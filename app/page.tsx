"use client";

import { useRouter } from "next/navigation";
import { FileCode2 } from "lucide-react";
import RepoInput from "@/components/RepoInput";

export default function HomePage() {
  const router = useRouter();

  function handleValidated(repoUrl: string, branch: string) {
    const params = new URLSearchParams({ repoUrl, branch });
    router.push(`/generate?${params.toString()}`);
  }

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
      <div className="flex items-center gap-2 mb-2 text-indigo-400">
        <FileCode2 size={28} />
        <span className="text-sm uppercase tracking-widest">
          Інтелектуальна генерація документації ПЗ
        </span>
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-slate-100 mb-3 text-center">
        Автоматичне формування проєктної документації ПЗ
      </h1>
      <p className="text-slate-400 max-w-xl text-center mb-10">
        Вкажіть публічний GitHub-репозиторій — система проаналізує код і
        згенерує документацію за стандартами ISO/IEC/IEEE: специфікація вимог, опис архітектури, документація користувача.
      </p>
      <RepoInput onValidated={handleValidated} />
    </main>
  );
}
