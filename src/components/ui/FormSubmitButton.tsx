"use client";

import Image from "next/image";
import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";

export function FormSubmitButton({
  className,
  label = "Guardar",
  overlayDescription = "Estamos guardando los cambios. En unos segundos actualizamos el panel.",
  overlayTitle = "Guardando",
  pendingLabel = "Guardando...",
}: {
  className?: string;
  label?: string;
  overlayDescription?: string;
  overlayTitle?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <>
      <Button className={className} disabled={pending} type="submit">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {pending ? pendingLabel : label}
      </Button>

      {pending ? (
        <div className="fixed inset-0 z-[140] grid place-items-center bg-[rgb(8_36_65_/_0.72)] px-4 text-center backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[1.75rem] border border-white/16 bg-white/95 p-6 text-[var(--primary)] shadow-[0_28px_90px_rgb(2_10_18_/_0.34)]">
            <div className="mx-auto grid h-24 w-24 place-items-center rounded-[1.5rem] bg-[var(--primary-light)] shadow-inner">
              <Image alt="yopido.shop" className="h-16 w-16 animate-pulse object-contain" height={96} priority src="/brand/yopido-icon-dark-1024.png" width={96} />
            </div>
            <p className="mt-5 text-xl font-black">{overlayTitle}</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">{overlayDescription}</p>
            <div className="mx-auto mt-5 h-2 w-44 overflow-hidden rounded-full bg-[var(--primary-light)]">
              <span className="block h-full w-1/2 animate-pulse rounded-full bg-[var(--accent)]" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
