"use client";

import { LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";

export function PendingSubmitButton({
  children,
  disabled = false,
  pendingLabel = "Procesando...",
  ...props
}: Omit<ComponentProps<typeof Button>, "children" | "type"> & {
  children: ReactNode;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button aria-busy={pending} disabled={disabled || pending} type="submit" {...props}>
      {pending ? (
        <>
          <LoaderCircle className="h-4 w-4 animate-spin" />
          {pendingLabel}
        </>
      ) : children}
    </Button>
  );
}
