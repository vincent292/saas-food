import { AlertTriangle, ChefHat, ClipboardList, PackageCheck, Table2, WalletCards } from "lucide-react";
import { RestaurantRealtimeRefresh } from "@/components/realtime/RestaurantRealtimeRefresh";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { cashService } from "@/lib/services/cash.service";
import { inventoryService } from "@/lib/services/inventory.service";
import { orderService } from "@/lib/services/order.service";
import { productService } from "@/lib/services/product.service";
import { tableService } from "@/lib/services/table.service";
import { createClient } from "@/lib/supabase/server";
import { isSameBusinessDay } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import { businessCatalogItemsLabel, businessPreparationAreaTitle, businessTypeSupportsTableQr } from "@/lib/restaurant-directory-options";
import type { BusinessType } from "@/types/restaurant.types";

type DashboardSnapshot = {
  activeTables: number;
  lowStock: Array<{ currentStock: number; id: string; minStock: number; name: string; unit: string }>;
  pendingOrders: number;
  preparingOrders: number;
  products: Array<{ id: string; name: string; price: number }>;
  readyOrders: number;
  salesTotal: number;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

async function loadDashboardSnapshot(restaurantId: string): Promise<DashboardSnapshot> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_restaurant_dashboard_snapshot", { p_restaurant_id: restaurantId });
  const payload = record(data);
  if (!error && payload) {
    const products = Array.isArray(payload.products) ? payload.products.map(record).filter(Boolean) : [];
    const lowStock = Array.isArray(payload.low_stock) ? payload.low_stock.map(record).filter(Boolean) : [];
    return {
      activeTables: Number(payload.active_tables ?? 0),
      lowStock: lowStock.map((item) => ({
        currentStock: Number(item?.current_stock ?? 0),
        id: String(item?.id ?? ""),
        minStock: Number(item?.min_stock ?? 0),
        name: String(item?.name ?? "Insumo"),
        unit: String(item?.unit ?? ""),
      })),
      pendingOrders: Number(payload.pending_orders ?? 0),
      preparingOrders: Number(payload.preparing_orders ?? 0),
      products: products.map((product) => ({
        id: String(product?.id ?? ""),
        name: String(product?.name ?? "Producto"),
        price: Number(product?.price ?? 0),
      })),
      readyOrders: Number(payload.ready_orders ?? 0),
      salesTotal: Number(payload.sales_total ?? 0),
    };
  }

  const [summary, orders, tables, products, lowStock] = await Promise.all([
    cashService.getSummary(restaurantId),
    orderService.listByRestaurant(restaurantId),
    tableService.listByRestaurant(restaurantId),
    productService.listByRestaurant(restaurantId),
    inventoryService.listLowStock(restaurantId),
  ]);
  const todaysOrders = orders.filter((order) => isSameBusinessDay(order.createdAt));
  return {
    activeTables: tables.filter((table) => table.status !== "available").length,
    lowStock,
    pendingOrders: todaysOrders.filter((order) => order.status === "pending").length,
    preparingOrders: todaysOrders.filter((order) => order.status === "preparing").length,
    products: products.slice(0, 4),
    readyOrders: todaysOrders.filter((order) => order.status === "ready").length,
    salesTotal: summary.salesTotal,
  };
}

export async function RestaurantDashboard({ restaurantId, businessType }: { restaurantId: string; businessType: BusinessType }) {
  const snapshot = await loadDashboardSnapshot(restaurantId);
  const supportsTables = businessTypeSupportsTableQr(businessType);
  const preparationTitle = businessPreparationAreaTitle(businessType);
  const itemsLabel = businessCatalogItemsLabel(businessType);

  return (
    <div className="space-y-6">
      <RestaurantRealtimeRefresh restaurantId={restaurantId} scope="dashboard" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<WalletCards className="h-5 w-5" />} label="Ventas del día" value={formatMoney(snapshot.salesTotal)} detail="Pagadas hasta ahora" />
        <StatCard icon={<ClipboardList className="h-5 w-5" />} label="Pedidos pendientes" value={String(snapshot.pendingOrders)} />
        <StatCard icon={<ChefHat className="h-5 w-5" />} label={`En ${preparationTitle.toLowerCase()}`} value={String(snapshot.preparingOrders)} />
        <StatCard
          icon={supportsTables ? <Table2 className="h-5 w-5" /> : <PackageCheck className="h-5 w-5" />}
          label={supportsTables ? "Mesas activas" : "Listos para entrega"}
          value={String(supportsTables ? snapshot.activeTables : snapshot.readyOrders)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Productos disponibles" description={`${itemsLabel[0].toUpperCase()}${itemsLabel.slice(1)} activos del negocio.`} />
          <div className="mt-4 space-y-3">
            {snapshot.products.map((product, index) => (
              <div className="flex items-center justify-between rounded-2xl bg-[var(--color-surface)] p-3" key={product.id}>
                <span className="font-semibold">
                  {index + 1}. {product.name}
                </span>
                <span className="text-sm text-[var(--color-secondary-text)]">{formatMoney(product.price)}</span>
              </div>
            ))}
            {!snapshot.products.length ? <p className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm text-[var(--color-secondary-text)]">Aún no hay productos cargados.</p> : null}
          </div>
        </Card>

        <Card>
          <SectionTitle title="Alertas de inventario" description="Insumos bajo mínimo." />
          <div className="mt-4 space-y-3">
            {snapshot.lowStock.map((item) => (
              <div className="flex items-center gap-3 rounded-2xl bg-[var(--color-warning-soft)] p-3 text-[var(--color-warning-strong)]" key={item.id}>
                <AlertTriangle className="h-5 w-5" />
                <span className="font-semibold">
                  {item.name}: {item.currentStock} {item.unit}
                </span>
              </div>
            ))}
            {!snapshot.lowStock.length ? <p className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm text-[var(--color-secondary-text)]">Sin alertas de inventario.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
