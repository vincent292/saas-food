import type { ReactNode } from "react";
import { createRestaurantAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { GoogleLocationFields } from "@/components/location/GoogleLocationFields";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { categoriesForBusinessType, defaultRestaurantCategory, restaurantBusinessTypeOptions, restaurantLocationOptions } from "@/lib/restaurant-directory-options";
import { planService } from "@/lib/services/plan.service";

const errorMessages: Record<string, string> = {
  invalid: "Revisa los datos obligatorios.",
  "owner-password-required": "Ingresa una contrasena inicial para crear el usuario responsable.",
  "owner-email-required": "Ingresa un correo para asignar un responsable.",
  "service-role-required": "Falta SUPABASE_SERVICE_ROLE_KEY para crear o actualizar usuarios desde el panel.",
};

export default async function NewRestaurantPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, plans] = await Promise.all([searchParams, planService.listPlans()]);

  return (
    <AdminLayout active="/admin/restaurantes" title="Nuevo restaurante">
      <SectionTitle title="Crear negocio" description="Crea el tenant, asigna responsable, plan, modulos y membresia inicial." />
      {error ? (
        <div className="mt-6 rounded-2xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] p-4 text-sm font-semibold text-[var(--color-danger-strong)]">
          {errorMessages[error] ?? "No se pudo crear el negocio. Verifica el slug, el responsable y tu rol superadmin."}
        </div>
      ) : null}
      <form action={createRestaurantAction}>
        <Card className="mt-6 grid gap-4 md:grid-cols-2">
          <SectionTitle className="md:col-span-2" title="Negocio" description="Datos visibles para clientes y equipo operativo." />
          <Input name="name" placeholder="Nombre comercial" required />
          <Input name="slug" placeholder="Slug publico, ej. cafeteria-luna" />
          <Input name="whatsapp" placeholder="WhatsApp" />

          <FieldSelect label="Ciudad">
            <Select defaultValue="Cochabamba" name="city">
              {restaurantLocationOptions.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </Select>
          </FieldSelect>

          <FieldSelect label="Rubro principal">
            <Select defaultValue="food" name="businessType">
              {restaurantBusinessTypeOptions.map((businessType) => (
                <option key={businessType.value} value={businessType.value}>
                  {businessType.label}
                </option>
              ))}
            </Select>
          </FieldSelect>

          <FieldSelect label="Subcategoria publica">
            <Select defaultValue={defaultRestaurantCategory("food")} name="publicCategory">
              {restaurantBusinessTypeOptions.map((businessType) => (
                <optgroup key={businessType.value} label={businessType.label}>
                  {categoriesForBusinessType(businessType.value).map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </FieldSelect>

          <Input name="address" placeholder="Direccion" />
          <Input name="addressReference" placeholder="Referencia o zona" />
          <div className="md:col-span-2">
            <GoogleLocationFields hideCoordinateInputs hideMapsUrlInput label="Ubicacion del negocio" showMapByDefault />
          </div>
          <Select defaultValue="basic" name="planKey">
            {plans.map((plan) => (
              <option key={plan.key} value={plan.key}>
                {plan.name} - Bs {plan.priceMonthly}/mes
              </option>
            ))}
          </Select>
          <CompressedImageInput help="Recomendado: cuadrado 800 x 800 px. Se subira optimizado en WebP." label="Logo" name="logoFile" previewClassName="aspect-square" />
          <CompressedImageInput help="Recomendado: 1600 x 900 px o similar. Evita texto pequeno dentro de la imagen." label="Banner" name="bannerFile" />
          <Textarea className="md:col-span-2" name="description" placeholder="Descripcion del negocio" />

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)] md:col-span-2">
            El rubro define si este tenant usara flujo gastronomico completo o un catalogo general con seguimiento de pedidos sin cocina ni mesas.
          </div>

          <SectionTitle className="md:col-span-2" title="Responsable" description="Este usuario entrara directo al panel del negocio." />
          <Input name="ownerName" placeholder="Nombre del responsable" />
          <Input name="ownerEmail" placeholder="correo@negocio.com" type="email" />
          <PasswordInput className="md:col-span-2" minLength={8} name="ownerPassword" placeholder="Contrasena inicial si el usuario no existe" />

          <div className="grid gap-3 md:col-span-2 md:grid-cols-3">
            {plans.map((plan) => (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4" key={plan.key}>
                <p className="text-lg font-black text-[var(--color-heading)]">{plan.name}</p>
                <p className="mt-1 text-sm text-[var(--color-secondary-text)]">{plan.description}</p>
                <p className="mt-3 text-sm font-bold text-[var(--color-success-strong)]">{plan.modules.length} modulos activos</p>
              </div>
            ))}
          </div>

          <div className="md:col-span-2">
            <Button>Crear negocio</Button>
          </div>
        </Card>
      </form>
    </AdminLayout>
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
