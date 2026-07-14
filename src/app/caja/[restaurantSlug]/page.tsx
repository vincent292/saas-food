import { notFound, redirect } from "next/navigation";
import { CashSummaryCard } from "@/components/cash/CashSummaryCard";
import { POSProductGrid } from "@/components/cash/POSProductGrid";
import { RestaurantThemeProvider } from "@/components/restaurant/RestaurantThemeProvider";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { hasRestaurantModule } from "@/lib/modules";
import { cashService } from "@/lib/services/cash.service";
import { categoryService } from "@/lib/services/category.service";
import { productService } from "@/lib/services/product.service";
import { authService } from "@/lib/services/auth.service";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function PublicCashPage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const profile = await authService.getCurrentProfile();

  if (!profile) {
    redirect("/admin/login?error=session");
  }

  const restaurant = await restaurantService.getOperationalBySlug(restaurantSlug);

  if (!restaurant || !hasRestaurantModule(restaurant, "cash")) {
    notFound();
  }

  await restaurantAccessService.claimOrRedirect(restaurant.id, `/caja/${restaurant.slug}`);

  const [summary, categories, products] = await Promise.all([
    cashService.getSummary(restaurant.id),
    categoryService.listByRestaurant(restaurant.id),
    productService.listAvailableByRestaurant(restaurant.id),
  ]);
  const configuration = await productService.listConfigurationsByRestaurant(restaurant.id);

  return (
    <RestaurantThemeProvider>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <SectionTitle title={`Caja · ${restaurant.name}`} description="Vista rápida para cajero con POS y resumen." />
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <CashSummaryCard amount={summary.expectedCash} label="Efectivo esperado" />
          <CashSummaryCard amount={summary.salesTotal} label="Ventas" />
          <CashSummaryCard amount={summary.digitalTotal} label="Cobros digitales" />
          <CashSummaryCard amount={summary.netTotal} label="Neto turno" />
        </div>
        <div className="mt-6">
          <POSProductGrid businessType={restaurant.businessType} categories={categories} configuration={configuration} disabled={!summary.session} products={products} restaurantId={restaurant.id} restaurantSlug={restaurant.slug} />
        </div>
      </main>
    </RestaurantThemeProvider>
  );
}
