import { notFound } from "next/navigation";
import { createInventoryItemAction, registerInventoryMovementAction } from "@/app/admin/actions";
import { InventoryItemRow } from "@/components/inventory/InventoryItemRow";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { inventoryService } from "@/lib/services/inventory.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { formatShortDate, formatShortTime } from "@/lib/utils/dates";

export default async function InventoryPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  const [items, movements] = await Promise.all([inventoryService.listItems(restaurant.id), inventoryService.listMovements(restaurant.id)]);

  return (
    <AdminLayout active="inventario" restaurantId={restaurant.id} title="Inventario">
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card>
            <SectionTitle title="Insumos" description="Stock actual, mínimo, costo unitario y alertas." />
            <div className="mt-4">
              {items.length ? (
                items.map((item) => <InventoryItemRow item={item} key={item.id} />)
              ) : (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Aún no hay insumos registrados.</p>
              )}
            </div>
          </Card>

          <Card>
            <SectionTitle title="Nuevo insumo" description="Crea insumos reales para este restaurante." />
            <form action={createInventoryItemAction} className="mt-4 space-y-3">
              <input name="restaurantId" type="hidden" value={restaurant.id} />
              <Input name="name" placeholder="Nombre del insumo" />
              <Select name="unit" defaultValue="unidad">
                <option value="unidad">Unidad</option>
                <option value="kg">Kg</option>
                <option value="g">g</option>
                <option value="litro">Litro</option>
                <option value="ml">ml</option>
                <option value="caja">Caja</option>
                <option value="paquete">Paquete</option>
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Input min={0} name="currentStock" placeholder="Stock actual" step="0.001" type="number" />
                <Input min={0} name="minStock" placeholder="Stock mínimo" step="0.001" type="number" />
              </div>
              <Input min={0} name="unitCost" placeholder="Costo unitario" step="0.01" type="number" />
              <Button className="w-full" type="submit">
                Crear insumo
              </Button>
            </form>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <Card>
            <SectionTitle title="Movimiento" description="Registra entradas, salidas, ajustes o mermas." />
            <form action={registerInventoryMovementAction} className="mt-4 space-y-3">
              <input name="restaurantId" type="hidden" value={restaurant.id} />
              <Select name="inventoryItemId" defaultValue="">
                <option disabled value="">
                  Seleccionar insumo
                </option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <Select name="type" defaultValue="in">
                <option value="in">Entrada</option>
                <option value="out">Salida</option>
                <option value="adjustment">Ajuste a stock final</option>
                <option value="waste">Merma</option>
                <option value="sale_usage">Uso por venta</option>
              </Select>
              <Input min={0} name="quantity" placeholder="Cantidad" step="0.001" type="number" />
              <Input name="reason" placeholder="Motivo" />
              <Button className="w-full" type="submit" variant="secondary">
                Registrar movimiento
              </Button>
            </form>
          </Card>

          <Card>
            <SectionTitle title="Historial" description="Entradas, salidas, ajustes y mermas." />
            <div className="mt-4 space-y-3">
              {movements.length ? (
                movements.map((movement) => {
                  const item = items.find((inventoryItem) => inventoryItem.id === movement.inventoryItemId);

                  return (
                    <div className="grid gap-2 rounded-2xl bg-slate-50 p-3 sm:grid-cols-[1fr_auto] sm:items-center" key={movement.id}>
                      <div>
                        <p className="font-bold text-slate-950">
                          {item?.name ?? "Insumo"} · {movement.type}
                        </p>
                        <p className="text-sm text-slate-500">{movement.reason}</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-700">
                        {movement.previousStock} → {movement.newStock} · {formatShortDate(movement.createdAt)} {formatShortTime(movement.createdAt)}
                      </p>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Aún no hay movimientos de inventario.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
