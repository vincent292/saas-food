import { formatShortTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import type { CashMovement } from "@/types/cash.types";

const movementLabels: Record<CashMovement["type"], string> = {
  sale: "Venta",
  expense: "Egreso",
  income: "Ingreso",
  adjustment: "Ajuste",
  opening: "Apertura",
  closing: "Cierre",
};

const paymentLabels: Record<CashMovement["paymentMethod"], string> = {
  cash: "Efectivo",
  qr: "QR",
  bank_transfer: "Transferencia",
  card: "Tarjeta",
  other: "Otro",
};

export function CashMovementRow({ movement }: { movement: CashMovement }) {
  const isExpense = movement.type === "expense";
  const isNeutral = movement.type === "opening" || movement.type === "closing";

  return (
    <div className="grid gap-3 border-b border-[var(--border)] py-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="font-semibold text-[var(--color-heading)]">{movement.description}</p>
        <p className="text-sm text-[var(--color-secondary-text)]">
          {movementLabels[movement.type]} · {paymentLabels[movement.paymentMethod]} · {formatShortTime(movement.createdAt)}
        </p>
      </div>
      <p className={isExpense ? "text-right font-black text-[var(--color-danger)]" : isNeutral ? "text-right font-black text-[var(--color-secondary-text)]" : "text-right font-black text-[var(--color-heading)]"}>
        {isExpense ? "-" : isNeutral ? "" : "+"}
        {formatMoney(movement.amount)}
      </p>
    </div>
  );
}
