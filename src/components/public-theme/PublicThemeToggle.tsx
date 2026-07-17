"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

type PublicTheme = "light" | "dark";

function applyTheme(theme: PublicTheme) {
  document.querySelectorAll<HTMLElement>(".public-brand-theme").forEach((element) => {
    element.dataset.publicTheme = theme;
  });
}

export function PublicThemeToggle({ compact = false, tone = "surface" }: { compact?: boolean; tone?: "surface" | "onPrimary" }) {
  const [theme, setTheme] = useState<PublicTheme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedTheme = localStorage.getItem("public-theme") === "dark" ? "dark" : "light";
      setTheme(storedTheme);
      setMounted(true);
      applyTheme(storedTheme);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("public-theme", nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <button
      aria-label={mounted && theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-3 text-sm font-black shadow-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]",
        tone === "surface" && "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--accent)] hover:text-[var(--primary-dark)]",
        tone === "onPrimary" && "border border-white/70 bg-white text-[#12355B] hover:bg-[var(--accent)]",
        compact && "h-10 w-10 px-0",
      )}
      onClick={toggleTheme}
      type="button"
    >
      {mounted && theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {compact ? null : <span>{mounted && theme === "dark" ? "Claro" : "Oscuro"}</span>}
    </button>
  );
}
