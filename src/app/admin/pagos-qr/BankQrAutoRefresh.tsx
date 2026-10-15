"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function BankQrAutoRefresh() {
  const router = useRouter();
  const [live, setLive] = useState(false);
  useEffect(() => {
    let connected = false, disposed = false, deferred = false;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (document.activeElement?.closest("form")) { deferred = true; return; }
      deferred = false;
      router.refresh();
    };
    const onBlur = () => { if (deferred) window.setTimeout(refresh, 0); };
    const client = createClient();
    const channel = client.channel("bank-qr:superadmin", { config: { private: true } }).on("broadcast", { event: "changed" }, refresh);
    void client.realtime.setAuth().then(() => {
      if (!disposed) channel.subscribe(status => { connected = status === "SUBSCRIBED"; if (!disposed) setLive(connected); if (connected) refresh(); });
    }).catch(() => { connected = false; });
    const timer = window.setInterval(() => { if (!connected) refresh(); }, 30_000);
    document.addEventListener("visibilitychange", refresh);
    document.addEventListener("focusout", onBlur);
    window.addEventListener("focus", refresh);
    return () => { disposed = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh);
      document.removeEventListener("focusout", onBlur); window.removeEventListener("focus", refresh); void client.removeChannel(channel); };
  }, [router]);
  return <p role="status" className={`text-xs font-bold ${live ? "text-emerald-700" : "text-[var(--muted)]"}`}>{live ? "● Actualizaciones en vivo" : "Conectando actualizaciones…"}</p>;
}

export function DisconnectBankButton() {
  return <button type="submit" className="min-h-11 rounded-xl border border-[var(--border)] px-4 text-sm font-bold"
    onClick={event => { if (!window.confirm("¿Desvincular esta cuenta? No se emitirán nuevos QR. Los QR anteriores siguen vigentes y se verificarán automáticamente; las credenciales cifradas se conservan para ello. Esto no cierra tu cuenta bancaria ni anula QR.")) event.preventDefault(); }}>
    Desvincular cuenta
  </button>;
}
