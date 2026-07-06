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
  searchParams: Promise<{ q?: string; categoria?: string }>;
}) {
  const { q = "", categoria = "" } = await searchParams;
  const directory = await publicDirectoryService.getDirectory({ search: q, category: categoria });
  const heroRestaurants = directory.mostVisited.length ? directory.mostVisited : directory.restaurants.slice(0, 6);

  return (
    <main className="min-h-screen bg-[#f6fbf7] text-slate-950">
      <header className="sticky top-0 z-40 bg-[#1d8844] text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link className="flex min-w-0 items-center gap-3 font-black" href="/">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-[#1d8844]">
              <Store className="h-5 w-5" />
            </span>
            <span className="truncate text-lg">Restaurant SaaS</span>
          </Link>
          <Link className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-black text-[#1d8844]" href="/admin/login">
            <LogIn className="h-4 w-4" />
            Admin
          </Link>
        </div>
      </header>

      <section className="bg-[#1d8844] text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-8 pt-7 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8 lg:pb-12 lg:pt-10">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-black">
              <Sparkles className="h-4 w-4" />
              Restaurantes vinculados
            </span>
            <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">Encuentra donde pedir hoy</h1>
            <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-white/85">
              Explora restaurantes activos, mira los mas visitados de la semana y entra directo al menu para pedir delivery o recojo.
            </p>

            <form className="mt-6 grid gap-3 rounded-[1.25rem] bg-white p-2 text-slate-950 shadow-xl sm:grid-cols-[1fr_auto]" action="/">
              <label className="flex min-h-12 items-center gap-3 rounded-2xl px-3">
                <Search className="h-5 w-5 shrink-0 text-slate-400" />
                <input
                  className="h-11 min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400"
                  defaultValue={q}
                  name="q"
                  placeholder="Buscar restaurante, ciudad o categoria"
                />
              </label>
              {categoria ? <input name="categoria" type="hidden" value={categoria} /> : null}
              <button className="min-h-12 rounded-full bg-[#1d8844] px-6 text-sm font-black text-white" type="submit">
                Buscar
              </button>
            </form>
          </div>

          <div className="grid content-end gap-3">
            {heroRestaurants.slice(0, 3).map((card, index) => (
              <Link className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-[1.25rem] bg-white/12 p-3 ring-1 ring-white/15 backdrop-blur" href={`/r/${card.restaurant.slug}`} key={card.restaurant.id}>
                <RestaurantLogo card={card} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black">{card.restaurant.name}</span>
                  <span className="block truncate text-xs font-semibold text-white/70">{card.categories.slice(0, 2).join(" | ") || card.restaurant.city || "Menu online"}</span>
                </span>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-[#1d8844]">{index + 1}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
        <section>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <CategoryChip active={!categoria} href={q ? `/?q=${encodeURIComponent(q)}` : "/"} label="Todo" />
            {directory.categories.map((category) => {
              const params = new URLSearchParams();
              if (q) params.set("q", q);
              params.set("categoria", category);
              return <CategoryChip active={categoria === category} href={`/?${params.toString()}`} key={category} label={category} />;
            })}
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeader eyebrow="Directorio" title={categoria ? `Restaurantes de ${categoria}` : "Restaurantes para pedir"} />
          {directory.restaurants.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {directory.restaurants.map((card) => (
                <RestaurantCard card={card} key={card.restaurant.id} />
              ))}
            </div>
          ) : (
            <Card className="p-6 text-center">
              <p className="text-lg font-black">Sin restaurantes encontrados</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">Prueba con otra busqueda o categoria.</p>
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
            <Card className="p-6 text-sm font-semibold text-slate-500">Aun no hay platos con pedidos registrados.</Card>
          )}
        </section>
      </div>
    </main>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#1d8844]">{eyebrow}</p>
      <h2 className="mt-1 text-3xl font-black">{title}</h2>
    </div>
  );
}

function CategoryChip({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-black", active ? "bg-[#1d8844] text-white" : "bg-white text-slate-700 shadow-sm ring-1 ring-slate-200")} href={href}>
      {label}
    </Link>
  );
}

function RestaurantLogo({ card, size = "md" }: { card: PublicRestaurantCard; size?: "sm" | "md" }) {
  const isImage = card.restaurant.logoUrl.startsWith("http") || card.restaurant.logoUrl.startsWith("/");
  const className = size === "sm" ? "h-16 w-16 rounded-2xl" : "h-20 w-20 rounded-[1.25rem]";

  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-[#1d8844] text-xl font-black text-white", className)}>
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
          <p className="mt-1 truncate text-sm font-semibold text-slate-500">{card.restaurant.city || card.restaurant.address || `/r/${card.restaurant.slug}`}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {card.categories.slice(0, 3).map((category) => (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700" key={category}>
                {category}
              </span>
            ))}
          </div>
        </div>
      </div>
      {card.popularProducts.length ? <p className="mt-4 line-clamp-2 text-sm font-semibold text-slate-600">Popular: {card.popularProducts.join(", ")}</p> : null}
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-black text-slate-600">
        <span className="rounded-2xl bg-slate-50 p-3">{card.visits7d} visitas semana</span>
        <span className="rounded-2xl bg-slate-50 p-3">{card.orders30d} pedidos 30d</span>
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
          <Link className="grid grid-cols-[36px_56px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-slate-50 p-2" href={`/r/${card.restaurant.slug}`} key={card.restaurant.id}>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-sm font-black text-[#1d8844]">{index + 1}</span>
            <RestaurantLogo card={card} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-black">{card.restaurant.name}</span>
              <span className="block truncate text-xs font-semibold text-slate-500">{value(card)} {metric}</span>
            </span>
            <span className="text-[#1d8844]">{icon}</span>
          </Link>
        ))}
        {!cards.length ? <p className="text-sm font-semibold text-slate-500">Sin datos suficientes todavia.</p> : null}
      </Card>
    </section>
  );
}

function DishCard({ dish }: { dish: PublicDishCard }) {
  return (
    <Link className="overflow-hidden rounded-[1.25rem] bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md" href={`/r/${dish.restaurantSlug}`}>
      <div className="relative aspect-[4/3] bg-emerald-50">
        <Image alt={dish.name} className="object-cover" fill sizes="(min-width:1024px) 25vw, 50vw" src={dish.imageUrl || defaultImage} />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-black text-[#1d8844]">
          <Star className="h-3.5 w-3.5 fill-current" />
          {dish.orderCount}
        </span>
      </div>
      <div className="p-4">
        <p className="text-xs font-black uppercase text-[#1d8844]">{dish.restaurantName}</p>
        <h3 className="mt-1 line-clamp-2 text-lg font-black">{dish.name}</h3>
        <p className="mt-2 text-sm font-bold text-slate-600">{formatMoney(dish.price)}</p>
      </div>
    </Link>
  );
}
