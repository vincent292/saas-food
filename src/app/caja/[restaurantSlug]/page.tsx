import { notFound } from "next/navigation";
import { CashSummaryCard } from "@/components/cash/CashSummaryCard";
import { POSProductGrid } from "@/components/cash/POSProductGrid";
import { RestaurantThemeProvider } from "@/components/restaurant/RestaurantThemeProvider";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { cashService } from "@/lib/services/cash.service";
import { categoryService } from "@/lib/services/category.service";
import { productService } from "@/lib/services/product.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function PublicCashPage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const restaurant = await restaurantService.getBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  const [summary, categories, products] = await Promise.all([
    cashService.getSummary(restaurant.id),
    categoryService.listByRestaurant(restaurant.id),
    productService.listAvailableByRestaurant(restaurant.id),
  ]);
  const configuration = await productService.listConfigurationsByRestaurant(restaurant.id);

  return (
    <RestaurantThemeProvider theme={restaurant.theme}>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <SectionTitle title={`Caja · ${restaurant.name}`} description="Vista rápida para cajero con POS y resumen." />
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <CashSummaryCard amount={summary.salesTotal} label="Ventas" />
          <CashSummaryCard amount={summary.cashTotal} label="Efectivo" />
          <CashSummaryCard amount={summary.qrTotal} label="QR" />
          <CashSummaryCard amount={summary.netTotal} label="Neto" />
        </div>
        <div className="mt-6">
          <POSProductGrid categories={categories} configuration={configuration} disabled={!summary.session} products={products} restaurantId={restaurant.id} restaurantSlug={restaurant.slug} />
        </div>
      </main>
    </RestaurantThemeProvider>
  );
}
