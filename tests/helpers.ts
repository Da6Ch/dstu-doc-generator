import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Створює тимчасову теку з файлами {відносний шлях → вміст} */
export function makeFixture(files: Record<string, string | Buffer>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dstu-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}

export function removeFixture(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}
