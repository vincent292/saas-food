import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

export const inputClasses =
  "min-h-11 w-full rounded-2xl border border-[var(--border)] bg-white px-4 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-light)]";

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
      className={cn("min-h-24 w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-light)]", className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn("min-h-11 w-full rounded-2xl border border-[var(--border)] bg-white px-4 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-light)]", className)}
      {...props}
    />
  );
}
