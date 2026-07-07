import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { releaseCurrentRestaurantAccessAction } from "@/app/admin/actions";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatShortDate, formatShortTime } from "@/lib/utils/dates";

export default async function AccessBlockedPage({
  searchParams,
}: {
  searchParams: Promise<{
    restaurantId?: string;
    restaurantName?: string;
    activeRestaurantId?: string;
    activeRestaurantName?: string;
    activeIpAddress?: string;
    activeLastSeenAt?: string;
    returnTo?: string;
  }>;
}) {
  const params = await searchParams;
  const returnTo = params.returnTo?.startsWith("/admin") ? params.returnTo : params.restaurantId ? `/admin/restaurantes/${params.restaurantId}/dashboard` : "/admin";

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-surface)] px-4">
      <Card className="w-full max-w-xl">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-black text-[var(--color-heading)]">Acceso bloqueado por otra sucursal activa</h1>
        <p className="mt-2 text-sm font-semibold text-[var(--color-secondary-text)]">
          Tu usuario ya está trabajando en {params.activeRestaurantName ?? "otro restaurante"}. Para evitar cajas o paneles abiertos en varias sucursales, libera la sesión activa antes de continuar.
        </p>

        <div className="mt-5 grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm">
          <div className="flex justify-between gap-3">
            <span className="font-bold text-[var(--color-secondary-text)]">Quieres entrar a</span>
            <span className="font-black">{params.restaurantName ?? "Restaurante"}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="font-bold text-[var(--color-secondary-text)]">Sesión activa</span>
            <span className="font-black">{params.activeRestaurantName ?? "No identificada"}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="font-bold text-[var(--color-secondary-text)]">IP registrada</span>
            <span className="font-black">{params.activeIpAddress ?? "Sin IP"}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="font-bold text-[var(--color-secondary-text)]">Última actividad</span>
            <span className="font-black">
              {params.activeLastSeenAt ? `${formatShortDate(params.activeLastSeenAt)} ${formatShortTime(params.activeLastSeenAt)}` : "Sin fecha"}
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {params.activeRestaurantId ? (
            <form action={releaseCurrentRestaurantAccessAction} className="flex-1">
              <input name="restaurantId" type="hidden" value={params.activeRestaurantId} />
              <input name="returnTo" type="hidden" value={returnTo} />
              <button className={buttonClasses("danger", "w-full")} type="submit">
                Liberar y continuar
              </button>
            </form>
          ) : null}
          <Link className={buttonClasses("secondary", "flex-1")} href="/admin">
            Ir al dashboard
          </Link>
        </div>
      </Card>
    </main>
  );
}
