import type { ReactNode } from "react";
import { Card } from "./Card";

export function StatCard({ label, value, detail, icon }: { label: string; value: string; detail?: string; icon?: ReactNode }) {
  return (
    <Card className="flex min-w-0 items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--muted)]">{label}</p>
        <p className="mt-2 truncate text-2xl font-black text-[var(--text)] sm:text-3xl">{value}</p>
        {detail ? <p className="mt-2 text-xs text-[var(--muted)]">{detail}</p> : null}
      </div>
      {icon ? <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--primary-light)] text-[var(--primary)]">{icon}</div> : null}
    </Card>
  );
}
