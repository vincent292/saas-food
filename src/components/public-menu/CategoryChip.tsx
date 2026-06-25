import { cn } from "@/lib/utils/cn";

export function CategoryChip({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <button
      className={cn(
        "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition",
        active ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)] bg-white text-[var(--text)] hover:bg-[var(--primary-light)]",
      )}
      type="button"
    >
      {label}
    </button>
  );
}
