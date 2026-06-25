import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm", className)} {...props} />;
}
