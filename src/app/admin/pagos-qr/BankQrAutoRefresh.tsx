"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function BankQrAutoRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      // Background bank verification is independent of this display refresh.
      // Avoid changing a generation request ID while someone edits a form.
      if (document.visibilityState !== "visible" || document.activeElement?.closest("form")) return;
      router.refresh();
    };
    const timer = window.setInterval(refresh, 20_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [enabled, router]);
  return null;
}

export function DisconnectBankButton() {
  return <button type="submit" className="min-h-11 rounded-xl border border-[var(--border)] px-4 text-sm font-bold"
    onClick={event => { if (!window.confirm("¿Desvincular esta cuenta? No se emitirán nuevos QR. Los QR anteriores siguen vigentes y se verificarán automáticamente; las credenciales cifradas se conservan para ello. Esto no cierra tu cuenta bancaria ni anula QR.")) event.preventDefault(); }}>
    Desvincular cuenta
  </button>;
}
