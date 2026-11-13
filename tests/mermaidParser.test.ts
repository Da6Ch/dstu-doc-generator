import { describe, it, expect } from "vitest";
import { createMermaidParser } from "../scripts/lib/mermaidParser";

const parser = await createMermaidParser();

describe("перевірка граматики Mermaid", () => {
  it("парсер або доступний, або явно позначений недоступним", () => {
    expect(typeof parser.available).toBe("boolean");
    if (!parser.available) console.warn("Mermaid-парсер недоступний:", parser.reason);
  });

  describe.skipIf(!parser.available)("з парсером", () => {
    it("приймає коректну діаграму", async () => {
      expect(await parser.validate('graph TD\n  A["Клієнт"] --> B["Сервер"]')).toBe(true);
    });

    it("відхиляє некоректну діаграму", async () => {
      expect(await parser.validate("graph TD\n  A[ --> ")).toBe(false);
    });
  });
});
