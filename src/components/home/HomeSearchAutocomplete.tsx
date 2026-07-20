"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock3, LocateFixed, MapPin, Search, Store, UserRound, Utensils, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PublicThemeToggle } from "@/components/public-theme/PublicThemeToggle";
import type { PublicBusinessTypeCard, PublicCategoryCard, PublicDishCard, PublicRestaurantCard } from "@/lib/services/public-directory.service";
import { cn } from "@/lib/utils/cn";
import { defaultProductImage } from "@/lib/utils/default-images";
import { formatMoney } from "@/lib/utils/money";
import { publicRestaurantPath } from "@/lib/utils/public-routes";

const defaultImage = defaultProductImage;
type ActivePublicTheme = "light" | "dark";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function imageSrc(value?: string | null) {
  return value && (value.startsWith("http") || value.startsWith("/")) ? value : defaultImage;
}

function distanceKm(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const radius = 6371;
  const latDelta = ((to.latitude - from.latitude) * Math.PI) / 180;
  const lonDelta = ((to.longitude - from.longitude) * Math.PI) / 180;
  const fromLat = (from.latitude * Math.PI) / 180;
  const toLat = (to.latitude * Math.PI) / 180;
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lonDelta / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function directoryHref({ query, location, category, businessType }: { query?: string; location?: string; category?: string; businessType?: string }) {
  const params = new URLSearchParams();
  if (query?.trim()) params.set("q", query.trim());
  if (location?.trim()) params.set("ubicacion", location.trim());
  if (category?.trim()) params.set("categoria", category.trim());
  if (businessType?.trim()) params.set("rubro", businessType.trim());
  const queryString = params.toString();
  return queryString ? `/?${queryString}#restaurantes` : "/#restaurantes";
}

export function HomeSearchAutocomplete({
  restaurants,
  dishes,
  businessTypes,
  categories,
  locations,
  initialQuery = "",
  initialLocation = "",
}: {
  restaurants: PublicRestaurantCard[];
  dishes: PublicDishCard[];
  businessTypes: PublicBusinessTypeCard[];
  categories: PublicCategoryCard[];
  locations: string[];
  initialQuery?: string;
  initialLocation?: string;
}) {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [location, setLocation] = useState(initialLocation);
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [autoLocationStatus, setAutoLocationStatus] = useState<"idle" | "detecting" | "detected" | "unavailable">("idle");
  const [publicTheme, setPublicTheme] = useState<ActivePublicTheme>("light");
  const [showCompactHeader, setShowCompactHeader] = useState(false);
  const [userChangedLocation, setUserChangedLocation] = useState(Boolean(initialLocation));
  const [isPending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(query);

  const needle = normalize(deferredQuery);
  const filteredRestaurants = useMemo(() => {
    const locationNeedle = normalize(location);
    return restaurants
      .filter((card) => {
        const matchesLocation = !locationNeedle || normalize(card.restaurant.city).includes(locationNeedle);
        const searchable = normalize(`${card.restaurant.name} ${card.restaurant.city} ${card.restaurant.businessType} ${card.primaryCategoryLabel} ${card.categories.join(" ")} ${card.popularProducts.join(" ")}`);
        return matchesLocation && (!needle || searchable.includes(needle));
      })
      .sort((left, right) => (needle ? right.orders30d - left.orders30d : right.visits7d - left.visits7d))
      .slice(0, needle ? 8 : 4);
  }, [location, needle, restaurants]);

  const filteredBusinessTypes = useMemo(() => {
    return businessTypes
      .filter((businessType) => !needle || normalize(`${businessType.label} ${businessType.description} ${businessType.value}`).includes(needle))
      .sort((left, right) => right.count - left.count)
      .slice(0, 8);
  }, [businessTypes, needle]);

  const filteredDishes = useMemo(() => {
    const dishMatches = needle ? dishes.filter((dish) => normalize(`${dish.name} ${dish.description} ${dish.restaurantName}`).includes(needle)) : dishes;
    return dishMatches
      .sort((left, right) => right.orderCount - left.orderCount)
      .slice(0, 10);
  }, [dishes, needle]);

  const filteredCategories = useMemo(() => {
    return categories
      .filter((category) => !needle || normalize(`${category.label} ${category.value} ${category.businessType}`).includes(needle))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10);
  }, [categories, needle]);

  const popularChips = useMemo(() => {
    const dishChips = dishes.slice(0, 4).map((dish) => dish.name);
    const businessTypeChips = businessTypes.slice(0, 4).map((businessType) => businessType.label);
    const categoryChips = categories.slice(0, 5).map((category) => category.label);
    return Array.from(new Set([...dishChips, ...businessTypeChips, ...categoryChips])).slice(0, 8);
  }, [businessTypes, categories, dishes]);

  const hasResults = filteredRestaurants.length > 0 || filteredDishes.length > 0 || filteredBusinessTypes.length > 0 || filteredCategories.length > 0;

  const closeSearch = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 420);
  }, [isClosing]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const syncTheme = () => {
      const nextTheme = document.querySelector(".public-brand-theme")?.getAttribute("data-public-theme") === "dark" ? "dark" : "light";
      setPublicTheme(nextTheme);
    };

    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.body, {
      attributeFilter: ["data-public-theme"],
      attributes: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("public-search-open");
    window.setTimeout(() => searchInputRef.current?.focus(), 120);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeSearch();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("public-search-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeSearch, isOpen]);

  useEffect(() => {
    let ticking = false;

    function syncCompactHeader() {
      ticking = false;
      setShowCompactHeader(window.scrollY > 120);
    }

    function handleScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(syncCompactHeader);
    }

    syncCompactHeader();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function openSearch() {
    setIsClosing(false);
    if (!location && !userChangedLocation && autoLocationStatus === "idle") {
      setAutoLocationStatus("geolocation" in navigator ? "detecting" : "unavailable");
    }
    setIsOpen(true);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const href = directoryHref({ query, location });
    setIsOpen(false);
    startTransition(() => router.push(href));
  }

  useEffect(() => {
    if (!isOpen || userChangedLocation || location || autoLocationStatus !== "detecting") return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const restaurantsWithCoords = restaurants.filter((card) => typeof card.restaurant.latitude === "number" && typeof card.restaurant.longitude === "number" && card.restaurant.city);
        if (!restaurantsWithCoords.length) {
          setAutoLocationStatus("unavailable");
          return;
        }

        const closest = restaurantsWithCoords
          .map((card) => ({
            city: card.restaurant.city,
            distance: distanceKm(
              { latitude: position.coords.latitude, longitude: position.coords.longitude },
              { latitude: card.restaurant.latitude ?? 0, longitude: card.restaurant.longitude ?? 0 },
            ),
          }))
          .sort((left, right) => left.distance - right.distance)[0];

        if (closest?.city) {
          setLocation(closest.city);
          setAutoLocationStatus("detected");
        } else {
          setAutoLocationStatus("unavailable");
        }
      },
      () => setAutoLocationStatus("unavailable"),
      { enableHighAccuracy: false, maximumAge: 1000 * 60 * 10, timeout: 4500 },
    );
  }, [autoLocationStatus, isOpen, location, restaurants, userChangedLocation]);

  return (
    <div className="relative">
      <div
        className={cn(
          "fixed inset-x-0 top-0 z-[90] border-b border-white/12 bg-[#12355B] px-4 pb-3 pt-[calc(0.45rem+env(safe-area-inset-top))] text-white shadow-[0_18px_55px_rgb(8_36_65_/_0.26)] transition duration-200 lg:hidden",
          showCompactHeader && !isOpen ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0",
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <Link aria-label="Ir al inicio de yopido.shop" className="flex min-w-0 flex-1 items-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href="/">
            <BrandLogo className="h-8 w-auto max-w-[148px] min-[390px]:max-w-[164px]" variant="dark" />
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <button
              aria-label="Abrir buscador"
              className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)] transition hover:bg-[#d9ff22] active:scale-95"
              onClick={openSearch}
              type="button"
            >
              <Search className="h-5 w-5" />
            </button>
            <Link aria-label="Ingresar al panel" className="grid h-10 w-10 place-items-center rounded-full border border-white/22 bg-white/8 text-white shadow-sm backdrop-blur transition hover:bg-white/14 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href="/admin/login">
              <UserRound className="h-5 w-5" />
            </Link>
            <PublicThemeToggle compact tone="onPrimary" />
          </div>
        </div>
      </div>

      <form className="rounded-[1.3rem] border border-[var(--border)] bg-[var(--color-card)] p-1.5 shadow-[var(--shadow-primary)] sm:rounded-[1.55rem] sm:p-2" onSubmit={(event) => {
        event.preventDefault();
        openSearch();
      }}>
        <div>
          <label className="flex min-h-12 items-center gap-2 rounded-[1.1rem] bg-[var(--color-card)] pl-4 pr-1 text-[var(--color-heading)] transition focus-within:ring-4 focus-within:ring-[var(--accent-ring)] sm:min-h-14 sm:gap-3 sm:rounded-[1.3rem] sm:pl-5 sm:pr-1.5">
            <input
              autoComplete="off"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm font-black outline-none placeholder:text-[var(--color-placeholder)] sm:h-11 sm:text-base"
              name="q"
              onChange={(event) => setQuery(event.target.value)}
              onFocus={openSearch}
              placeholder="Locales, platos y productos"
              value={query}
            />
            {query ? (
              <button
                aria-label="Limpiar busqueda"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white"
                onClick={() => {
                  setQuery("");
                  openSearch();
                }}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
            <button aria-label="Abrir buscador" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)] transition hover:bg-[#d9ff22] active:scale-95 sm:h-12 sm:w-12" onClick={openSearch} type="button">
              <Search className="h-5 w-5" />
            </button>
          </label>
        </div>
      </form>

      {isOpen && typeof document !== "undefined" ? createPortal(
        <div className="public-brand-theme fixed inset-0 z-[100] bg-[rgb(8_36_65_/_0.78)] p-0 text-[var(--color-heading)] backdrop-blur-md sm:p-6" data-public-theme={publicTheme} role="dialog" aria-modal="true" aria-label="Busqueda de negocios">
          <div className={cn("relative mx-auto flex h-dvh w-full flex-col overflow-hidden bg-[var(--color-card)] shadow-[0_30px_90px_rgb(2_10_18_/_0.36)] sm:h-[min(88dvh,820px)] sm:max-w-6xl sm:rounded-[2rem]", isClosing ? "search-tv-exit" : "search-tv-enter")}>
            <span className={cn("search-tv-line pointer-events-none absolute left-1/2 top-1/2 z-50 h-1 w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)] shadow-[0_0_32px_rgb(199_240_0_/_0.88)]", isClosing && "search-tv-line-out")} />

            <div className="sticky top-0 z-20 border-b border-white/12 bg-[linear-gradient(135deg,#082441_0%,#12355B_64%,#071E36_100%)] p-3 text-white shadow-[0_18px_55px_rgb(8_36_65_/_0.24)] backdrop-blur sm:p-5">
              <div className="flex items-center gap-3">
                <button className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/12 text-white shadow-lg ring-1 ring-white/16 transition hover:bg-white/18" onClick={closeSearch} type="button" aria-label="Cerrar busqueda">
                  <X className="h-5 w-5" />
                </button>
                <form className="min-w-0 flex-1" onSubmit={submitSearch}>
                  <label className="flex min-h-14 items-center gap-3 rounded-[1.35rem] border border-white/20 bg-[var(--color-card)] px-4 text-[var(--color-heading)] shadow-[0_18px_45px_rgb(2_10_18_/_0.16)] focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent-ring)]">
                    <Search className="h-5 w-5 shrink-0 text-[var(--primary)]" />
                    <input
                      ref={searchInputRef}
                      autoComplete="off"
                      className="min-w-0 flex-1 bg-transparent text-base font-black outline-none placeholder:text-[var(--color-placeholder)]"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Ej: hamburguesas, ropa, farmacia..."
                      value={query}
                    />
                    {query ? (
                      <button aria-label="Limpiar busqueda" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white shadow-sm" onClick={() => setQuery("")} type="button">
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </label>
                </form>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-[220px_auto] sm:items-center">
                <label className="flex min-h-12 items-center gap-2 rounded-full border border-white/22 bg-white/12 px-4 text-sm font-black text-white ring-1 ring-white/10">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <select
                    className="min-w-0 flex-1 bg-transparent outline-none"
                    onChange={(event) => {
                      setUserChangedLocation(true);
                      setLocation(event.target.value);
                    }}
                    value={location}
                  >
                    <option value="">Todas las ciudades</option>
                    {locations.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--accent)] px-3 text-xs font-black text-[var(--primary)] shadow-[var(--shadow-glow)]">
                  <LocateFixed className="h-3.5 w-3.5" />
                  {autoLocationStatus === "detecting" ? "Detectando GPS" : autoLocationStatus === "detected" ? `GPS: ${location}` : "Puedes cambiar ciudad"}
                </span>

                <div className="flex gap-2 overflow-x-auto pb-1 sm:justify-end">
                  {popularChips.map((chip) => (
                    <button className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/16 bg-white/10 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-white/16" key={chip} onClick={() => setQuery(chip)} type="button">
                      <Clock3 className="h-3.5 w-3.5 text-[var(--accent)]" />
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-background)] p-3 sm:p-5">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Busqueda en tiempo real</p>
                  <h2 className="mt-1 text-2xl font-black sm:text-3xl">{needle ? `Resultados para "${query}"` : "Lo mas buscado cerca de ti"}</h2>
                </div>
                <Link className="hidden rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-black text-[var(--primary)] shadow-[var(--shadow-glow)] sm:inline-flex" href={directoryHref({ query, location })} onClick={() => setIsOpen(false)}>
                  Ver todos
                </Link>
              </div>

              {isPending ? (
                <SearchSkeleton />
              ) : hasResults ? (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                  <div className="grid gap-4">
                    <SearchSection title={needle ? "Restaurantes" : "Restaurantes mas visitados"} count={filteredRestaurants.length}>
                      {filteredRestaurants.map((card) => (
                        <Link className="grid grid-cols-[64px_minmax(0,1fr)_32px] items-center gap-3 rounded-[1.25rem] bg-[var(--surface)] p-2 text-[var(--color-heading)] shadow-sm ring-1 ring-[var(--border)] transition hover:bg-[var(--color-hover)]" href={publicRestaurantPath(card.restaurant.slug)} key={card.restaurant.id} onClick={() => setIsOpen(false)}>
                          <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-[var(--primary)] text-sm font-black text-white">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img alt={card.restaurant.name} className="h-full w-full object-cover" src={imageSrc(card.restaurant.logoUrl || card.restaurant.bannerUrl)} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-black">{card.restaurant.name}</span>
                            <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--muted)]">
                              {card.primaryCategoryLabel} {card.restaurant.city ? `- ${card.restaurant.city}` : ""}
                            </span>
                            <span className="mt-1 inline-flex rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-black text-[var(--primary)]">
                              {Math.max(4, Math.min(5, 4 + card.orders30d / 100)).toFixed(1)}
                            </span>
                          </span>
                          <ArrowRight className="h-4 w-4 text-[var(--accent)]" />
                        </Link>
                      ))}
                    </SearchSection>

                    <SearchSection title={needle ? "Platos" : "Platos mas pedidos"} count={filteredDishes.length}>
                      {filteredDishes.map((dish) => (
                        <Link className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 rounded-[1.35rem] bg-[var(--surface)] p-2 text-[var(--color-heading)] shadow-sm ring-1 ring-[var(--border)] transition hover:-translate-y-0.5 hover:bg-[var(--accent-soft)]" href={publicRestaurantPath(dish.restaurantSlug)} key={dish.id} onClick={() => setIsOpen(false)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img alt={dish.name} className="h-20 w-[88px] rounded-[1.15rem] object-cover" src={imageSrc(dish.imageUrl)} />
                          <span className="min-w-0">
                            <span className="block line-clamp-1 text-base font-black">{dish.name}</span>
                            <span className="mt-0.5 block truncate text-sm font-semibold text-[var(--muted)]">{dish.restaurantName}</span>
                            <span className="mt-2 inline-flex rounded-full bg-[var(--primary-light)] px-2.5 py-1 text-xs font-black text-[var(--primary)]">{formatMoney(dish.price)}</span>
                          </span>
                          <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)]">
                            <ArrowRight className="h-4 w-4" />
                          </span>
                        </Link>
                      ))}
                    </SearchSection>
                  </div>

                  <div className="grid content-start gap-4">
                    <SearchSection title={needle ? "Rubros" : "Rubros sugeridos"} count={filteredBusinessTypes.length}>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {filteredBusinessTypes.map((businessType) => (
                          <Link
                            className={cn(
                              "inline-flex min-w-0 items-center gap-3 rounded-[1.1rem] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm font-black text-[var(--color-heading)] shadow-sm transition hover:bg-[var(--accent-soft)]",
                              businessType.count ? "" : "opacity-60",
                            )}
                            href={directoryHref({ query, location, businessType: businessType.value })}
                            key={businessType.value}
                            onClick={() => setIsOpen(false)}
                          >
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--accent)] text-[var(--primary)]">
                              <Store className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate">{businessType.label}</span>
                              <span className="block text-xs font-semibold text-[var(--muted)]">{businessType.count || "Sin"} locales</span>
                            </span>
                          </Link>
                        ))}
                      </div>
                    </SearchSection>

                    <SearchSection title={needle ? "Categorias" : "Categorias destacadas"} count={filteredCategories.length}>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
                        {filteredCategories.map((category) => (
                          <Link className={cn("inline-flex min-w-0 items-center gap-3 rounded-[1.1rem] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm font-black text-[var(--color-heading)] shadow-sm transition hover:bg-[var(--accent-soft)]", category.count ? "" : "opacity-60")} href={directoryHref({ query, location, category: category.value, businessType: category.businessType })} key={category.value} onClick={() => setIsOpen(false)}>
                            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--accent)]">
                              {category.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img alt={category.label} className="h-full w-full object-cover" src={imageSrc(category.imageUrl)} />
                              ) : (
                                <Utensils className="h-5 w-5" />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate">{category.label}</span>
                              <span className="block text-xs font-semibold text-[var(--muted)]">{category.count || "Sin"} locales</span>
                            </span>
                          </Link>
                        ))}
                      </div>
                    </SearchSection>
                  </div>
                </div>
              ) : (
                <div className="grid min-h-[360px] place-items-center rounded-[1.5rem] bg-[var(--surface)] p-8 text-center shadow-sm ring-1 ring-[var(--border)]">
                  <div>
                    <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
                      <Store className="h-7 w-7" />
                    </div>
                    <p className="mt-4 text-lg font-black text-[var(--color-heading)]">Sin resultados rapidos</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--muted)]">Prueba con otro producto, rubro, categoria o ciudad.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function SearchSection({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="rounded-[1.5rem] bg-[var(--color-card-muted)] p-3 shadow-sm ring-1 ring-[var(--border)] backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">{title}</p>
        {typeof count === "number" ? <span className="rounded-full bg-[var(--primary-light)] px-2.5 py-1 text-xs font-black text-[var(--primary)]">{count}</span> : null}
      </div>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

function SearchSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
      {Array.from({ length: 2 }).map((_, groupIndex) => (
        <div className="rounded-[1.5rem] bg-[var(--color-card-muted)] p-3 shadow-sm ring-1 ring-[var(--border)] backdrop-blur-sm" key={groupIndex}>
          <div className="mb-3 h-4 w-28 animate-pulse rounded-full bg-[var(--primary-light)]" />
          <div className="grid gap-2">
            {Array.from({ length: groupIndex === 0 ? 5 : 3 }).map((__, index) => (
              <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-3 rounded-[1.25rem] bg-[var(--surface)] p-2 ring-1 ring-[var(--border)]" key={index}>
                <div className="h-20 animate-pulse rounded-[1.15rem] bg-[var(--primary-light)]" />
                <div className="py-2">
                  <div className="h-4 w-40 animate-pulse rounded-full bg-[var(--primary-light)]" />
                  <div className="mt-3 h-3 w-28 animate-pulse rounded-full bg-[var(--color-surface)]" />
                  <div className="mt-4 h-6 w-20 animate-pulse rounded-full bg-[var(--accent-soft)]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
