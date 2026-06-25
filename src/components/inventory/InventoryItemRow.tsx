import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/utils/money";
import type { InventoryItem } from "@/types/inventory.types";

export function InventoryItemRow({ item }: { item: InventoryItem }) {
  const isLow = item.currentStock <= item.minStock;

  return (
    <div className="grid gap-3 border-b border-slate-200 py-4 sm:grid-cols-[1fr_120px_120px_120px] sm:items-center">
      <div>
        <p className="font-bold text-slate-950">{item.name}</p>
        <p className="text-sm text-slate-500">Unidad: {item.unit}</p>
      </div>
      <p className="font-semibold">{item.currentStock}</p>
      <p className="text-sm text-slate-500">mín. {item.minStock}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{formatMoney(item.unitCost)}</span>
        {isLow ? <Badge className="bg-amber-100 text-amber-800">Bajo</Badge> : null}
      </div>
    </div>
  );
}
