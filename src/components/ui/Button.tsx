import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function buttonClasses(variant: ButtonVariant = "primary", className?: string) {
  return cn(
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-4 disabled:pointer-events-none disabled:bg-[var(--color-disabled)] disabled:text-[var(--color-on-primary)] disabled:shadow-none",
    variant === "primary" && "bg-[var(--primary)] text-[var(--color-on-primary)] shadow-[var(--shadow-primary)] hover:bg-[var(--primary-dark)] active:bg-[var(--primary-dark)] focus-visible:ring-[var(--primary-light)]",
    variant === "secondary" && "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-sm hover:border-[var(--primary-light)] hover:bg-[var(--primary-light)] active:bg-[var(--primary-light)] focus-visible:ring-[var(--primary-light)]",
    variant === "ghost" && "text-[var(--text)] hover:bg-[var(--primary-light)] active:bg-[var(--primary-light)] focus-visible:ring-[var(--primary-light)]",
    variant === "danger" && "bg-[var(--danger)] text-[var(--color-on-primary)] shadow-sm hover:bg-[var(--color-danger-strong)] focus-visible:ring-[var(--color-danger-soft)]",
    className,
  );
}

export function Button({ className, variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClasses(variant, className)} {...props} />;
}
