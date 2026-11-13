// scripts/lib/mermaidParser.ts
//
// Перевірка справжньої граматики Mermaid у Node. Mermaid потребує DOM,
// тому підключаємо jsdom. Спершу перевіряємо «пробну» діаграму: якщо вона
// не проходить, парсер вважається недоступним (а не діаграма — помилковою).

export type MermaidParser = {
  available: boolean;
  version?: string;
  reason?: string;
  validate: (code: string) => Promise<boolean | null>;
};

export async function createMermaidParser(): Promise<MermaidParser> {
  try {
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
    const g = globalThis as Record<string, unknown>;
    g.window = dom.window;
    g.document = dom.window.document;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mermaid = (await import("mermaid")).default as any;
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });

    const probe = await mermaid.parse("graph TD\n  A[\"x\"] --> B[\"y\"]", {
      suppressErrors: true,
    });
    if (!probe) throw new Error("пробна діаграма не пройшла розбір");

    return {
      available: true,
      version: mermaid.version ?? undefined,
      validate: async (code: string) => {
        try {
          return Boolean(await mermaid.parse(code, { suppressErrors: true }));
        } catch {
          return false;
        }
      },
    };
  } catch (err) {
    return {
      available: false,
      reason: (err as Error).message,
      validate: async () => null,
    };
  }
}
