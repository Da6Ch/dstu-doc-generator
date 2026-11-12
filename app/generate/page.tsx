"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Play, FolderTree } from "lucide-react";
import ArtifactSelector from "@/components/ArtifactSelector";
import DocumentReader from "@/components/DocumentReader";
import { DOC_STANDARDS } from "@/lib/llm/standards";
import type {
  DocStandardId,
  GenerationEvent,
  RepoTreeNode,
} from "@/lib/types";

type DocsState = Record<
  string,
  { title: string; content: string; done: boolean }
>;

function renderTreePreview(nodes: RepoTreeNode[], depth = 0): string {
  return nodes
    .map((n) => {
      const line = "  ".repeat(depth) + (n.type === "dir" ? "📁 " : "📄 ") + n.name;
      return n.children?.length
        ? line + "\n" + renderTreePreview(n.children, depth + 1)
        : line;
    })
    .join("\n");
}

function GeneratePageInner() {
  const searchParams = useSearchParams();
  const repoUrl = searchParams.get("repoUrl") ?? "";
  const branch = searchParams.get("branch") ?? "main";

  const [selected, setSelected] = useState<DocStandardId[]>([
    "iso-42010",
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [tree, setTree] = useState<RepoTreeNode[] | null>(null);
  const [docs, setDocs] = useState<DocsState>({});
  const [errorMsg, setErrorMsg] = useState("");

  const orderedStandards = useMemo(
    () => selected.map((id) => DOC_STANDARDS[id]),
    [selected]
  );

  async function startGeneration() {
    setIsGenerating(true);
    setErrorMsg("");
    setDocs({});
    setTree(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, branch, standards: selected }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Сервер повернув помилку: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const event = JSON.parse(line.slice(5).trim()) as GenerationEvent;
          handleEvent(event);
        }
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsGenerating(false);
    }
  }

  function handleEvent(event: GenerationEvent) {
    switch (event.type) {
      case "status":
        setStatusMsg(event.message);
        break;
      case "tree":
        setTree(event.tree);
        break;
      case "doc-start":
        setDocs((prev) => ({
          ...prev,
          [event.standard]: { title: event.title, content: "", done: false },
        }));
        break;
      case "doc-chunk":
        setDocs((prev) => ({
          ...prev,
          [event.standard]: {
            ...prev[event.standard],
            content: (prev[event.standard]?.content ?? "") + event.delta,
          },
        }));
        break;
      case "doc-end":
        setDocs((prev) => ({
          ...prev,
          [event.standard]: { ...prev[event.standard], done: true },
        }));
        break;
      case "error":
        setErrorMsg(event.message);
        break;
      case "done":
        setStatusMsg("Генерацію завершено.");
        break;
    }
  }

  function downloadMarkdown(standardId: string) {
    const doc = docs[standardId];
    if (!doc) return;
    const blob = new Blob([doc.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${standardId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportDocx(standardId: string) {
    const doc = docs[standardId];
    if (!doc) return;
    const res = await fetch("/api/export-docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: doc.title, markdown: doc.content }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${standardId}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <p className="text-sm text-slate-500">Репозиторій</p>
          <p className="text-slate-200 font-mono text-sm">
            {repoUrl} <span className="text-slate-500">@ {branch}</span>
          </p>
        </div>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-3">
            Оберіть артефакти документації
          </h2>
          <ArtifactSelector selected={selected} onChange={setSelected} />
        </section>

        <button
          onClick={startGeneration}
          disabled={isGenerating || selected.length === 0}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-5 py-2.5 transition-colors"
        >
          <Play size={16} />
          {isGenerating ? "Генерація..." : "Згенерувати документацію"}
        </button>

        {statusMsg && (
          <p className="text-sm text-slate-400">{statusMsg}</p>
        )}
        {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}

        {tree && (
          <details className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
            <summary className="flex items-center gap-2 cursor-pointer text-slate-200 text-sm font-medium">
              <FolderTree size={15} /> Структура репозиторію
            </summary>
            <pre className="mt-3 text-xs text-slate-400 whitespace-pre-wrap">
              {renderTreePreview(tree)}
            </pre>
          </details>
        )}

        <div className="space-y-6">
          {orderedStandards.map((standard) => {
            const doc = docs[standard.id];
            if (!doc) return null;
            return (
              <DocumentReader
                key={standard.id}
                title={doc.title}
                content={doc.content}
                isStreaming={!doc.done}
                onDownloadMarkdown={() => downloadMarkdown(standard.id)}
                onExportDocx={() => exportDocx(standard.id)}
              />
            );
          })}
        </div>
      </div>
    </main>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={null}>
      <GeneratePageInner />
    </Suspense>
  );
}
