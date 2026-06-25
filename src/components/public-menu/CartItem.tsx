import { Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/utils/money";
import { QuantitySelector } from "./QuantitySelector";

export function CartItem({ name, price, quantity }: { name: string; price: number; quantity: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-4">
      <div>
        <p className="font-semibold text-[var(--text)]">{name}</p>
        <p className="text-sm text-[var(--muted)]">{formatMoney(price)}</p>
        <div className="mt-2">
          <QuantitySelector quantity={quantity} />
        </div>
      </div>
      <button className="grid h-10 w-10 place-items-center rounded-full text-[var(--muted)] hover:bg-red-50 hover:text-red-600" title="Eliminar" type="button">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
