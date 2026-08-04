"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Beef,
  Briefcase,
  Coffee,
  CupSoda,
  Drumstick,
  House,
  IceCreamBowl,
  LeafyGreen,
  LocateFixed,
  MapPin,
  Pill,
  Pizza,
  Salad,
  Sandwich,
  Shirt,
  ShoppingBag,
  Soup,
  Sparkles,
  Store,
  Utensils,
} from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { readUserLocation, USER_LOCATION_UPDATED_EVENT, writeUserLocation } from "@/lib/client/user-location";
import { businessCatalogLabelTitle } from "@/lib/restaurant-directory-options";
import type { PublicBusinessTypeCard, PublicCategoryCard, PublicRestaurantCard } from "@/lib/services/public-directory.service";
import { cn } from "@/lib/utils/cn";
import { defaultProductImage } from "@/lib/utils/default-images";
import { calculateDistanceKm, formatDistance, type GeoPoint } from "@/lib/utils/geo-distance";
import { publicRestaurantPath } from "@/lib/utils/public-routes";

type LocationStatus = "idle" | "detecting" | "detected" | "denied" | "unavailable";
type NearbyRestaurantCard = PublicRestaurantCard & {
  distanceKm?: number;
  originalIndex: number;
};

type HomeLocationContextValue = {
  closestRestaurant: NearbyRestaurantCard | null;
  requestLocation: () => void;
  status: LocationStatus;
  userLocation: GeoPoint | null;
};

const HomeLocationContext = createContext<HomeLocationContextValue | null>(null);

function useHomeLocation() {
  const context = useContext(HomeLocationContext);
  if (!context) {
    throw new Error("useHomeLocation must be used inside HomeLocationProvider");
  }

  return context;
}

function restaurantDistanceKm(userLocation: GeoPoint | null, card: PublicRestaurantCard) {
  if (!userLocation || typeof card.restaurant.latitude !== "number" || typeof card.restaurant.longitude !== "number") {
    return undefined;
  }

  return calculateDistanceKm(userLocation, {
    latitude: card.restaurant.latitude,
    longitude: card.restaurant.longitude,
  });
}

function rankRestaurantCards(cards: PublicRestaurantCard[], userLocation: GeoPoint | null): NearbyRestaurantCard[] {
  return cards
    .map((card, originalIndex) => ({
      ...card,
      distanceKm: restaurantDistanceKm(userLocation, card),
      originalIndex,
    }))
    .sort((left, right) => {
      if (userLocation) {
        if (typeof left.distanceKm === "number" && typeof right.distanceKm === "number" && left.distanceKm !== right.distanceKm) {
          return left.distanceKm - right.distanceKm;
        }
        if (typeof left.distanceKm === "number" && typeof right.distanceKm !== "number") return -1;
        if (typeof left.distanceKm !== "number" && typeof right.distanceKm === "number") return 1;
      }

      return left.originalIndex - right.originalIndex;
    });
}

function isGeoPoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<GeoPoint>;
  return (
    typeof point.latitude === "number" &&
    typeof point.longitude === "number" &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

export function HomeLocationProvider({ children, restaurants }: { children: ReactNode; restaurants: PublicRestaurantCard[] }) {
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
  const autoRequestStarted = useRef(false);

  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }

    autoRequestStarted.current = true;
    setStatus("detecting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setUserLocation(nextLocation);
        setStatus("detected");
        writeUserLocation(nextLocation);
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, maximumAge: 1000 * 60 * 10, timeout: 6000 },
    );
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const storedLocation = readUserLocation();
      if (storedLocation) {
        setUserLocation(storedLocation);
        setStatus("detected");
        return;
      }

      if (!autoRequestStarted.current) {
        requestLocation();
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [requestLocation]);

  useEffect(() => {
    function handleLocationUpdate(event: Event) {
      const nextLocation = (event as CustomEvent<GeoPoint>).detail;
      if (!isGeoPoint(nextLocation)) return;

      setUserLocation(nextLocation);
      setStatus("detected");
    }

    window.addEventListener(USER_LOCATION_UPDATED_EVENT, handleLocationUpdate);
    return () => window.removeEventListener(USER_LOCATION_UPDATED_EVENT, handleLocationUpdate);
  }, []);

  const closestRestaurant = useMemo(() => {
    return rankRestaurantCards(restaurants, userLocation).find((card) => typeof card.distanceKm === "number") ?? null;
  }, [restaurants, userLocation]);

  const value = useMemo<HomeLocationContextValue>(
    () => ({
      closestRestaurant,
      requestLocation,
      status,
      userLocation,
    }),
    [closestRestaurant, requestLocation, status, userLocation],
  );

  return <HomeLocationContext.Provider value={value}>{children}</HomeLocationContext.Provider>;
}

export function HomeNearbyMobileExplorer({
  businessTypes,
  categories,
  categoria,
  directory,
  q,
  rubro,
  selectedBusinessTypeLabel,
  selectedCategoryLabel,
  ubicacion,
}: {
  businessTypes: PublicBusinessTypeCard[];
  categories: PublicCategoryCard[];
  categoria: string;
  directory: PublicRestaurantCard[];
  q: string;
  rubro: string;
  selectedBusinessTypeLabel: string;
  selectedCategoryLabel: string;
  ubicacion: string;
}) {
  const { userLocation } = useHomeLocation();
  const rankedDirectory = useMemo(() => rankRestaurantCards(directory, userLocation), [directory, userLocation]);
  const title = selectedCategoryLabel || selectedBusinessTypeLabel || (userLocation ? "Mas cercanos para pedir" : "Negocios para pedir");
  const resultLabel = rankedDirectory.length === 1 ? "1 negocio" : `${rankedDirectory.length} negocios`;
  const clearHref = ubicacion ? `/?ubicacion=${encodeURIComponent(ubicacion)}#explorar` : "/#explorar";

  return (
    <div className="lg:hidden">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--accent)]">Explorar</p>
          <h2 className="mt-1 text-2xl font-black leading-tight">Encuentra tu negocio</h2>
        </div>
        {rubro || categoria || q ? (
          <Link className="shrink-0 rounded-full bg-[var(--primary-light)] px-3 py-2 text-xs font-black text-[var(--primary)]" href={clearHref}>
            Limpiar
          </Link>
        ) : null}
      </div>

      <NearbyLocationPanel className="mt-4" scopedRestaurants={rankedDirectory} />

      <div className="public-scrollbar -mx-4 mt-4 overflow-x-auto px-4 pb-2">
        <div className="flex snap-x gap-2 pr-4">
          {businessTypes.map((businessType) => {
            const params = new URLSearchParams();
            if (q) params.set("q", q);
            if (ubicacion) params.set("ubicacion", ubicacion);
            params.set("rubro", businessType.value);
            return <MobileBusinessTypeChip active={rubro === businessType.value} businessType={businessType} href={`/?${params.toString()}#explorar`} key={businessType.value} />;
          })}
        </div>
      </div>

      {rubro ? (
        <div className="mt-4 rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[0_16px_42px_rgb(18_53_91_/_0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-[var(--primary)]">{selectedBusinessTypeLabel || "Rubro seleccionado"}</p>
              <p className="text-xs font-semibold text-[var(--color-secondary-text)]">Elige categoria o mira todos</p>
            </div>
            <Link className="shrink-0 rounded-full bg-[var(--accent)] px-3 py-2 text-xs font-black text-[var(--primary)]" href={clearHref}>
              Todos
            </Link>
          </div>
          {categories.length ? (
            <div className="public-scrollbar -mx-3 mt-3 overflow-x-auto px-3 pb-1">
              <div className="flex snap-x gap-2 pr-3">
                {categories.map((category) => {
                  const params = new URLSearchParams();
                  if (q) params.set("q", q);
                  if (ubicacion) params.set("ubicacion", ubicacion);
                  if (category.businessType) params.set("rubro", category.businessType);
                  params.set("categoria", category.value);
                  return <MobileCategoryChip active={categoria === category.value} category={category} href={`/?${params.toString()}#explorar`} key={category.value} />;
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--accent)]">Resultados</p>
            <h3 className="truncate text-xl font-black">{title}</h3>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--color-surface)] px-3 py-1.5 text-xs font-black text-[var(--color-secondary-text)] ring-1 ring-[var(--border)]">{resultLabel}</span>
        </div>

        {rankedDirectory.length ? (
          <div className="grid gap-2 rounded-[1.35rem] border border-[var(--border)] bg-[var(--color-surface)] p-2">
            {rankedDirectory.map((card) => (
              <MobileRestaurantResult card={card} key={card.restaurant.id} />
            ))}
          </div>
        ) : (
          <Card className="p-5 text-center">
            <p className="text-base font-black">Sin negocios encontrados</p>
            <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">Prueba otro rubro, categoria o busqueda.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

export function HomeNearestBranchSpotlight({ restaurants }: { restaurants: PublicRestaurantCard[] }) {
  const { requestLocation, status, userLocation } = useHomeLocation();
  const rankedRestaurants = useMemo(
    () => rankRestaurantCards(restaurants, userLocation).filter((card) => typeof card.distanceKm === "number"),
    [restaurants, userLocation],
  );
  const closest = rankedRestaurants[0];
  const alternatives = rankedRestaurants.slice(1, 3);
  const isLoading = status === "detecting";

  if (status === "idle") {
    return null;
  }

  if (isLoading) {
    return (
      <div className="rounded-[1.6rem] border border-white/18 bg-white/12 p-4 text-white shadow-[0_20px_55px_rgb(2_10_18_/_0.18)] backdrop-blur lg:rounded-[1.75rem] lg:p-5" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)]">
            <LocateFixed className="h-5 w-5 animate-pulse" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black">Buscando tu sucursal mas cercana</span>
            <span className="mt-2 block h-3 w-52 max-w-full animate-pulse rounded-full bg-white/24" />
            <span className="mt-2 block h-3 w-32 max-w-full animate-pulse rounded-full bg-white/18" />
          </span>
        </div>
      </div>
    );
  }

  if (status === "detected" && closest) {
    const imageSrc = isDisplayImage(closest.restaurant.bannerUrl) ? closest.restaurant.bannerUrl : defaultProductImage;

    return (
      <div className="overflow-hidden rounded-[1.6rem] border border-[var(--accent)]/70 bg-white text-[var(--color-heading)] shadow-[0_24px_70px_rgb(2_10_18_/_0.2)] lg:rounded-[1.85rem]" aria-live="polite">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="grid gap-4 p-4 sm:grid-cols-[72px_minmax(0,1fr)] sm:p-5 lg:p-6">
            <RestaurantLogo card={closest} size="sm" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-black text-[var(--primary)] shadow-[var(--shadow-glow)]">
                  <MapPin className="h-3.5 w-3.5" />
                  {formatDistance(closest.distanceKm ?? 0)}
                </span>
                <span className="rounded-full bg-[var(--primary-light)] px-3 py-1 text-xs font-black text-[var(--primary)]">Mas cercana</span>
              </div>
              <p className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Sucursal recomendada por ubicacion</p>
              <h2 className="mt-1 truncate text-2xl font-black leading-tight sm:text-3xl">{closest.restaurant.name}</h2>
              <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
                {closest.categories.slice(0, 2).join(" | ") || closest.popularProducts.slice(0, 2).join(" | ") || closest.restaurant.city || `${businessCatalogLabelTitle(closest.restaurant.businessType)} disponible`}
              </p>
              {alternatives.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {alternatives.map((card) => (
                    <Link
                      className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--color-surface)] px-3 py-1.5 text-xs font-black text-[var(--color-secondary-text)] ring-1 ring-[var(--border)] transition hover:bg-[var(--primary-light)] hover:text-[var(--primary)]"
                      href={publicRestaurantPath(card.restaurant.slug)}
                      key={card.restaurant.id}
                    >
                      <span className="truncate">{card.restaurant.name}</span>
                      <span className="shrink-0 text-[var(--primary)]">{formatDistance(card.distanceKm ?? 0)}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
                <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-5 text-sm font-black text-white shadow-sm transition hover:bg-[var(--primary-dark)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={publicRestaurantPath(closest.restaurant.slug)}>
                  Pedir en esta sucursal
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-black text-[var(--primary)] shadow-[var(--shadow-glow)] transition hover:bg-[#d9ff22] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href="#restaurantes">
                  Ver cercanos
                </Link>
              </div>
            </div>
          </div>
          <Link className="group relative hidden min-h-full overflow-hidden bg-[var(--primary)] lg:block" href={publicRestaurantPath(closest.restaurant.slug)}>
            <Image alt={closest.restaurant.name} className="object-cover transition duration-500 group-hover:scale-105" fill sizes="220px" src={imageSrc} />
            <span className="absolute inset-0 bg-[linear-gradient(180deg,rgb(8_36_65_/_0.04)_0%,rgb(8_36_65_/_0.44)_100%)]" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[1.6rem] border border-white/16 bg-white/10 p-4 text-white shadow-[0_20px_55px_rgb(2_10_18_/_0.16)] backdrop-blur lg:p-5" aria-live="polite">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <p className="text-sm font-black">{status === "denied" ? "No pudimos usar tu ubicacion" : "Ubicacion no disponible"}</p>
          <p className="mt-1 text-sm font-semibold text-white/72">Puedes activar el permiso para ordenar negocios por metros y kilometros.</p>
        </div>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-black text-[var(--primary)] shadow-[var(--shadow-glow)] transition active:scale-95" onClick={requestLocation} type="button">
          <LocateFixed className="h-4 w-4" />
          Usar ubicacion
        </button>
      </div>
    </div>
  );
}

export function HomeNearbyHighlights({ restaurants }: { restaurants: PublicRestaurantCard[] }) {
  const { userLocation } = useHomeLocation();
  const rankedRestaurants = useMemo(() => rankRestaurantCards(restaurants, userLocation).slice(0, 3), [restaurants, userLocation]);

  if (!rankedRestaurants.length) return null;

  return (
    <section className="hidden gap-3 rounded-[1.75rem] border border-[var(--border)] bg-[var(--color-surface)] p-3 lg:grid lg:grid-cols-3">
      {rankedRestaurants.map((card, index) => (
        <Link className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-[1.25rem] bg-[var(--surface)] p-3 shadow-sm ring-1 ring-[var(--border)] transition hover:-translate-y-0.5 hover:ring-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={publicRestaurantPath(card.restaurant.slug)} key={card.restaurant.id}>
          <RestaurantLogo card={card} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-black">{card.restaurant.name}</span>
            <span className="block truncate text-xs font-semibold text-[var(--color-secondary-text)]">
              {card.isTemporarilyClosed ? "Cerrado temporalmente" : card.categories.slice(0, 2).join(" | ") || card.restaurant.city || `${businessCatalogLabelTitle(card.restaurant.businessType)} disponible`}
            </span>
          </span>
          <span className={cn("grid min-h-8 min-w-8 place-items-center rounded-full px-2 text-xs font-black text-[var(--primary)]", card.isTemporarilyClosed ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]" : "bg-[var(--accent)]")}>
            {card.isTemporarilyClosed ? <AlertTriangle className="h-4 w-4" /> : typeof card.distanceKm === "number" ? formatDistance(card.distanceKm) : index + 1}
          </span>
        </Link>
      ))}
    </section>
  );
}

export function HomeNearbyRestaurantSection({
  directory,
  selectedBusinessTypeLabel,
  selectedCategoryLabel,
}: {
  directory: PublicRestaurantCard[];
  selectedBusinessTypeLabel: string;
  selectedCategoryLabel: string;
}) {
  const { userLocation } = useHomeLocation();
  const rankedDirectory = useMemo(() => rankRestaurantCards(directory, userLocation), [directory, userLocation]);
  const title = selectedCategoryLabel ? `Negocios de ${selectedCategoryLabel}` : selectedBusinessTypeLabel ? selectedBusinessTypeLabel : userLocation ? "Negocios mas cercanos para pedir" : "Negocios para pedir";

  return (
    <section className="hidden space-y-4 lg:block" id="restaurantes">
      <div className="flex items-start justify-between gap-4">
        <SectionHeader eyebrow="Directorio" title={title} />
        <NearbyLocationButton />
      </div>
      <NearbyLocationPanel scopedRestaurants={rankedDirectory} />
      {rankedDirectory.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rankedDirectory.map((card) => (
            <RestaurantCard card={card} key={card.restaurant.id} />
          ))}
        </div>
      ) : (
        <Card className="p-6 text-center">
          <p className="text-lg font-black">Sin negocios encontrados</p>
          <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">Prueba con otra busqueda, rubro o categoria.</p>
        </Card>
      )}
    </section>
  );
}

function NearbyLocationButton() {
  const { requestLocation, status } = useHomeLocation();
  const disabled = status === "detecting";

  return (
    <button
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-black shadow-sm ring-1 ring-[var(--border)] transition active:scale-95",
        status === "detected" ? "bg-[var(--primary-light)] text-[var(--primary)]" : "bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)]",
        disabled && "cursor-wait opacity-75",
      )}
      disabled={disabled}
      onClick={requestLocation}
      type="button"
    >
      <LocateFixed className={cn("h-4 w-4", disabled && "animate-pulse")} />
      {disabled ? "Buscando" : status === "detected" ? "Actualizar ubicacion" : "Usar mi ubicacion"}
    </button>
  );
}

function NearbyLocationPanel({ className, scopedRestaurants }: { className?: string; scopedRestaurants: NearbyRestaurantCard[] }) {
  const { closestRestaurant, requestLocation, status } = useHomeLocation();
  const scopedClosest = scopedRestaurants.find((card) => typeof card.distanceKm === "number") ?? closestRestaurant;
  const isLoading = status === "detecting";

  if (status === "idle") return null;

  if (isLoading) {
    return (
      <div className={cn("rounded-[1.35rem] border border-[var(--border)] bg-[var(--color-card)] p-4 shadow-sm", className)} aria-live="polite">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--primary)]">
            <LocateFixed className="h-5 w-5 animate-pulse" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-[var(--color-heading)]">Buscando negocios cerca de ti</span>
            <span className="mt-2 block h-3 w-40 max-w-full animate-pulse rounded-full bg-[var(--primary-light)]" />
          </span>
        </div>
      </div>
    );
  }

  if (status === "detected" && scopedClosest && typeof scopedClosest.distanceKm === "number") {
    return (
      <div className={cn("grid gap-3 rounded-[1.35rem] border border-[var(--accent)]/70 bg-[linear-gradient(135deg,var(--accent-soft)_0%,var(--surface)_76%)] p-4 shadow-[0_16px_44px_rgb(18_53_91_/_0.08)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center", className)} aria-live="polite">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)]">
            <MapPin className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">Sucursal mas cercana</span>
            <span className="mt-1 block truncate text-base font-black text-[var(--color-heading)]">{scopedClosest.restaurant.name}</span>
            <span className="mt-0.5 block truncate text-sm font-semibold text-[var(--color-secondary-text)]">
              {formatDistance(scopedClosest.distanceKm)}
              {scopedClosest.restaurant.city ? ` de tu ubicacion · ${scopedClosest.restaurant.city}` : " de tu ubicacion"}
            </span>
          </span>
        </div>
        <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[var(--primary-dark)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={publicRestaurantPath(scopedClosest.restaurant.slug)}>
          Pedir aqui
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3 rounded-[1.35rem] border border-[var(--border)] bg-[var(--color-card)] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between", className)} aria-live="polite">
      <div className="min-w-0">
        <p className="text-sm font-black text-[var(--color-heading)]">{status === "denied" ? "Ubicacion sin permiso" : "Ubicacion no disponible"}</p>
        <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">Mostramos los negocios con el orden general.</p>
      </div>
      <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-black text-[var(--primary)] shadow-[var(--shadow-glow)]" onClick={requestLocation} type="button">
        <LocateFixed className="h-4 w-4" />
        Reintentar
      </button>
    </div>
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

function DistancePill({ distanceKm, variant = "card" }: { distanceKm?: number; variant?: "card" | "mini" }) {
  if (typeof distanceKm !== "number") return null;

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full font-black",
        variant === "card" && "bg-[var(--accent)] px-2.5 py-1 text-xs text-[var(--primary)] shadow-[var(--shadow-glow)]",
        variant === "mini" && "bg-[var(--primary-light)] px-2 py-0.5 text-[10px] text-[var(--primary)]",
      )}
    >
      <MapPin className={cn("shrink-0", variant === "card" ? "h-3.5 w-3.5" : "h-3 w-3")} />
      {formatDistance(distanceKm)}
    </span>
  );
}

function MobileBusinessTypeChip({ active, businessType, href }: { active: boolean; businessType: PublicBusinessTypeCard; href: string }) {
  return (
    <Link
      className={cn(
        "flex min-h-12 shrink-0 snap-start items-center gap-2 rounded-full border px-3 text-sm font-black shadow-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]",
        active ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--primary)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--color-heading)]",
      )}
      href={href}
    >
      <span className={cn("grid h-8 w-8 place-items-center rounded-full", active ? "bg-white/65" : "bg-[var(--primary-light)]", businessTypeIconTone(businessType.value))}>
        <BusinessTypeIcon value={businessType.value} />
      </span>
      <span>{businessType.label}</span>
    </Link>
  );
}

function MobileCategoryChip({ active, category, href }: { active: boolean; category: { value: string; label: string; count: number }; href: string }) {
  return (
    <Link
      className={cn(
        "flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full border px-3 text-xs font-black shadow-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]",
        active ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--primary)]" : "border-[var(--border)] bg-white text-[var(--color-heading)]",
      )}
      href={href}
    >
      <span className={cn("grid h-7 w-7 place-items-center rounded-full", active ? "bg-white/65" : categoryIconTone(category.value, category.label))}>
        <CategoryIcon label={category.label} value={category.value} />
      </span>
      <span>{category.label}</span>
      <span className="text-[10px] text-[var(--color-secondary-text)]">{category.count}</span>
    </Link>
  );
}

function MobileRestaurantResult({ card }: { card: NearbyRestaurantCard }) {
  return (
    <Link className="grid grid-cols-[64px_minmax(0,1fr)_36px] items-center gap-3 rounded-[1.05rem] bg-[var(--surface)] p-3 shadow-sm ring-1 ring-[var(--border)] transition hover:-translate-y-0.5 hover:ring-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={publicRestaurantPath(card.restaurant.slug)}>
      <RestaurantLogo card={card} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-black">{card.restaurant.name}</span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--color-secondary-text)]">
          {card.isTemporarilyClosed ? "Cerrado temporalmente" : card.categories.slice(0, 2).join(" | ") || card.restaurant.city || `${businessCatalogLabelTitle(card.restaurant.businessType)} disponible`}
        </span>
        <span className="mt-1 block">
          <DistancePill distanceKm={card.distanceKm} variant="mini" />
        </span>
      </span>
      <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent)] text-[var(--primary)]">
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

function RestaurantCard({ card }: { card: NearbyRestaurantCard }) {
  const imageSrc = isDisplayImage(card.restaurant.bannerUrl) ? card.restaurant.bannerUrl : defaultProductImage;

  return (
    <Link className="group block h-full rounded-[1.35rem] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]" href={publicRestaurantPath(card.restaurant.slug)}>
      <Card className="flex h-full flex-col overflow-hidden p-0 transition group-hover:-translate-y-0.5 group-hover:shadow-md">
        <div className="relative h-44 bg-[var(--primary-light)]">
          <Image alt={card.restaurant.name} className="object-cover" fill sizes="(min-width:1280px) 33vw, (min-width:768px) 50vw, 100vw" src={imageSrc} />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-image-overlay-strong)] via-[var(--color-image-overlay-medium)] to-transparent" />
          <span className="absolute bottom-3 left-3 max-w-[75%] truncate rounded-full bg-white/92 px-3 py-1 text-xs font-black text-[var(--primary)] backdrop-blur">
            {card.categories[0] || card.restaurant.city || `${businessCatalogLabelTitle(card.restaurant.businessType)} disponible`}
          </span>
          {card.currentAnnouncement ? (
            <span className={cn("absolute left-3 top-3 inline-flex max-w-[78%] items-center gap-1 truncate rounded-full px-2.5 py-1 text-xs font-black shadow-sm backdrop-blur", card.isTemporarilyClosed ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]" : "bg-white/92 text-[var(--primary)]")}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{card.isTemporarilyClosed ? "Cerrado hoy" : card.currentAnnouncement.title}</span>
            </span>
          ) : null}
          {typeof card.distanceKm === "number" ? (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-black text-[var(--primary)] shadow-[var(--shadow-glow)]">
              <MapPin className="h-3.5 w-3.5" />
              {formatDistance(card.distanceKm)}
            </span>
          ) : card.orders30d ? (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-black text-[var(--primary)] shadow-[var(--shadow-glow)]">{card.orders30d} pedidos</span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start gap-3">
            <RestaurantLogo card={card} size="sm" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-xl font-black">{card.restaurant.name}</h3>
              <p className="mt-1 truncate text-sm font-semibold text-[var(--color-secondary-text)]">
                {card.isTemporarilyClosed ? card.currentAnnouncement?.title || "Cerrado temporalmente" : card.restaurant.city || card.restaurant.address || publicRestaurantPath(card.restaurant.slug)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <DistancePill distanceKm={card.distanceKm} />
                {card.orders30d ? <span className="inline-flex rounded-full bg-[var(--primary-light)] px-2.5 py-1 text-xs font-black text-[var(--primary)]">{card.orders30d} pedidos</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {card.categories.slice(0, 3).map((category) => (
                  <span className="rounded-full bg-[var(--primary-light)] px-2.5 py-1 text-xs font-black text-[var(--primary)]" key={category}>
                    {category}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {card.currentAnnouncement ? (
            <p className={cn("mt-4 line-clamp-2 min-h-10 text-sm font-semibold", card.isTemporarilyClosed ? "text-[var(--color-warning-strong)]" : "text-[var(--color-secondary-text)]")}>
              {card.currentAnnouncement.body || card.currentAnnouncement.title}
            </p>
          ) : card.popularProducts.length ? (
            <p className="mt-4 line-clamp-2 min-h-10 text-sm font-semibold text-[var(--color-secondary-text)]">Popular: {card.popularProducts.join(", ")}</p>
          ) : (
            <p className="mt-4 min-h-10 text-sm font-semibold text-[var(--color-secondary-text)]">{businessCatalogLabelTitle(card.restaurant.businessType)} activo para revisar y pedir directo.</p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-black text-[var(--color-secondary-text)]">
            <span className="rounded-2xl bg-[var(--color-surface)] p-3 ring-1 ring-[var(--border)]">{card.visits7d} visitas semana</span>
            <span className="rounded-2xl bg-[var(--color-surface)] p-3 ring-1 ring-[var(--border)]">{card.orders30d} pedidos 30d</span>
          </div>
          <span className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-black text-[var(--primary)] shadow-[var(--shadow-glow)] transition group-hover:bg-[#d9ff22]">
            Ver {businessCatalogLabelTitle(card.restaurant.businessType).toLowerCase()}
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </Card>
    </Link>
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
  if (value === "electronics") return <Store className={className} />;
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
  if (text.includes("celular") || text.includes("comput") || text.includes("tech") || text.includes("gaming")) return <Store className={className} />;
  if (text.includes("lavander") || text.includes("imprent") || text.includes("papeler") || text.includes("mensaj")) return <Briefcase className={className} />;

  return <Utensils className={className} />;
}
