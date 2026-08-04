import { AlertTriangle, LogOut, Plus, Sparkles, Store } from "lucide-react";
import { signOutAction } from "@/app/admin/actions";
import { OwnerRestaurantCreateFormClient } from "@/components/restaurants/OwnerRestaurantCreateFormClient";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { OwnerActivationSummary } from "@/lib/services/owner-dashboard.service";

export function OwnerOnboarding({
  activation,
  email,
  fullName,
  mode = "first",
}: {
  activation?: OwnerActivationSummary;
  email: string;
  fullName: string;
  mode?: "expansion" | "first" | "suspended";
}) {
  const isExpansion = mode === "expansion";
  const isSuspended = mode === "suspended";
  const displayName = fullName || email;

  return (
    <main className="min-h-screen bg-[var(--color-surface)] px-4 py-6 text-[var(--color-heading)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Card className="overflow-hidden p-0">
          <div className="grid gap-0 lg:grid-cols-[1fr_0.82fr]">
            <div className="p-6 sm:p-8">
              <span className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--primary-light)] px-4 text-sm font-black text-[var(--primary)]">
                {isSuspended ? <AlertTriangle className="h-4 w-4" /> : isExpansion ? <Store className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {isSuspended ? "Cuenta suspendida" : isExpansion ? "Sucursal habilitada" : "Bienvenido a yopido.shop"}
              </span>
              <h1 className="mt-5 text-3xl font-black tracking-normal text-[var(--color-heading)] sm:text-4xl">
                {isSuspended ? "Tu cuenta esta suspendida" : isExpansion ? "Expande tu negocio" : "Crea tu primer negocio"}
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
                {isSuspended
                  ? `Hola ${displayName}. El superadmin suspendio temporalmente la cuenta del negocio y sus sucursales.`
                  : isExpansion
                    ? `Hola ${displayName}. Tienes una sucursal habilitada para activar cuando tengas datos y responsable listos.`
                    : `Hola ${displayName}. Tu cuenta de dueno ya esta lista. Completa los datos publicos del primer restaurante y despues podras pedir o crear sucursales desde tu panel.`}
              </p>
              {activation ? (
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  <MiniMetric label="Activas" value={String(activation.used)} />
                  <MiniMetric label="Disponibles" value={String(activation.remaining)} />
                  <MiniMetric label="Archivadas" value={String(activation.archived)} />
                </div>
              ) : null}
            </div>
            <div className="border-t border-[var(--border)] bg-[var(--primary)] p-6 text-white lg:border-l lg:border-t-0">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--accent)]">Tu cuenta</p>
              <p className="mt-2 break-words text-xl font-black">{email}</p>
              <p className="mt-4 text-sm font-semibold leading-6 text-white/78">
                {isSuspended
                  ? "Mientras este suspendida, el panel operativo y las sucursales quedan bloqueados."
                  : isExpansion
                    ? "La activacion no es obligatoria ahora. Puedes cerrar sesion y volver cuando quieras crearla."
                    : "El restaurante se publica cuando termines el formulario. La operacion diaria vivira dentro del panel de esa sucursal."}
              </p>
              <form action={signOutAction} className="mt-6">
                <button className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/12 px-4 text-sm font-bold text-white ring-1 ring-white/16 hover:bg-white/18" type="submit">
                  <LogOut className="h-4 w-4" />
                  Salir
                </button>
              </form>
            </div>
          </div>
        </Card>

        {isSuspended ? (
          <Card className="border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] text-sm font-semibold leading-6 text-[var(--color-warning-strong)]">
            Contacta al superadmin para reactivar la cuenta. Cuando vuelva a estar activa, tus sucursales apareceran otra vez en el panel.
          </Card>
        ) : isExpansion ? (
          <details className="group rounded-[var(--radius-card)] border border-dashed border-[var(--primary-light)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] sm:p-5">
            <summary className={buttonClasses("primary", "w-full cursor-pointer list-none sm:w-fit [&::-webkit-details-marker]:hidden")}>
              <Plus className="h-4 w-4" />
              Activar sucursal
            </summary>
            <div className="mt-5">
              <OwnerRestaurantCreateFormClient
                description="Completa los datos de esta sucursal cuando estes listo. El sistema generara la contrasena temporal del responsable al finalizar."
                submitLabel="Activar sucursal"
                successTitle="Sucursal activada"
                title="Datos de la sucursal"
              />
            </div>
          </details>
        ) : (
          <OwnerRestaurantCreateFormClient />
        )}
      </div>
    </main>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3">
      <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">{label}</p>
      <p className="mt-1 text-2xl font-black text-[var(--color-heading)]">{value}</p>
    </div>
  );
}
