import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { RestaurantLayout } from "@/components/layout/RestaurantLayout";
import { ProductCard } from "@/components/public-menu/ProductCard";
import { QRCodeCard } from "@/components/tables/QRCodeCard";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { buttonClasses } from "@/components/ui/Button";
import { productService } from "@/lib/services/product.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { tableService } from "@/lib/services/table.service";

export default async function TableOrderPage({ params }: { params: Promise<{ restaurantSlug: string; tableCode: string }> }) {
  const { restaurantSlug, tableCode } = await params;
  const restaurant = await restaurantService.getBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  const table = await tableService.getByCode(restaurant.id, tableCode);

  if (!table) {
    notFound();
  }

  const products = await productService.listFeaturedByRestaurant(restaurant.id);
  const url = `/r/${restaurant.slug}/mesa/${table.code}`;

  return (
    <RestaurantLayout restaurant={restaurant}>
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <div className="space-y-4">
            <Card>
              <ClipboardList className="h-8 w-8 text-[var(--primary)]" />
              <h1 className="mt-4 text-3xl font-black">Pedido para {table.name}</h1>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Este pedido quedará ligado a la mesa mediante el código {table.code}.</p>
              <Link className={buttonClasses("primary", "mt-5 w-full")} href={`/r/${restaurant.slug}/checkout`}>
                Ir al checkout
              </Link>
            </Card>
            <QRCodeCard url={url} />
          </div>
          <section>
            <SectionTitle title="Sugeridos para la mesa" description="Agrega productos y confirma el pedido desde el checkout." />
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        </div>
      </main>
    </RestaurantLayout>
  );
}
