"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { BrandLoadingOverlay } from "@/components/ui/BrandLoadingOverlay";

export function FormSubmitButton({
  className,
  disabled = false,
  label = "Guardar",
  overlayDescription = "Estamos guardando los cambios. En unos segundos actualizamos el panel.",
  overlayTitle = "Guardando",
  pendingLabel = "Guardando...",
}: {
  className?: string;
  disabled?: boolean;
  label?: string;
  overlayDescription?: string;
  overlayTitle?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <>
      <Button className={className} disabled={disabled || pending} type="submit">
        {pending ? pendingLabel : label}
      </Button>

      {pending ? (
        <BrandLoadingOverlay title={overlayTitle} description={overlayDescription} />
      ) : null}
    </>
  );
}
