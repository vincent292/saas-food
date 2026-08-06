"use client";

import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import type { FocusEvent, InputHTMLAttributes, MouseEvent } from "react";

function dateYearsAgo(years: number) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

export function BirthDateInput({
  className,
  max = dateYearsAgo(18),
  min = "1900-01-01",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  function openPicker(event: FocusEvent<HTMLInputElement> | MouseEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    try {
      input.showPicker?.();
    } catch {
      // Some browsers only allow showPicker during direct pointer activation.
    }
  }

  return (
    <div className="relative">
      <Input
        className={cn("cursor-pointer pr-11", className)}
        max={max}
        min={min}
        onClick={openPicker}
        onFocus={openPicker}
        type="date"
        {...props}
      />
      <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-secondary-text)]" />
    </div>
  );
}
