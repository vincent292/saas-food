import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Beef,
  Briefcase,
  Coffee,
  CupSoda,
  Drumstick,
  Flame,
  House,
  IceCreamBowl,
  LeafyGreen,
  Pill,
  Pizza,
  Salad,
  Sandwich,
  Shirt,
  ShoppingBag,
  Soup,
  Sparkles,
  Store,
  Smartphone,
  TrendingUp,
  Utensils,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PartnerLoginButton } from "@/components/auth/PartnerLoginButton";
import { PublicCustomerAccountButton } from "@/components/customer/PublicCustomerAccountButton";
import { HomeLocationProvider, HomeNearbyHighlights, HomeNearbyMobileExplorer, HomeNearbyRestaurantSection } from "@/components/home/HomeNearbyDirectory";
import { HomeSearchAutocomplete } from "@/components/home/HomeSearchAutocomplete";
import { PendingCartNotice } from "@/components/home/PendingCartNotice";
import { PublicThemeToggle } from "@/components/public-theme/PublicThemeToggle";
import { Card } from "@/components/ui/Card";
import {
  businessCatalogLabelTitle,
  restaurantBusinessTypeLabel,
} from "@/lib/restaurant-directory-options";
import { publicDirectoryService, type PublicBusinessTypeCard, type PublicDishCard, type PublicRestaurantCard } from "@/lib/services/public-directory.service";
import { cn } from "@/lib/utils/cn";
import { defaultProductImage } from "@/lib/utils/default-images";
import { formatMoney } from "@/lib/utils/money";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
import type { BusinessType } from "@/types/restaurant.types";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string; ubicacion?: string; rubro?: string; miYopido?: string }>;
}) {
  const { q = "", categoria = "", ubicacion = "", rubro = "", miYopido = "" } = await searchParams;
  const hasActiveFilter = Boolean(q || categoria || ubicacion || rubro);
  const miYopidoMode = miYopido === "registro" || miYopido === "register" ? "register" : "login";
  const openMiYopido = miYopido === "login" || miYopido === "ingresar" || miYopido === "registro" || miYopido === "register";
  const baseDirectoryPromise = publicDirectoryService.getDirectory();
  const directoryPromise = hasActiveFilter ? publicDirectoryService.getDirectory({ search: q, category: categoria, city: ubicacion, businessType: rubro }) : baseDirectoryPromise;
  const [baseDirectory, directory] = await Promise.all([baseDirectoryPromise, directoryPromise]);
  const heroRestaurants = baseDirectory.mostVisited.length ? baseDirectory.mostVisited : baseDirectory.restaurants.slice(0, 6);
  const selectedCategoryLabel = baseDirectory.categoryCards.find((category) => category.value === categoria)?.label ?? categoria;
  const selectedBusinessTypeLabel = rubro ? (baseDirectory.businessTypeCards.find((businessType) => businessType.value === rubro)?.label ?? restaurantBusinessTypeLabel(rubro)) : "";
  const featuredRestaurant = heroRestaurants[0];
  const featuredDish = baseDirectory.mostOrderedDishes[0] ?? baseDirectory.dishSuggestions[0];
  const featuredBusinessType = baseDirectory.businessTypeCards[0];
  const featuredHeroHref = featuredRestaurant ? publicRestaurantPath(featuredRestaurant.restaurant.slug) : "#restaurantes";
  const featuredHeroImage = featuredRestaurant && isDisplayImage(featuredRestaurant.restaurant.bannerUrl) ? featuredRestaurant.restaurant.bannerUrl : defaultProductImage;
  const featuredHeroTitle = featuredRestaurant?.restaurant.name ?? featuredBusinessType?.label ?? "yopido.shop";
  const featuredHeroSubtitle = featuredRestaurant
    ? featuredRestaurant.currentAnnouncement?.title || featuredRestaurant.popularProducts.slice(0, 2).join(" | ") || featuredRestaurant.categories.slice(0, 2).join(" | ") || featuredRestaurant.restaurant.city || businessCatalogLabelTitle(featuredRestaurant.restaurant.businessType)
    : featuredBusinessType
      ? `${featuredBusinessType.count} locales disponibles`
      : "Catalogos y pedidos directos";

  return (
    <main className="public-brand-theme min-h-screen bg-[#12355B] text-[var(--color-heading)] lg:bg-[var(--color-background)]">
      <HomeLocationProvider restaurants={baseDirectory.restaurants}>
      <section className="relative overflow-hidden rounded-b-[2rem] bg-[#12355B] px-4 pb-5 pt-[calc(0.85rem+env(safe-area-inset-top))] text-[var(--color-on-primary)] shadow-[0_28px_80px_rgb(8_36_65_/_0.2)] sm:px-6 sm:pb-7 lg:overflow-visible lg:rounded-b-[2.5rem] lg:bg-[#12355B] lg:px-8 lg:pb-14 lg:pt-6 lg:shadow-none">
        <div className="relative z-10 mx-auto max-w-7xl">
          <header className="flex items-center justify-between gap-3 sm:gap-4">
            <Link aria-label="Ir al inicio de yopido.shop" className="flex min-w-0 max-w-[150px] items-center rounded-full outline-none transition focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)] min-[390px]:max-w-[172px] sm:max-w-none" href="/">
              <BrandLogo className="h-8 w-auto max-w-[150px] min-[390px]:h-9 min-[390px]:max-w-[172px] sm:h-12 sm:max-w-none" priority variant="dark" />
            </Link>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <PartnerLoginButton compact tone="onPrimary" />
              <PublicCustomerAccountButton compact initialMode={miYopidoMode} initialOpen={openMiYopido} />
              <PublicThemeToggle compact tone="onPrimary" />
            </div>
          </header>

          <div className="mt-4 sm:mt-6 lg:mx-auto lg:mt-8 lg:max-w-6xl">
            <div className="lg:max-w-[760px]">
              <HomeSearchAutocomplete
                businessTypes={baseDirectory.businessTypeCards}
                categories={baseDirectory.categoryCards}
                dishes={baseDirectory.dishSuggestions}
                initialLocation={ubicacion}
                initialQuery={q}
                locations={baseDirectory.locations}
                restaurants={baseDirectory.restaurants}
              />
            </div>

            <div className="mt-5 lg:mt-7">
              <MobileHeroCarousel restaurants={heroRestaurants.slice(0, 3)} />

              <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(0,1.08fr)_360px] lg:items-stretch">
                <Link className="group flex h-full flex-col justify-between rounded-[2rem] border border-[var(--border)] bg-[var(--color-surface)] p-8 text-[var(--color-heading)] shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={featuredHeroHref}>
                  <span>
                    <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-black text-[var(--primary)]">
                      <Sparkles className="h-3.5 w-3.5" />
                      Banner activo
                    </span>
                    <span className="mt-6 block text-4xl font-black leading-[1.05] text-[var(--primary)] xl:text-[3.35rem]">{featuredHeroTitle}</span>
                    <span className="mt-4 block max-w-2xl text-base font-semibold leading-7 text-[var(--color-secondary-text)]">{featuredHeroSubtitle}</span>
                    <span className="mt-6 grid max-w-2xl gap-3 xl:grid-cols-2">
                      <span className="rounded-[1.35rem] bg-[var(--surface)] px-4 py-4 shadow-sm ring-1 ring-[var(--border)]">
                        <span className="block text-xs font-black text-[var(--color-secondary-text)]">Rubro</span>
                        <span className="mt-1 block text-lg font-black text-[var(--primary)]">{featuredBusinessType?.label ?? "Locales activos"}</span>
                        <span className="mt-1 block text-sm font-semibold text-[var(--color-secondary-text)]">{featuredBusinessType ? `${featuredBusinessType.count} opciones para explorar` : "Explora negocios y productos"}</span>
                      </span>
                      <span className="rounded-[1.35rem] bg-[var(--surface)] px-4 py-4 shadow-sm ring-1 ring-[var(--border)]">
                        <span className="block text-xs font-black text-[var(--color-secondary-text)]">Producto destacado</span>
                        <span className="mt-1 block line-clamp-2 text-lg font-black text-[var(--primary)]">{featuredDish?.name ?? "Catalogos listos para pedir"}</span>
                        <span className="mt-1 block text-sm font-semibold text-[var(--color-secondary-text)]">{featuredDish?.restaurantName ?? "Revisa el negocio, elige y confirma."}</span>
                      </span>
                    </span>
                  </span>
                  <span className="mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-black text-[var(--primary)] shadow-[var(--shadow-glow)]">
                    Ver ahora
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>

                <Link className="group relative min-h-[360px] overflow-hidden rounded-[2rem] bg-[var(--primary)] shadow-[0_24px_60px_rgb(8_36_65_/_0.18)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={featuredHeroHref}>
                  <Image alt={featuredHeroTitle} className="object-cover transition duration-500 group-hover:scale-105" fill priority sizes="360px" src={featuredHeroImage} />
                  <span className="absolute inset-0 bg-[linear-gradient(180deg,rgb(8_36_65_/_0.08)_0%,rgb(8_36_65_/_0.34)_100%)]" />
                  <span className="absolute inset-x-5 bottom-5 rounded-[1.4rem] bg-[var(--color-card-glass)] p-4 text-[var(--color-heading)] shadow-[0_18px_40px_rgb(8_36_65_/_0.18)] backdrop-blur">
                    <span className="block text-sm font-black">Catalogo listo para pedir</span>
                    <span className="mt-1 block text-sm font-semibold text-[var(--color-secondary-text)]">{featuredRestaurant?.restaurant.city ?? featuredBusinessType?.label ?? "Descubre negocios activos"}</span>
                  </span>
                </Link>
              </div>

              <div className="mt-4 hidden gap-4 lg:grid lg:grid-cols-2">
                <Link className="group grid min-h-32 grid-cols-[minmax(0,1fr)_104px] items-center gap-3 overflow-hidden rounded-[1.5rem] bg-[var(--surface)] p-4 text-[var(--color-heading)] shadow-[0_18px_48px_rgb(18_53_91_/_0.1)] ring-1 ring-[var(--border)] transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)] sm:grid-cols-[minmax(0,1fr)_148px] lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_160px] lg:rounded-[1.35rem] lg:px-5 lg:py-4" href={featuredBusinessType ? `/?rubro=${encodeURIComponent(featuredBusinessType.value)}#explorar` : "#explorar"}>
                  <span className="min-w-0">
                    <span className="block text-xl font-black leading-tight sm:text-2xl">{featuredBusinessType?.label ?? "Rubros activos"}</span>
                    <span className="mt-2 block text-sm font-semibold text-[var(--color-secondary-text)]">{featuredBusinessType ? `${featuredBusinessType.count} locales` : "Ver opciones disponibles"}</span>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-black text-[var(--color-heading)]">
                      Conocer mas
                      <ArrowRight className="h-4 w-4 text-[var(--accent)]" />
                    </span>
                  </span>
                  <span className="relative h-24 overflow-hidden rounded-[1.25rem] bg-[var(--primary-light)] sm:h-28 lg:h-24">
                    {featuredBusinessType?.imageUrl ? <Image alt={featuredBusinessType.label} className="object-cover transition duration-300 group-hover:scale-105" fill sizes="160px" src={featuredBusinessType.imageUrl} /> : <BusinessVisual businessType={featuredBusinessType?.value ?? "other"} className="absolute inset-0 h-full w-full" label={featuredBusinessType?.label ?? "Rubros"} />}
                  </span>
                </Link>

                <Link className="group grid min-h-32 grid-cols-[104px_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-[1.5rem] bg-[var(--surface)] p-4 text-[var(--color-heading)] shadow-[0_18px_48px_rgb(18_53_91_/_0.1)] ring-1 ring-[var(--border)] transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)] sm:grid-cols-[148px_minmax(0,1fr)] lg:min-h-0 lg:grid-cols-[160px_minmax(0,1fr)] lg:rounded-[1.35rem] lg:px-5 lg:py-4" href={featuredDish ? publicRestaurantPath(featuredDish.restaurantSlug) : "#platos"}>
                  <span className="relative h-24 overflow-hidden rounded-[1.25rem] bg-[var(--primary-light)] sm:h-28 lg:h-24">
                    {featuredDish?.imageUrl && isDisplayImage(featuredDish.imageUrl) ? <Image alt={featuredDish.name} className="object-cover transition duration-300 group-hover:scale-105" fill sizes="160px" src={featuredDish.imageUrl} /> : <BusinessVisual businessType={featuredRestaurant?.restaurant.businessType ?? "other"} className="absolute inset-0 h-full w-full" label={featuredDish?.name ?? "Productos"} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block line-clamp-2 text-xl font-black leading-tight sm:text-2xl">{featuredDish?.name ?? "Productos populares"}</span>
                    <span className="mt-2 block text-sm font-semibold text-[var(--color-secondary-text)]">{featuredDish?.restaurantName ?? "Ver productos"}</span>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-black text-[var(--color-heading)]">
                      Ver mas
                      <ArrowRight className="h-4 w-4 text-[var(--accent)]" />
                    </span>
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-10 bg-[var(--color-background)] px-4 py-8 sm:px-6 lg:px-8 lg:pt-8">
        <PendingCartNotice />

        <section id="explorar">
          <HomeNearbyMobileExplorer
            businessTypes={baseDirectory.businessTypeCards}
            categories={rubro ? directory.categoryCards : []}
            categoria={categoria}
            directory={directory.restaurants}
            q={q}
            rubro={rubro}
            selectedBusinessTypeLabel={selectedBusinessTypeLabel}
            selectedCategoryLabel={selectedCategoryLabel}
            ubicacion={ubicacion}
          />

          <div className="hidden lg:block">
            <div className="flex items-end justify-between gap-3">
              <SectionHeader eyebrow="Rubros" title="Explora por tipo de negocio" />
              <Link className="shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-sm font-black text-[var(--color-heading)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={ubicacion ? `/?ubicacion=${encodeURIComponent(ubicacion)}` : "/"}>
                Ver todos
              </Link>
            </div>
            <div className="public-scrollbar -mx-4 mt-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:overflow-visible lg:px-0 lg:pb-0">
              <div className="flex snap-x gap-3 pr-3 lg:grid lg:grid-cols-4 lg:gap-4 lg:pr-0">
                {baseDirectory.businessTypeCards.map((businessType) => {
                  const params = new URLSearchParams();
                  if (q) params.set("q", q);
                  if (ubicacion) params.set("ubicacion", ubicacion);
                  params.set("rubro", businessType.value);
                  return <BusinessTypeCard active={rubro === businessType.value} businessType={businessType} href={`/?${params.toString()}#explorar`} key={businessType.value} />;
                })}
              </div>
            </div>
          </div>
        </section>

        {rubro ? (
          <section className="hidden lg:block">
            <div className="flex items-end justify-between gap-3">
              <SectionHeader eyebrow="Categorias" title={selectedBusinessTypeLabel ? `Categorias en ${selectedBusinessTypeLabel}` : "Explora por categorias"} />
              <Link className="shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-sm font-black text-[var(--color-heading)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={ubicacion ? `/?ubicacion=${encodeURIComponent(ubicacion)}#explorar` : "/#explorar"}>
                Ver rubros
              </Link>
            </div>
            <div className="public-scrollbar -mx-4 mt-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:overflow-visible lg:px-0 lg:pb-0">
              <div className="flex snap-x gap-3 pr-3 lg:grid lg:grid-cols-6 lg:gap-4 lg:pr-0">
                {directory.categoryCards.map((category) => {
                  const params = new URLSearchParams();
                  if (q) params.set("q", q);
                  if (ubicacion) params.set("ubicacion", ubicacion);
                  if (category.businessType) params.set("rubro", category.businessType);
                  params.set("categoria", category.value);
                  return <CategoryImageCard active={categoria === category.value} category={category} href={`/?${params.toString()}#restaurantes`} key={category.value} />;
                })}
              </div>
            </div>
          </section>
        ) : null}

        <HomeNearbyHighlights restaurants={directory.restaurants} />

        <HomeNearbyRestaurantSection
          directory={directory.restaurants}
          selectedBusinessTypeLabel={selectedBusinessTypeLabel}
          selectedCategoryLabel={selectedCategoryLabel}
        />

        <section className="grid gap-6 lg:grid-cols-2">
          <RankingPanel cards={directory.mostVisited} icon={<TrendingUp className="h-5 w-5" />} metric="visitas esta semana" title="Mas visitados" value={(card) => card.visits7d} />
          <RankingPanel cards={directory.mostOrderedRestaurants} icon={<Flame className="h-5 w-5" />} metric="pedidos 30d" title="Mas pedidos" value={(card) => card.orders30d} />
        </section>

        <section className="space-y-4" id="platos">
          <SectionHeader eyebrow="Productos" title="Productos mas pedidos" />
          {directory.mostOrderedDishes.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {directory.mostOrderedDishes.map((dish) => (
                <DishCard dish={dish} key={dish.id} />
              ))}
            </div>
          ) : (
            <Card className="p-6 text-sm font-semibold text-[var(--color-secondary-text)]">Aun no hay productos con pedidos registrados.</Card>
          )}
        </section>
      </div>
      </HomeLocationProvider>
    </main>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--accent)]">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-black sm:text-3xl">{title}</h2>
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
        "group flex min-h-24 w-36 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-[1.15rem] border bg-[var(--surface)] p-3 text-center shadow-[0_16px_42px_rgb(18_53_91_/_0.08)] transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)] sm:min-h-28 sm:w-44 lg:min-h-28 lg:w-auto",
        active ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-4 ring-[var(--accent-ring)]" : "border-[var(--border)]",
      )}
      href={href}
    >
      <div className={cn("grid h-12 w-12 place-items-center rounded-[1rem] ring-1 ring-[var(--border)] transition group-hover:shadow-[var(--shadow-glow)] sm:h-14 sm:w-14", categoryIconTone(category.value, category.label), active && "bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)]")}>
        <CategoryIcon label={category.label} value={category.value} />
      </div>
      <span className="line-clamp-2 block w-full text-balance text-xs font-black leading-tight text-[var(--color-heading)] sm:text-sm">{category.label}</span>
    </Link>
  );
}

function BusinessTypeCard({
  active,
  href,
  businessType,
}: {
  active: boolean;
  href: string;
  businessType: PublicBusinessTypeCard;
}) {
  return (
    <Link
      className={cn(
        "group flex min-h-24 w-[232px] shrink-0 snap-start items-center gap-3 rounded-[1.2rem] border bg-[var(--surface)] p-3 text-left shadow-[0_16px_42px_rgb(18_53_91_/_0.08)] transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)] sm:w-[250px] lg:min-h-[104px] lg:w-auto",
        active ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-4 ring-[var(--accent-ring)]" : "border-[var(--border)]",
      )}
      href={href}
    >
        <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-[1rem] bg-[var(--surface)] ring-1 ring-[var(--border)] sm:h-14 sm:w-14", businessTypeIconTone(businessType.value))}>
        <BusinessTypeIcon value={businessType.value} />
      </div>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-sm font-black leading-tight text-[var(--color-heading)] sm:text-base">{businessType.label}</span>
        <span className="mt-1 block text-xs font-semibold text-[var(--color-secondary-text)]">{businessType.count} locales</span>
      </span>
    </Link>
  );
}

function businessTypeIconTone(value: string) {
  if (value === "food") return "text-amber-700";
  if (value === "fashion" || value === "footwear") return "text-fuchsia-700";
  if (value === "pharmacy") return "text-emerald-700";
  if (value === "market") return "text-lime-700";
  if (value === "beauty") return "text-rose-700";
  if (value === "home") return "text-orange-700";
  if (value === "electronics") return "text-sky-700";
  if (value === "services") return "text-indigo-700";
  return "text-[var(--primary)]";
}

function BusinessTypeIcon({ value }: { value: string }) {
  const className = "h-7 w-7";

  if (value === "food") return <Utensils className={className} />;
  if (value === "fashion") return <Shirt className={className} />;
  if (value === "footwear") return <ShoppingBag className={className} />;
  if (value === "pharmacy") return <Pill className={className} />;
  if (value === "market") return <Store className={className} />;
  if (value === "beauty") return <Sparkles className={className} />;
  if (value === "home") return <House className={className} />;
  if (value === "electronics") return <Smartphone className={className} />;
  if (value === "services") return <Briefcase className={className} />;
  return <Store className={className} />;
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
  if (text.includes("ropa") || text.includes("lenceria") || text.includes("accesorio")) return "bg-fuchsia-100 text-fuchsia-700";
  if (text.includes("zapato") || text.includes("zapatilla") || text.includes("sandalia") || text.includes("bota")) return "bg-violet-100 text-violet-700";
  if (text.includes("farm") || text.includes("dermo") || text.includes("suplement") || text.includes("orto")) return "bg-emerald-100 text-emerald-700";
  if (text.includes("super") || text.includes("market") || text.includes("panader") || text.includes("fruta")) return "bg-lime-100 text-lime-700";
  if (text.includes("belleza") || text.includes("barber") || text.includes("maquill") || text.includes("skin") || text.includes("perfume")) return "bg-rose-100 text-rose-700";
  if (text.includes("hogar") || text.includes("mueble") || text.includes("decor") || text.includes("ferreter")) return "bg-orange-100 text-orange-700";
  if (text.includes("celular") || text.includes("comput") || text.includes("tech") || text.includes("gaming")) return "bg-sky-100 text-sky-700";
  if (text.includes("lavander") || text.includes("imprent") || text.includes("papeler") || text.includes("mensaj")) return "bg-indigo-100 text-indigo-700";

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
  if (text.includes("ropa") || text.includes("lenceria")) return <Shirt className={className} />;
  if (text.includes("accesorio") || text.includes("bolso") || text.includes("mochila")) return <ShoppingBag className={className} />;
  if (text.includes("zapato") || text.includes("zapatilla") || text.includes("sandalia") || text.includes("bota")) return <ShoppingBag className={className} />;
  if (text.includes("farm") || text.includes("dermo") || text.includes("suplement") || text.includes("orto")) return <Pill className={className} />;
  if (text.includes("super") || text.includes("market") || text.includes("panader") || text.includes("fruta")) return <Store className={className} />;
  if (text.includes("belleza") || text.includes("barber") || text.includes("maquill") || text.includes("skin") || text.includes("perfume")) return <Sparkles className={className} />;
  if (text.includes("hogar") || text.includes("mueble") || text.includes("decor") || text.includes("ferreter")) return <House className={className} />;
  if (text.includes("celular") || text.includes("comput") || text.includes("tech") || text.includes("gaming")) return <Smartphone className={className} />;
  if (text.includes("lavander") || text.includes("imprent") || text.includes("papeler") || text.includes("mensaj")) return <Briefcase className={className} />;

  return <Utensils className={className} />;
}

function isImageSrc(value?: string | null) {
  return Boolean(value && (value.startsWith("http") || value.startsWith("/")));
}

function isDisplayImage(value?: string | null) {
  return Boolean(value && isImageSrc(value) && !value.includes("imagendefault"));
}

function initials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function businessVisualClasses(businessType: BusinessType) {
  if (businessType === "fashion") return "from-[#3A1F2B] via-[#A44A6A] to-[#F1B7A4] text-white";
  if (businessType === "footwear") return "from-[#2B2348] via-[#6F4BC4] to-[#D6C4FF] text-white";
  if (businessType === "pharmacy") return "from-[#073B35] via-[#0F8A70] to-[#BFF4E8] text-white";
  if (businessType === "market") return "from-[#204015] via-[#72A51C] to-[#EAF7B4] text-white";
  if (businessType === "beauty") return "from-[#43142C] via-[#C44E86] to-[#FFD0E5] text-white";
  if (businessType === "home") return "from-[#3D2517] via-[#B97842] to-[#F7D4A8] text-white";
  if (businessType === "electronics") return "from-[#071B3A] via-[#1464B4] to-[#A8DAFF] text-white";
  if (businessType === "services") return "from-[#171B39] via-[#4F5CC7] to-[#CAD4FF] text-white";
  return "from-[#082441] via-[#12355B] to-[#27577F] text-white";
}

function BusinessVisualIcon({ businessType, className = "h-8 w-8" }: { businessType: BusinessType; className?: string }) {
  if (businessType === "food") return <Utensils className={className} />;
  if (businessType === "fashion") return <Shirt className={className} />;
  if (businessType === "footwear") return <ShoppingBag className={className} />;
  if (businessType === "pharmacy") return <Pill className={className} />;
  if (businessType === "market") return <Store className={className} />;
  if (businessType === "beauty") return <Sparkles className={className} />;
  if (businessType === "home") return <House className={className} />;
  if (businessType === "electronics") return <Smartphone className={className} />;
  if (businessType === "services") return <Briefcase className={className} />;
  return <Store className={className} />;
}

function BusinessVisual({ businessType, label, className }: { businessType: BusinessType; label: string; className?: string }) {
  return (
    <span className={cn("relative grid overflow-hidden bg-gradient-to-br", businessVisualClasses(businessType), className)}>
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgb(255_255_255_/_0.35),transparent_28%),radial-gradient(circle_at_82%_20%,rgb(255_255_255_/_0.22),transparent_24%),linear-gradient(135deg,transparent_0%,rgb(255_255_255_/_0.16)_48%,transparent_49%)]" />
      <span className="absolute -right-8 -top-8 h-24 w-24 rounded-full border border-white/24" />
      <span className="relative z-10 grid h-full w-full place-items-center">
        <span className="grid h-14 w-14 place-items-center rounded-[1.2rem] bg-white/18 shadow-xl ring-1 ring-white/24 backdrop-blur">
          <BusinessVisualIcon businessType={businessType} className="h-7 w-7" />
        </span>
      </span>
      <span className="absolute bottom-2 left-3 z-10 text-[9px] font-black uppercase tracking-[0.16em] text-white/58">{initials(label) || "YP"}</span>
    </span>
  );
}

function restaurantHeroSubtitle(card: PublicRestaurantCard) {
  if (card.isTemporarilyClosed) return card.currentAnnouncement?.title || "Cerrado temporalmente";
  return card.currentAnnouncement?.title || card.popularProducts.slice(0, 2).join(" | ") || card.categories.slice(0, 2).join(" | ") || card.restaurant.city || `${businessCatalogLabelTitle(card.restaurant.businessType)} disponible`;
}

function MobileHeroCarousel({ restaurants }: { restaurants: PublicRestaurantCard[] }) {
  if (!restaurants.length) return null;

  return (
    <div className="lg:hidden">
      <div className="public-scrollbar -mx-4 overflow-x-auto px-4 pb-2">
        <div className="flex snap-x snap-mandatory gap-3 pr-4">
          {restaurants.map((card, index) => {
            const imageSrc = isDisplayImage(card.restaurant.bannerUrl) ? card.restaurant.bannerUrl : defaultProductImage;
            return (
              <Link
                className="group relative min-h-[210px] w-[82vw] max-w-[340px] shrink-0 snap-start overflow-hidden rounded-[1.6rem] bg-[var(--primary-dark)] text-[var(--color-on-primary)] shadow-[0_22px_60px_rgb(2_10_18_/_0.26)] ring-1 ring-white/14 transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)] min-[390px]:min-h-[226px]"
                href={publicRestaurantPath(card.restaurant.slug)}
                key={card.restaurant.id}
              >
                <Image alt={card.restaurant.name} className="object-cover transition duration-500 group-hover:scale-105" fill priority={index === 0} sizes="85vw" src={imageSrc} />
                <span className="absolute inset-0 bg-[linear-gradient(180deg,rgb(5_17_31_/_0.08)_0%,rgb(5_17_31_/_0.4)_46%,rgb(5_17_31_/_0.88)_100%)]" />
                <span className="absolute inset-x-0 bottom-0 z-10 p-4">
                  <span className="mb-3 inline-flex w-fit items-center gap-2 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-black text-[var(--primary)] shadow-[var(--shadow-glow)]">
                    <TrendingUp className="h-3.5 w-3.5" />
                    #{index + 1} mas usado
                  </span>
                  <span className="flex items-end gap-3">
                    <RestaurantLogo card={card} size="sm" />
                    <span className="min-w-0 flex-1 pb-0.5">
                      <span className="block truncate text-2xl font-black leading-tight">{card.restaurant.name}</span>
                      <span className="mt-1 block line-clamp-2 text-sm font-semibold leading-5 text-[var(--color-on-primary-muted)]">{restaurantHeroSubtitle(card)}</span>
                    </span>
                  </span>
                  <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-white/92 px-4 py-2 text-sm font-black text-[var(--primary)] shadow-lg backdrop-blur">
                    Ver local
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
      <div aria-hidden="true" className="mt-2 flex justify-center gap-1.5">
        {restaurants.map((card, index) => (
          <span className={cn("h-1.5 rounded-full", index === 0 ? "w-6 bg-[var(--accent)]" : "w-1.5 bg-white/34")} key={card.restaurant.id} />
        ))}
      </div>
    </div>
  );
}

function RestaurantLogo({ card, size = "md" }: { card: PublicRestaurantCard; size?: "sm" | "md" }) {
  const isImage = isDisplayImage(card.restaurant.logoUrl);
  const className = size === "sm" ? "h-16 w-16 rounded-2xl" : "h-20 w-20 rounded-[1.25rem]";
  const textLogo = initials(card.restaurant.name);

  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-[var(--primary)] text-xl font-black text-[var(--color-on-primary)] ring-1 ring-[var(--border)]", className)}>
      {isImage ? <Image alt={card.restaurant.name} className="h-full w-full object-cover" height={80} src={card.restaurant.logoUrl} width={80} /> : <span aria-hidden="true">{textLogo || <Store className="h-5 w-5" />}</span>}
    </span>
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
          <Link className="grid grid-cols-[36px_56px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-[var(--color-surface)] p-2 ring-1 ring-transparent transition hover:-translate-y-0.5 hover:bg-[var(--primary-light)] hover:ring-[var(--border)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={publicRestaurantPath(card.restaurant.slug)} key={card.restaurant.id}>
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
  const imageSrc = isDisplayImage(dish.imageUrl) ? dish.imageUrl : defaultProductImage;
  return (
    <Link className="overflow-hidden rounded-[1.25rem] bg-[var(--surface)] shadow-sm ring-1 ring-[var(--border)] transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={publicRestaurantPath(dish.restaurantSlug)}>
      <div className="relative aspect-[4/3] bg-[var(--primary-light)]">
        <Image alt={dish.name} className="object-cover" fill sizes="(min-width:1024px) 25vw, 50vw" src={imageSrc} />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-black text-[var(--primary)] shadow-[var(--shadow-glow)]">
          <Flame className="h-3.5 w-3.5" />
          {dish.orderCount} pedidos
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
