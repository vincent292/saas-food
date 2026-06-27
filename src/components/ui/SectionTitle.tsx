import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function SectionTitle({ title, description, action, className }: { title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)]">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
