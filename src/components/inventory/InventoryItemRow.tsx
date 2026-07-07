import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/utils/money";
import type { InventoryItem } from "@/types/inventory.types";

export function InventoryItemRow({ item }: { item: InventoryItem }) {
  const isLow = item.currentStock <= item.minStock;

  return (
    <div className="grid gap-3 border-b border-[var(--border)] py-4 lg:grid-cols-[1fr_120px_120px_150px] lg:items-center">
      <div className="min-w-0">
        <p className="font-bold text-[var(--color-heading)]">{item.name}</p>
        <p className="text-sm text-[var(--color-secondary-text)]">
          {item.category || "Insumo"} · unidad base: {item.unit}
        </p>
      </div>
      <p className="font-semibold">
        {item.currentStock} {item.unit}
      </p>
      <p className="text-sm text-[var(--color-secondary-text)]">
        mín. {item.minStock} {item.unit}
      </p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{formatMoney(item.unitCost)}</span>
        {isLow ? <Badge className="bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]">Bajo</Badge> : null}
      </div>
    </div>
  );
}
