import type { ReactNode } from "react";
import type { RestaurantTheme } from "@/types/restaurant.types";

export function RestaurantThemeProvider({ children }: { theme: RestaurantTheme; children: ReactNode }) {
  return (
    <div className="public-brand-theme min-h-screen bg-[var(--background)] text-[var(--text)]">
      {children}
    </div>
  );
}
