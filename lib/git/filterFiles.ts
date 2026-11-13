// lib/git/filterFiles.ts
//
// Обхід клонованого репозиторію: побудова дерева файлів, фільтрація
// «сміттєвих» шляхів (lock-файли, node_modules, build-артефакти, бінарні
// асети) та формування списку релевантних текстових файлів для аналізу.

import fs from "node:fs";
import ignore from "ignore";
import type { RepoFile, RepoTreeNode } from "@/lib/types";

// Директорії, які повністю виключаються з обходу
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  "coverage",
  ".turbo",
  ".vercel",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
]);

// Патерни файлів, що виключаються (lock-файли, бінарні асети тощо)
const EXCLUDED_FILE_PATTERNS: RegExp[] = [
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /composer\.lock$/,
  /Gemfile\.lock$/,
  /\.(png|jpe?g|gif|svg|ico|webp|bmp)$/i,
  /\.(woff2?|ttf|eot|otf)$/i,
  /\.(mp4|mp3|wav|avi|mov)$/i,
  /\.(zip|tar|gz|7z|rar)$/i,
  /\.(exe|dll|so|dylib|bin)$/i,
  /\.(pdf|docx?|xlsx?|pptx?)$/i,
  /\.map$/,
  /\.min\.(js|css)$/,
];

// Розширення, які вважаються текстовим кодом і включаються в дайджест
const CODE_EXTENSIONS: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".py": "python",
  ".java": "java",
  ".go": "go",
  ".rs": "rust",
  ".cs": "csharp",
  ".php": "php",
  ".rb": "ruby",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".md": "markdown",
  ".css": "css",
  ".scss": "scss",
  ".html": "html",
  ".sql": "sql",
};

// Файли без розширення, які варто включати в аналіз
const EXTENSIONLESS_FILES: Record<string, string> = {
  readme: "markdown",
  dockerfile: "dockerfile",
  makefile: "makefile",
};

export const MAX_FILE_BYTES = 60_000; // обрізаємо надто великі файли
export const MAX_TOTAL_FILES = 400; // запобіжник для величезних репозиторіїв

export interface FilterOptions {
  gitignoreContent?: string;
}

export async function collectRepoFiles(
  dir: string,
  opts: FilterOptions = {}
): Promise<{
  tree: RepoTreeNode[];
  files: RepoFile[];
  readme?: string;
  totalFilesScanned: number;
}> {
  const ig = ignore();
  let gitignore = opts.gitignoreContent;
  if (gitignore === undefined) {
    gitignore = await fs.promises
      .readFile(`${dir}/.gitignore`, "utf-8")
      .catch(() => "");
  }
  ig.add(gitignore);

  const files: RepoFile[] = [];
  let totalFilesScanned = 0;
  let readme: string | undefined;

  async function walk(relPath: string): Promise<RepoTreeNode[]> {
    const absPath = `${dir}${relPath ? "/" + relPath : ""}`;
    // Сортування гарантує детермінований порядок обходу незалежно від ОС/ФС
    const entries = (await fs.promises.readdir(absPath)).sort();
    const nodes: RepoTreeNode[] = [];

    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      const entryRel = relPath ? `${relPath}/${entry}` : entry;
      const entryAbs = `${dir}/${entryRel}`;
      const stat = await fs.promises.stat(entryAbs);

      if (stat.isDirectory()) {
        const children = await walk(entryRel);
        if (children.length > 0) {
          nodes.push({ name: entry, path: entryRel, type: "dir", children });
        }
        continue;
      }

      totalFilesScanned++;
      if (files.length >= MAX_TOTAL_FILES) continue;
      if (ig.ignores(entryRel)) continue;
      if (EXCLUDED_FILE_PATTERNS.some((re) => re.test(entry))) continue;

      const dot = entry.lastIndexOf(".");
      const ext = dot > 0 ? entry.slice(dot).toLowerCase() : "";
      const language = CODE_EXTENSIONS[ext] ?? EXTENSIONLESS_FILES[entry.toLowerCase()];

      nodes.push({ name: entry, path: entryRel, type: "file" });

      if (!language) continue; // не текстовий код -> у дерево йде, у дайджест ні

      let content = await fs.promises.readFile(entryAbs, "utf-8");
      const sizeBytes = Buffer.byteLength(content, "utf-8");
      if (sizeBytes > MAX_FILE_BYTES) {
        content =
          content.slice(0, MAX_FILE_BYTES) +
          "\n/* ...обрізано для аналізу... */";
      }

      if (/^readme(\.md|\.txt)?$/i.test(entry) && !relPath) {
        readme = content;
      }

      files.push({ path: entryRel, content, language, sizeBytes });
    }

    return nodes.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1
    );
  }

  const tree = await walk("");
  return { tree, files, readme, totalFilesScanned };
}
