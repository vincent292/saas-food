import { createRestaurantAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { planService } from "@/lib/services/plan.service";

const errorMessages: Record<string, string> = {
  invalid: "Revisa los datos obligatorios.",
  "owner-password-required": "Ingresa una contraseña inicial para crear el usuario responsable.",
  "service-role-required": "Falta SUPABASE_SERVICE_ROLE_KEY para crear usuarios desde el panel.",
};

export default async function NewRestaurantPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, plans] = await Promise.all([searchParams, planService.listPlans()]);

  return (
    <AdminLayout active="/admin/restaurantes" title="Nuevo restaurante">
      <SectionTitle title="Crear restaurante" description="Crea el tenant, asigna responsable, plan, módulos y membresía inicial." />
      {error ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {errorMessages[error] ?? "No se pudo crear el restaurante. Verifica el slug, el responsable y tu rol superadmin."}
        </div>
      ) : null}
      <form action={createRestaurantAction}>
        <Card className="mt-6 grid gap-4 md:grid-cols-2">
          <SectionTitle className="md:col-span-2" title="Negocio" description="Datos visibles para clientes y equipo operativo." />
          <Input name="name" placeholder="Nombre comercial" required />
          <Input name="slug" placeholder="Slug público, ej. cafeteria-luna" />
          <Input name="whatsapp" placeholder="WhatsApp" />
          <Input name="city" placeholder="Ciudad" />
          <Input name="address" placeholder="Dirección" />
          <Select defaultValue="basic" name="planKey">
            {plans.map((plan) => (
              <option key={plan.key} value={plan.key}>
                {plan.name} - Bs {plan.priceMonthly}/mes
              </option>
            ))}
          </Select>
          <Input defaultValue="#1d8844" name="primaryColor" placeholder="Color principal #1d8844" />
          <Input defaultValue="#f59e0b" name="secondaryColor" placeholder="Color secundario" />
          <Input accept="image/*" name="logoFile" type="file" />
          <Input accept="image/*" name="bannerFile" type="file" />
          <Textarea className="md:col-span-2" name="description" placeholder="Descripción del negocio" />

          <SectionTitle className="md:col-span-2" title="Responsable" description="Este usuario entrará directo al panel del restaurante." />
          <Input name="ownerName" placeholder="Nombre del responsable" />
          <Input name="ownerEmail" placeholder="correo@restaurante.com" type="email" />
          <Input className="md:col-span-2" minLength={8} name="ownerPassword" placeholder="Contraseña inicial si el usuario no existe" type="password" />

          <div className="grid gap-3 md:col-span-2 md:grid-cols-3">
            {plans.map((plan) => (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4" key={plan.key}>
                <p className="text-lg font-black text-slate-950">{plan.name}</p>
                <p className="mt-1 text-sm text-slate-600">{plan.description}</p>
                <p className="mt-3 text-sm font-bold text-emerald-700">{plan.modules.length} módulos activos</p>
              </div>
            ))}
          </div>
          <div className="md:col-span-2">
            <Button>Crear restaurante</Button>
          </div>
        </Card>
      </form>
    </AdminLayout>
  );
}
