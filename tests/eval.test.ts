import { describe, it, expect } from "vitest";
import {
  structuralConformity,
  hasCompletionNote,
  extractHeadings,
} from "@/lib/eval/structure";
import {
  extractMentionedPaths,
  groundingRatio,
  flattenTree,
} from "@/lib/eval/grounding";
import { extractMermaidBlocks, checkPromptConformance } from "@/lib/eval/mermaid";
import { summarize, tCritical95, percentile } from "@/lib/eval/stats";
import { parseSseBuffer } from "@/lib/eval/sse";
import type { RepoTreeNode } from "@/lib/types";

describe("структурна відповідність (SC)", () => {
  const full = [
    "## 1. Про документ", "## 2. Огляд системи", "## 3. Підготовка до встановлення",
    "## 4. Встановлення та розгортання", "## 5. Налаштування", "## 6. Використання",
    "## 7. Довідкова інформація", "## 8. Усунення несправностей", "## 9. Глосарій",
  ].join("\n");

  it("повний документ дає SC = 1", () => {
    const r = structuralConformity("iso-26514", full);
    expect(r.score).toBe(1);
    expect(r.missing).toEqual([]);
  });

  it("відсутні розділи знижують SC й перелічуються", () => {
    const r = structuralConformity("iso-26514", "## 1. Про документ\n## 5. Налаштування");
    expect(r.found).toBe(2);
    expect(r.score).toBeCloseTo(2 / 9);
    expect(r.missing).toContain("глосарій");
  });

  it("ігнорує текст, що не є заголовком", () => {
    const r = structuralConformity("iso-26514", "Про документ та Глосарій у тексті");
    expect(r.found).toBe(0);
  });

  it("необов'язкові розділи не впливають на SC", () => {
    const base = [
      "## Ідентифікація та огляд", "## Зацікавлені сторони та їхні інтереси",
      "## Ракурси", "## Архітектурні розрізи", "## Відповідності між розрізами",
      "## Архітектурні рішення та обґрунтування",
      "## Ризики, обмеження та відомі прогалини архітектури",
    ].join("\n");
    const without = structuralConformity("iso-42010", base);
    const withViews = structuralConformity("iso-42010", base + "\n### 4.1. Контекстний розріз");
    expect(without.score).toBe(1);
    expect(withViews.score).toBe(1);
    expect(withViews.optionalFound).toBe(1);
  });

  it("extractHeadings нормалізує регістр і розмітку", () => {
    expect(extractHeadings("## **Вступ**\ntext\n### `Код`")).toEqual(["вступ", "код"]);
  });

  it("ознака повноти шукає примітку наприкінці", () => {
    expect(hasCompletionNote("текст\n\n*Документ сформовано автоматично за кодом.*")).toBe(true);
    expect(hasCompletionNote("текст без примітки")).toBe(false);
  });
});

describe("заземленість (GR)", () => {
  const tree: RepoTreeNode[] = [
    { name: "app", path: "app", type: "dir", children: [
      { name: "page.tsx", path: "app/page.tsx", type: "file" },
    ]},
    { name: "package.json", path: "package.json", type: "file" },
  ];

  it("flattenTree повертає лише файли", () => {
    expect(flattenTree(tree)).toEqual(["app/page.tsx", "package.json"]);
  });

  it("витягає файли з inline-коду й ігнорує команди, URL та .env.local", () => {
    const md = "Див. `app/page.tsx`, `package.json`; запуск `npm run dev`; `.env.local`; `https://x.com/a.js`; `localhost:3000`.";
    expect(extractMentionedPaths(md).sort()).toEqual(["app/page.tsx", "package.json"]);
  });

  it("не бере вміст блоків коду", () => {
    expect(extractMentionedPaths("```\n`a/b.ts`\n```")).toEqual([]);
  });

  it("рахує частку знайдених і перелічує відсутні", () => {
    const r = groundingRatio(["app/page.tsx", "src/ghost.ts"], flattenTree(tree));
    expect(r.found).toBe(1);
    expect(r.ratio).toBe(0.5);
    expect(r.missing).toEqual(["src/ghost.ts"]);
  });

  it("ім'я файлу без каталогу знаходиться будь-де, каталог — за префіксом", () => {
    const r = groundingRatio(["page.tsx", "app"], flattenTree(tree));
    expect(r.ratio).toBe(1);
  });

  it("за відсутності згадок ratio = null", () => {
    expect(groundingRatio([], []).ratio).toBeNull();
  });
});

describe("діаграми Mermaid: відповідність правилам промпта", () => {
  const good = 'graph TD\n  A["Клієнт"] --> B["Сервер"]\n  B -->|"запит"| C["Gemini"]';

  it("витягає блоки mermaid", () => {
    const md = "a\n```mermaid\n" + good + "\n```\nb\n```js\nx\n```";
    expect(extractMermaidBlocks(md)).toEqual([good]);
  });

  it("приймає коректну діаграму й рахує вузли", () => {
    const r = checkPromptConformance(good);
    expect(r.ok).toBe(true);
    expect(r.nodes).toBe(3);
  });

  it.each([
    ["flowchart TD\n A[\"x\"]", "не graph TD/LR"],
    ["graph TD\n A[Без лапок] --> B", "підпис без лапок"],
    ['graph TD\n A["Модуль (core)"] --> B', "дужки в підписі"],
  ])("відхиляє: %s (%s)", (code) => {
    expect(checkPromptConformance(code).ok).toBe(false);
  });

  it("відхиляє діаграму з понад 10 вузлами", () => {
    const code = "graph TD\n" + Array.from({ length: 12 }, (_, i) => `N${i}["a"] --> N${i + 1}["b"]`).join("\n");
    expect(checkPromptConformance(code).ok).toBe(false);
  });
});

describe("статистика", () => {
  it("середнє, СКВ, медіана, p95 і довірчий інтервал", () => {
    const s = summarize([1, 2, 3, 4, 5])!;
    expect(s.mean).toBe(3);
    expect(s.sd).toBeCloseTo(Math.sqrt(2.5));
    expect(s.median).toBe(3);
    expect(s.p95).toBe(5);
    expect(s.ci95).toBeCloseTo((2.776 * Math.sqrt(2.5)) / Math.sqrt(5));
  });

  it("одне значення: sd = 0, ci95 = 0", () => {
    const s = summarize([7])!;
    expect(s.sd).toBe(0);
    expect(s.ci95).toBe(0);
  });

  it("порожній масив і NaN", () => {
    expect(summarize([])).toBeNull();
    expect(summarize([NaN, 2])!.n).toBe(1);
  });

  it("t-критерій і перцентиль", () => {
    expect(tCritical95(4)).toBe(2.776);
    expect(tCritical95(100)).toBe(1.96);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
  });
});

describe("розбір SSE", () => {
  it("повертає цілі події й неповний залишок", () => {
    const r = parseSseBuffer('data: {"type":"status","t":5}\n\ndata: {"type":"done"}\n\ndata: {"ty');
    expect(r.events.map((e) => e.type)).toEqual(["status", "done"]);
    expect(r.rest).toBe('data: {"ty');
  });

  it("пропускає пошкоджені фрагменти", () => {
    expect(parseSseBuffer("data: {oops}\n\n").events).toEqual([]);
  });
});
