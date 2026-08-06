"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, type ReactNode } from "react";
import { ArrowRight, Building2, Copy } from "lucide-react";
import { createOwnedRestaurantFormAction, type CreateRestaurantFormState } from "@/app/admin/actions";
import { GoogleLocationFields } from "@/components/location/GoogleLocationFields";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { BrandLoadingOverlay } from "@/components/ui/BrandLoadingOverlay";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { categoriesForBusinessType, defaultRestaurantCategory, restaurantBusinessTypeOptions, restaurantLocationOptions } from "@/lib/restaurant-directory-options";
import type { BusinessType } from "@/types/restaurant.types";

const errorMessages: Record<string, string> = {
  invalid: "Revisa los datos obligatorios.",
  "owner-only": "Este formulario es para duenos de negocio, no para superadmin.",
  "restaurant-exists": "Ya tienes una sucursal no archivada. Para otra sucursal usa el flujo de sucursales.",
  "service-role-required": "Falta SUPABASE_SERVICE_ROLE_KEY para crear el restaurante desde este flujo.",
  "slug-exists": "Ese slug publico ya esta en uso. Prueba con otro.",
  "storage-upload": "No se pudieron subir las imagenes. Intenta con archivos mas livianos.",
  "branch-user-email-exists": "Ese correo ya existe. Usa otro correo para el responsable de esta sucursal.",
  "branch-user-create": "No se pudo crear el usuario responsable de la sucursal.",
  "branch-user-profile": "Se creo el usuario, pero no se pudo guardar su perfil. Intenta nuevamente.",
  create: "No se pudo crear el restaurante. Intenta nuevamente.",
};

const initialState: CreateRestaurantFormState = {};

function readableCreateError(error?: string) {
  if (!error) return "";
  if (error.startsWith("create:")) {
    return `No se pudo crear el restaurante. Detalle tecnico: ${error.replace("create:", "")}`;
  }
  if (error.startsWith("setup:")) {
    return `El restaurante se creo, pero fallo la configuracion inicial. Detalle tecnico: ${error.replace("setup:", "")}`;
  }
  return errorMessages[error] ?? errorMessages.create;
}

export function OwnerRestaurantCreateFormClient({
  description = "Completa los datos publicos de tu negocio. Luego entraras al panel para crear productos, horarios, caja e inventario.",
  submitLabel = "Crear mi restaurante",
  successTitle = "Restaurante creado",
  title = "Datos de tu restaurante",
}: {
  description?: string;
  submitLabel?: string;
  successTitle?: string;
  title?: string;
}) {
  const [state, formAction, pending] = useActionState(createOwnedRestaurantFormAction, initialState);
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const values = state.values ?? {};
  const businessType = (values.businessType || "food") as BusinessType;
  const publicCategory = values.publicCategory || defaultRestaurantCategory(businessType);
  const redirectTo = state.redirectTo ?? "/dueno";

  if (state.success) {
    return (
      <Card className="space-y-4 border-[var(--color-success-soft)] bg-[var(--color-success-soft)]">
        <div>
          <p className="text-xl font-black text-[var(--color-success-strong)]">{successTitle}</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-success-strong)]">
            El responsable de esta sucursal debe iniciar sesion con esta contrasena temporal y luego crear una propia.
          </p>
        </div>
        {state.temporaryPassword ? (
          <div className="grid gap-2 rounded-2xl bg-white/85 p-3 text-[var(--color-heading)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <code className="select-all break-all text-base font-black">{state.temporaryPassword}</code>
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-4 text-sm font-bold text-[var(--color-on-primary)]"
              onClick={() => {
                navigator.clipboard?.writeText(state.temporaryPassword ?? "");
                setCopied(true);
              }}
              type="button"
            >
              <Copy className="h-4 w-4" />
              {copied ? "Copiada" : "Copiar"}
            </button>
          </div>
        ) : null}
        <Button className="w-full sm:w-auto" onClick={() => router.replace(redirectTo)} type="button">
          Entrar al panel
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Card>
    );
  }

  return (
    <form action={formAction} data-navigation-feedback="off">
      {state.error ? (
        <div className="mb-5 rounded-2xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] p-4 text-sm font-semibold text-[var(--color-danger-strong)]" role="alert">
          {readableCreateError(state.error)}
        </div>
      ) : null}

      <Card className="grid gap-4 md:grid-cols-2">
        <SectionTitle
          className="md:col-span-2"
          description={description}
          title={title}
        />
        <Input defaultValue={values.name} name="name" placeholder="Nombre comercial" required />
        <Input defaultValue={values.slug} name="slug" placeholder="Slug publico, ej. cafeteria-luna" />
        <Input defaultValue={values.whatsapp} name="whatsapp" placeholder="WhatsApp para pedidos" />

        <FieldSelect label="Ciudad">
          <Select defaultValue={values.city || "Cochabamba"} name="city">
            {restaurantLocationOptions.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </Select>
        </FieldSelect>

        <FieldSelect label="Rubro principal">
          <Select defaultValue={businessType} name="businessType">
            {restaurantBusinessTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FieldSelect>

        <FieldSelect label="Subcategoria publica">
          <Select defaultValue={publicCategory} name="publicCategory">
            {restaurantBusinessTypeOptions.map((option) => (
              <optgroup key={option.value} label={option.label}>
                {categoriesForBusinessType(option.value).map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </FieldSelect>

        <Input defaultValue={values.address} name="address" placeholder="Direccion" />
        <Input defaultValue={values.addressReference} name="addressReference" placeholder="Referencia o zona" />
        <div className="md:col-span-2">
          <GoogleLocationFields
            defaultLatitude={values.latitude ? Number(values.latitude) : undefined}
            defaultLongitude={values.longitude ? Number(values.longitude) : undefined}
            defaultMapsUrl={values.mapsUrl}
            hideCoordinateInputs
            hideMapsUrlInput
            label="Ubicacion del negocio"
            showMapByDefault
          />
        </div>

        <CompressedImageInput help="Recomendado: cuadrado 800 x 800 px. Se subira optimizado en WebP." label="Logo" name="logoFile" previewClassName="aspect-square" />
        <CompressedImageInput help="Recomendado: 1600 x 900 px o similar. Evita texto pequeno dentro de la imagen." label="Banner" name="bannerFile" />
        <Textarea className="md:col-span-2" defaultValue={values.description} name="description" placeholder="Descripcion del negocio" />

        <SectionTitle
          className="md:col-span-2"
          description="Este usuario entra desde /admin/login solo a esta sucursal. El dueno mantiene su panel para ver todas sus sucursales."
          title="Usuario del panel de esta sucursal"
        />
        <Input defaultValue={values.branchUserName} name="branchUserName" placeholder="Nombre del responsable" required />
        <Input defaultValue={values.branchUserEmail} name="branchUserEmail" placeholder="responsable@sucursal.com" required type="email" />

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)] md:col-span-2">
          El sistema generara una contrasena temporal segura para este responsable. Copiala al terminar; en su primer ingreso debera crear una propia.
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)] md:col-span-2">
          Tu restaurante se crea con la tarifa Full. La primera sucursal cuesta Bs 450/mes; cada sucursal adicional habilitada cuesta Bs 199/mes.
        </div>

        <div className="md:col-span-2">
          <Button className="min-h-12 w-full sm:w-auto" disabled={pending}>
            {pending ? null : <Building2 className="h-4 w-4" />}
            {pending ? "Creando restaurante..." : submitLabel}
          </Button>
        </div>
      </Card>

      {pending ? (
        <BrandLoadingOverlay
          title="Creando restaurante"
          description="Preparando acceso inicial."
          zIndexClassName="z-[120]"
        />
      ) : null}
    </form>
  );
}

function FieldSelect({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      {children}
    </div>
  );
}
