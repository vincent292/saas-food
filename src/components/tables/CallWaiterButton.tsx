"use client";
import { useEffect, useRef, useState } from "react";
import { BellRing } from "lucide-react";
type Call = { id: string; token: string; status: string };
export function CallWaiterButton({ slug, code }: { slug: string; code: string }) {
  const [call, setCall] = useState<Call | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false), key = `yopido:table-call:${slug}:${code}`;
  const callId = call?.id, callToken = call?.token, callStatus = call?.status;
  useEffect(() => { const timer = setTimeout(() => { try { const raw = localStorage.getItem(key); if (raw) setCall(JSON.parse(raw)); } catch { /* Server still enforces one pending call per table. */ } }, 0); return () => clearTimeout(timer); }, [key]);
  useEffect(() => {
    if (!callId || !callToken || callStatus !== "pending") return;
    let alive = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/mobile/tables/call?id=${callId}`, { headers: { "x-table-call-token": callToken }, cache: "no-store" });
        if (response.ok && alive) { const next = { id: callId, token: callToken, ...await response.json() }; setCall(next); localStorage.setItem(key, JSON.stringify(next)); }
      } catch { /* Returning online resumes the same call. */ }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 8000);
    window.addEventListener("focus", refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [callId, callStatus, callToken, key]);
  async function request() {
    if (lock.current || call?.status === "pending") return;
    lock.current = true; setBusy(true); setError("");
    try {
      const requestKey = `${key}:request`, requestId = localStorage.getItem(requestKey) || crypto.randomUUID();
      localStorage.setItem(requestKey, requestId);
      const response = await fetch("/api/mobile/tables/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantSlug: slug, tableCode: code, requestId }) });
      if (!response.ok) throw new Error(response.status === 429 ? "Espera unos minutos antes de volver a llamar." : "No pudimos avisar. Revisa que el local tenga caja abierta.");
      const next: Call = await response.json(); setCall(next); localStorage.setItem(key, JSON.stringify(next)); localStorage.removeItem(requestKey);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo enviar la llamada."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="space-y-2" aria-live="polite">
    <button type="button" disabled={busy || call?.status === "pending"} onClick={() => void request()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary-light)] px-4 py-3 text-sm font-bold text-[var(--primary)] disabled:opacity-70"><BellRing className="h-5 w-5 shrink-0" />{busy ? "Avisando…" : call?.status === "pending" ? "Mesero avisado · esperando atención" : "Llamar al mesero"}</button>
    {call?.status === "attended" ? <p className="text-sm">El equipo confirmó la atención de tu llamada.</p> : null}
    {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
  </div>;
}
