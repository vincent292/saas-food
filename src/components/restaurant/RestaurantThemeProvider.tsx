import type { ReactNode } from "react";

export function RestaurantThemeProvider({ children }: { children: ReactNode }) {
  return (
    <div className="public-brand-theme min-h-screen bg-[var(--background)] text-[var(--text)]">
      {children}
    </div>
  );
}
