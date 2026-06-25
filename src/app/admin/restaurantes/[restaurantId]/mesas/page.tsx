import { notFound } from "next/navigation";
import { createTableAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { TableCard } from "@/components/tables/TableCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { restaurantService } from "@/lib/services/restaurant.service";
import { tableService } from "@/lib/services/table.service";

export default async function TablesPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  const [{ restaurantId }, status] = await Promise.all([params, searchParams]);
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  const tables = await tableService.listByRestaurant(restaurant.id);

  return (
    <AdminLayout active="mesas" restaurantId={restaurant.id} title="Mesas QR">
      <SectionTitle title="Mesas" description="Crea mesas reales con código QR por restaurante." />
      {status.created ? <div className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Mesa creada.</div> : null}
      {status.error ? <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">No se pudo guardar la mesa.</div> : null}
      <form action={createTableAction}>
        <Card className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr_140px_auto] md:items-end">
          <input name="restaurantId" type="hidden" value={restaurant.id} />
          <Input name="name" placeholder="Nombre, ej. Mesa 01" required />
          <Input name="code" placeholder="Código, ej. MESA-01" required />
          <Input defaultValue={4} min={1} name="capacity" placeholder="Capacidad" type="number" />
          <Button>Nueva mesa</Button>
        </Card>
      </form>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tables.map((table) => (
          <TableCard key={table.id} table={table} />
        ))}
      </div>
    </AdminLayout>
  );
}
