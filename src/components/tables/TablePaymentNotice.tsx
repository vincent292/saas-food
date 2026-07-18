"use client";

import { useState } from "react";
import { CheckCircle2, ReceiptText, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function TablePaymentNotice({ orderNumber }: { orderNumber: string }) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-end bg-[var(--color-overlay)] p-0 text-[var(--text)] backdrop-blur-sm sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Pedido pendiente de pago">
      <div className="w-full max-w-md rounded-t-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl sm:rounded-[1.5rem]">
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--color-success-soft)] text-[var(--color-success-strong)]">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-[var(--color-neutral-100)] text-[var(--color-body)]" onClick={() => setOpen(false)} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Pedido enviado</p>
        <h2 className="mt-1 text-2xl font-black text-[var(--text)]">Acercate a caja</h2>
        <p className="mt-3 text-sm font-semibold leading-6 text-[var(--muted)]">
          Para que tu pedido {orderNumber} se procese y pase a cocina, confirma el pago en caja indicando este numero y tu mesa.
        </p>
        <div className="mt-4 rounded-2xl bg-[var(--primary-light)] p-4 text-sm font-bold leading-6 text-[var(--primary-dark)]">
          <ReceiptText className="mb-2 h-5 w-5" />
          El pedido queda pendiente hasta que caja lo apruebe.
        </div>
        <Button className="mt-5 w-full" onClick={() => setOpen(false)} type="button">
          Entendido
        </Button>
      </div>
    </div>
  );
}
