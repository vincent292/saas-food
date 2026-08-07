"use client";

import { CheckCircle2, Link2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";

type LinkStatus = {
  email: string;
  googleLinked: boolean;
  identityCount: number;
  role: "owner" | "superadmin";
};

const linkedMessages: Record<string, { tone: "success" | "error" | "warning"; text: string }> = {
  "1": { tone: "success", text: "Google quedo vinculado correctamente." },
  "business-account-required": { tone: "error", text: "Esta sesion no pertenece a una cuenta administrativa." },
  "email-mismatch": { tone: "error", text: "El correo de Google debe coincidir con el correo de esta cuenta." },
  error: { tone: "error", text: "No se pudo completar la vinculacion con Google." },
  "missing-code": { tone: "error", text: "Google no devolvio un codigo valido. Intenta nuevamente." },
  "session-error": { tone: "error", text: "No se pudo recuperar la sesion despues de Google." },
};

function feedbackClassName(tone: "success" | "error" | "warning") {
  if (tone === "success") return "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success-strong)]";
  if (tone === "warning") return "border-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]";
  return "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]";
}

export function GoogleAccountLinkCard() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");

  const feedback = useMemo(() => {
    const value = searchParams.get("googleLinked");
    return value ? linkedMessages[value] : null;
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/admin/auth/google-link/status", { cache: "no-store" });
        if (!response.ok) {
          setStatus(null);
          return;
        }
        const nextStatus = (await response.json()) as LinkStatus;
        if (!cancelled) setStatus(nextStatus);
      } catch {
        if (!cancelled) setError("No se pudo revisar el estado de Google.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  async function linkGoogle() {
    setLinking(true);
    setError("");

    try {
      const statusResponse = await fetch("/api/admin/auth/google-link/status", { cache: "no-store" });
      if (!statusResponse.ok) {
        setError("Esta cuenta no tiene permiso para vincular Google.");
        setLinking(false);
        return;
      }

      const supabase = createClient();
      const nextPath = `${pathname}?googleLinked=1`;
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (linkError) {
        const detail = `${linkError.message} ${"code" in linkError ? linkError.code : ""}`.toLowerCase();
        const manualLinkingDisabled = detail.includes("manual") || detail.includes("linking") || detail.includes("identity");
        setError(manualLinkingDisabled ? "Activa Enable Manual Linking en Supabase Auth para poder vincular Google." : "No se pudo iniciar la vinculacion con Google.");
        setLinking(false);
      }
    } catch {
      setError("No se pudo iniciar la vinculacion con Google.");
      setLinking(false);
    }
  }

  return (
    <Card className="grid gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
            {status?.googleLinked ? <CheckCircle2 className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-sm font-bold text-[var(--color-secondary-text)]">Acceso con Google</p>
            <h2 className="mt-1 text-xl font-black text-[var(--color-heading)]">
              {status?.googleLinked ? "Google vinculado" : "Vincular Google"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-secondary-text)]">
              {status?.googleLinked
                ? "Puedes entrar al panel usando Google con el mismo correo de esta cuenta."
                : "Vincula Google solo con el mismo correo administrativo. Tus permisos y sucursales no cambian."}
            </p>
          </div>
        </div>

        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-black text-[var(--color-secondary-text)]">
          <ShieldCheck className="h-3.5 w-3.5" />
          {status?.role === "superadmin" ? "Superadmin" : "Dueno"}
        </span>
      </div>

      {feedback ? <p className={`rounded-2xl border p-3 text-sm font-black ${feedbackClassName(feedback.tone)}`}>{feedback.text}</p> : null}
      {error ? <p className="rounded-2xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm font-black text-[var(--color-danger-strong)]">{error}</p> : null}

      <div className="grid gap-2 rounded-2xl bg-[var(--color-neutral-50)] p-3 text-sm font-semibold text-[var(--color-secondary-text)]">
        <p>Correo permitido: <span className="font-black text-[var(--color-heading)]">{status?.email ?? "Revisando..."}</span></p>
        <p>Identidades activas: <span className="font-black text-[var(--color-heading)]">{loading ? "..." : String(status?.identityCount ?? 0)}</span></p>
      </div>

      <Button className="w-full sm:w-fit" disabled={loading || linking || !status || status.googleLinked} onClick={linkGoogle} type="button">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-sm font-black text-[#4285F4]">G</span>
        {status?.googleLinked ? "Ya esta vinculado" : linking ? "Abriendo Google..." : "Vincular con Google"}
      </Button>
    </Card>
  );
}
