"use client";

import { FileText } from "lucide-react";
import { DSTU_STANDARDS } from "@/lib/llm/standards";
import type { DstuStandardId } from "@/lib/types";

interface ArtifactSelectorProps {
  selected: DstuStandardId[];
  onChange: (selected: DstuStandardId[]) => void;
}

export default function ArtifactSelector({
  selected,
  onChange,
}: ArtifactSelectorProps) {
  function toggle(id: DstuStandardId) {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id]
    );
  }

  return (
    <div className="w-full max-w-2xl space-y-3">
      {Object.values(DSTU_STANDARDS).map((standard) => {
        const checked = selected.includes(standard.id);
        return (
          <label
            key={standard.id}
            className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
              checked
                ? "border-indigo-500 bg-indigo-950/40"
                : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(standard.id)}
              className="mt-1 accent-indigo-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 font-medium text-slate-100">
                <FileText size={16} className="text-indigo-400" />
                {standard.code} «{standard.title}»
              </div>
              <p className="text-sm text-slate-400 mt-1">
                {standard.description}
              </p>
            </div>
          </label>
        );
      })}
    </div>
  );
}
