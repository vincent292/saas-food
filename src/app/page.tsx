import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Flame, LogIn, Search, Sparkles, Star, Store, TrendingUp } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { publicDirectoryService, type PublicDishCard, type PublicRestaurantCard } from "@/lib/services/public-directory.service";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";

const defaultImage = "/imagendefault.jpeg";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string; ubicacion?: string }>;
}) {
  const { q = "", categoria = "", ubicacion = "" } = await searchParams;
  const directory = await publicDirectoryService.getDirectory({ search: q, category: categoria, city: ubicacion });
  const heroRestaurants = directory.mostVisited.length ? directory.mostVisited : directory.restaurants.slice(0, 6);
  const selectedCategoryLabel = directory.categoryCards.find((category) => category.value === categoria)?.label ?? categoria;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--color-heading)]">
      <header className="sticky top-0 z-40 bg-[var(--primary)] text-[var(--color-on-primary)] shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link className="flex min-w-0 items-center gap-3 font-black" href="/">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--surface)] text-[var(--primary)]">
              <Store className="h-5 w-5" />
            </span>
            <span className="truncate text-lg">Restaurant SaaS</span>
          </Link>
          <Link className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--surface)] px-4 text-sm font-black text-[var(--primary)]" href="/admin/login">
            <LogIn className="h-4 w-4" />
            Admin
          </Link>
        </div>
      </header>

      <section className="bg-[var(--primary)] text-[var(--color-on-primary)]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-8 pt-7 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8 lg:pb-12 lg:pt-10">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-on-primary-soft)] px-4 py-2 text-sm font-black">
              <Sparkles className="h-4 w-4" />
              Restaurantes vinculados
            </span>
            <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">Encuentra donde pedir hoy</h1>
            <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-[var(--color-on-primary-muted)]">
              Explora restaurantes activos, mira los mas visitados de la semana y entra directo al menu para pedir delivery o recojo.
            </p>

            <form className="mt-6 grid gap-2 rounded-[1.25rem] bg-[var(--surface)] p-2 text-[var(--color-heading)] shadow-xl lg:grid-cols-[minmax(0,1fr)_190px_170px_auto]" action="/">
              <label className="flex min-h-12 items-center gap-3 rounded-2xl px-3">
                <Search className="h-5 w-5 shrink-0 text-[var(--color-placeholder)]" />
                <input
                  className="h-11 min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-[var(--color-placeholder)]"
                  defaultValue={q}
                  name="q"
                  placeholder="Buscar restaurante, ciudad o categoria"
                />
              </label>
              <select className="min-h-12 rounded-2xl border border-[var(--border)] bg-[var(--color-input)] px-3 text-sm font-bold outline-none" defaultValue={categoria} name="categoria">
                <option value="">Todas las categorias</option>
                {directory.categoryCards.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
              <select className="min-h-12 rounded-2xl border border-[var(--border)] bg-[var(--color-input)] px-3 text-sm font-bold outline-none" defaultValue={ubicacion} name="ubicacion">
                <option value="">Todas las ciudades</option>
                {directory.locations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
              <button className="min-h-12 rounded-full bg-[var(--primary)] px-6 text-sm font-black text-[var(--color-on-primary)]" type="submit">
                Buscar
              </button>
            </form>
          </div>

          <div className="grid content-end gap-3">
            {heroRestaurants.slice(0, 3).map((card, index) => (
              <Link className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-[1.25rem] bg-[var(--color-on-primary-soft)] p-3 ring-1 ring-[var(--color-on-primary-border)] backdrop-blur" href={`/r/${card.restaurant.slug}`} key={card.restaurant.id}>
                <RestaurantLogo card={card} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black">{card.restaurant.name}</span>
                  <span className="block truncate text-xs font-semibold text-[var(--color-on-primary-muted)]">{card.categories.slice(0, 2).join(" | ") || card.restaurant.city || "Menu online"}</span>
                </span>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface)] text-[var(--primary)]">{index + 1}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
        <section>
          <div className="flex items-end justify-between gap-3">
            <SectionHeader eyebrow="Categorias" title="Explora por antojo" />
            <Link className="text-sm font-black text-[var(--primary)]" href={ubicacion ? `/?ubicacion=${encodeURIComponent(ubicacion)}` : "/"}>
              Ver todas
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {directory.categoryCards.map((category) => {
              const params = new URLSearchParams();
              if (q) params.set("q", q);
              if (ubicacion) params.set("ubicacion", ubicacion);
              params.set("categoria", category.value);
              return <CategoryImageCard active={categoria === category.value} category={category} href={`/?${params.toString()}`} key={category.value} />;
            })}
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeader eyebrow="Directorio" title={selectedCategoryLabel ? `Restaurantes de ${selectedCategoryLabel}` : "Restaurantes para pedir"} />
          {directory.restaurants.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {directory.restaurants.map((card) => (
                <RestaurantCard card={card} key={card.restaurant.id} />
              ))}
            </div>
          ) : (
            <Card className="p-6 text-center">
              <p className="text-lg font-black">Sin restaurantes encontrados</p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">Prueba con otra busqueda o categoria.</p>
            </Card>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <RankingPanel cards={directory.mostVisited} icon={<TrendingUp className="h-5 w-5" />} metric="visitas esta semana" title="Mas visitados" value={(card) => card.visits7d} />
          <RankingPanel cards={directory.mostOrderedRestaurants} icon={<Flame className="h-5 w-5" />} metric="pedidos 30d" title="Mas pedidos" value={(card) => card.orders30d} />
        </section>

        <section className="space-y-4">
          <SectionHeader eyebrow="Platos" title="Platos mas pedidos" />
          {directory.mostOrderedDishes.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {directory.mostOrderedDishes.map((dish) => (
                <DishCard dish={dish} key={dish.id} />
              ))}
            </div>
          ) : (
            <Card className="p-6 text-sm font-semibold text-[var(--color-secondary-text)]">Aun no hay platos con pedidos registrados.</Card>
          )}
        </section>
      </div>
    </main>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">{eyebrow}</p>
      <h2 className="mt-1 text-3xl font-black">{title}</h2>
    </div>
  );
}

function CategoryImageCard({
  active,
  href,
  category,
}: {
  active: boolean;
  href: string;
  category: { value: string; label: string; imageUrl: string; count: number };
}) {
  return (
    <Link
      className={cn(
        "group overflow-hidden rounded-[1.25rem] border bg-[var(--surface)] shadow-[var(--shadow-card)] transition hover:-translate-y-0.5",
        active ? "border-[var(--primary)] ring-4 ring-[var(--primary-light)]" : "border-[var(--border)]",
      )}
      href={href}
    >
      <div className="relative aspect-[4/3] bg-[var(--primary-light)]">
        <Image alt={category.label} className="object-cover transition duration-300 group-hover:scale-105" fill sizes="(min-width:1024px) 20vw, 50vw" src={category.imageUrl || defaultImage} />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-image-overlay-strong)] via-[var(--color-image-overlay-medium)] to-[var(--color-image-overlay-none)]" />
        <span className="absolute bottom-3 left-3 right-3">
          <span className="block truncate text-sm font-black text-[var(--color-on-primary)]">{category.label}</span>
          <span className="mt-1 block text-xs font-semibold text-[var(--color-on-primary-muted)]">{category.count || "Nuevos"} restaurantes</span>
        </span>
      </div>
    </Link>
  );
}

function RestaurantLogo({ card, size = "md" }: { card: PublicRestaurantCard; size?: "sm" | "md" }) {
  const isImage = card.restaurant.logoUrl.startsWith("http") || card.restaurant.logoUrl.startsWith("/");
  const className = size === "sm" ? "h-16 w-16 rounded-2xl" : "h-20 w-20 rounded-[1.25rem]";

  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-[var(--primary)] text-xl font-black text-[var(--color-on-primary)]", className)}>
      {isImage ? <Image alt={card.restaurant.name} className="h-full w-full object-cover" height={80} src={card.restaurant.logoUrl} width={80} /> : card.restaurant.logoUrl}
    </span>
  );
}

function RestaurantCard({ card }: { card: PublicRestaurantCard }) {
  return (
    <Card className="p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-4">
        <RestaurantLogo card={card} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xl font-black">{card.restaurant.name}</h3>
          <p className="mt-1 truncate text-sm font-semibold text-[var(--color-secondary-text)]">{card.restaurant.city || card.restaurant.address || `/r/${card.restaurant.slug}`}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {card.categories.slice(0, 3).map((category) => (
              <span className="rounded-full bg-[var(--primary-light)] px-2.5 py-1 text-xs font-black text-[var(--primary-dark)]" key={category}>
                {category}
              </span>
            ))}
          </div>
        </div>
      </div>
      {card.popularProducts.length ? <p className="mt-4 line-clamp-2 text-sm font-semibold text-[var(--color-secondary-text)]">Popular: {card.popularProducts.join(", ")}</p> : null}
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-black text-[var(--color-secondary-text)]">
        <span className="rounded-2xl bg-[var(--color-surface)] p-3">{card.visits7d} visitas semana</span>
        <span className="rounded-2xl bg-[var(--color-surface)] p-3">{card.orders30d} pedidos 30d</span>
      </div>
      <Link className={buttonClasses("primary", "mt-4 w-full")} href={`/r/${card.restaurant.slug}`}>
        Ver menu
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Card>
  );
}

function RankingPanel({
  cards,
  title,
  metric,
  value,
  icon,
}: {
  cards: PublicRestaurantCard[];
  title: string;
  metric: string;
  value: (card: PublicRestaurantCard) => number;
  icon: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <SectionHeader eyebrow="Ranking" title={title} />
      <Card className="space-y-3 p-4">
        {cards.map((card, index) => (
          <Link className="grid grid-cols-[36px_56px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-[var(--color-surface)] p-2" href={`/r/${card.restaurant.slug}`} key={card.restaurant.id}>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface)] text-sm font-black text-[var(--primary)]">{index + 1}</span>
            <RestaurantLogo card={card} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-black">{card.restaurant.name}</span>
              <span className="block truncate text-xs font-semibold text-[var(--color-secondary-text)]">{value(card)} {metric}</span>
            </span>
            <span className="text-[var(--primary)]">{icon}</span>
          </Link>
        ))}
        {!cards.length ? <p className="text-sm font-semibold text-[var(--color-secondary-text)]">Sin datos suficientes todavia.</p> : null}
      </Card>
    </section>
  );
}

function DishCard({ dish }: { dish: PublicDishCard }) {
  return (
    <Link className="overflow-hidden rounded-[1.25rem] bg-[var(--surface)] shadow-sm ring-1 ring-[var(--border)] transition hover:-translate-y-0.5 hover:shadow-md" href={`/r/${dish.restaurantSlug}`}>
      <div className="relative aspect-[4/3] bg-[var(--primary-light)]">
        <Image alt={dish.name} className="object-cover" fill sizes="(min-width:1024px) 25vw, 50vw" src={dish.imageUrl || defaultImage} />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs font-black text-[var(--primary)]">
          <Star className="h-3.5 w-3.5 fill-current" />
          {dish.orderCount}
        </span>
      </div>
      <div className="p-4">
        <p className="text-xs font-black uppercase text-[var(--primary)]">{dish.restaurantName}</p>
        <h3 className="mt-1 line-clamp-2 text-lg font-black">{dish.name}</h3>
        <p className="mt-2 text-sm font-bold text-[var(--color-secondary-text)]">{formatMoney(dish.price)}</p>
      </div>
    </Link>
  );
}
