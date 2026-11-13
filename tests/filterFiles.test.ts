import { describe, it, expect, afterEach } from "vitest";
import {
  collectRepoFiles,
  MAX_FILE_BYTES,
  MAX_TOTAL_FILES,
} from "@/lib/git/filterFiles";
import { flattenTree } from "@/lib/eval/grounding";
import { makeFixture, removeFixture } from "./helpers";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) removeFixture(dirs.pop()!);
});
const fixture = (files: Record<string, string | Buffer>) => {
  const d = makeFixture(files);
  dirs.push(d);
  return d;
};

const BASE = {
  "package.json": "{}",
  README: "# hi",
  ".gitignore": "secret.ts\n",
  "secret.ts": "const s = 1;",
  "src/index.ts": "export const a = 1;",
  "src/util.ts": "export const b = 2;",
  "docs/notes.md": "# notes",
  "node_modules/pkg/index.js": "module.exports = 1;",
  "dist/out.js": "var x;",
  "package-lock.json": "{}",
  "yarn.lock": "# lock",
  "logo.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]),
};

describe("collectRepoFiles: предикатна фільтрація", () => {
  it("включає код і документацію, виключає сміття", async () => {
    const { files } = await collectRepoFiles(fixture(BASE));
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual(
      ["README", "docs/notes.md", "package.json", "src/index.ts", "src/util.ts"].sort()
    );
  });

  it("враховує .gitignore репозиторію", async () => {
    const { files, tree } = await collectRepoFiles(fixture(BASE));
    expect(files.some((f) => f.path === "secret.ts")).toBe(false);
    expect(flattenTree(tree)).not.toContain("secret.ts");
  });

  it("не обходить виключені каталоги та бінарні файли", async () => {
    const { tree } = await collectRepoFiles(fixture(BASE));
    const all = flattenTree(tree);
    expect(all.some((p) => p.startsWith("node_modules/"))).toBe(false);
    expect(all.some((p) => p.startsWith("dist/"))).toBe(false);
    expect(all).not.toContain("logo.png");
    expect(all).not.toContain("package-lock.json");
  });

  it("README без розширення потрапляє в аналіз і в поле readme", async () => {
    const { files, readme } = await collectRepoFiles(fixture(BASE));
    expect(files.some((f) => f.path === "README")).toBe(true);
    expect(readme).toBe("# hi");
  });

  it("файли без розпізнаного розширення є в дереві, але не в дайджесті", async () => {
    const { files, tree } = await collectRepoFiles(
      fixture({ "a.ts": "x", "data.bin2": "zzz" })
    );
    expect(flattenTree(tree)).toContain("data.bin2");
    expect(files.map((f) => f.path)).toEqual(["a.ts"]);
  });

  it("обрізає надто великі файли", async () => {
    const { files } = await collectRepoFiles(
      fixture({ "big.ts": "a".repeat(MAX_FILE_BYTES + 5000) })
    );
    expect(files[0].content.length).toBeLessThan(MAX_FILE_BYTES + 100);
    expect(files[0].content).toContain("обрізано");
  });

  it("обмежує кількість файлів значенням K, лічильник сканування повний", async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < MAX_TOTAL_FILES + 5; i++) {
      many[`f${String(i).padStart(3, "0")}.ts`] = "x";
    }
    const { files, totalFilesScanned } = await collectRepoFiles(fixture(many));
    expect(files).toHaveLength(MAX_TOTAL_FILES);
    expect(totalFilesScanned).toBe(MAX_TOTAL_FILES + 5);
    expect(files[MAX_TOTAL_FILES - 1].path).toBe(
      `f${String(MAX_TOTAL_FILES - 1).padStart(3, "0")}.ts`
    );
  });

  it("детермінований: двічі підряд — той самий результат", async () => {
    const dir = fixture(BASE);
    const a = await collectRepoFiles(dir);
    const b = await collectRepoFiles(dir);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("порожній репозиторій не спричиняє помилки", async () => {
    const { files, tree } = await collectRepoFiles(fixture({ "x.png": "p" }));
    expect(files).toEqual([]);
    expect(flattenTree(tree)).toEqual([]);
  });
});
