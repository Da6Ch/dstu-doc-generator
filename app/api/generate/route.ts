// app/api/generate/route.ts
//
// Головний ендпоінт генерації документації. Приймає посилання на
// репозиторій та обрані типи документів, виконує пайплайн
// (клонування -> фільтрація -> дайджест -> генерація для кожного
// документа) і транслює прогрес та текст клієнту через Server-Sent Events.

import { NextRequest } from "next/server";
import { cloneRepo } from "@/lib/git/cloneRepo";
import { collectRepoFiles } from "@/lib/git/filterFiles";
import { buildRepoDigest } from "@/lib/git/buildDigest";
import { PROMPT_BUILDERS } from "@/lib/llm/prompts";
import { DOC_STANDARDS } from "@/lib/llm/standards";
import { streamGeminiText } from "@/lib/llm/geminiClient";
import type { GenerationEvent, GenerationRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 хв — генерація кількох документів може тривати довго

function sseEvent(event: GenerationEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json()) as GenerationRequest;

  if (!body.repoUrl || !body.standards?.length) {
    return new Response(
      JSON.stringify({ error: "repoUrl та хоча б один стандарт обов'язкові" }),
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const abortController = new AbortController();
  req.signal.addEventListener("abort", () => abortController.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: GenerationEvent) =>
        controller.enqueue(
          encoder.encode(sseEvent({ ...event, t: Date.now() - t0 }))
        );

      let cleanup: (() => Promise<void>) | undefined;
      try {
        send({
          type: "status",
          stage: "clone",
          message: `Клонування репозиторію ${body.repoUrl}...`,
        });

        const cloned = await cloneRepo(body.repoUrl, body.branch);
        const { dir, owner, repo } = cloned;
        cleanup = cloned.cleanup;
        send({
          type: "status",
          stage: "cloned",
          message: `Клонування завершено (коміт ${cloned.commit.slice(0, 7)}).`,
        });

        send({
          type: "status",
          stage: "filter",
          message: "Аналіз та фільтрація файлів репозиторію...",
        });

        const { tree, files, readme, totalFilesScanned } =
          await collectRepoFiles(dir);

        send({ type: "tree", tree });
        send({
          type: "status",
          stage: "digest",
          message: `Відібрано ${files.length} із ${totalFilesScanned} файлів. Формування конспекту коду...`,
        });

        const digest = buildRepoDigest(tree, files);
        await cleanup(); // файли вже в пам'яті — тимчасова тека більше не потрібна
        cleanup = undefined;

        for (const standardId of body.standards) {
          if (abortController.signal.aborted) break;

          const meta = DOC_STANDARDS[standardId];
          send({
            type: "doc-start",
            standard: standardId,
            title: `${meta.code} — ${meta.title}`,
          });

          const prompt = PROMPT_BUILDERS[standardId]({
            owner,
            repo,
            digest,
            readme,
          });

          const { interrupted } = await streamGeminiText(
            prompt,
            (delta) => send({ type: "doc-chunk", standard: standardId, delta }),
            abortController.signal
          );
          if (interrupted) {
            console.warn(`Документ ${standardId}: потік обірвався наприкінці.`);
          }

          send({ type: "doc-end", standard: standardId });
        }

        send({ type: "done" });
      } catch (err) {
        const e = err as Error & { cause?: { code?: string; message?: string } };
        console.error("Помилка генерації:", err);
        const cause = e.cause?.code ?? e.cause?.message;
        send({
          type: "error",
          message:
            (e.message ?? "Невідома помилка генерації") +
            (cause ? ` (причина: ${cause})` : ""),
        });
      } finally {
        await cleanup?.();
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
