"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, type ReactNode } from "react";
import { Building2, Loader2 } from "lucide-react";
import { createOwnedRestaurantFormAction, type CreateRestaurantFormState } from "@/app/admin/actions";
import { GoogleLocationFields } from "@/components/location/GoogleLocationFields";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { categoriesForBusinessType, defaultRestaurantCategory, restaurantBusinessTypeOptions, restaurantLocationOptions } from "@/lib/restaurant-directory-options";
import type { BusinessType } from "@/types/restaurant.types";

const errorMessages: Record<string, string> = {
  invalid: "Revisa los datos obligatorios.",
  "owner-only": "Este formulario es para duenos de negocio, no para superadmin.",
  "restaurant-exists": "Ya tienes un restaurante base. Para otra sucursal usa el flujo de sucursales.",
  "service-role-required": "Falta SUPABASE_SERVICE_ROLE_KEY para crear el restaurante desde este flujo.",
  "slug-exists": "Ese slug publico ya esta en uso. Prueba con otro.",
  "storage-upload": "No se pudieron subir las imagenes. Intenta con archivos mas livianos.",
  "branch-user-email-exists": "Ese correo ya existe. Usa otro correo para el responsable de esta sucursal.",
  "branch-user-create": "No se pudo crear el usuario responsable de la sucursal.",
  "branch-user-profile": "Se creo el usuario, pero no se pudo guardar su perfil. Intenta nuevamente.",
  create: "No se pudo crear el restaurante. Intenta nuevamente.",
};

const initialState: CreateRestaurantFormState = {};

export function OwnerRestaurantCreateFormClient() {
  const [state, formAction, pending] = useActionState(createOwnedRestaurantFormAction, initialState);
  const router = useRouter();
  const values = state.values ?? {};
  const businessType = (values.businessType || "food") as BusinessType;
  const publicCategory = values.publicCategory || defaultRestaurantCategory(businessType);
  const isFinishing = Boolean(state.success);

  useEffect(() => {
    if (!state.success) {
      return;
    }

    router.replace(state.redirectTo ?? "/dueno");
  }, [router, state.redirectTo, state.success]);

  return (
    <form action={formAction}>
      {state.error ? (
        <div className="mb-5 rounded-2xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] p-4 text-sm font-semibold text-[var(--color-danger-strong)]" role="alert">
          {errorMessages[state.error] ?? errorMessages.create}
        </div>
      ) : null}

      <Card className="grid gap-4 md:grid-cols-2">
        <SectionTitle
          className="md:col-span-2"
          description="Completa los datos publicos de tu negocio. Luego entraras al panel para crear productos, horarios, caja e inventario."
          title="Datos de tu restaurante"
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
        <Input className="md:col-span-2" minLength={8} name="branchUserPassword" placeholder="Contrasena temporal, minimo 8 caracteres" required type="password" />

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)] md:col-span-2">
          Este responsable debera cambiar la contrasena en su primer ingreso y no tendra acceso al panel de dueno.
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)] md:col-span-2">
          Tu restaurante se crea con la tarifa Full. La primera sucursal cuesta Bs 450/mes; cada sucursal adicional habilitada cuesta Bs 299/mes.
        </div>

        <div className="md:col-span-2">
          <Button className="min-h-12 w-full sm:w-auto" disabled={pending || isFinishing}>
            {pending || isFinishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            {pending || isFinishing ? "Creando restaurante..." : "Crear mi restaurante"}
          </Button>
        </div>
      </Card>

      {pending || isFinishing ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[rgb(8_36_65_/_0.78)] px-4 text-center text-white backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[1.75rem] border border-white/16 bg-white/95 p-6 text-[var(--primary)] shadow-[0_28px_90px_rgb(2_10_18_/_0.34)]">
            <div className="mx-auto grid h-24 w-24 place-items-center rounded-[1.5rem] bg-[var(--primary-light)] shadow-inner">
              <Image alt="yopido.shop" className="h-16 w-16 animate-pulse object-contain" height={96} priority src="/brand/yopido-icon-dark-1024.png" width={96} />
            </div>
            <p className="mt-5 text-xl font-black">{isFinishing ? "Entrando a tu panel" : "Estamos creando tu restaurante"}</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
              {isFinishing ? "Todo quedo listo. Estamos actualizando tu dashboard." : "Preparando tu panel, configuracion inicial y acceso de dueno."}
            </p>
            <div className="mx-auto mt-5 h-2 w-44 overflow-hidden rounded-full bg-[var(--primary-light)]">
              <span className="block h-full w-1/2 animate-pulse rounded-full bg-[var(--accent)]" />
            </div>
          </div>
        </div>
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
