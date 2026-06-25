import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatMoney } from "@/lib/utils/money";

export function CheckoutSummary({ subtotal, deliveryFee, total }: { subtotal: number; deliveryFee: number; total: number }) {
  return (
    <Card>
      <h3 className="text-lg font-bold text-[var(--text)]">Resumen</h3>
      <div className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between text-[var(--muted)]">
          <span>Subtotal</span>
          <span>{formatMoney(subtotal)}</span>
        </div>
        <div className="flex justify-between text-[var(--muted)]">
          <span>Delivery</span>
          <span>{formatMoney(deliveryFee)}</span>
        </div>
        <div className="flex justify-between border-t border-[var(--border)] pt-3 text-lg font-black text-[var(--text)]">
          <span>Total</span>
          <span>{formatMoney(total)}</span>
        </div>
      </div>
      <Button className="mt-5 w-full">
        <CreditCard className="h-4 w-4" />
        Confirmar pedido
      </Button>
    </Card>
  );
}
