// lib/git/buildDigest.ts
//
// Формує компактний текстовий "конспект" репозиторію: дерево файлів,
// README, та вміст ключових файлів (імпорти/оголошення функцій й
// інтерфейсів мають найбільшу вагу, тому такі файли не обрізаються
// агресивно). Результат — єдиний блок тексту, що йде в промпт LLM.

import type { RepoFile, RepoTreeNode } from "@/lib/types";

export const MAX_DIGEST_CHARS = 180_000; // орієнтир під контекстне вікно Gemini

function renderTree(nodes: RepoTreeNode[], depth = 0): string {
  return nodes
    .map((n) => {
      const prefix = "  ".repeat(depth) + (n.type === "dir" ? "📁 " : "📄 ");
      const line = prefix + n.name;
      if (n.type === "dir" && n.children?.length) {
        return line + "\n" + renderTree(n.children, depth + 1);
      }
      return line;
    })
    .join("\n");
}

/** Пріоритезація файлів: конфіги/маніфести та точки входу йдуть першими */
export function priorityScore(path: string): number {
  const p = path.toLowerCase();
  if (/^package\.json$/.test(p)) return 0;
  if (/readme\.md$/.test(p)) return 1;
  if (/^(src\/)?(app|pages)\//.test(p)) return 2;
  if (/^(src\/)?(lib|utils|services|core)\//.test(p)) return 3;
  return 5;
}

export interface DigestStats {
  totalFiles: number; // n — кількість відібраних файлів
  includedFiles: number; // m — скільки з них вмістилося в бюджет
  totalChars: number; // сумарна довжина блоків усіх файлів
  includedChars: number; // сумарна довжина включених блоків
  digestChars: number; // довжина підсумкового дайджеста |D|
  truncated: boolean; // true, якщо m < n
}

export function buildRepoDigestWithStats(
  tree: RepoTreeNode[],
  files: RepoFile[],
  maxChars: number = MAX_DIGEST_CHARS
): { digest: string; stats: DigestStats } {
  const sorted = [...files].sort(
    (a, b) => priorityScore(a.path) - priorityScore(b.path)
  );

  let digest = `## Структура файлів репозиторію\n\n${renderTree(tree)}\n\n`;
  digest += `## Вміст файлів (пріоритезовано)\n\n`;

  const blocks = sorted.map(
    (file) =>
      `### ${file.path}\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n\n`
  );
  const totalChars = blocks.reduce((acc, b) => acc + b.length, 0);

  let included = 0;
  let includedChars = 0;
  for (let i = 0; i < sorted.length; i++) {
    const block = blocks[i];
    if (digest.length + block.length > maxChars) {
      digest += `\n/* ...решту файлів (${
        sorted.length - i
      } шт.) обрізано через обмеження контексту... */\n`;
      break;
    }
    digest += block;
    included++;
    includedChars += block.length;
  }

  return {
    digest,
    stats: {
      totalFiles: sorted.length,
      includedFiles: included,
      totalChars,
      includedChars,
      digestChars: digest.length,
      truncated: included < sorted.length,
    },
  };
}

export function buildRepoDigest(
  tree: RepoTreeNode[],
  files: RepoFile[],
  maxChars: number = MAX_DIGEST_CHARS
): string {
  return buildRepoDigestWithStats(tree, files, maxChars).digest;
}
