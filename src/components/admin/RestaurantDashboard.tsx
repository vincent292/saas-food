import { AlertTriangle, ChefHat, ClipboardList, PackageCheck, Table2, WalletCards } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { cashService } from "@/lib/services/cash.service";
import { inventoryService } from "@/lib/services/inventory.service";
import { orderService } from "@/lib/services/order.service";
import { productService } from "@/lib/services/product.service";
import { tableService } from "@/lib/services/table.service";
import { isSameBusinessDay } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import { businessCatalogItemsLabel, businessPreparationAreaTitle, businessTypeSupportsTableQr } from "@/lib/restaurant-directory-options";
import type { BusinessType } from "@/types/restaurant.types";

export async function RestaurantDashboard({ restaurantId, businessType }: { restaurantId: string; businessType: BusinessType }) {
  const [summary, orders, tables, products, lowStock] = await Promise.all([
    cashService.getSummary(restaurantId),
    orderService.listByRestaurant(restaurantId),
    tableService.listByRestaurant(restaurantId),
    productService.listByRestaurant(restaurantId),
    inventoryService.listLowStock(restaurantId),
  ]);
  const todaysOrders = orders.filter((order) => isSameBusinessDay(order.createdAt));
  const supportsTables = businessTypeSupportsTableQr(businessType);
  const preparationTitle = businessPreparationAreaTitle(businessType);
  const itemsLabel = businessCatalogItemsLabel(businessType);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<WalletCards className="h-5 w-5" />} label="Ventas del día" value={formatMoney(summary.salesTotal)} detail="Pagadas hasta ahora" />
        <StatCard icon={<ClipboardList className="h-5 w-5" />} label="Pedidos pendientes" value={String(todaysOrders.filter((order) => order.status === "pending").length)} />
        <StatCard icon={<ChefHat className="h-5 w-5" />} label={`En ${preparationTitle.toLowerCase()}`} value={String(todaysOrders.filter((order) => order.status === "preparing").length)} />
        <StatCard
          icon={supportsTables ? <Table2 className="h-5 w-5" /> : <PackageCheck className="h-5 w-5" />}
          label={supportsTables ? "Mesas activas" : "Listos para entrega"}
          value={String(supportsTables ? tables.filter((table) => table.status !== "available").length : todaysOrders.filter((order) => order.status === "ready").length)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Productos disponibles" description={`${itemsLabel[0].toUpperCase()}${itemsLabel.slice(1)} activos del negocio.`} />
          <div className="mt-4 space-y-3">
            {products.slice(0, 4).map((product, index) => (
              <div className="flex items-center justify-between rounded-2xl bg-[var(--color-surface)] p-3" key={product.id}>
                <span className="font-semibold">
                  {index + 1}. {product.name}
                </span>
                <span className="text-sm text-[var(--color-secondary-text)]">{formatMoney(product.price)}</span>
              </div>
            ))}
            {!products.length ? <p className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm text-[var(--color-secondary-text)]">Aún no hay productos cargados.</p> : null}
          </div>
        </Card>

        <Card>
          <SectionTitle title="Alertas de inventario" description="Insumos bajo mínimo." />
          <div className="mt-4 space-y-3">
            {lowStock.map((item) => (
              <div className="flex items-center gap-3 rounded-2xl bg-[var(--color-warning-soft)] p-3 text-[var(--color-warning-strong)]" key={item.id}>
                <AlertTriangle className="h-5 w-5" />
                <span className="font-semibold">
                  {item.name}: {item.currentStock} {item.unit}
                </span>
              </div>
            ))}
            {!lowStock.length ? <p className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm text-[var(--color-secondary-text)]">Sin alertas de inventario.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
