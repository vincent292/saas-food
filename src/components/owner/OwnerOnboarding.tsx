import { LogOut, Sparkles } from "lucide-react";
import { signOutAction } from "@/app/admin/actions";
import { OwnerRestaurantCreateFormClient } from "@/components/restaurants/OwnerRestaurantCreateFormClient";
import { Card } from "@/components/ui/Card";

export function OwnerOnboarding({ email, fullName }: { email: string; fullName: string }) {
  return (
    <main className="min-h-screen bg-[var(--color-surface)] px-4 py-6 text-[var(--color-heading)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Card className="overflow-hidden p-0">
          <div className="grid gap-0 lg:grid-cols-[1fr_0.82fr]">
            <div className="p-6 sm:p-8">
              <span className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--primary-light)] px-4 text-sm font-black text-[var(--primary)]">
                <Sparkles className="h-4 w-4" />
                Bienvenido a yopido.shop
              </span>
              <h1 className="mt-5 text-3xl font-black tracking-normal text-[var(--color-heading)] sm:text-4xl">Crea tu primer negocio</h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
                Hola {fullName || email}. Tu cuenta de dueno ya esta lista. Completa los datos publicos del primer restaurante y despues podras pedir o crear sucursales desde tu panel.
              </p>
            </div>
            <div className="border-t border-[var(--border)] bg-[var(--primary)] p-6 text-white lg:border-l lg:border-t-0">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--accent)]">Tu cuenta</p>
              <p className="mt-2 break-words text-xl font-black">{email}</p>
              <p className="mt-4 text-sm font-semibold leading-6 text-white/78">
                El restaurante se publica cuando termines el formulario. La operacion diaria vivira dentro del panel de esa sucursal.
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

        <OwnerRestaurantCreateFormClient />
      </div>
    </main>
  );
}
