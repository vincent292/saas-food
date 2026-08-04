"use client";

import { useMemo, useState } from "react";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { buttonClasses } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { formatMoney } from "@/lib/utils/money";

export function BranchRequestFormClient({
  action,
  disabled,
  qrConfigured,
  restaurantId,
  unitAmount,
  currency,
}: {
  action: (formData: FormData) => void | Promise<void>;
  disabled: boolean;
  qrConfigured: boolean;
  restaurantId: string;
  unitAmount: number;
  currency: string;
}) {
  const [quantity, setQuantity] = useState(1);
  const total = useMemo(() => Math.max(1, quantity) * unitAmount, [quantity, unitAmount]);
  const formDisabled = disabled || !qrConfigured;

  return (
    <form action={action} className="space-y-3">
      <input name="restaurantId" type="hidden" value={restaurantId} />

      <div className="grid gap-3 sm:grid-cols-[160px_1fr] sm:items-start">
        <label className="block">
          <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">Sucursales</span>
          <Input
            disabled={formDisabled}
            max={20}
            min={1}
            name="requestedAdditional"
            onChange={(event) => setQuantity(Math.min(20, Math.max(1, Number(event.currentTarget.value) || 1)))}
            required
            type="number"
            value={quantity}
          />
        </label>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">Total a pagar</p>
          <p className="mt-1 text-2xl font-black text-[var(--color-heading)]">{formatMoney(total, currency)}</p>
          <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
            {quantity} x {formatMoney(unitAmount, currency)} por sucursal
          </p>
        </div>
      </div>

      <Textarea disabled={formDisabled} name="reason" placeholder="Comentario opcional para el superadmin" />
      <CompressedImageInput acceptPdf className="rounded-2xl border border-[var(--border)] p-4" help="Obligatorio: captura o PDF del pago. Las imagenes se optimizan en WebP." label="Comprobante de pago" name="paymentProofFile" required />
      <button className={buttonClasses("primary", "w-full")} disabled={formDisabled} type="submit">
        {disabled ? "Solicitud pendiente" : "Enviar solicitud"}
      </button>
    </form>
  );
}
