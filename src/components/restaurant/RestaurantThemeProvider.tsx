import type { CSSProperties, ReactNode } from "react";
import type { RestaurantTheme } from "@/types/restaurant.types";

export function RestaurantThemeProvider({ theme, children }: { theme: RestaurantTheme; children: ReactNode }) {
  const style = {
    "--primary": theme.primary,
    "--primary-dark": theme.primaryDark,
    "--primary-light": theme.primaryLight,
    "--background": theme.background,
    "--surface": theme.surface,
    "--text": theme.text,
    "--muted": theme.muted,
    "--border": theme.border,
    "--nav-background": theme.navBackground,
    "--nav-text": theme.navText,
    "--success": theme.success,
    "--warning": theme.warning,
    "--danger": theme.danger,
  } as CSSProperties;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text)]" style={style}>
      {children}
    </div>
  );
}
