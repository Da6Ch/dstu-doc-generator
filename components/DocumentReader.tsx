"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download, FileDown, Loader2 } from "lucide-react";

interface MermaidBlockProps {
  code: string;
  streaming: boolean;
}

/**
 * Рендерить діаграму Mermaid. Поки документ ще генерується, код діаграми
 * неповний і містить синтаксичні помилки, тому рендеринг відкладається до
 * завершення потоку. Якщо діаграма некоректна, показуємо її код замість
 * помилки, а службові елементи Mermaid прибираємо зі сторінки.
 */
function MermaidBlock({ code, streaming }: MermaidBlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (streaming) return;
    let cancelled = false;
    setFailed(false);

    (async () => {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "strict",
      });
      const id = `mermaid-${Math.random().toString(36).slice(2)}`;
      try {
        const valid = await mermaid.parse(code, { suppressErrors: true });
        if (!valid) throw new Error("invalid mermaid syntax");
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch {
        document.getElementById(`d${id}`)?.remove();
        document.getElementById(id)?.remove();
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, streaming]);

  if (streaming) {
    return (
      <div className="my-4 text-xs text-slate-500">
        Діаграма з'явиться після завершення генерації...
      </div>
    );
  }
  if (failed) {
    return (
      <div className="my-4 rounded-md border border-slate-700 bg-slate-950/60 p-3">
        <p className="mb-2 text-xs text-amber-400">
          Діаграму не вдалося відобразити (модель згенерувала некоректний
          синтаксис). Код діаграми:
        </p>
        <div className="whitespace-pre-wrap font-mono text-xs text-slate-300">
          {code}
        </div>
      </div>
    );
  }
  return <div ref={ref} className="my-4 flex justify-center" />;
}

export interface DocumentReaderProps {
  title: string;
  content: string;
  isStreaming?: boolean;
  onDownloadMarkdown?: () => void;
  onExportDocx?: () => void;
}

export default function DocumentReader({
  title,
  content,
  isStreaming,
  onDownloadMarkdown,
  onExportDocx,
}: DocumentReaderProps) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-800/50">
        <h3 className="font-semibold text-slate-100 flex items-center gap-2">
          {title}
          {isStreaming && (
            <Loader2 size={14} className="animate-spin text-indigo-400" />
          )}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onDownloadMarkdown}
            disabled={isStreaming}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200"
          >
            <Download size={13} /> .md
          </button>
          <button
            onClick={onExportDocx}
            disabled={isStreaming}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200"
          >
            <FileDown size={13} /> .docx
          </button>
        </div>
      </div>

      <div className="prose prose-invert prose-slate max-w-none px-6 py-5 text-sm">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children, ...props }) {
              const match = /language-mermaid/.exec(className ?? "");
              if (match) {
                return (
                  <MermaidBlock
                    code={String(children).trim()}
                    streaming={!!isStreaming}
                  />
                );
              }
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {content || "_Очікування даних від моделі..._"}
        </ReactMarkdown>
      </div>
    </div>
  );
}
