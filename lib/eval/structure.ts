// lib/eval/structure.ts
//
// Структурна відповідність згенерованого документа шаблону: частка
// обов'язкових розділів, присутніх у заголовках Markdown.
// SC(s) = |{h ∈ H_s : h присутній}| / |H_s|

import type { DocStandardId } from "@/lib/types";

export interface SectionSpec {
  /** Підрядок (нижній регістр), що має міститися в тексті заголовка */
  phrase: string;
  /** Необов'язкові розділи не входять до знаменника SC */
  optional?: boolean;
}

export const SECTION_SPECS: Record<DocStandardId, SectionSpec[]> = {
  "iso-29148": [
    { phrase: "вступ" },
    { phrase: "нормативні та інші посилання" },
    { phrase: "специфічні вимоги" },
    { phrase: "зовнішні інтерфейси" },
    { phrase: "функціональні вимоги" },
    { phrase: "вимоги до зручності використання" },
    { phrase: "вимоги до продуктивності" },
    { phrase: "вимоги до даних" },
    { phrase: "проєктні обмеження" },
    { phrase: "атрибути якості системи" },
    { phrase: "верифікація" },
    { phrase: "додатки" },
  ],
  "iso-42010": [
    { phrase: "ідентифікація та огляд" },
    { phrase: "зацікавлені сторони та їхні інтереси" },
    { phrase: "ракурси" },
    { phrase: "архітектурні розрізи" },
    { phrase: "відповідності між розрізами" },
    { phrase: "архітектурні рішення та обґрунтування" },
    { phrase: "ризики, обмеження та відомі прогалини" },
    { phrase: "контекстний розріз", optional: true },
    { phrase: "логічний", optional: true },
    { phrase: "розріз потоків даних", optional: true },
    { phrase: "розріз розгортання", optional: true },
    { phrase: "інформаційний розріз", optional: true },
  ],
  "iso-26514": [
    { phrase: "про документ" },
    { phrase: "огляд системи" },
    { phrase: "підготовка до встановлення" },
    { phrase: "встановлення та розгортання" },
    { phrase: "налаштування" },
    { phrase: "використання" },
    { phrase: "довідкова інформація" },
    { phrase: "усунення несправностей" },
    { phrase: "глосарій" },
  ],
  "espd-19404": [
    { phrase: "вступ" },
    { phrase: "призначення та галузь застосування" },
    { phrase: "технічні характеристики" },
    { phrase: "обґрунтування вибору мови" },
    { phrase: "обґрунтування архітектурних рішень" },
    { phrase: "опис алгоритму" },
    { phrase: "використані технічні засоби" },
    { phrase: "очікувані техніко-економічні показники" },
    { phrase: "джерела" },
  ],
};

/** Текст усіх заголовків Markdown (рядки, що починаються з #) у нижньому регістрі */
export function extractHeadings(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .filter((line) => /^\s{0,3}#{1,6}\s+\S/.test(line))
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/[*_`]/g, "")
        .trim()
        .toLowerCase()
    );
}

export interface StructureResult {
  score: number; // SC ∈ [0, 1] за обов'язковими розділами
  required: number;
  found: number;
  missing: string[];
  optionalFound: number;
  optionalTotal: number;
}

export function structuralConformity(
  standard: DocStandardId,
  markdown: string
): StructureResult {
  const headings = extractHeadings(markdown);
  const has = (phrase: string) => headings.some((h) => h.includes(phrase));

  const specs = SECTION_SPECS[standard];
  const required = specs.filter((s) => !s.optional);
  const optional = specs.filter((s) => s.optional);

  const missing = required.filter((s) => !has(s.phrase)).map((s) => s.phrase);
  const found = required.length - missing.length;

  return {
    score: required.length === 0 ? 1 : found / required.length,
    required: required.length,
    found,
    missing,
    optionalFound: optional.filter((s) => has(s.phrase)).length,
    optionalTotal: optional.length,
  };
}

/** Ознака повноти: у кінці документа є примітка про автоматичне формування */
export function hasCompletionNote(markdown: string): boolean {
  const tail = markdown.slice(-600).toLowerCase();
  return tail.includes("сформовано автоматично");
}
