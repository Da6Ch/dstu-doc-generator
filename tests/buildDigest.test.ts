import { describe, it, expect } from "vitest";
import {
  buildRepoDigest,
  buildRepoDigestWithStats,
  priorityScore,
} from "@/lib/git/buildDigest";
import type { RepoFile } from "@/lib/types";

const file = (path: string, size = 100): RepoFile => ({
  path,
  content: "x".repeat(size),
  language: "typescript",
  sizeBytes: size,
});

describe("priorityScore", () => {
  it.each([
    ["package.json", 0],
    ["README.md", 1],
    ["app/page.tsx", 2],
    ["src/pages/index.tsx", 2],
    ["lib/util.ts", 3],
    ["src/services/x.ts", 3],
    ["other/file.ts", 5],
  ])("%s → %i", (p, expected) => {
    expect(priorityScore(p)).toBe(expected);
  });
});

describe("buildRepoDigestWithStats", () => {
  const files = [file("z/other.ts"), file("package.json", 2), file("lib/a.ts"), file("app/b.ts")];

  it("впорядковує за пріоритетом", () => {
    const { digest } = buildRepoDigestWithStats([], files);
    const at = (p: string) => digest.indexOf(`### ${p}`);
    expect(at("package.json")).toBeLessThan(at("app/b.ts"));
    expect(at("app/b.ts")).toBeLessThan(at("lib/a.ts"));
    expect(at("lib/a.ts")).toBeLessThan(at("z/other.ts"));
  });

  it("стабільно зберігає порядок обходу для рівних пріоритетів", () => {
    const { digest } = buildRepoDigestWithStats(
      [],
      [file("m/1.ts"), file("m/2.ts"), file("m/3.ts")]
    );
    expect(digest.indexOf("### m/1.ts")).toBeLessThan(digest.indexOf("### m/2.ts"));
    expect(digest.indexOf("### m/2.ts")).toBeLessThan(digest.indexOf("### m/3.ts"));
  });

  it("без обмеження включає всі файли", () => {
    const { stats } = buildRepoDigestWithStats([], files);
    expect(stats.includedFiles).toBe(files.length);
    expect(stats.truncated).toBe(false);
    expect(stats.includedChars).toBe(stats.totalChars);
  });

  it("за малого бюджету включає лише префікс і додає повідомлення", () => {
    const { digest, stats } = buildRepoDigestWithStats([], files, 200);
    expect(stats.truncated).toBe(true);
    expect(stats.includedFiles).toBeLessThan(files.length);
    expect(digest).toContain("обрізано через обмеження контексту");
    expect(digest).toContain("### package.json"); // найвищий пріоритет — першим
  });

  it("довжина дайджеста: |D| ≤ B + довжина повідомлення", () => {
    const B = 300;
    const { stats } = buildRepoDigestWithStats([], files, B);
    expect(stats.digestChars).toBeLessThanOrEqual(B + 120);
  });

  it("статистика узгоджена з результатом", () => {
    const { digest, stats } = buildRepoDigestWithStats([], files, 400);
    expect(stats.digestChars).toBe(digest.length);
    expect(stats.totalFiles).toBe(files.length);
    expect(stats.includedChars).toBeLessThanOrEqual(stats.totalChars);
  });

  it("детермінований", () => {
    expect(buildRepoDigest([], files, 400)).toBe(buildRepoDigest([], files, 400));
  });

  it("порожній набір файлів дає лише заголовок", () => {
    const { stats } = buildRepoDigestWithStats([], []);
    expect(stats.includedFiles).toBe(0);
    expect(stats.truncated).toBe(false);
  });
});
