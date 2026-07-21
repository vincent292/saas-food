"use client";

import Image from "next/image";
import { useFormStatus } from "react-dom";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function BranchCreateSubmit() {
  const { pending } = useFormStatus();

  return (
    <>
      <Button className="min-h-12 w-full sm:w-auto" disabled={pending} type="submit">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
        {pending ? "Creando sucursal..." : "Crear sucursal"}
      </Button>

      {pending ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[rgb(8_36_65_/_0.78)] px-4 text-center text-white backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[1.75rem] border border-white/16 bg-white/95 p-6 text-[var(--primary)] shadow-[0_28px_90px_rgb(2_10_18_/_0.34)]">
            <div className="mx-auto grid h-24 w-24 place-items-center rounded-[1.5rem] bg-[var(--primary-light)] shadow-inner">
              <Image alt="yopido.shop" className="h-16 w-16 animate-pulse object-contain" height={96} priority src="/brand/yopido-icon-dark-1024.png" width={96} />
            </div>
            <p className="mt-5 text-xl font-black">Estamos creando tu sucursal</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
              Copiando identidad, catalogo y configuracion base. En unos segundos entramos al nuevo panel.
            </p>
            <div className="mx-auto mt-5 h-2 w-44 overflow-hidden rounded-full bg-[var(--primary-light)]">
              <span className="block h-full w-1/2 animate-pulse rounded-full bg-[var(--accent)]" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
