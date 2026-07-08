"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock3, MapPin, Search, SlidersHorizontal, Store, Utensils, X } from "lucide-react";
import { type FormEvent, type ReactNode, useDeferredValue, useMemo, useState, useTransition } from "react";
import type { PublicCategoryCard, PublicDishCard, PublicRestaurantCard } from "@/lib/services/public-directory.service";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";

const defaultImage = "/imagendefault.jpeg";

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

function directoryHref({ query, location, category }: { query?: string; location?: string; category?: string }) {
  const params = new URLSearchParams();
  if (query?.trim()) params.set("q", query.trim());
  if (location?.trim()) params.set("ubicacion", location.trim());
  if (category?.trim()) params.set("categoria", category.trim());
  const queryString = params.toString();
  return queryString ? `/?${queryString}#restaurantes` : "/#restaurantes";
}

export function HomeSearchAutocomplete({
  restaurants,
  dishes,
  categories,
  locations,
  initialQuery = "",
  initialLocation = "",
}: {
  restaurants: PublicRestaurantCard[];
  dishes: PublicDishCard[];
  categories: PublicCategoryCard[];
  locations: string[];
  initialQuery?: string;
  initialLocation?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [location, setLocation] = useState(initialLocation);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(query);

  const needle = normalize(deferredQuery);
  const filteredRestaurants = useMemo(() => {
    const locationNeedle = normalize(location);
    return restaurants
      .filter((card) => {
        const matchesLocation = !locationNeedle || normalize(card.restaurant.city).includes(locationNeedle);
        const searchable = normalize(`${card.restaurant.name} ${card.restaurant.city} ${card.primaryCategoryLabel} ${card.categories.join(" ")} ${card.popularProducts.join(" ")}`);
        return matchesLocation && (!needle || searchable.includes(needle));
      })
      .slice(0, needle ? 5 : 3);
  }, [location, needle, restaurants]);

  const filteredDishes = useMemo(() => {
    if (!needle) {
      return dishes.slice(0, 4);
    }
    return dishes
      .filter((dish) => normalize(`${dish.name} ${dish.description} ${dish.restaurantName}`).includes(needle))
      .slice(0, 5);
  }, [dishes, needle]);

  const filteredCategories = useMemo(() => {
    return categories.filter((category) => !needle || normalize(`${category.label} ${category.value}`).includes(needle)).slice(0, 6);
  }, [categories, needle]);

  const popularChips = useMemo(() => {
    const dishChips = dishes.slice(0, 3).map((dish) => dish.name);
    const categoryChips = categories.slice(0, 4).map((category) => category.label);
    return Array.from(new Set([...dishChips, ...categoryChips])).slice(0, 6);
  }, [categories, dishes]);

  const hasResults = filteredRestaurants.length > 0 || filteredDishes.length > 0 || filteredCategories.length > 0;

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const href = directoryHref({ query, location });
    setIsOpen(false);
    startTransition(() => router.push(href));
  }

  return (
    <div className="relative">
      <form
        className="rounded-[1.65rem] border border-[var(--border)] bg-white p-2 shadow-[0_24px_70px_rgb(18_53_91_/_0.16)]"
        onSubmit={submitSearch}
      >
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_190px_auto]">
          <label className="flex min-h-14 items-center gap-3 rounded-[1.25rem] border border-transparent bg-[var(--color-surface)] px-4 text-[var(--color-heading)] ring-1 ring-[var(--border)] transition focus-within:border-[var(--primary)] focus-within:ring-4 focus-within:ring-[var(--accent-ring)]">
            <Search className="h-5 w-5 shrink-0 text-[var(--muted)]" />
            <input
              autoComplete="off"
              className="h-12 min-w-0 flex-1 bg-transparent text-sm font-black outline-none placeholder:text-[var(--color-placeholder)]"
              name="q"
              onChange={(event) => {
                setQuery(event.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder="Busca comida, restaurantes o categorias"
              value={query}
            />
            {query ? (
              <button
                aria-label="Limpiar busqueda"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white"
                onClick={() => {
                  setQuery("");
                  setIsOpen(true);
                }}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>

          <label className="flex min-h-14 items-center gap-2 rounded-[1.25rem] border border-[var(--border)] bg-white px-3 text-sm font-black text-[var(--primary)]">
            <MapPin className="h-4 w-4 shrink-0" />
            <select
              className="min-w-0 flex-1 bg-transparent outline-none"
              name="ubicacion"
              onChange={(event) => setLocation(event.target.value)}
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

          <button
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-[1.25rem] bg-[var(--accent)] px-5 text-sm font-black text-[var(--primary)] shadow-[var(--shadow-glow)] transition hover:bg-[#d9ff22] active:scale-[0.98]"
            type="submit"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Explorar
          </button>
        </div>
      </form>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-30 overflow-hidden rounded-[1.6rem] border border-[var(--border)] bg-white shadow-[0_26px_80px_rgb(8_36_65_/_0.22)]">
          {isPending ? (
            <div className="grid gap-3 p-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3" key={index}>
                  <div className="h-16 animate-pulse rounded-2xl bg-[var(--primary-light)]" />
                  <div className="py-1">
                    <div className="h-4 w-40 animate-pulse rounded-full bg-[var(--primary-light)]" />
                    <div className="mt-3 h-3 w-28 animate-pulse rounded-full bg-[var(--color-surface)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : hasResults ? (
            <div className="max-h-[min(70vh,560px)] overflow-y-auto p-3">
              {!needle ? (
                <div className="mb-3">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <p className="text-sm font-black text-[var(--primary)]">Busquedas populares</p>
                    <span className="text-xs font-bold text-[var(--muted)]">Tiempo real</span>
                  </div>
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {popularChips.map((chip) => (
                      <button
                        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-xs font-black text-[var(--color-heading)] shadow-sm"
                        key={chip}
                        onClick={() => {
                          setQuery(chip);
                          setIsOpen(true);
                        }}
                        type="button"
                      >
                        <Clock3 className="h-3.5 w-3.5 text-[var(--primary)]" />
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {filteredRestaurants.length ? (
                <SearchSection title={needle ? "Restaurantes" : "Top para pedir"}>
                  {filteredRestaurants.map((card) => (
                    <Link
                      className="grid grid-cols-[64px_minmax(0,1fr)_32px] items-center gap-3 rounded-[1.2rem] p-2 text-[var(--color-heading)] transition hover:bg-[var(--primary-light)]"
                      href={`/r/${card.restaurant.slug}`}
                      key={card.restaurant.id}
                      onClick={() => setIsOpen(false)}
                    >
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
                      <ArrowRight className="h-4 w-4 text-[var(--primary)]" />
                    </Link>
                  ))}
                </SearchSection>
              ) : null}

              {filteredDishes.length ? (
                <SearchSection title="Platos">
                  {filteredDishes.map((dish) => (
                    <Link
                      className="grid grid-cols-[74px_minmax(0,1fr)_auto] items-center gap-3 rounded-[1.2rem] p-2 text-[var(--color-heading)] transition hover:bg-[var(--primary-light)]"
                      href={`/r/${dish.restaurantSlug}`}
                      key={dish.id}
                      onClick={() => setIsOpen(false)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt={dish.name} className="h-16 w-[74px] rounded-2xl object-cover" src={imageSrc(dish.imageUrl)} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black">{dish.name}</span>
                        <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--muted)]">{dish.restaurantName}</span>
                        <span className="mt-1 block text-xs font-black text-[var(--primary)]">{formatMoney(dish.price)}</span>
                      </span>
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent)] text-[var(--primary)]">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </Link>
                  ))}
                </SearchSection>
              ) : null}

              {filteredCategories.length ? (
                <SearchSection title="Categorias">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {filteredCategories.map((category) => (
                      <Link
                        className={cn(
                          "inline-flex min-w-24 shrink-0 flex-col items-center gap-2 rounded-[1.1rem] border border-[var(--border)] bg-white p-3 text-center text-xs font-black text-[var(--primary)] shadow-sm transition hover:bg-[var(--accent-soft)]",
                          category.count ? "" : "opacity-60",
                        )}
                        href={directoryHref({ query, location, category: category.value })}
                        key={category.value}
                        onClick={() => setIsOpen(false)}
                      >
                        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--accent)]">
                          {category.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img alt={category.label} className="h-full w-full rounded-2xl object-cover" src={imageSrc(category.imageUrl)} />
                          ) : (
                            <Utensils className="h-5 w-5" />
                          )}
                        </span>
                        <span className="max-w-24 truncate">{category.label}</span>
                      </Link>
                    ))}
                  </div>
                </SearchSection>
              ) : null}
            </div>
          ) : (
            <div className="p-5 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
                <Store className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-black text-[var(--color-heading)]">Sin resultados rapidos</p>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Prueba con otro plato, categoria o ciudad.</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SearchSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3 first:mt-0">
      <p className="px-1 pb-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">{title}</p>
      <div className="grid gap-1">{children}</div>
    </section>
  );
}
