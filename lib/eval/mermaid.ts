// lib/eval/mermaid.ts
//
// Витягання діаграм Mermaid із Markdown і перевірка їхньої відповідності
// правилам промпта (L_strict). Перевірка справжньої граматики Mermaid
// виконується окремо (scripts/lib/mermaidParser.ts), бо потребує DOM.

export function extractMermaidBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const re = /```mermaid[^\n]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) blocks.push(m[1].trim());
  return blocks;
}

export interface ConformanceResult {
  ok: boolean;
  nodes: number;
  reasons: string[];
}

const MAX_NODES = 10;
const KEYWORDS = new Set([
  "graph", "TD", "LR", "subgraph", "end", "style", "classDef", "class", "click",
]);

/** Чи дотримано правил промпта: graph TD/LR, ASCII-id, підписи в лапках, ≤ 10 вузлів */
export function checkPromptConformance(code: string): ConformanceResult {
  const reasons: string[] = [];
  const lines = code
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("%%"));

  if (lines.length === 0 || !/^graph\s+(TD|LR)\b/.test(lines[0])) {
    reasons.push("діаграма не починається з graph TD або graph LR");
  }

  const ids = new Set<string>();
  const nodeRe = /\b([A-Za-z][A-Za-z0-9_]*)\s*\[([^\]]*)\]/g;
  for (const line of lines.slice(1)) {
    let m: RegExpExecArray | null;
    nodeRe.lastIndex = 0;
    while ((m = nodeRe.exec(line)) !== null) {
      const label = m[2].trim();
      if (!/^".*"$/.test(label)) {
        reasons.push(`підпис вузла ${m[1]} не взято в лапки`);
      } else if (/[();]/.test(label.slice(1, -1))) {
        reasons.push(`підпис вузла ${m[1]} містить дужки або «;»`);
      }
    }
    // ідентифікатори вузлів: прибираємо підписи й підписи ребер
    const stripped = line
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\|[^|]*\|/g, " ")
      .replace(/"[^"]*"/g, " ");
    for (const id of stripped.match(/[A-Za-z][A-Za-z0-9_]*/g) ?? []) {
      if (!KEYWORDS.has(id)) ids.add(id);
    }
  }

  if (ids.size > MAX_NODES) {
    reasons.push(`вузлів ${ids.size}, дозволено не більше ${MAX_NODES}`);
  }

  return { ok: reasons.length === 0, nodes: ids.size, reasons };
}
