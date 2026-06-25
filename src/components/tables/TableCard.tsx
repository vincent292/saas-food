import { QrCode, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { RestaurantTable } from "@/types/order.types";

export function TableCard({ table }: { table: RestaurantTable }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-[var(--text)]">{table.name}</h3>
          <p className="mt-1 flex items-center gap-1 text-sm text-[var(--muted)]">
            <Users className="h-4 w-4" />
            {table.capacity} personas
          </p>
        </div>
        <Badge>{table.status.replace("_", " ")}</Badge>
      </div>
      <div className="mt-5 flex items-center justify-between rounded-2xl bg-slate-50 p-4">
        <span className="text-sm font-bold text-[var(--text)]">{table.code}</span>
        <QrCode className="h-5 w-5 text-[var(--primary)]" />
      </div>
    </Card>
  );
}
