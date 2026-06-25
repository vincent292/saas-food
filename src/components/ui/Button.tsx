import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function buttonClasses(variant: ButtonVariant = "primary", className?: string) {
  return cn(
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
    variant === "primary" && "bg-[var(--primary)] text-white shadow-sm hover:bg-[var(--primary-dark)] focus-visible:outline-[var(--primary)]",
    variant === "secondary" && "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--primary-light)]",
    variant === "ghost" && "text-[var(--text)] hover:bg-[var(--primary-light)]",
    variant === "danger" && "bg-[var(--danger)] text-white hover:bg-red-700 focus-visible:outline-[var(--danger)]",
    className,
  );
}

export function Button({ className, variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClasses(variant, className)} {...props} />;
}
