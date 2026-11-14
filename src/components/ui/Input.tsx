import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

export const inputClasses =
  "ui-input min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--color-input)] px-4 text-sm text-[var(--text)] outline-none transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-[var(--color-placeholder)] hover:border-[var(--primary-light)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:ring-2 focus:ring-[var(--primary-light)] disabled:bg-[var(--color-neutral-100)] disabled:text-[var(--color-disabled)]";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      className={cn(inputClasses, className)}
      ref={ref}
      {...props}
    />
  );
});

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn("ui-input min-h-24 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--color-input)] px-4 py-3 text-sm text-[var(--text)] outline-none transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-[var(--color-placeholder)] hover:border-[var(--primary-light)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:ring-2 focus:ring-[var(--primary-light)] disabled:bg-[var(--color-neutral-100)] disabled:text-[var(--color-disabled)]", className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn("ui-input min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--color-input)] px-4 text-sm text-[var(--text)] outline-none transition-[background-color,border-color,box-shadow] duration-150 hover:border-[var(--primary-light)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:ring-2 focus:ring-[var(--primary-light)] disabled:bg-[var(--color-neutral-100)] disabled:text-[var(--color-disabled)]", className)}
      {...props}
    />
  );
}
