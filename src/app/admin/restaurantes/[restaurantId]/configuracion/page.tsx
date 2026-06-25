import { notFound } from "next/navigation";
import { updateRestaurantConfigurationAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { ModuleToggle } from "@/components/settings/ModuleToggle";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { restaurantService } from "@/lib/services/restaurant.service";
import { settingsService } from "@/lib/services/settings.service";

const days = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { restaurantId } = await params;
  const { saved, error } = await searchParams;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  const [settings, businessHours] = await Promise.all([restaurantService.getSettings(restaurant.id), settingsService.listBusinessHours(restaurant.id)]);
  const hoursByDay = new Map(businessHours.map((hour) => [hour.dayOfWeek, hour]));

  return (
    <AdminLayout active="configuracion" restaurantId={restaurant.id} title="Configuracion">
      <form action={updateRestaurantConfigurationAction} className="space-y-6">
        <input name="restaurantId" type="hidden" value={restaurant.id} />
        <input name="currentSlug" type="hidden" value={restaurant.slug} />

        {saved ? <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Configuracion guardada en Supabase.</div> : null}
        {error ? <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">No se pudo guardar la configuracion: {error}.</div> : null}

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <Card className="grid gap-4 md:grid-cols-2">
            <SectionTitle title="Identidad y operacion" description="Datos visibles en el menu publico y paneles operativos." />
            <div className="md:col-span-2" />
            <Input defaultValue={restaurant.name} name="name" placeholder="Nombre" required />
            <Input defaultValue={restaurant.slug} name="slug" placeholder="Slug" required />
            <Input defaultValue={restaurant.primaryColor} name="primaryColor" type="color" />
            <Input defaultValue={restaurant.secondaryColor} name="secondaryColor" type="color" />
            <Input defaultValue={restaurant.whatsapp} name="whatsapp" placeholder="WhatsApp" />
            <Input defaultValue={restaurant.address} name="address" placeholder="Direccion" />
            <Input defaultValue={restaurant.city} name="city" placeholder="Ciudad" />
            <Select defaultValue={restaurant.status} name="status">
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
              <option value="suspended">Suspendido</option>
            </Select>
            <Textarea className="md:col-span-2" defaultValue={restaurant.description} name="description" placeholder="Descripcion" />
            <label className="space-y-2 text-sm font-semibold text-slate-700">
              Logo
              <Input accept="image/*" name="logoFile" type="file" />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-700">
              Banner
              <Input accept="image/*" name="bannerFile" type="file" />
            </label>
          </Card>

          <Card>
            <SectionTitle title="Modulos" description="Activacion por restaurante." />
            <div className="mt-4 space-y-3">
              <ModuleToggle enabled={settings?.deliveryEnabled ?? true} label="Delivery" name="deliveryEnabled" />
              <ModuleToggle enabled={settings?.pickupEnabled ?? true} label="Recojo" name="pickupEnabled" />
              <ModuleToggle enabled={settings?.tableOrdersEnabled ?? true} label="Pedidos en mesa" name="tableOrdersEnabled" />
              <ModuleToggle enabled={settings?.inventoryEnabled ?? true} label="Inventario" name="inventoryEnabled" />
              <ModuleToggle enabled={settings?.cashEnabled ?? true} label="Caja / POS" name="cashEnabled" />
              <ModuleToggle enabled={settings?.kitchenEnabled ?? true} label="Cocina" name="kitchenEnabled" />
            </div>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <Card className="grid gap-4 md:grid-cols-2">
            <SectionTitle title="Pedidos y pagos" description="Reglas reales para checkout, delivery y QR." />
            <div className="md:col-span-2" />
            <Input defaultValue={settings?.deliveryFee ?? 0} min="0" name="deliveryFee" placeholder="Costo delivery" step="0.01" type="number" />
            <Input defaultValue={settings?.freeDeliveryFrom || ""} min="0" name="freeDeliveryFrom" placeholder="Delivery gratis desde" step="0.01" type="number" />
            <Input defaultValue={settings?.minOrderAmount ?? 0} min="0" name="minOrderAmount" placeholder="Pedido minimo" step="0.01" type="number" />
            <Select defaultValue={settings?.currency ?? "BOB"} name="currency">
              <option value="BOB">BOB</option>
              <option value="USD">USD</option>
            </Select>
            <Input className="md:col-span-2" defaultValue={settings?.qrPaymentUrl} name="qrPaymentUrl" placeholder="URL de QR de pago" />
            <label className="space-y-2 text-sm font-semibold text-slate-700 md:col-span-2">
              Subir QR de pago
              <Input accept="image/*" name="qrPaymentFile" type="file" />
            </label>
          </Card>

          <Card>
            <SectionTitle title="Publicacion" description="Accesos publicos del restaurante." />
            <div className="mt-4 space-y-3 text-sm font-semibold text-slate-700">
              <p className="rounded-2xl bg-slate-50 p-3">Menu: /r/{restaurant.slug}</p>
              <p className="rounded-2xl bg-slate-50 p-3">Cocina: /cocina/{restaurant.slug}</p>
              <p className="rounded-2xl bg-slate-50 p-3">Caja: /caja/{restaurant.slug}</p>
            </div>
          </Card>
        </div>

        <Card>
          <SectionTitle title="Horarios" description="Horario operativo que queda asociado al restaurante." />
          <div className="mt-4 grid gap-3">
            {days.map((day, dayOfWeek) => {
              const hour = hoursByDay.get(dayOfWeek);
              return (
                <div className="grid gap-3 rounded-2xl border border-slate-200 p-3 md:grid-cols-[140px_1fr_1fr_120px]" key={day}>
                  <p className="font-bold text-slate-900">{day}</p>
                  <Input defaultValue={hour?.opensAt || "09:00"} name={`day_${dayOfWeek}_opensAt`} type="time" />
                  <Input defaultValue={hour?.closesAt || "22:00"} name={`day_${dayOfWeek}_closesAt`} type="time" />
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input defaultChecked={hour?.isClosed ?? false} name={`day_${dayOfWeek}_isClosed`} type="checkbox" />
                    Cerrado
                  </label>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="sticky bottom-4 z-10 flex justify-end">
          <Button type="submit">Guardar configuracion</Button>
        </div>
      </form>
    </AdminLayout>
  );
}
