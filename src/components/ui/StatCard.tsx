import type { ReactNode } from "react";
import { Card } from "./Card";

export function StatCard({ label, value, detail, icon }: { label: string; value: string; detail?: string; icon?: ReactNode }) {
  return (
    <Card className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
        <p className="mt-2 text-3xl font-bold text-[var(--text)]">{value}</p>
        {detail ? <p className="mt-2 text-xs text-[var(--muted)]">{detail}</p> : null}
      </div>
      {icon ? <div className="rounded-2xl bg-[var(--primary-light)] p-3 text-[var(--primary)]">{icon}</div> : null}
    </Card>
  );
}
