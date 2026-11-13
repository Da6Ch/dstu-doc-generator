import { describe, it, expect } from "vitest";
import { PROMPT_BUILDERS } from "@/lib/llm/prompts";
import { SECTION_SPECS } from "@/lib/eval/structure";
import { DOC_STANDARDS } from "@/lib/llm/standards";
import type { DocStandardId } from "@/lib/types";

const ids = Object.keys(PROMPT_BUILDERS) as DocStandardId[];
const params = { owner: "own", repo: "rep", digest: "DIGEST_MARKER", readme: "README_MARKER" };

describe("промпт-шаблони", () => {
  it("реєстр, метадані й специфікації розділів узгоджені", () => {
    expect(ids.sort()).toEqual(Object.keys(DOC_STANDARDS).sort());
    expect(ids.sort()).toEqual(Object.keys(SECTION_SPECS).sort());
  });

  it.each(ids)("%s: містить репозиторій, дайджест і README", (id) => {
    const p = PROMPT_BUILDERS[id](params);
    expect(p).toContain("own/rep");
    expect(p).toContain("DIGEST_MARKER");
    expect(p).toContain("README_MARKER");
  });

  it.each(ids)("%s: містить правила заземленості й примітку про автоматичне формування", (id) => {
    const p = PROMPT_BUILDERS[id](params);
    expect(p).toContain("Припущення:");
    expect(p).toContain("сформовано");
  });

  it.each(ids)("%s: усі розділи, які перевіряє метрика SC, задано в промпті", (id) => {
    const p = PROMPT_BUILDERS[id](params).toLowerCase();
    for (const spec of SECTION_SPECS[id]) {
      expect(p, `розділ «${spec.phrase}»`).toContain(spec.phrase);
    }
  });

  it("опис архітектури вимагає суворих правил Mermaid", () => {
    const p = PROMPT_BUILDERS["iso-42010"](params);
    expect(p).toContain("graph TD");
    expect(p).toContain("подвійні лапки");
  });

  it("специфікація вимог вимагає ідентифікаторів і форми «Система повинна»", () => {
    const p = PROMPT_BUILDERS["iso-29148"](params);
    expect(p).toContain("FR-001");
    expect(p).toContain("Система повинна");
  });

  it("README необов'язковий", () => {
    const p = PROMPT_BUILDERS["iso-26514"]({ ...params, readme: undefined });
    expect(p).not.toContain("## README проєкту");
  });
});
