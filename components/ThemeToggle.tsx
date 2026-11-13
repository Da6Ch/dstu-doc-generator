"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "theme";

/** Реактивно відстежує клас `dark` на <html> (перемикається кнопкою теми) */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export default function ThemeToggle() {
  const dark = useIsDark();

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // сховище недоступне (приватний режим) — тема діє лише в цій сесії
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Увімкнути світлу тему" : "Увімкнути темну тему"}
      title={dark ? "Світла тема" : "Темна тема"}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
