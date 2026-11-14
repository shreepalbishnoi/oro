"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

/** Light / dark switch. Dark is the default; the choice is remembered in this browser. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"));
    return () => cancelAnimationFrame(id);
  }, []);

  const next: Theme = theme === "light" ? "dark" : "light";
  const flip = () => {
    const root = document.documentElement;
    if (next === "light") root.dataset.theme = "light";
    else delete root.dataset.theme;
    try {
      localStorage.setItem("oro.theme", next);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "light" ? "#F6F1E6" : "#070A11");
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={next === "light" ? "Switch to light theme" : "Switch to dark theme"}
      title={next === "light" ? "Light theme" : "Dark theme"}
      className={`grid size-10 shrink-0 place-items-center rounded-full border border-line text-paper-dim transition-colors hover:border-line-strong hover:text-paper ${className}`}
    >
      {theme === "light" ? <Moon className="size-[1.1rem]" aria-hidden="true" /> : <Sun className="size-[1.1rem]" aria-hidden="true" />}
    </button>
  );
}
