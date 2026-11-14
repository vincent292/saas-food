import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function buttonClasses(variant: ButtonVariant = "primary", className?: string) {
  return cn(
    "ui-button inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 py-2 text-sm font-semibold transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:pointer-events-none disabled:bg-[var(--color-neutral-100)] disabled:text-[var(--muted)] disabled:shadow-none",
    variant === "primary" && "bg-[var(--primary)] text-[var(--color-on-primary)] hover:bg-[var(--primary-dark)] active:bg-[var(--primary-dark)]",
    variant === "secondary" && "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--color-primary-200)] hover:bg-[var(--primary-light)] active:bg-[var(--primary-light)]",
    variant === "ghost" && "text-[var(--text)] hover:bg-[var(--primary-light)] active:bg-[var(--primary-light)]",
    variant === "danger" && "bg-[var(--danger)] text-[var(--color-on-primary)] hover:bg-[var(--color-danger-strong)] active:bg-[var(--color-danger-strong)]",
    className,
  );
}

export function Button({ className, variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClasses(variant, className)} {...props} />;
}
