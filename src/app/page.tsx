import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight,
  Beef,
  Coffee,
  CupSoda,
  Drumstick,
  Flame,
  Headphones,
  IceCreamBowl,
  LeafyGreen,
  LogIn,
  Pizza,
  Salad,
  Sandwich,
  Search,
  ShieldCheck,
  Soup,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Truck,
  Utensils,
} from "lucide-react";
import { HomeHeroVisual } from "@/components/home/HomeHeroVisual";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { publicDirectoryService, type PublicDishCard, type PublicRestaurantCard } from "@/lib/services/public-directory.service";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";

const defaultImage = "/imagendefault.jpeg";
const homeTheme = {
  "--primary": "#12355B",
  "--primary-dark": "#0B2745",
  "--primary-light": "#EAF2F8",
  "--accent": "#C7F000",
  "--accent-soft": "#F6FFD5",
  "--accent-ring": "rgb(199 240 0 / 0.32)",
  "--background": "#FFFFFF",
  "--surface": "#FFFFFF",
  "--text": "#1C1C1C",
  "--muted": "#6B7280",
  "--border": "#E5E7EB",
  "--foreground": "#1C1C1C",
  "--color-background": "#FFFFFF",
  "--color-surface": "#F8FAFC",
  "--color-card": "#FFFFFF",
  "--color-input": "#F8FAFC",
  "--color-hover": "#EAF2F8",
  "--color-focus": "#C7F000",
  "--color-heading": "#1C1C1C",
  "--color-body": "#1C1C1C",
  "--color-secondary-text": "#6B7280",
  "--color-placeholder": "#94A3B8",
  "--color-disabled": "#CBD5E1",
  "--color-success": "#22C55E",
  "--color-success-soft": "#ECFDF5",
  "--color-success-strong": "#15803D",
  "--color-warning": "#F59E0B",
  "--color-warning-soft": "#FFFBEB",
  "--color-warning-strong": "#B45309",
  "--color-danger": "#EF4444",
  "--color-danger-soft": "#FEF2F2",
  "--color-danger-strong": "#B91C1C",
  "--color-on-primary": "#FFFFFF",
  "--color-on-primary-muted": "rgb(255 255 255 / 0.82)",
  "--color-on-primary-soft": "rgb(199 240 0 / 0.14)",
  "--color-on-primary-border": "rgb(199 240 0 / 0.28)",
  "--color-on-primary-border-strong": "rgb(199 240 0 / 0.44)",
  "--color-image-overlay-strong": "rgb(18 53 91 / 0.78)",
  "--color-image-overlay-medium": "rgb(18 53 91 / 0.28)",
  "--color-image-overlay-none": "rgb(18 53 91 / 0)",
  "--shadow-card": "0 18px 45px rgb(18 53 91 / 0.08)",
  "--shadow-primary": "0 16px 36px rgb(18 53 91 / 0.22)",
  "--shadow-panel": "0 24px 60px rgb(18 53 91 / 0.12)",
  "--shadow-focus": "0 0 0 4px rgb(199 240 0 / 0.26)",
  "--shadow-glow": "0 0 28px rgb(199 240 0 / 0.28)",
  "--success": "#22C55E",
  "--warning": "#F59E0B",
  "--danger": "#EF4444",
} as CSSProperties;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string; ubicacion?: string }>;
}) {
  const { q = "", categoria = "", ubicacion = "" } = await searchParams;
  const directory = await publicDirectoryService.getDirectory({ search: q, category: categoria, city: ubicacion });
  const heroRestaurants = directory.mostVisited.length ? directory.mostVisited : directory.restaurants.slice(0, 6);
  const selectedCategoryLabel = directory.categoryCards.find((category) => category.value === categoria)?.label ?? categoria;
  const heroDishImage = directory.mostOrderedDishes.find((dish) => dish.imageUrl)?.imageUrl;
  const heroRestaurantImage = heroRestaurants.find((card) => isImageSrc(card.restaurant.logoUrl))?.restaurant.logoUrl;
  const heroImage = heroDishImage || heroRestaurantImage || defaultImage;
  const heroRestaurantName = heroRestaurants[0]?.restaurant.name || "Restaurantes activos";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_48%,#FFFFFF_100%)] text-[var(--color-heading)]" style={homeTheme}>
      <header className="sticky top-0 z-40 border-b border-[var(--color-on-primary-border)] bg-[linear-gradient(90deg,#082441_0%,#12355B_62%,#082441_100%)] text-[var(--color-on-primary)] shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link className="flex min-w-0 items-center gap-3 rounded-full font-black outline-none transition focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href="/">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)]">
              <Store className="h-5 w-5" />
            </span>
            <span className="truncate text-lg">Restaurant SaaS</span>
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
          <Link className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--surface)] px-4 text-sm font-black text-[var(--primary)] shadow-sm transition hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]" href="/admin/login">
            <LogIn className="h-4 w-4" />
            Admin
          </Link>
        </div>
      </header>

      <section className="bg-[var(--primary)] px-4 pb-6 pt-5 text-[var(--color-heading)] sm:px-6 lg:bg-[var(--surface)] lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-[2rem] border border-[var(--color-on-primary-border)] bg-[var(--primary)] p-4 shadow-[var(--shadow-panel)] sm:p-6 lg:grid lg:grid-cols-[minmax(0,1fr)_430px] lg:gap-8 lg:border-[var(--border)] lg:bg-[var(--surface)] lg:p-8">
            <div className="pointer-events-none absolute right-10 top-8 hidden h-24 w-24 rounded-full bg-[var(--accent)] opacity-20 blur-2xl lg:block" />
            <div className="relative z-10">
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-4 py-2 text-sm font-black text-[var(--primary)] ring-1 ring-[var(--accent-ring)]">
                <Sparkles className="h-4 w-4" />
                Restaurantes vinculados
              </span>
              <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight text-white lg:text-[var(--primary)] sm:text-6xl">
                Comida deliciosa, <span className="text-[#BCE600]">lista para pedir</span>
              </h1>
              <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-white/78 lg:text-[var(--color-secondary-text)]">
                Explora restaurantes activos, mira los mas visitados de la semana y entra directo al menu para pedir delivery o recojo.
              </p>

              <form className="mt-6 grid gap-2 rounded-[1.35rem] border border-[var(--border)] bg-[var(--color-surface)] p-2 text-[var(--color-heading)] shadow-sm lg:grid-cols-[minmax(0,1fr)_190px_170px_auto]" action="/">
                <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--surface)] px-3 ring-1 ring-[var(--border)]">
                  <Search className="h-5 w-5 shrink-0 text-[var(--color-placeholder)]" />
                  <input
                    className="h-11 min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-[var(--color-placeholder)] focus-visible:ring-0"
                    defaultValue={q}
                    name="q"
                    placeholder="Buscar restaurante, ciudad o categoria"
                  />
                </label>
                <select className="min-h-12 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--accent-ring)]" defaultValue={categoria} name="categoria">
                  <option value="">Todas las categorias</option>
                  {directory.categoryCards.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
                <select className="min-h-12 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--accent-ring)]" defaultValue={ubicacion} name="ubicacion">
                  <option value="">Todas las ciudades</option>
                  {directory.locations.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
                <button className="min-h-12 rounded-full bg-[var(--accent)] px-6 text-sm font-black text-[var(--primary)] shadow-[var(--shadow-glow)] transition hover:bg-[#d9ff22] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98] disabled:pointer-events-none disabled:bg-[var(--color-disabled)] disabled:text-[var(--surface)]" type="submit">
                  Buscar
                </button>
              </form>
            </div>

            <HomeHeroVisual imageSrc={heroImage} restaurantName={heroRestaurantName} />
          </div>

          <div className="mt-4 grid gap-3 rounded-[1.5rem] border border-[var(--border)] bg-white/95 p-3 shadow-[var(--shadow-card)] sm:grid-cols-2 lg:grid-cols-4">
            <FeaturePill icon={<Truck className="h-5 w-5" />} label="Envio rapido" text="En minutos" />
            <FeaturePill icon={<ShieldCheck className="h-5 w-5" />} label="Pago seguro" text="100% protegido" />
            <FeaturePill icon={<Utensils className="h-5 w-5" />} label="Los mejores" text="Restaurantes" />
            <FeaturePill icon={<Headphones className="h-5 w-5" />} label="Soporte" text="Siempre contigo" />
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
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {directory.categoryCards.map((category) => {
              const params = new URLSearchParams();
              if (q) params.set("q", q);
              if (ubicacion) params.set("ubicacion", ubicacion);
              params.set("categoria", category.value);
              return <CategoryImageCard active={categoria === category.value} category={category} href={`/?${params.toString()}`} key={category.value} />;
            })}
          </div>
        </section>

        {heroRestaurants.length ? (
          <section className="grid gap-3 rounded-[1.75rem] border border-[var(--border)] bg-[var(--color-surface)] p-3 lg:grid-cols-3">
            {heroRestaurants.slice(0, 3).map((card, index) => (
              <Link className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-[1.25rem] bg-[var(--surface)] p-3 shadow-sm ring-1 ring-[var(--border)] transition hover:-translate-y-0.5 hover:ring-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={`/r/${card.restaurant.slug}`} key={card.restaurant.id}>
                <RestaurantLogo card={card} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black">{card.restaurant.name}</span>
                  <span className="block truncate text-xs font-semibold text-[var(--color-secondary-text)]">{card.categories.slice(0, 2).join(" | ") || card.restaurant.city || "Menu online"}</span>
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

function FeaturePill({ icon, label, text }: { icon: ReactNode; label: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[1.15rem] bg-[var(--surface)] p-3 ring-1 ring-[var(--border)]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-[var(--primary)]">{label}</span>
        <span className="block truncate text-xs font-semibold text-[var(--color-secondary-text)]">{text}</span>
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
        "group flex min-h-24 flex-col items-center justify-center gap-2 rounded-[1.15rem] border bg-[var(--surface)] p-3 text-center shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]",
        active ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-4 ring-[var(--accent-ring)]" : "border-[var(--border)]",
      )}
      href={href}
    >
      <div className={cn("grid h-14 w-14 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)] ring-1 ring-[var(--border)] transition group-hover:bg-[var(--accent)] group-hover:shadow-[var(--shadow-glow)]", active && "bg-[var(--accent)] shadow-[var(--shadow-glow)]")}>
        <CategoryIcon label={category.label} value={category.value} />
      </div>
      <span className="block w-full truncate text-[11px] font-black text-[var(--primary)]">{category.label}</span>
    </Link>
  );
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

  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-[var(--primary)] text-xl font-black text-[var(--color-on-primary)] ring-1 ring-[var(--border)]", className)}>
      {isImage ? <Image alt={card.restaurant.name} className="h-full w-full object-cover" height={80} src={card.restaurant.logoUrl} width={80} /> : card.restaurant.logoUrl}
    </span>
  );
}

function RestaurantCard({ card }: { card: PublicRestaurantCard }) {
  const imageSrc = isImageSrc(card.restaurant.logoUrl) ? card.restaurant.logoUrl : defaultImage;

  return (
    <Card className="overflow-hidden p-0 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative h-40 bg-[var(--primary-light)]">
        <Image alt={card.restaurant.name} className="object-cover" fill sizes="(min-width:1280px) 33vw, (min-width:768px) 50vw, 100vw" src={imageSrc} />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-image-overlay-strong)] via-[var(--color-image-overlay-medium)] to-transparent" />
        <span className="absolute bottom-3 left-3 max-w-[75%] truncate rounded-full bg-white/92 px-3 py-1 text-xs font-black text-[var(--primary)] backdrop-blur">
          {card.categories[0] || card.restaurant.city || "Menu online"}
        </span>
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-black text-[var(--primary)] shadow-[var(--shadow-glow)]">
          <Star className="h-3.5 w-3.5 fill-current" />
          {Math.max(4, Math.min(5, 4 + card.orders30d / 100)).toFixed(1)}
        </span>
      </div>
      <div className="p-4">
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
        {card.popularProducts.length ? <p className="mt-4 line-clamp-2 text-sm font-semibold text-[var(--color-secondary-text)]">Popular: {card.popularProducts.join(", ")}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-black text-[var(--color-secondary-text)]">
          <span className="rounded-2xl bg-[var(--color-surface)] p-3 ring-1 ring-[var(--border)]">{card.visits7d} visitas semana</span>
          <span className="rounded-2xl bg-[var(--color-surface)] p-3 ring-1 ring-[var(--border)]">{card.orders30d} pedidos 30d</span>
        </div>
        <Link className={buttonClasses("primary", "mt-4 w-full bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)] hover:bg-[#d9ff22] active:bg-[#d9ff22]")} href={`/r/${card.restaurant.slug}`}>
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
