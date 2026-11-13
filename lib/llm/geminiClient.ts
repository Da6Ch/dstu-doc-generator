// lib/llm/geminiClient.ts
//
// Тонка обгортка над @google/genai для потокової (streaming) генерації
// тексту. Ключ API читається виключно зі змінних середовища на сервері —
// клієнту він ніколи не передається.

import { GoogleGenAI } from "@google/genai";

const MODEL_NAME = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "Змінна середовища GEMINI_API_KEY не задана. Отримайте безкоштовний " +
        "ключ у Google AI Studio та додайте його у .env.local"
    );
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

/**
 * Виконує потоковий запит до Gemini та викликає onChunk для кожного
 * фрагмента тексту у міру надходження.
 *
 * Інколи потік обривається в самому кінці з помилкою "Incomplete JSON
 * segment at the end" (останній шматок відповіді прийшов неповним). Якщо
 * текст уже отримано, це не вважаємо фатальною помилкою: повертаємо
 * interrupted=true, а документ показуємо в тому вигляді, в якому він
 * прийшов.
 */
export async function streamGeminiText(
  prompt: string,
  onChunk: (delta: string) => void,
  signal?: AbortSignal
): Promise<{ interrupted: boolean }> {
  const ai = getClient();

  const stream = await ai.models.generateContentStream({
    model: MODEL_NAME,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.3, // низька температура — для стабільної офіційної документації
      maxOutputTokens: 8192,
    },
  });

  let received = false;
  try {
    for await (const chunk of stream) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const text = chunk.text;
      if (text) {
        received = true;
        onChunk(text);
      }
    }
  } catch (err) {
    const message = (err as Error).message ?? "";
    if (received && /Incomplete JSON segment/i.test(message)) {
      console.warn("Потік Gemini завершився передчасно:", message);
      return { interrupted: true };
    }
    throw err;
  }
  return { interrupted: false };
}
