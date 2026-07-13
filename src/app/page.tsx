import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Beef,
  Clock3,
  Coffee,
  CupSoda,
  Drumstick,
  Flame,
  IceCreamBowl,
  LeafyGreen,
  LogIn,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  Star,
  Store,
  TrendingUp,
  Utensils,
} from "lucide-react";
import { HomeSearchAutocomplete } from "@/components/home/HomeSearchAutocomplete";
import { PublicThemeToggle } from "@/components/public-theme/PublicThemeToggle";
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
  const hasActiveFilter = Boolean(q || categoria || ubicacion);
  const baseDirectoryPromise = publicDirectoryService.getDirectory();
  const directoryPromise = hasActiveFilter ? publicDirectoryService.getDirectory({ search: q, category: categoria, city: ubicacion }) : baseDirectoryPromise;
  const [baseDirectory, directory] = await Promise.all([baseDirectoryPromise, directoryPromise]);
  const heroRestaurants = baseDirectory.mostVisited.length ? baseDirectory.mostVisited : baseDirectory.restaurants.slice(0, 6);
  const selectedCategoryLabel = baseDirectory.categoryCards.find((category) => category.value === categoria)?.label ?? categoria;
  const featuredRestaurant = heroRestaurants[0];
  const featuredDish = baseDirectory.mostOrderedDishes[0] ?? baseDirectory.dishSuggestions[0];
  const featuredCategory = baseDirectory.categoryCards[0];

  return (
    <main className="public-brand-theme min-h-screen bg-[linear-gradient(180deg,var(--background)_0%,var(--color-surface)_48%,var(--background)_100%)] text-[var(--color-heading)]">
      <header className="public-site-header sticky top-0 z-40 border-b border-[var(--color-on-primary-border)] bg-[linear-gradient(90deg,#082441_0%,#12355B_62%,#082441_100%)] text-[var(--color-on-primary)] shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link className="flex min-w-0 items-center gap-3 rounded-full font-black outline-none transition focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href="/">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)]">
              <Store className="h-5 w-5" />
            </span>
            <span className="truncate text-lg">Pedidos Directos</span>
          </Link>
          <nav className="hidden items-center gap-1 rounded-full bg-white/8 p-1 text-xs font-black lg:flex">
            <Link className="rounded-full bg-[var(--accent)] px-4 py-2 text-[var(--primary)]" href="/">
              Inicio
            </Link>
            <Link className="rounded-full px-4 py-2 text-white/86 transition hover:bg-white/12 hover:text-white" href="#explorar">
              Explorar
            </Link>
            <Link className="rounded-full px-4 py-2 text-white/86 transition hover:bg-white/12 hover:text-white" href="#restaurantes">
              Restaurantes
            </Link>
            <Link className="rounded-full px-4 py-2 text-white/86 transition hover:bg-white/12 hover:text-white" href="#platos">
              Platos
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <PublicThemeToggle compact />
            <Link className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-sm font-black text-[var(--primary)] shadow-sm transition hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98] sm:inline-flex sm:w-auto sm:gap-2 sm:px-4" href="/admin/login">
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="bg-[linear-gradient(180deg,#082441_0%,#12355B_68%,#F8FAFC_68%,#FFFFFF_100%)] px-4 pb-6 pt-4 text-[var(--color-heading)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/14 bg-[linear-gradient(135deg,#082441_0%,#12355B_58%,#071E36_100%)] p-4 text-white shadow-[0_28px_90px_rgb(8_36_65_/_0.28)] sm:p-5 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6 lg:p-6 xl:grid-cols-[minmax(0,1fr)_430px]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/35" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgb(255_255_255_/_0.12)_0%,transparent_34%,transparent_100%)]" />
            <div className="relative z-10 min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--accent)]">Restaurantes locales</p>
              <h1 className="mt-2 max-w-2xl text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">Encuentra comida lista para pedir en tu zona</h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/78 sm:text-base">
                Busca por plato, restaurante o ciudad. Entra al menu real, arma tu pedido y sigue el avance sin llamadas cruzadas.
              </p>
              <div className="mt-5 max-w-3xl">
                <HomeSearchAutocomplete
                  categories={baseDirectory.categoryCards}
                  dishes={baseDirectory.dishSuggestions}
                  initialLocation={ubicacion}
                  initialQuery={q}
                  locations={baseDirectory.locations}
                  restaurants={baseDirectory.restaurants}
                />
              </div>
              <div className="mt-4 grid max-w-3xl gap-2 sm:grid-cols-3">
                <HeroSignal icon={<Utensils className="h-4 w-4" />} title="Menu actualizado" text="Productos, precios y fotos del local." />
                <HeroSignal icon={<BadgeCheck className="h-4 w-4" />} title="Pago claro" text="Total visible antes de confirmar." />
                <HeroSignal icon={<Clock3 className="h-4 w-4" />} title="Seguimiento" text="Estados para delivery, mesa o recojo." />
              </div>
            </div>

            <div className="relative z-10 mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:mt-0">
              <Link className="group overflow-hidden rounded-[1.45rem] bg-white p-2 text-[var(--primary)] shadow-[0_18px_45px_rgb(2_10_18_/_0.18)] ring-1 ring-white/60 transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={featuredRestaurant ? `/r/${featuredRestaurant.restaurant.slug}` : "#restaurantes"}>
                <span className="relative block h-32 overflow-hidden rounded-[1.1rem] bg-[var(--primary-light)] sm:h-36 lg:h-40">
                  <Image alt={featuredRestaurant?.restaurant.name ?? "Restaurantes"} className="object-cover transition duration-300 group-hover:scale-105" fill sizes="(min-width:1280px) 205px, (min-width:1024px) 190px, 45vw" src={featuredRestaurant && isImageSrc(featuredRestaurant.restaurant.bannerUrl || featuredRestaurant.restaurant.logoUrl) ? (featuredRestaurant.restaurant.bannerUrl || featuredRestaurant.restaurant.logoUrl || defaultImage) : defaultImage} />
                  <span className="absolute inset-0 bg-gradient-to-t from-[var(--color-image-overlay-medium)] to-transparent" />
                </span>
                <span className="mt-3 flex items-center justify-between gap-2 px-1 pb-1 text-sm font-black">
                  {featuredRestaurant?.restaurant.name ?? "Restaurantes abiertos"}
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>

              <Link className="group overflow-hidden rounded-[1.45rem] bg-white p-2 text-[var(--primary)] shadow-[0_18px_45px_rgb(2_10_18_/_0.18)] ring-1 ring-white/60 transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={featuredDish ? `/r/${featuredDish.restaurantSlug}` : "#platos"}>
                <span className="relative block h-32 overflow-hidden rounded-[1.1rem] bg-[var(--primary-light)] sm:h-36 lg:h-40">
                  <Image alt={featuredDish?.name ?? "Platos populares"} className="object-cover transition duration-300 group-hover:scale-105" fill sizes="(min-width:1280px) 205px, (min-width:1024px) 190px, 45vw" src={featuredDish?.imageUrl || defaultImage} />
                  <span className="absolute inset-0 bg-gradient-to-t from-[var(--color-image-overlay-medium)] to-transparent" />
                </span>
                <span className="mt-3 flex items-center justify-between gap-2 px-1 pb-1 text-sm font-black">
                  {featuredDish?.name ?? "Platos populares"}
                  <Flame className="h-4 w-4" />
                </span>
              </Link>

              <Link className="flex items-center gap-3 rounded-[1.35rem] bg-white/12 p-3 text-white ring-1 ring-white/16 transition hover:bg-white/16 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)] sm:col-span-2" href={featuredCategory ? `/?categoria=${encodeURIComponent(featuredCategory.value)}#restaurantes` : "#explorar"}>
                <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--accent)] text-[var(--primary)]">
                  {featuredCategory?.imageUrl ? <Image alt={featuredCategory.label} className="h-full w-full object-cover" height={48} src={featuredCategory.imageUrl} width={48} /> : <Utensils className="h-5 w-5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black">Explora por antojo</span>
                  <span className="block truncate text-xs font-semibold text-white/68">{featuredCategory?.label ?? "Categorias activas"}</span>
                </span>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-[var(--accent)]" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
        <section id="explorar">
          <div className="flex items-end justify-between gap-3">
            <SectionHeader eyebrow="Categorias" title="Explora por categorias" />
            <Link className="rounded-full px-2 py-1 text-sm font-black text-[var(--primary)] transition hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={ubicacion ? `/?ubicacion=${encodeURIComponent(ubicacion)}` : "/"}>
              Ver todas
            </Link>
          </div>
          <div className="public-scrollbar -mx-4 mt-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <div className="flex snap-x gap-3 pr-3">
            {directory.categoryCards.map((category) => {
              const params = new URLSearchParams();
              if (q) params.set("q", q);
              if (ubicacion) params.set("ubicacion", ubicacion);
              params.set("categoria", category.value);
              return <CategoryImageCard active={categoria === category.value} category={category} href={`/?${params.toString()}`} key={category.value} />;
            })}
            </div>
          </div>
        </section>

        {heroRestaurants.length ? (
          <section className="grid gap-3 rounded-[1.75rem] border border-[var(--border)] bg-[var(--color-surface)] p-3 lg:grid-cols-3">
            {heroRestaurants.slice(0, 3).map((card, index) => (
              <Link className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-[1.25rem] bg-[var(--surface)] p-3 shadow-sm ring-1 ring-[var(--border)] transition hover:-translate-y-0.5 hover:ring-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={`/r/${card.restaurant.slug}`} key={card.restaurant.id}>
                <RestaurantLogo card={card} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black">{card.restaurant.name}</span>
                  <span className="block truncate text-xs font-semibold text-[var(--color-secondary-text)]">{card.categories.slice(0, 2).join(" | ") || card.restaurant.city || "Menu disponible"}</span>
                </span>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--accent)] text-[var(--primary)]">{index + 1}</span>
              </Link>
            ))}
          </section>
        ) : null}

        <section className="space-y-4" id="restaurantes">
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

        <section className="space-y-4" id="platos">
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

function HeroSignal({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex min-h-[76px] items-start gap-3 rounded-[1.2rem] border border-white/14 bg-white/10 p-3 text-white shadow-sm backdrop-blur">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-black leading-5">{title}</span>
        <span className="mt-0.5 block text-xs font-semibold leading-5 text-white/70">{text}</span>
      </span>
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
        "group flex min-h-24 w-28 shrink-0 flex-col items-center justify-center gap-2 rounded-[1.15rem] border bg-[var(--surface)] p-3 text-center shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]",
        active ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-4 ring-[var(--accent-ring)]" : "border-[var(--border)]",
      )}
      href={href}
    >
      <div className={cn("grid h-14 w-14 place-items-center rounded-2xl ring-1 ring-[var(--border)] transition group-hover:shadow-[var(--shadow-glow)]", categoryIconTone(category.value, category.label), active && "bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)]")}>
        <CategoryIcon label={category.label} value={category.value} />
      </div>
      <span className="block w-full truncate text-[11px] font-black text-[var(--primary)]">{category.label}</span>
    </Link>
  );
}

function categoryIconTone(value: string, label: string) {
  const text = `${value} ${label}`.toLowerCase();

  if (text.includes("hamb") || text.includes("burger") || text.includes("carne")) return "bg-amber-100 text-amber-700";
  if (text.includes("pizza")) return "bg-orange-100 text-orange-700";
  if (text.includes("sushi") || text.includes("japon")) return "bg-rose-100 text-rose-700";
  if (text.includes("beb") || text.includes("refresco") || text.includes("drink")) return "bg-sky-100 text-sky-700";
  if (text.includes("post") || text.includes("dulce") || text.includes("helad")) return "bg-pink-100 text-pink-700";
  if (text.includes("ensal") || text.includes("salud") || text.includes("vegan")) return "bg-emerald-100 text-emerald-700";
  if (text.includes("pollo")) return "bg-yellow-100 text-yellow-700";
  if (text.includes("cafe") || text.includes("coffee")) return "bg-stone-100 text-stone-700";
  if (text.includes("sand") || text.includes("combo")) return "bg-cyan-100 text-cyan-700";

  return "bg-lime-100 text-[var(--primary)]";
}

function CategoryIcon({ value, label }: { value: string; label: string }) {
  const text = `${value} ${label}`.toLowerCase();
  const className = "h-7 w-7";

  if (text.includes("hamb") || text.includes("burger") || text.includes("carne")) return <Beef className={className} />;
  if (text.includes("pizza")) return <Pizza className={className} />;
  if (text.includes("sushi") || text.includes("japon")) return <Soup className={className} />;
  if (text.includes("beb") || text.includes("refresco") || text.includes("drink")) return <CupSoda className={className} />;
  if (text.includes("post") || text.includes("dulce") || text.includes("helad")) return <IceCreamBowl className={className} />;
  if (text.includes("ensal")) return <Salad className={className} />;
  if (text.includes("salud") || text.includes("vegan")) return <LeafyGreen className={className} />;
  if (text.includes("pollo")) return <Drumstick className={className} />;
  if (text.includes("cafe") || text.includes("coffee")) return <Coffee className={className} />;
  if (text.includes("sand") || text.includes("combo")) return <Sandwich className={className} />;
  if (text.includes("sopa")) return <Soup className={className} />;

  return <Utensils className={className} />;
}

function isImageSrc(value?: string | null) {
  return Boolean(value && (value.startsWith("http") || value.startsWith("/")));
}

function RestaurantLogo({ card, size = "md" }: { card: PublicRestaurantCard; size?: "sm" | "md" }) {
  const isImage = isImageSrc(card.restaurant.logoUrl);
  const className = size === "sm" ? "h-16 w-16 rounded-2xl" : "h-20 w-20 rounded-[1.25rem]";
  const initials = card.restaurant.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-[var(--primary)] text-xl font-black text-[var(--color-on-primary)] ring-1 ring-[var(--border)]", className)}>
      {isImage ? <Image alt={card.restaurant.name} className="h-full w-full object-cover" height={80} src={card.restaurant.logoUrl} width={80} /> : <span aria-hidden="true">{initials || <Store className="h-5 w-5" />}</span>}
    </span>
  );
}

function RestaurantCard({ card }: { card: PublicRestaurantCard }) {
  const imageSrc = isImageSrc(card.restaurant.bannerUrl || card.restaurant.logoUrl) ? card.restaurant.bannerUrl || card.restaurant.logoUrl : defaultImage;

  return (
    <Card className="flex h-full flex-col overflow-hidden p-0 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative h-44 bg-[var(--primary-light)]">
        <Image alt={card.restaurant.name} className="object-cover" fill sizes="(min-width:1280px) 33vw, (min-width:768px) 50vw, 100vw" src={imageSrc} />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-image-overlay-strong)] via-[var(--color-image-overlay-medium)] to-transparent" />
        <span className="absolute bottom-3 left-3 max-w-[75%] truncate rounded-full bg-white/92 px-3 py-1 text-xs font-black text-[var(--primary)] backdrop-blur">
          {card.categories[0] || card.restaurant.city || "Menu disponible"}
        </span>
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-black text-[var(--primary)] shadow-[var(--shadow-glow)]">
          <Star className="h-3.5 w-3.5 fill-current" />
          {Math.max(4, Math.min(5, 4 + card.orders30d / 100)).toFixed(1)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <RestaurantLogo card={card} size="sm" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xl font-black">{card.restaurant.name}</h3>
            <p className="mt-1 truncate text-sm font-semibold text-[var(--color-secondary-text)]">{card.restaurant.city || card.restaurant.address || `/r/${card.restaurant.slug}`}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {card.categories.slice(0, 3).map((category) => (
                <span className="rounded-full bg-[var(--primary-light)] px-2.5 py-1 text-xs font-black text-[var(--primary)]" key={category}>
                  {category}
                </span>
              ))}
            </div>
          </div>
        </div>
        {card.popularProducts.length ? <p className="mt-4 line-clamp-2 min-h-10 text-sm font-semibold text-[var(--color-secondary-text)]">Popular: {card.popularProducts.join(", ")}</p> : <p className="mt-4 min-h-10 text-sm font-semibold text-[var(--color-secondary-text)]">Menu activo para revisar y pedir directo.</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-black text-[var(--color-secondary-text)]">
          <span className="rounded-2xl bg-[var(--color-surface)] p-3 ring-1 ring-[var(--border)]">{card.visits7d} visitas semana</span>
          <span className="rounded-2xl bg-[var(--color-surface)] p-3 ring-1 ring-[var(--border)]">{card.orders30d} pedidos 30d</span>
        </div>
        <Link className={buttonClasses("primary", "mt-auto w-full bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)] hover:bg-[#d9ff22] active:bg-[#d9ff22]")} href={`/r/${card.restaurant.slug}`}>
          Ver menu
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
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
          <Link className="grid grid-cols-[36px_56px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-[var(--color-surface)] p-2 ring-1 ring-transparent transition hover:-translate-y-0.5 hover:bg-[var(--primary-light)] hover:ring-[var(--border)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={`/r/${card.restaurant.slug}`} key={card.restaurant.id}>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent)] text-sm font-black text-[var(--primary)]">{index + 1}</span>
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
    <Link className="overflow-hidden rounded-[1.25rem] bg-[var(--surface)] shadow-sm ring-1 ring-[var(--border)] transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={`/r/${dish.restaurantSlug}`}>
      <div className="relative aspect-[4/3] bg-[var(--primary-light)]">
        <Image alt={dish.name} className="object-cover" fill sizes="(min-width:1024px) 25vw, 50vw" src={dish.imageUrl || defaultImage} />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-black text-[var(--primary)] shadow-[var(--shadow-glow)]">
          <Star className="h-3.5 w-3.5 fill-current" />
          {dish.orderCount}
        </span>
      </div>
      <div className="p-4">
        <p className="text-xs font-black uppercase text-[var(--primary)]">{dish.restaurantName}</p>
        <h3 className="mt-1 line-clamp-2 text-lg font-black">{dish.name}</h3>
        <p className="mt-3 inline-flex rounded-full bg-[var(--accent)] px-3 py-1 text-sm font-black text-[var(--primary)]">{formatMoney(dish.price)}</p>
      </div>
    </Link>
  );
}
