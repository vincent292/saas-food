import { notFound } from "next/navigation";
import Image from "next/image";
import { Search } from "lucide-react";
import { CartDrawer } from "@/components/public-menu/CartDrawer";
import { CategoryChip } from "@/components/public-menu/CategoryChip";
import { ProductCard } from "@/components/public-menu/ProductCard";
import { PromoBanner } from "@/components/public-menu/PromoBanner";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { RestaurantLayout } from "@/components/layout/RestaurantLayout";
import { categoryService } from "@/lib/services/category.service";
import { productService } from "@/lib/services/product.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function RestaurantPublicPage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const restaurant = await restaurantService.getBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  const [settings, categories, products, featuredProducts] = await Promise.all([
    restaurantService.getSettings(restaurant.id),
    categoryService.listByRestaurant(restaurant.id),
    productService.listAvailableByRestaurant(restaurant.id),
    productService.listFeaturedByRestaurant(restaurant.id),
  ]);

  return (
    <RestaurantLayout restaurant={restaurant}>
      <main className="mx-auto grid max-w-7xl gap-8 px-4 pb-28 pt-6 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
        <div className="space-y-10">
          <section className="relative min-h-[420px] overflow-hidden rounded-[2rem] bg-slate-900">
            {restaurant.bannerUrl ? (
              <Image alt={restaurant.name} className="absolute inset-0 object-cover opacity-75" fill priority sizes="(min-width: 1024px) 70vw, 100vw" src={restaurant.bannerUrl} />
            ) : (
              <div className="absolute inset-0 bg-[var(--primary)]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="relative flex min-h-[420px] flex-col justify-end p-6 sm:p-8">
              <p className="w-fit rounded-full bg-white/15 px-4 py-2 text-sm font-bold text-white backdrop-blur">Menú online · {restaurant.city}</p>
              <h1 className="mt-4 max-w-2xl text-4xl font-black leading-tight text-white sm:text-6xl">{restaurant.name}</h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-white/86">{restaurant.description}</p>
            </div>
          </section>

          <section className="grid gap-4 rounded-[2rem] border border-[var(--border)] bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto]">
            <label className="relative block">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <Input className="pl-11" placeholder="Buscar pizzas, hamburguesas, bebidas..." />
            </label>
            <div className="flex gap-2 overflow-x-auto">
              {categories.length === 0 ? <CategoryChip active label="Todos" /> : null}
              {categories.map((category, index) => (
                <CategoryChip active={index === 0} key={category.id} label={category.name} />
              ))}
            </div>
          </section>

          <PromoBanner />

          <section>
            <SectionTitle title="Populares" description="Productos destacados por el restaurante." />
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {featuredProducts.length > 0 ? (
                featuredProducts.map((product) => <ProductCard currency={settings?.currency} key={product.id} product={product} />)
              ) : (
                <div className="sm:col-span-2 xl:col-span-3">
                  <EmptyState title="Todavía no hay productos destacados" description="Marca productos como destacados desde el admin del restaurante." />
                </div>
              )}
            </div>
          </section>

          <section id="menu">
            <SectionTitle title="Menú completo" description="Categorías y productos filtrados por restaurante." />
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {products.length > 0 ? (
                products.map((product) => <ProductCard currency={settings?.currency} key={product.id} product={product} />)
              ) : (
                <div className="sm:col-span-2 xl:col-span-3">
                  <EmptyState title="Menú en preparación" description="Este restaurante aún no cargó productos disponibles." />
                </div>
              )}
            </div>
          </section>
        </div>
        <aside className="hidden lg:block">
          <CartDrawer restaurantSlug={restaurant.slug} />
        </aside>
      </main>
    </RestaurantLayout>
  );
}
