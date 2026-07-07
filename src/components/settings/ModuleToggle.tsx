import { ToggleRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function ModuleToggle({ label, enabled, name, disabled = false }: { label: string; enabled: boolean; name?: string; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4", disabled && "cursor-not-allowed bg-[var(--color-surface)] opacity-60")}>
      <span className="font-semibold text-[var(--color-heading)]">{label}</span>
      {name ? <input className="peer sr-only" defaultChecked={enabled} disabled={disabled} name={name} type="checkbox" /> : null}
      <span className={name ? "text-[var(--color-disabled)] peer-checked:text-[var(--color-success)]" : enabled ? "text-[var(--color-success)]" : "text-[var(--color-disabled)]"}>
        <ToggleRight className="h-7 w-7" />
      </span>
    </label>
  );
}
