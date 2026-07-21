import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { createBranchAction } from "@/app/admin/actions";
import { BranchCreateSubmit } from "@/components/branches/BranchCreateSubmit";
import { GoogleLocationFields } from "@/components/location/GoogleLocationFields";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { getOwnerBranchCapacity } from "@/lib/services/owner-dashboard.service";

const errorMessages: Record<string, string> = {
  invalid: "Revisa los datos obligatorios de la sucursal.",
  "branch-limit": "Tu cuenta ya no tiene cupos disponibles para nuevas sucursales.",
  "owner-required": "Solo el dueno del negocio puede crear sucursales desde este flujo.",
  "service-role-required": "Falta SUPABASE_SERVICE_ROLE_KEY para crear sucursales desde el panel.",
  "source-not-found": "No encontramos la sucursal base activa.",
  "slug-exists": "Ese slug publico ya esta en uso. Elige otro enlace.",
  "branch-user-email-exists": "Ese correo ya existe. Usa otro correo para el responsable de esta sucursal.",
  "branch-user-check": "No se pudo validar si el correo del responsable ya existe.",
  "branch-user-create": "No se pudo crear el usuario responsable de la sucursal.",
  "branch-user-profile": "Se creo el usuario, pero no se pudo guardar su perfil. Intenta nuevamente.",
};

export default async function NewOwnerBranchPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, { ownerMemberships }] = await Promise.all([searchParams, getOwnerLayoutContext()]);

  if (!ownerMemberships.length) {
    redirect("/dueno");
  }

  const capacity = await getOwnerBranchCapacity(ownerMemberships);
  const remaining = Math.max(0, capacity.limit - capacity.used);

  return (
    <OwnerLayout active="/dueno/sucursales" memberships={ownerMemberships} title="Nueva sucursal">
      <div className="space-y-5 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link className={buttonClasses("secondary", "w-fit")} href="/dueno/sucursales">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
          <Badge className={remaining > 0 ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"}>
            {remaining > 0 ? `${remaining} cupo${remaining === 1 ? "" : "s"} disponible${remaining === 1 ? "" : "s"}` : "Sin cupos disponibles"}
          </Badge>
        </div>

        <section className="overflow-hidden rounded-[1.75rem] bg-[linear-gradient(135deg,#082441_0%,#12355B_62%,#071E36_100%)] p-5 text-white shadow-[0_26px_70px_rgb(8_36_65_/_0.22)] sm:p-7 lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-black text-[var(--primary)] shadow-[var(--shadow-glow)]">
                <Sparkles className="h-3.5 w-3.5" />
                Nueva sucursal
              </span>
              <h1 className="mt-4 max-w-3xl text-3xl font-black leading-tight sm:text-4xl">Estas por crear una sucursal independiente</h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/78 sm:text-base">
                Copiamos identidad, catalogo y configuracion desde una sucursal base. Luego esta nueva sucursal maneja su propio usuario, pedidos, caja e inventario.
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-white/16 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--accent)]">Tarifa actual</p>
              <p className="mt-2 text-2xl font-black">{capacity.planName}</p>
              <p className="mt-1 text-sm font-bold text-white/70">Sucursal adicional: Bs {capacity.additionalPriceMonthly}/mes</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-black">
                <span className="rounded-2xl bg-white/12 p-3">
                  <span className="block text-white/62">Usadas</span>
                  {capacity.used}
                </span>
                <span className="rounded-2xl bg-white/12 p-3">
                  <span className="block text-white/62">Permitidas</span>
                  {capacity.limit}
                </span>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] p-4 text-sm font-semibold text-[var(--color-danger-strong)]">
            {errorMessages[error] ?? "No se pudo crear la sucursal. Revisa los datos e intenta nuevamente."}
          </div>
        ) : null}

        {remaining > 0 ? (
          <form action={createBranchAction}>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
              <Card className="grid gap-4 md:grid-cols-2">
                <SectionTitle className="md:col-span-2" description="La sucursal nace separada en pedidos, caja, inventario y reportes." title="Datos de la sucursal" />

                <Field label="Sucursal base">
                  <Select name="sourceRestaurantId" required>
                    {ownerMemberships.map((membership) => (
                      <option key={membership.restaurant.id} value={membership.restaurant.id}>
                        {membership.restaurant.name} {membership.restaurant.city ? `- ${membership.restaurant.city}` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Nombre visible">
                  <Input name="name" placeholder="Ej. Helados Centro" required />
                </Field>

                <Field label="Slug publico">
                  <Input name="slug" placeholder="ej. helados-centro" required />
                </Field>

                <Field label="WhatsApp">
                  <Input name="whatsapp" placeholder="70707070" />
                </Field>

                <Field label="Ciudad">
                  <Input name="city" placeholder="Cochabamba" />
                </Field>

                <Field label="Direccion">
                  <Input name="address" placeholder="Av. Principal #123" />
                </Field>

                <Field className="md:col-span-2" label="Referencia o zona">
                  <Input name="addressReference" placeholder="Zona, piso, frente a..." />
                </Field>

                <div className="md:col-span-2">
                  <GoogleLocationFields hideCoordinateInputs hideMapsUrlInput label="Ubicacion exacta de esta sucursal" showMapByDefault />
                </div>

                <SectionTitle className="md:col-span-2" description="Este usuario podra entrar solo a esta sucursal. El dueno mantiene acceso a todas." title="Usuario de esta sucursal" />

                <Field label="Responsable">
                  <Input name="branchUserName" placeholder="Nombre del encargado" required />
                </Field>

                <Field label="Correo de acceso">
                  <Input name="branchUserEmail" placeholder="encargado@sucursal.com" required type="email" />
                </Field>

                <Field className="md:col-span-2" label="Contrasena temporal">
                  <Input minLength={8} name="branchUserPassword" placeholder="Minimo 8 caracteres" required type="password" />
                </Field>

                <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)] md:col-span-2">
                  Cuando este usuario ingrese por primera vez, debera cambiar su contrasena antes de usar el panel.
                </div>

                <div className="md:col-span-2">
                  <BranchCreateSubmit />
                </div>
              </Card>

              <aside className="grid gap-3">
                <InfoCard icon={<ShieldCheck className="h-5 w-5" />} title="No se mezclan datos" text="Pedidos, caja, inventario y cierres empiezan independientes para esta nueva sucursal." />
                <InfoCard icon={<CheckCircle2 className="h-5 w-5" />} title="Se copia lo importante" text="Catalogo, categorias, variantes, banners, colores y horarios se toman de la sucursal base." />
                <InfoCard icon={<MapPin className="h-5 w-5" />} title="Ubicacion propia" text="El slug, direccion, WhatsApp y pin del mapa son propios de la nueva sucursal." />
              </aside>
            </div>
          </form>
        ) : (
          <Card className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-xl font-black">No tienes cupos disponibles</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
                Solicita a soporte que habilite otra sucursal en tu cuenta antes de crearla.
              </p>
            </div>
            <Link className={buttonClasses("primary")} href="/dueno/soporte">
              Solicitar cupo
            </Link>
          </Card>
        )}
      </div>
    </OwnerLayout>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={className}>
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function InfoCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <Card className="p-4">
      <div className="flex gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">{icon}</span>
        <div>
          <p className="font-black">{title}</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-[var(--color-secondary-text)]">{text}</p>
        </div>
      </div>
    </Card>
  );
}
