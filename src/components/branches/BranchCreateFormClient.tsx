"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, type ReactNode } from "react";
import { Building2, CheckCircle2, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { createBranchFormAction, type CreateBranchFormState } from "@/app/admin/actions";
import { GoogleLocationFields } from "@/components/location/GoogleLocationFields";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";

type BranchCreateMembershipOption = {
  restaurant: {
    city: string | null;
    id: string;
    name: string;
  };
};

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

const initialState: CreateBranchFormState = {};

export function BranchCreateFormClient({
  ownerMemberships,
  serverError,
}: {
  ownerMemberships: BranchCreateMembershipOption[];
  serverError?: string;
}) {
  const [state, formAction, pending] = useActionState(createBranchFormAction, initialState);
  const router = useRouter();
  const values = state.values ?? {};
  const error = state.error ?? serverError;
  const isFinishing = Boolean(state.success);

  useEffect(() => {
    if (!state.success) {
      return;
    }

    router.replace(state.redirectTo ?? "/dueno/sucursales?created=1");
  }, [router, state.redirectTo, state.success]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <form action={formAction}>
        <Card className="grid gap-4 md:grid-cols-2">
          <SectionTitle className="md:col-span-2" description="La sucursal nace separada en pedidos, caja, inventario y reportes." title="Datos de la sucursal" />

          {error ? (
            <div className="rounded-2xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] p-4 text-sm font-semibold text-[var(--color-danger-strong)] md:col-span-2" role="alert">
              {errorMessages[error] ?? "No se pudo crear la sucursal. Revisa los datos e intenta nuevamente."}
            </div>
          ) : null}

          <Field label="Sucursal base">
            <Select defaultValue={values.sourceRestaurantId} name="sourceRestaurantId" required>
              {ownerMemberships.map((membership) => (
                <option key={membership.restaurant.id} value={membership.restaurant.id}>
                  {membership.restaurant.name} {membership.restaurant.city ? `- ${membership.restaurant.city}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Nombre visible">
            <Input defaultValue={values.name} name="name" placeholder="Ej. Helados Centro" required />
          </Field>

          <Field label="Slug publico">
            <Input defaultValue={values.slug} name="slug" placeholder="ej. helados-centro" required />
          </Field>

          <Field label="WhatsApp">
            <Input defaultValue={values.whatsapp} name="whatsapp" placeholder="70707070" />
          </Field>

          <Field label="Ciudad">
            <Input defaultValue={values.city} name="city" placeholder="Cochabamba" />
          </Field>

          <Field label="Direccion">
            <Input defaultValue={values.address} name="address" placeholder="Av. Principal #123" />
          </Field>

          <Field className="md:col-span-2" label="Referencia o zona">
            <Input defaultValue={values.addressReference} name="addressReference" placeholder="Zona, piso, frente a..." />
          </Field>

          <div className="md:col-span-2">
            <GoogleLocationFields
              defaultLatitude={values.latitude ? Number(values.latitude) : undefined}
              defaultLongitude={values.longitude ? Number(values.longitude) : undefined}
              defaultMapsUrl={values.mapsUrl}
              hideCoordinateInputs
              hideMapsUrlInput
              label="Ubicacion exacta de esta sucursal"
              showMapByDefault
            />
          </div>

          <SectionTitle className="md:col-span-2" description="Este usuario podra entrar solo a esta sucursal. El dueno mantiene acceso a todas." title="Usuario de esta sucursal" />

          <Field label="Responsable">
            <Input defaultValue={values.branchUserName} name="branchUserName" placeholder="Nombre del encargado" required />
          </Field>

          <Field label="Correo de acceso">
            <Input defaultValue={values.branchUserEmail} name="branchUserEmail" placeholder="encargado@sucursal.com" required type="email" />
          </Field>

          <Field className="md:col-span-2" label="Contrasena temporal">
            <Input minLength={8} name="branchUserPassword" placeholder="Minimo 8 caracteres" required type="password" />
          </Field>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)] md:col-span-2">
            Cuando este usuario ingrese por primera vez, debera cambiar su contrasena antes de usar el panel.
          </div>

          <div className="md:col-span-2">
            <Button className="min-h-12 w-full sm:w-auto" disabled={pending || isFinishing} type="submit">
              {pending || isFinishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
              {pending || isFinishing ? "Creando sucursal..." : "Crear sucursal"}
            </Button>
          </div>
        </Card>
      </form>

      <aside className="grid gap-3">
        <InfoCard icon={<ShieldCheck className="h-5 w-5" />} title="No se mezclan datos" text="Pedidos, caja, inventario y cierres empiezan independientes para esta nueva sucursal." />
        <InfoCard icon={<CheckCircle2 className="h-5 w-5" />} title="Se copia lo importante" text="Catalogo, categorias, variantes, banners, colores y horarios se toman de la sucursal base." />
        <InfoCard icon={<MapPin className="h-5 w-5" />} title="Ubicacion propia" text="El slug, direccion, WhatsApp y pin del mapa son propios de la nueva sucursal." />
      </aside>

      {pending || isFinishing ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[rgb(8_36_65_/_0.78)] px-4 text-center text-white backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[1.75rem] border border-white/16 bg-white/95 p-6 text-[var(--primary)] shadow-[0_28px_90px_rgb(2_10_18_/_0.34)]">
            <div className="mx-auto grid h-24 w-24 place-items-center rounded-[1.5rem] bg-[var(--primary-light)] shadow-inner">
              <Image alt="yopido.shop" className="h-16 w-16 animate-pulse object-contain" height={96} priority src="/brand/yopido-icon-dark-1024.png" width={96} />
            </div>
            <p className="mt-5 text-xl font-black">{isFinishing ? "Entrando a sucursales" : "Estamos creando tu sucursal"}</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
              {isFinishing ? "La sucursal quedo lista. Estamos actualizando el panel." : "Copiando identidad, catalogo y configuracion base. En unos segundos entramos al nuevo panel."}
            </p>
            <div className="mx-auto mt-5 h-2 w-44 overflow-hidden rounded-full bg-[var(--primary-light)]">
              <span className="block h-full w-1/2 animate-pulse rounded-full bg-[var(--accent)]" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
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
