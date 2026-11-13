// scripts/benchmark.ts
//
// Стенд вимірювань: надсилає запити на /api/generate (локально або на Vercel),
// читає потік SSE, вимірює час етапів і рахує метрики якості документів.
//
// Приклад:
//   npx tsx scripts/benchmark.ts --url https://dstu-doc-generator.vercel.app \
//     --standards iso-29148,iso-42010,iso-26514,espd-19404 --runs 1 --delay 20

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { parseSseBuffer, type SseEvent } from "../lib/eval/sse";
import { structuralConformity, hasCompletionNote } from "../lib/eval/structure";
import {
  extractMentionedPaths,
  flattenTree,
  groundingRatio,
} from "../lib/eval/grounding";
import { extractMermaidBlocks, checkPromptConformance } from "../lib/eval/mermaid";
import { summarize } from "../lib/eval/stats";
import { createMermaidParser } from "./lib/mermaidParser";
import type { DocStandardId, RepoTreeNode } from "../lib/types";

// ---------- параметри командного рядка ----------
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE_URL = arg("url", process.env.BENCH_URL ?? "http://localhost:3000").replace(/\/$/, "");
const REPOS_FILE = arg("repos", "benchmark/repos.json");
const STANDARDS = arg("standards", "iso-42010").split(",") as DocStandardId[];
const RUNS = Number(arg("runs", "1"));
const DELAY_S = Number(arg("delay", "15"));
const ONLY = arg("only", "").split(",").filter(Boolean);
const TIMEOUT_MS = Number(arg("timeout", "330")) * 1000;
const CHARS_PER_TOKEN = Number(arg("chars-per-token", "3")); // оцінка, див. методику

interface RepoEntry { id: string; url: string; branch?: string; language: string; expectedClass: string; note?: string }

// ---------- допоміжні функції ----------
const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const writeCsv = (file: string, rows: Record<string, unknown>[]) => {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(",")].concat(rows.map((r) => cols.map((c) => csvCell(r[c])).join(",")));
  fs.writeFileSync(file, "\uFEFF" + lines.join("\n"), "utf-8");
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r3 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? "" : Math.round(x * 1000) / 1000);

// ---------- один запуск ----------
interface RunResult {
  httpStatus: number;
  vercelId: string;
  error: string;
  commit: string;
  scanned: number | null;
  selected: number | null;
  tree: RepoTreeNode[];
  clientTotalMs: number;
  serverMs: Record<string, number>;
  docs: Record<string, { text: string; startT: number; endT: number | null; firstChunkT: number | null; chunks: number; completed: boolean }>;
}

async function runOnce(repo: RepoEntry, standards: DocStandardId[]): Promise<RunResult> {
  const result: RunResult = {
    httpStatus: 0, vercelId: "", error: "", commit: "", scanned: null, selected: null,
    tree: [], clientTotalMs: 0, serverMs: {}, docs: {},
  };
  const started = performance.now();

  try {
    const res = await fetch(`${BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl: repo.url, branch: repo.branch, standards }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    result.httpStatus = res.status;
    result.vercelId = res.headers.get("x-vercel-id") ?? "";
    if (!res.ok || !res.body) {
      result.error = `HTTP ${res.status}`;
      return result;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let current = "";

    const handle = (e: SseEvent) => {
      const t = typeof e.t === "number" ? e.t : NaN;
      switch (e.type) {
        case "status": {
          const stage = String(e.stage);
          result.serverMs[stage] = t;
          const msg = String(e.message ?? "");
          const sel = /Відібрано (\d+) із (\d+)/.exec(msg);
          if (sel) { result.selected = Number(sel[1]); result.scanned = Number(sel[2]); }
          const c = /коміт ([0-9a-f]{7,40})/.exec(msg);
          if (c) result.commit = c[1];
          break;
        }
        case "tree": result.tree = e.tree as RepoTreeNode[]; break;
        case "doc-start":
          current = String(e.standard);
          result.docs[current] = { text: "", startT: t, endT: null, firstChunkT: null, chunks: 0, completed: false };
          break;
        case "doc-chunk": {
          const d = result.docs[String(e.standard)];
          if (d) {
            if (d.firstChunkT === null) d.firstChunkT = t;
            d.text += String(e.delta ?? "");
            d.chunks++;
          }
          break;
        }
        case "doc-end": {
          const d = result.docs[String(e.standard)];
          if (d) { d.endT = t; d.completed = true; }
          break;
        }
        case "error": result.error = String(e.message ?? "error"); break;
        case "done": result.serverMs.done = t; break;
      }
    };

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseBuffer(buffer);
      buffer = parsed.rest;
      parsed.events.forEach(handle);
    }
  } catch (err) {
    result.error = (err as Error).name === "TimeoutError" ? "клієнтський тайм-аут" : (err as Error).message;
  }

  result.clientTotalMs = performance.now() - started;
  return result;
}

// ---------- головна програма ----------
async function main() {
  const repos: RepoEntry[] = JSON.parse(fs.readFileSync(REPOS_FILE, "utf-8"));
  const selectedRepos = ONLY.length ? repos.filter((r) => ONLY.includes(r.id)) : repos;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(arg("out", "benchmark/results"), stamp);
  fs.mkdirSync(path.join(outDir, "docs"), { recursive: true });

  const mermaidParser = await createMermaidParser();

  // прогрівальний запит (холодний старт функції не входить у вимірювання)
  let vercelId = "";
  try {
    const warm = await fetch(`${BASE_URL}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    vercelId = warm.headers.get("x-vercel-id") ?? "";
  } catch { /* ігноруємо: помилка проявиться в основних запусках */ }

  const env = {
    date: new Date().toISOString(),
    targetUrl: BASE_URL,
    vercelId,
    clientOs: `${os.type()} ${os.release()} (${os.arch()})`,
    clientCpu: os.cpus()[0]?.model ?? "",
    clientCores: os.cpus().length,
    clientRamGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    node: process.version,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    standards: STANDARDS,
    runsPerRepo: RUNS,
    delaySeconds: DELAY_S,
    charsPerToken: CHARS_PER_TOKEN,
    mermaidParser: mermaidParser.available ? "mermaid.parse (jsdom)" : `недоступний: ${mermaidParser.reason}`,
  };
  fs.writeFileSync(path.join(outDir, "environment.json"), JSON.stringify(env, null, 2), "utf-8");
  console.log("Середовище:", env);

  const rows: Record<string, unknown>[] = [];

  for (const repo of selectedRepos) {
    for (let run = 1; run <= RUNS; run++) {
      console.log(`\n▶ ${repo.id} (запуск ${run}/${RUNS}) → ${STANDARDS.join(", ")}`);
      const r = await runOnce(repo, STANDARDS);
      const treePaths = flattenTree(r.tree);

      const prep = {
        tCloneMs: r.serverMs.cloned ?? NaN,
        tFilterMs: (r.serverMs.digest ?? NaN) - (r.serverMs.cloned ?? NaN),
      };
      const firstDocStart = Math.min(...Object.values(r.docs).map((d) => d.startT).filter(Number.isFinite), Infinity);
      const tDigestMs = Number.isFinite(firstDocStart) ? firstDocStart - (r.serverMs.digest ?? NaN) : NaN;

      const common = {
        repo: repo.id, language: repo.language, expectedClass: repo.expectedClass, run,
        commit: r.commit, filesScanned: r.scanned, filesSelected: r.selected,
        selectionRatio: r.scanned ? r3(r.selected! / r.scanned) : "",
        httpStatus: r.httpStatus, error: r.error,
        tCloneMs: r3(prep.tCloneMs), tFilterMs: r3(prep.tFilterMs), tDigestMs: r3(tDigestMs),
        tServerTotalMs: r3(r.serverMs.done), tClientTotalMs: r3(r.clientTotalMs),
      };

      const standardsToReport = STANDARDS.filter((s) => r.docs[s]);
      if (standardsToReport.length === 0) {
        rows.push({ ...common, standard: "", completed: false });
        console.log(`  ✗ без документів${r.error ? `: ${r.error}` : ""}`);
      }

      for (const s of standardsToReport) {
        const d = r.docs[s];
        const sc = structuralConformity(s, d.text);
        const gr = groundingRatio(extractMentionedPaths(d.text), treePaths);
        const blocks = extractMermaidBlocks(d.text);
        const conformant = blocks.filter((b) => checkPromptConformance(b).ok).length;
        let valid: number | "" = "";
        if (mermaidParser.available && blocks.length) {
          let ok = 0;
          for (const b of blocks) if (await mermaidParser.validate(b)) ok++;
          valid = ok;
        }
        const genMs = d.endT !== null ? d.endT - d.startT : NaN;
        const ttftMs = d.firstChunkT !== null ? d.firstChunkT - d.startT : NaN;
        const chars = d.text.length;
        const estTokens = Math.round(chars / CHARS_PER_TOKEN);

        rows.push({
          ...common, standard: s, completed: d.completed && hasCompletionNote(d.text),
          chars, estTokens, ttftMs: r3(ttftMs), genMs: r3(genMs),
          charsPerSec: Number.isFinite(genMs) && genMs > 0 ? r3(chars / (genMs / 1000)) : "",
          sc: r3(sc.score), scFound: sc.found, scRequired: sc.required, scMissing: sc.missing.join("; "),
          groundingRatio: r3(gr.ratio), pathsMentioned: gr.mentioned, pathsMissing: gr.missing.join("; "),
          diagrams: blocks.length, diagramsConformant: conformant, diagramsValid: valid,
        });
        fs.writeFileSync(path.join(outDir, "docs", `${repo.id}-${s}-run${run}.md`), d.text, "utf-8");
        console.log(`  ✓ ${s}: ${chars} симв., SC=${r3(sc.score)}, GR=${r3(gr.ratio)}, діаграм ${blocks.length}, час ${r3(genMs / 1000)} с`);
      }

      if (!(repo === selectedRepos[selectedRepos.length - 1] && run === RUNS)) {
        console.log(`  … пауза ${DELAY_S} с (щоб не перевищити квоту ключа)`);
        await sleep(DELAY_S * 1000);
      }
    }
  }

  writeCsv(path.join(outDir, "runs.csv"), rows);

  // агрегування за парою (репозиторій, документ)
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    if (!row.standard) continue;
    const key = `${row.repo}|${row.standard}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  // порожні клітинки (""/null) не є нулями, тому відфільтровуємо їх до обчислень
  const numeric = (rs: Record<string, unknown>[], k: string): number[] =>
    rs
      .map((r) => r[k])
      .filter((v) => v !== "" && v !== null && v !== undefined)
      .map(Number)
      .filter((v) => Number.isFinite(v));
  const summaryRows = [...groups.entries()].map(([key, rs]) => {
    const [repoId, standard] = key.split("|");
    const g = (k: string) => summarize(numeric(rs, k));
    const total = summarize(numeric(rs, "tClientTotalMs"));
    const sc = g("sc"), gr = g("groundingRatio"), gen = g("genMs"), ch = g("chars");
    return {
      repo: repoId, standard, runs: rs.length,
      successRate: r3(rs.filter((r) => r.completed === true).length / rs.length),
      tClientTotalMs_mean: r3(total?.mean), tClientTotalMs_sd: r3(total?.sd), tClientTotalMs_ci95: r3(total?.ci95),
      genMs_mean: r3(gen?.mean), genMs_sd: r3(gen?.sd), genMs_p95: r3(gen?.p95),
      chars_mean: r3(ch?.mean), sc_mean: r3(sc?.mean), groundingRatio_mean: r3(gr?.mean),
    };
  });
  writeCsv(path.join(outDir, "summary.csv"), summaryRows);

  console.log(`\nГотово. Результати: ${outDir}`);
  console.log("  runs.csv (кожен запуск), summary.csv (агреговано), environment.json, docs/*.md");
}

main().catch((e) => { console.error(e); process.exit(1); });
