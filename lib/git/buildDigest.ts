// lib/git/buildDigest.ts
//
// Формує компактний текстовий "конспект" репозиторію: дерево файлів,
// README, та вміст ключових файлів (імпорти/оголошення функцій й
// інтерфейсів мають найбільшу вагу, тому такі файли не обрізаються
// агресивно). Результат — єдиний блок тексту, що йде в промпт LLM.

import type { RepoFile, RepoTreeNode } from "@/lib/types";

const MAX_DIGEST_CHARS = 180_000; // орієнтир під контекстне вікно Gemini

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
function priorityScore(path: string): number {
  const p = path.toLowerCase();
  if (/^package\.json$/.test(p)) return 0;
  if (/readme\.md$/.test(p)) return 1;
  if (/^(src\/)?(app|pages)\//.test(p)) return 2;
  if (/^(src\/)?(lib|utils|services|core)\//.test(p)) return 3;
  return 5;
}

export function buildRepoDigest(
  tree: RepoTreeNode[],
  files: RepoFile[]
): string {
  const sorted = [...files].sort(
    (a, b) => priorityScore(a.path) - priorityScore(b.path)
  );

  let digest = `## Структура файлів репозиторію\n\n${renderTree(tree)}\n\n`;
  digest += `## Вміст файлів (пріоритезовано)\n\n`;

  for (const file of sorted) {
    const block = `### ${file.path}\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n\n`;
    if (digest.length + block.length > MAX_DIGEST_CHARS) {
      digest += `\n/* ...решту файлів (${
        sorted.length - sorted.indexOf(file)
      } шт.) обрізано через обмеження контексту... */\n`;
      break;
    }
    digest += block;
  }

  return digest;
}
