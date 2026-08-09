import { notFound } from "next/navigation";
import { UsersRound } from "lucide-react";
import { createGroupOrderSessionAction } from "@/app/r/actions";
import { RestaurantThemeProvider } from "@/components/restaurant/RestaurantThemeProvider";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { restaurantService } from "@/lib/services/restaurant.service";
import { publicRestaurantPath } from "@/lib/utils/public-routes";

const errorMessages: Record<string, string> = {
  invalid: "Revisa el nombre del host.",
  "rate-limit": "Demasiados intentos. Espera un momento.",
  "service-role-required": "Falta configuracion segura del servidor.",
  "qr-size": "El QR debe pesar menos de 5 MB.",
  "qr-type": "El QR debe ser PNG, JPG, WebP o AVIF.",
  create: "No se pudo crear el Yopido Grupal.",
};

export default async function NewGroupOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ restaurantSlug }, { error }] = await Promise.all([params, searchParams]);
  const restaurant = await restaurantService.getPublicBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  return (
    <RestaurantThemeProvider>
      <main className="min-h-screen bg-[linear-gradient(180deg,var(--color-surface)_0%,var(--background)_55%,var(--color-surface)_100%)] px-4 py-6 text-[var(--text)]">
        <div className="mx-auto max-w-2xl space-y-5">
          <a className="inline-flex items-center text-sm font-black text-[var(--primary)]" href={publicRestaurantPath(restaurant.slug)}>
            Volver al menu
          </a>
          <Card className="space-y-5">
            <span className="grid h-14 w-14 place-items-center rounded-[var(--radius-control)] bg-[var(--primary-light)] text-[var(--primary)]">
              <UsersRound className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-black uppercase text-[var(--primary)]">{restaurant.name}</p>
              <h1 className="mt-1 text-3xl font-black leading-tight sm:text-4xl">Crear Yopido Grupal</h1>
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--muted)]">
                Crea una sesion, comparte el link y cada persona agrega lo suyo. Al final se envia un solo pedido al restaurante.
              </p>
            </div>

            {error ? (
              <div className="rounded-[var(--radius-control)] bg-[var(--color-danger-soft)] p-3 text-sm font-black text-[var(--color-danger-strong)]">
                {errorMessages[error] ?? "No se pudo completar la accion."}
              </div>
            ) : null}

            <form action={createGroupOrderSessionAction} className="grid gap-3">
              <input name="restaurantSlug" type="hidden" value={restaurant.slug} />
              <Input name="hostName" placeholder="Nombre del host" required />
              <Input inputMode="tel" name="hostPhone" placeholder="WhatsApp del host opcional" />
              <Select name="collectMode" defaultValue="host_collects">
                <option value="host_collects">Todos me pagan a mi y yo pago al restaurante</option>
                <option value="restaurant_collects">Cada persona paga al restaurante</option>
                <option value="internal_cash">Arreglo interno / efectivo</option>
              </Select>
              <label className="grid gap-1 text-sm font-black">
                QR del host opcional
                <Input accept="image/png,image/jpeg,image/webp,image/avif" name="hostQrFile" type="file" />
              </label>
              <button className={buttonClasses("primary", "min-h-12 w-full")} type="submit">
                Crear Yopido Grupal
              </button>
            </form>
          </Card>
        </div>
      </main>
    </RestaurantThemeProvider>
  );
}
