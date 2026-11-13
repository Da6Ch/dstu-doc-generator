// lib/eval/sse.ts
// Розбір потоку Server-Sent Events: події відокремлені порожнім рядком.

export interface SseEvent {
  type: string;
  t?: number;
  [key: string]: unknown;
}

export function parseSseBuffer(buffer: string): { events: SseEvent[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: SseEvent[] = [];
  for (const part of parts) {
    const line = part.trim();
    if (!line.startsWith("data:")) continue;
    try {
      events.push(JSON.parse(line.slice(5).trim()) as SseEvent);
    } catch {
      // пошкоджений фрагмент пропускаємо
    }
  }
  return { events, rest };
}
