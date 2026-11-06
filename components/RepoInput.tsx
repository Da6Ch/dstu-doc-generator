"use client";

import { useState } from "react";
import { GitBranch, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface RepoInputProps {
  onValidated: (repoUrl: string, branch: string) => void;
}

type ValidationState = "idle" | "checking" | "valid" | "invalid";

export default function RepoInput({ onValidated }: RepoInputProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [state, setState] = useState<ValidationState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function validate() {
    setState("checking");
    setErrorMsg("");
    try {
      const match = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(\.git)?\/?$/.exec(
        repoUrl.trim()
      );
      if (!match) throw new Error("Очікується посилання виду https://github.com/власник/репозиторій");

      const [, owner, repo] = match;
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`
      );
      if (!res.ok) throw new Error("Репозиторій не знайдено або він приватний");
      const data = await res.json();

      const finalBranch = branch.trim() || data.default_branch || "main";
      setBranch(finalBranch);
      setState("valid");
      onValidated(repoUrl.trim(), finalBranch);
    } catch (err) {
      setState("invalid");
      setErrorMsg((err as Error).message);
    }
  }

  return (
    <div className="w-full max-w-xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Посилання на публічний GitHub-репозиторій
        </label>
        <input
          type="text"
          value={repoUrl}
          onChange={(e) => {
            setRepoUrl(e.target.value);
            setState("idle");
          }}
          placeholder="https://github.com/owner/repository"
          className="w-full rounded-lg bg-slate-800 border border-slate-700 px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-slate-300 mb-1.5">
          <GitBranch size={14} /> Гілка (необов'язково)
        </label>
        <input
          type="text"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="залиште порожнім — буде гілка за замовчуванням"
          className="w-full rounded-lg bg-slate-800 border border-slate-700 px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <button
        onClick={validate}
        disabled={!repoUrl || state === "checking"}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 transition-colors"
      >
        {state === "checking" && <Loader2 size={16} className="animate-spin" />}
        {state === "valid" && <CheckCircle2 size={16} />}
        {state === "invalid" && <XCircle size={16} />}
        {state === "checking" ? "Перевірка доступності..." : "Перевірити та продовжити"}
      </button>

      {state === "invalid" && (
        <p className="text-sm text-red-400">{errorMsg}</p>
      )}
    </div>
  );
}
