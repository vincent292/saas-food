import { AlertTriangle, ChefHat, ClipboardList, Table2, WalletCards } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { cashService } from "@/lib/services/cash.service";
import { inventoryService } from "@/lib/services/inventory.service";
import { orderService } from "@/lib/services/order.service";
import { productService } from "@/lib/services/product.service";
import { tableService } from "@/lib/services/table.service";
import { formatMoney } from "@/lib/utils/money";

export async function RestaurantDashboard({ restaurantId }: { restaurantId: string }) {
  const [summary, orders, tables, products, lowStock] = await Promise.all([
    cashService.getSummary(restaurantId),
    orderService.listByRestaurant(restaurantId),
    tableService.listByRestaurant(restaurantId),
    productService.listByRestaurant(restaurantId),
    inventoryService.listLowStock(restaurantId),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<WalletCards className="h-5 w-5" />} label="Ventas del dia" value={formatMoney(summary.salesTotal)} detail="Pagadas hasta ahora" />
        <StatCard icon={<ClipboardList className="h-5 w-5" />} label="Pedidos pendientes" value={String(orders.filter((order) => order.status === "pending").length)} />
        <StatCard icon={<ChefHat className="h-5 w-5" />} label="En preparacion" value={String(orders.filter((order) => order.status === "preparing").length)} />
        <StatCard icon={<Table2 className="h-5 w-5" />} label="Mesas activas" value={String(tables.filter((table) => table.status !== "available").length)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Productos disponibles" description="Productos activos del restaurante." />
          <div className="mt-4 space-y-3">
            {products.slice(0, 4).map((product, index) => (
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3" key={product.id}>
                <span className="font-semibold">
                  {index + 1}. {product.name}
                </span>
                <span className="text-sm text-slate-500">{formatMoney(product.price)}</span>
              </div>
            ))}
            {!products.length ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Aun no hay productos cargados.</p> : null}
          </div>
        </Card>

        <Card>
          <SectionTitle title="Alertas de inventario" description="Insumos bajo minimo." />
          <div className="mt-4 space-y-3">
            {lowStock.map((item) => (
              <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-3 text-amber-900" key={item.id}>
                <AlertTriangle className="h-5 w-5" />
                <span className="font-semibold">
                  {item.name}: {item.currentStock} {item.unit}
                </span>
              </div>
            ))}
            {!lowStock.length ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Sin alertas de inventario.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
