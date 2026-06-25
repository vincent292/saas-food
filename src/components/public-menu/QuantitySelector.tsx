import { Minus, Plus } from "lucide-react";

export function QuantitySelector({ quantity = 1 }: { quantity?: number }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white p-1">
      <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--primary-light)]" title="Restar" type="button">
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-6 text-center text-sm font-bold">{quantity}</span>
      <button className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary)] text-white" title="Sumar" type="button">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
