import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { ModuleToggle } from "@/components/settings/ModuleToggle";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function SettingsPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  const settings = await restaurantService.getSettings(restaurant.id);

  return (
    <AdminLayout active="configuracion" restaurantId={restaurant.id} title="Configuración">
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="grid gap-4 md:grid-cols-2">
          <SectionTitle title="Identidad y operación" description="Datos que personalizan el menú público." />
          <div className="md:col-span-2" />
          <Input defaultValue={restaurant.name} placeholder="Nombre" />
          <Input defaultValue={restaurant.slug} placeholder="Slug" />
          <Input defaultValue={restaurant.primaryColor} placeholder="Color principal" />
          <Input defaultValue={restaurant.secondaryColor} placeholder="Color secundario" />
          <Input defaultValue={restaurant.whatsapp} placeholder="WhatsApp" />
          <Input defaultValue={restaurant.address} placeholder="Dirección" />
          <Textarea className="md:col-span-2" defaultValue={restaurant.description} placeholder="Descripción" />
          <div className="md:col-span-2">
            <Button>Guardar configuración</Button>
          </div>
        </Card>
        <Card>
          <SectionTitle title="Módulos" description="Activación por restaurante." />
          <div className="mt-4 space-y-3">
            <ModuleToggle enabled={Boolean(settings?.deliveryEnabled)} label="Delivery" />
            <ModuleToggle enabled={Boolean(settings?.pickupEnabled)} label="Recojo" />
            <ModuleToggle enabled={Boolean(settings?.tableOrdersEnabled)} label="Pedidos en mesa" />
            <ModuleToggle enabled={Boolean(settings?.inventoryEnabled)} label="Inventario" />
            <ModuleToggle enabled={Boolean(settings?.cashEnabled)} label="Caja / POS" />
            <ModuleToggle enabled={Boolean(settings?.kitchenEnabled)} label="Cocina" />
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
