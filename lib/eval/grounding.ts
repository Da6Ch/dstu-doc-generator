// lib/eval/grounding.ts
//
// Заземленість: частка згаданих у документі файлів і шляхів, які реально
// існують у репозиторії.   GR = |знайдені| / |згадані|

import type { RepoTreeNode } from "@/lib/types";

const PATH_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "md", "yml", "yaml",
  "py", "java", "go", "rs", "cs", "php", "rb", "c", "cpp", "h", "css",
  "scss", "html", "sql", "toml", "lock", "txt", "cfg", "ini", "xml",
  "gradle", "mod", "sum",
]);

/** Згадки, що не є файлами репозиторію (інструкції, змінні оточення) */
const IGNORED_MENTIONS = new Set([".env", ".env.local", ".env.production"]);

export function flattenTree(nodes: RepoTreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: RepoTreeNode[]) => {
    for (const n of list) {
      if (n.type === "file") out.push(n.path);
      else if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

function normalizePath(raw: string): string {
  return raw.replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "");
}

function looksLikePath(token: string): boolean {
  if (/\s/.test(token)) return false;
  if (/^[a-z]+:\/\//i.test(token)) return false;
  if (/[*<>{}$|]/.test(token)) return false;
  if (IGNORED_MENTIONS.has(token)) return false;

  const clean = normalizePath(token);
  if (clean.length < 2) return false;

  const base = clean.split("/").pop() ?? clean;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
  if (PATH_EXTENSIONS.has(ext)) return true;
  // шлях без розширення вважаємо шляхом, лише якщо він має сегменти
  return clean.includes("/") && !clean.includes(":") && /^[\w.\-/@]+$/.test(clean);
}

/** Унікальні файли/шляхи, згадані в рядках `inline code` */
export function extractMentionedPaths(markdown: string): string[] {
  const withoutFences = markdown.replace(/```[\s\S]*?```/g, " ");
  const found = new Set<string>();
  const re = /`([^`\n]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutFences)) !== null) {
    const token = m[1].trim();
    if (looksLikePath(token)) found.add(normalizePath(token));
  }
  return [...found];
}

export interface GroundingResult {
  mentioned: number;
  found: number;
  ratio: number | null; // null, якщо згадок немає
  missing: string[];
}

/**
 * Згадка вважається знайденою, якщо шлях збігається з файлом дерева, або це
 * ім'я файлу без каталогу, що існує де завгодно, або це каталог-префікс.
 */
export function groundingRatio(
  mentioned: string[],
  treePaths: string[]
): GroundingResult {
  const exact = new Set(treePaths);
  const basenames = new Set(treePaths.map((p) => p.split("/").pop() ?? p));

  const missing = mentioned.filter((p) => {
    if (exact.has(p)) return false;
    if (!p.includes("/") && basenames.has(p)) return false;
    if (treePaths.some((t) => t.startsWith(p + "/"))) return false;
    return true;
  });

  const found = mentioned.length - missing.length;
  return {
    mentioned: mentioned.length,
    found,
    ratio: mentioned.length === 0 ? null : found / mentioned.length,
    missing,
  };
}
