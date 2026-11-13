import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseSseBuffer, type SseEvent } from "@/lib/eval/sse";
import { makeFixture, removeFixture } from "./helpers";

const state = vi.hoisted(() => ({
  cleanup: vi.fn(async () => {}),
  dir: "",
  llm: "ok" as "ok" | "fail" | "interrupted",
}));

vi.mock("@/lib/git/cloneRepo", () => ({
  cloneRepo: vi.fn(async () => ({
    dir: state.dir,
    owner: "o",
    repo: "r",
    branch: "main",
    commit: "abcdef1234567",
    cleanup: state.cleanup,
  })),
}));

vi.mock("@/lib/llm/geminiClient", () => ({
  streamGeminiText: vi.fn(async (_prompt: string, onChunk: (d: string) => void) => {
    if (state.llm === "fail") throw new Error("boom");
    onChunk("## 1. Тест\n");
    onChunk("текст");
    return { interrupted: state.llm === "interrupted" };
  }),
}));

import { POST } from "@/app/api/generate/route";

async function call(body: unknown): Promise<{ status: number; events: SseEvent[] }> {
  const res = await POST(
    new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never
  );
  if (res.status !== 200) return { status: res.status, events: [] };
  const text = await res.text();
  return { status: res.status, events: parseSseBuffer(text + "\n\n").events };
}

let fixtureDir = "";
beforeEach(() => {
  state.cleanup.mockClear();
  state.llm = "ok";
  fixtureDir = makeFixture({ README: "# r", "src/a.ts": "export const a = 1;" });
  state.dir = fixtureDir;
});
afterEach(() => removeFixture(fixtureDir));

const req = { repoUrl: "https://github.com/o/r", standards: ["iso-42010", "iso-26514"] };

describe("POST /api/generate", () => {
  it("відхиляє запит без стандартів", async () => {
    const r = await call({ repoUrl: "https://github.com/o/r", standards: [] });
    expect(r.status).toBe(400);
  });

  it("успішна генерація: порядок подій і протокол (3)", async () => {
    const { events } = await call(req);
    const types = events.map((e) => e.type);

    expect(types.at(-1)).toBe("done");
    expect(types).not.toContain("error");
    expect(types).toContain("tree");

    // doc-start ≺ doc-chunk* ≺ doc-end ≺ наступний doc-start
    const seq = events
      .filter((e) => e.type.startsWith("doc-"))
      .map((e) => `${e.type}:${e.standard}`);
    expect(seq).toEqual([
      "doc-start:iso-42010", "doc-chunk:iso-42010", "doc-chunk:iso-42010", "doc-end:iso-42010",
      "doc-start:iso-26514", "doc-chunk:iso-26514", "doc-chunk:iso-26514", "doc-end:iso-26514",
    ]);
  });

  it("усі події мають серверний час, що не спадає", async () => {
    const { events } = await call(req);
    const ts = events.map((e) => e.t);
    expect(ts.every((t) => typeof t === "number")).toBe(true);
    for (let i = 1; i < ts.length; i++) expect(ts[i]!).toBeGreaterThanOrEqual(ts[i - 1]!);
  });

  it("повідомляє коміт і кількість відібраних файлів", async () => {
    const { events } = await call(req);
    const msgs = events.filter((e) => e.type === "status").map((e) => String(e.message));
    expect(msgs.some((m) => m.includes("abcdef1"))).toBe(true);
    expect(msgs.some((m) => /Відібрано 2 із 2/.test(m))).toBe(true);
  });

  it("тимчасова тека видаляється рівно один раз (рання очистка)", async () => {
    await call(req);
    expect(state.cleanup).toHaveBeenCalledTimes(1);
  });

  it("помилка LLM: подія error без done, тека вже очищена", async () => {
    state.llm = "fail";
    const { events } = await call(req);
    const types = events.map((e) => e.type);
    expect(types).toContain("error");
    expect(types).not.toContain("done");
    expect(String(events.find((e) => e.type === "error")!.message)).toContain("boom");
    expect(state.cleanup).toHaveBeenCalledTimes(1);
  });

  it("помилка до рання очистки: блок finally видаляє теку", async () => {
    state.dir = fixtureDir + "-does-not-exist"; // аналіз коду впаде
    const { events } = await call(req);
    expect(events.map((e) => e.type)).toContain("error");
    expect(state.cleanup).toHaveBeenCalledTimes(1);
  });

  it("обірваний потік Gemini не є фатальним: документ завершується", async () => {
    state.llm = "interrupted";
    const { events } = await call({ ...req, standards: ["iso-42010"] });
    const types = events.map((e) => e.type);
    expect(types).toContain("doc-end");
    expect(types.at(-1)).toBe("done");
  });
});
