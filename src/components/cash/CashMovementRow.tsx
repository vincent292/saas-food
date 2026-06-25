import { formatShortTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import type { CashMovement } from "@/types/cash.types";

export function CashMovementRow({ movement }: { movement: CashMovement }) {
  const isExpense = movement.type === "expense";

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 py-3">
      <div>
        <p className="font-semibold text-slate-950">{movement.description}</p>
        <p className="text-sm text-slate-500">
          {movement.type} · {movement.paymentMethod} · {formatShortTime(movement.createdAt)}
        </p>
      </div>
      <p className={isExpense ? "font-black text-red-600" : "font-black text-slate-950"}>
        {isExpense ? "-" : "+"}
        {formatMoney(movement.amount)}
      </p>
    </div>
  );
}
