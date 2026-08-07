"use client";

import { AlertTriangle, ArrowRight, Bike, CalendarClock, Check, Clock3, CreditCard, Info, MapPin, Minus, MoreVertical, Plus, ReceiptText, Search, Share2, ShoppingCart, Sparkles, Store, UserRound, X } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPublicOrderAction } from "@/app/r/actions";
import { PublicCustomerAccountButton } from "@/components/customer/PublicCustomerAccountButton";
import { GoogleLocationFields } from "@/components/location/GoogleLocationFields";
import { QrPaymentViewer } from "@/components/payments/QrPaymentViewer";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { Button } from "@/components/ui/Button";
import { IllustrationAsset } from "@/components/ui/IllustrationAsset";
import { Input } from "@/components/ui/Input";
import { businessCatalogItemsLabel, businessCatalogLabel } from "@/lib/restaurant-directory-options";
import { customerAccountChangedEvent, fetchPublicCustomerAccount, type PublicCustomerAccount } from "@/lib/client/customer-account";
import { resolveDeliveryPolicy } from "@/lib/delivery-policy";
import { readCart, writeCart } from "@/lib/utils/cart";
import { DEFAULT_RESTAURANT_TIME_ZONE, formatBusinessHour, getBusinessStatus, isLocalDateTimeWithinBusinessHours } from "@/lib/utils/business-hours";
import { cn } from "@/lib/utils/cn";
import { defaultProductImage } from "@/lib/utils/default-images";
import { formatMoney } from "@/lib/utils/money";
import { productAvailabilityLabels } from "@/lib/utils/product-availability";
import { productImageFitStyle, type ProductImageFit } from "@/lib/utils/product-image-fit";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
import { hasQrPaymentConfigured, normalizeQrPaymentUrl } from "@/lib/utils/qr-payment";
import type { Category, Product, ProductConfiguration, ProductOption, ProductOptionGroup, ProductStockAvailability, ProductVariant } from "@/types/product.types";
import type { BusinessHour, Restaurant, RestaurantAnnouncement, RestaurantDeliveryZone, RestaurantSettings } from "@/types/restaurant.types";

type PublicOrderType = "delivery" | "pickup";
type SelectedOptions = Record<string, string[]>;
type ProductConfigMap = Record<string, { variants: ProductVariant[]; optionGroups: ProductOptionGroup[] }>;

type CartItem = {
  cartId: string;
  productId: string;
  variantId?: string;
  optionIds?: string[];
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
  notes?: string;
};

const defaultImage = defaultProductImage;
const dismissedAnnouncementStoragePrefix = "yopido:dismissed-announcement";

function isDisplayImage(value?: string | null) {
  return Boolean(value && (value.startsWith("http") || value.startsWith("/")) && !value.includes("imagendefault"));
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

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function googleMapsSearchUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function formatHeroOpeningLabel(nextOpeningInputValue: string, currentInputValue: string) {
  const [nextDate, nextTime = ""] = nextOpeningInputValue.split("T");
  const [currentDate] = currentInputValue.split("T");
  if (!nextDate || !nextTime) return nextOpeningInputValue.replace("T", " ");

  const current = new Date(`${currentDate}T00:00:00`);
  const next = new Date(`${nextDate}T00:00:00`);
  const days = Math.round((next.getTime() - current.getTime()) / 86400000);
  const time = nextTime.slice(0, 5);
  if (days <= 0) return `hoy a las ${time}`;
  if (days === 1) return `mañana a las ${time}`;
  return `${nextDate.slice(5).replace("-", "/")} a las ${time}`;
}

function businessHoursSummary(hours: BusinessHour[]) {
  const labels = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
  const byDay = new Map(hours.map((hour) => [hour.dayOfWeek, hour]));
  return labels.map((day, index) => ({ day, value: formatBusinessHour(byDay.get(index)) }));
}

export function PublicRestaurantOrderClient({
  restaurant,
  categories,
  products,
  settings,
  businessHours,
  announcements,
  configuration,
  stockAvailability,
  deliveryZones,
  initialOrderOpen = false,
  orderError,
}: {
  restaurant: Restaurant;
  categories: Category[];
  products: Product[];
  settings: RestaurantSettings | null;
  businessHours: BusinessHour[];
  announcements: RestaurantAnnouncement[];
  configuration: ProductConfiguration;
  stockAvailability: ProductStockAvailability[];
  deliveryZones: RestaurantDeliveryZone[];
  initialOrderOpen?: boolean;
  orderError?: string;
}) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [productQuery, setProductQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(initialOrderOpen);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [restaurantMenuOpen, setRestaurantMenuOpen] = useState(false);
  const [restaurantInfoOpen, setRestaurantInfoOpen] = useState(false);
  const [restaurantHoursOpen, setRestaurantHoursOpen] = useState(false);
  const [visibleAnnouncementId, setVisibleAnnouncementId] = useState(() => {
    const firstAnnouncementId = announcements[0]?.id ?? "";
    if (!firstAnnouncementId || typeof window === "undefined") {
      return firstAnnouncementId;
    }

    const dismissedId = window.sessionStorage.getItem(`${dismissedAnnouncementStoragePrefix}:${restaurant.id}`);
    return dismissedId === firstAnnouncementId ? "" : firstAnnouncementId;
  });
  const businessStatus = useMemo(() => getBusinessStatus(businessHours, new Date(), DEFAULT_RESTAURANT_TIME_ZONE), [businessHours]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "qr">("cash");
  const [requiresInvoice, setRequiresInvoice] = useState(false);
  const [fulfillmentMode, setFulfillmentMode] = useState<"now" | "scheduled">(() => (businessStatus.hasSchedule && !businessStatus.isOpen ? "scheduled" : "now"));
  const [orderType, setOrderType] = useState<PublicOrderType>(() => (settings?.pickupEnabled === false && settings?.deliveryEnabled ? "delivery" : "pickup"));
  const activeClosure = announcements.find((announcement) => announcement.type === "closure");
  const visibleAnnouncement = announcements.find((announcement) => announcement.id === visibleAnnouncementId);
  const availabilityLabel = activeClosure
    ? "Cerrado temporalmente"
    : businessStatus.hasSchedule
      ? businessStatus.isOpen
        ? "Abierto ahora"
        : "Cerrado ahora"
      : "Pedidos disponibles";

  const configByProduct = useMemo<ProductConfigMap>(() => {
    const map: ProductConfigMap = {};
    for (const product of products) {
      map[product.id] = {
        variants: configuration.variants.filter((variant) => variant.productId === product.id && variant.isActive),
        optionGroups: configuration.optionGroups
          .filter((group) => group.productId === product.id && group.isActive)
          .map((group) => ({ ...group, options: group.options.filter((option) => option.isActive) })),
      };
    }
    return map;
  }, [configuration.optionGroups, configuration.variants, products]);
  const stockByProduct = useMemo(() => new Map(stockAvailability.map((availability) => [availability.productId, availability])), [stockAvailability]);

  const filteredProducts = useMemo(() => {
    const queryNeedle = normalize(productQuery);
    return products.filter((product) => {
      const matchesCategory = selectedCategory === "all" || product.categoryId === selectedCategory;
      const matchesSearch = !queryNeedle || normalize(`${product.name} ${product.description}`).includes(queryNeedle);
      return matchesCategory && matchesSearch;
    });
  }, [productQuery, products, selectedCategory]);
  const catalogLabel = businessCatalogLabel(restaurant.businessType);
  const catalogItemsLabel = businessCatalogItemsLabel(restaurant.businessType);
  const selectedCategoryName = selectedCategory === "all" ? `Todo el ${catalogLabel}` : (categories.find((category) => category.id === selectedCategory)?.name ?? "Categoria");

  const cartQuantity = cart.reduce((total, item) => total + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const notes = `Pedido desde ${catalogLabel} publico${requiresInvoice ? " - Requiere factura" : ""}`;
  const cartJson = JSON.stringify(cart.map(({ productId, variantId, optionIds, name, price, quantity, notes: itemNotes }) => ({ productId, variantId, optionIds, name, price, quantity, notes: itemNotes })));
  const hasLogoImage = isDisplayImage(restaurant.logoUrl);
  const logoText = initials(restaurant.name) || restaurant.name.slice(0, 1).toUpperCase();
  const heroImage = isDisplayImage(restaurant.bannerUrl) ? restaurant.bannerUrl : defaultImage;
  const heroStatusText = businessStatus.hasSchedule
    ? businessStatus.isOpen
      ? `Abierto hasta las ${businessStatus.todayHours.split(" - ")[1] || businessStatus.todayHours}`
      : `Cerrado · Abre ${formatHeroOpeningLabel(businessStatus.nextOpeningInputValue, businessStatus.currentInputValue)}`
    : availabilityLabel;
  const heroSpecialties = categories.slice(0, 3).map((category) => category.name).filter(Boolean).join(" • ") || restaurant.publicCategory || restaurant.description || catalogLabel;
  const restaurantMapHref = restaurant.mapsUrl || googleMapsSearchUrl([restaurant.name, restaurant.address, restaurant.city].filter(Boolean).join(", "));
  const hourRows = businessHoursSummary(businessHours);
  const hasConfiguredHours = businessHours.some((hour) => !hour.isClosed && hour.opensAt && hour.closesAt);
  const topOrderedProducts = useMemo(() => {
    return products
      .filter((product) => product.orderCount > 0 && (stockByProduct.get(product.id)?.isAvailableHere ?? true))
      .sort((left, right) => right.orderCount - left.orderCount)
      .slice(0, 3);
  }, [products, stockByProduct]);
  const bannerHeightClass = "min-h-[244px] sm:min-h-[286px]";
  const publicBackgroundStyle: CSSProperties = isDisplayImage(restaurant.menuBackgroundImageUrl)
    ? {
        backgroundImage: `linear-gradient(var(--color-menu-background-scrim), var(--color-menu-background-scrim)), url(${restaurant.menuBackgroundImageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {};

  useEffect(() => {
    document.body.classList.add("public-restaurant-order-page");
    return () => document.body.classList.remove("public-restaurant-order-page");
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setCart(readCart(restaurant.slug) as CartItem[]);
      setCartHydrated(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [restaurant.slug]);

  useEffect(() => {
    if (!cartHydrated) {
      return;
    }

    writeCart(cart, {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      restaurantSlug: restaurant.slug,
    });
  }, [cart, cartHydrated, restaurant.id, restaurant.name, restaurant.slug]);

  function addConfiguredProduct(product: Product, variant: ProductVariant | null, selectedOptions: ProductOption[]) {
    const price = product.price + (variant?.priceDelta ?? 0) + selectedOptions.reduce((sum, option) => sum + option.priceDelta, 0);
    const detailParts = [variant?.name, ...selectedOptions.map((option) => option.name)].filter(Boolean);
    const itemNotes = detailParts.length ? detailParts.join(" | ") : undefined;
    const name = variant ? `${product.name} - ${variant.name}` : product.name;
    const cartId = [product.id, variant?.id ?? "base", ...selectedOptions.map((option) => option.id).sort()].join(":");

    setCart((current) => {
      const existing = current.find((item) => item.cartId === cartId);
      if (existing) {
        return current.map((item) => (item.cartId === cartId ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...current, { cartId, productId: product.id, variantId: variant?.id, optionIds: selectedOptions.map((option) => option.id), name, price, quantity: 1, imageUrl: product.imageUrl || defaultImage, notes: itemNotes }];
    });
    setSelectedProduct(null);
  }

  function changeQuantity(cartId: string, delta: number) {
    setCart((current) =>
      current
        .map((item) => (item.cartId === cartId ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0),
    );
  }

  function openDrawer() {
    setDrawerClosing(false);
    setDrawerOpen(true);
  }

  function requestCloseDrawer() {
    setDrawerClosing(true);
    window.setTimeout(() => {
      setDrawerOpen(false);
      setDrawerClosing(false);
    }, 210);
  }

  function closeAnnouncementModal() {
    if (visibleAnnouncement) {
      window.sessionStorage.setItem(`${dismissedAnnouncementStoragePrefix}:${restaurant.id}`, visibleAnnouncement.id);
    }
    setVisibleAnnouncementId("");
  }

  async function shareRestaurant() {
    const shareData = {
      title: restaurant.name,
      text: `Mira el catalogo de ${restaurant.name} en yopido.shop.`,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      await navigator.clipboard.writeText(shareData.url);
      setShareState("copied");
      window.setTimeout(() => setShareState("idle"), 2200);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareState("idle");
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,var(--color-surface)_0%,var(--background)_44%,var(--color-surface)_100%)] text-[var(--text)]" style={publicBackgroundStyle}>
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--color-card-elevated)] text-[var(--text)] shadow-[0_12px_34px_rgb(18_53_91_/_0.08)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:justify-between sm:gap-3 sm:px-6 sm:py-3 lg:px-8">
          <Link className="flex min-w-0 flex-1 items-center sm:flex-none" href={publicRestaurantPath(restaurant.slug)}>
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)] p-1 text-base font-black text-[var(--color-on-primary)] shadow-sm sm:h-12 sm:w-12">
              {hasLogoImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={restaurant.name} className="h-full w-full rounded-full object-cover" src={restaurant.logoUrl} />
              ) : (
                <span className="grid h-full w-full place-items-center rounded-full bg-[var(--primary)] px-2 text-center leading-none">{logoText}</span>
              )}
            </span>
            <span className="ml-2 min-w-0 sm:ml-3">
              <span className="block max-w-[48vw] truncate text-sm font-black text-[var(--text)] min-[390px]:max-w-[56vw] sm:max-w-[260px] sm:text-base">{restaurant.name}</span>
              <span className="mt-0.5 flex max-w-[48vw] items-center gap-1 truncate text-[11px] font-semibold text-[var(--muted)] min-[390px]:max-w-[56vw] sm:max-w-[320px] sm:text-xs">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
                {restaurant.city || restaurant.address || "Menu online"}
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
            <PublicCustomerAccountButton compact tone="surface" />
            <Link aria-label="Rastrear pedido" className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-black text-[var(--primary)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)] sm:h-10 sm:px-3 sm:text-sm" href={publicRestaurantPath(restaurant.slug, "seguimiento")}>
              <ReceiptText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden min-[430px]:inline sm:hidden">Rastrear</span>
              <span className="hidden sm:inline">Rastrear pedido</span>
            </Link>
            <button aria-label="Tu pedido" className="relative inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[var(--text)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)] sm:h-11 sm:px-3" onClick={openDrawer} type="button">
              <ShoppingCart className="h-5 w-5" />
              <span className="hidden text-sm font-black md:inline">Tu pedido</span>
              {cartQuantity ? <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--primary)] text-[10px] font-black text-[var(--color-on-primary)]">{cartQuantity}</span> : null}
            </button>
          </div>
        </div>
      </header>

      {visibleAnnouncement ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-[rgb(8_36_65_/_0.72)] p-4 text-[var(--text)] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={visibleAnnouncement.title} onClick={closeAnnouncementModal}>
          <div className="public-sheet-enter relative w-full max-w-lg overflow-hidden rounded-[1.6rem] border border-white/12 bg-[var(--surface)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <button
              className="absolute right-3 top-3 z-20 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[var(--primary)] shadow-xl ring-1 ring-black/8 transition hover:scale-105 active:scale-95"
              onClick={closeAnnouncementModal}
              type="button"
              aria-label="Cerrar comunicado"
            >
              <X className="h-5 w-5" />
            </button>
            {visibleAnnouncement.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={visibleAnnouncement.title} className="h-56 w-full object-cover sm:h-64" src={visibleAnnouncement.imageUrl} />
            ) : null}
            <div className="p-5 sm:p-6">
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black",
                  visibleAnnouncement.type === "closure" ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]" : "bg-[var(--primary-light)] text-[var(--primary)]",
                )}
              >
                {visibleAnnouncement.type === "closure" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                {visibleAnnouncement.type === "closure" ? "Cierre temporal" : "Comunicado"}
              </span>
              <h2 className="mt-3 pr-10 text-2xl font-black leading-tight text-[var(--text)] sm:text-3xl">{visibleAnnouncement.title}</h2>
              {visibleAnnouncement.body ? <p className="mt-3 text-sm font-semibold leading-6 text-[var(--muted)]">{visibleAnnouncement.body}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl px-3 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-8">
        <section className="min-w-0">
          <div className="relative mb-4 overflow-hidden rounded-[1.55rem] bg-[var(--primary)] shadow-[0_18px_44px_rgb(8_36_65_/_0.16)] sm:mb-5 sm:rounded-[1.85rem]">
            <div className={cn("relative", bannerHeightClass)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={restaurant.name} className="absolute inset-0 h-full w-full object-cover object-center" src={heroImage} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(8_36_65_/_0.05)_0%,rgb(8_36_65_/_0.34)_44%,rgb(18_53_91_/_0.95)_100%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(8_36_65_/_0.68)_0%,rgb(8_36_65_/_0.24)_54%,rgb(8_36_65_/_0.06)_100%)]" />
              <div className="absolute left-3 right-3 top-3 z-20 flex items-center justify-between gap-3 sm:left-4 sm:right-4">
                <Link className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-[#12355B]/62 text-white shadow-lg backdrop-blur-md transition hover:bg-[#12355B]/78 sm:h-11 sm:w-11" href="/">
                  <ArrowRight className="h-[18px] w-[18px] rotate-180" />
                </Link>
                <div className="flex items-center gap-2">
                  <button aria-label="Mas opciones" className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-[#12355B]/62 text-white shadow-lg backdrop-blur-md transition hover:bg-[#12355B]/78 sm:h-11 sm:w-11" onClick={() => setRestaurantMenuOpen(true)} type="button">
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className={cn("relative z-10 flex max-w-3xl flex-col justify-end px-4 pb-4 pt-16 text-white sm:px-6 sm:pb-5 sm:pt-18", bannerHeightClass)}>
                <div className="mb-2 flex max-w-full flex-col items-start gap-1.5 sm:mb-3">
                  <a className="inline-flex max-w-[72%] items-center gap-1.5 rounded-full border border-white/10 bg-[#12355B]/58 px-2.5 py-1.5 text-[11px] font-black text-white shadow-sm backdrop-blur-md sm:text-xs" href={restaurantMapHref} rel="noreferrer" target="_blank">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{restaurant.city || "Ver mapa"}</span>
                  </a>
                  <button className="inline-flex max-w-[92%] items-center gap-2 rounded-full border border-white/14 bg-[#12355B]/72 px-3 py-1.5 text-[11px] font-black text-white shadow-sm backdrop-blur-md sm:text-xs" onClick={() => setRestaurantHoursOpen(true)} type="button">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", businessStatus.hasSchedule && !businessStatus.isOpen ? "bg-[var(--color-danger-strong)]" : "bg-[var(--accent)]")} />
                    <span className="truncate">{heroStatusText}</span>
                  </button>
                </div>
                <h1 className="max-w-[16ch] text-[2rem] font-black leading-[1.02] drop-shadow-[0_2px_14px_rgb(0_0_0_/_0.28)] min-[390px]:text-[2.25rem] sm:max-w-2xl sm:text-5xl">{restaurant.name}</h1>
                <p className="mt-1.5 line-clamp-1 max-w-[30rem] text-sm font-bold leading-5 text-white/78 drop-shadow-sm sm:text-base">{heroSpecialties}</p>
                <div className="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 border-t border-white/18 pt-3 text-white sm:mt-4 sm:gap-3">
                  <HeroStat icon={<Clock3 className="h-[18px] w-[18px] text-[var(--accent)]" />} label="Entrega estimada" value="Segun zona" />
                  <span className="h-8 w-px bg-white/22" />
                  <HeroStat icon={<Bike className="h-[18px] w-[18px] text-[var(--accent)]" />} label="Disponible" value="Delivery" />
                  <span className="h-8 w-px bg-white/22" />
                  <HeroStat icon={<Store className="h-[18px] w-[18px] text-[var(--accent)]" />} label="Mas vendidos" value={`${products.length} ${catalogItemsLabel}`} />
                </div>
              </div>
              <div className="hidden" aria-hidden="true" />
            </div>
          </div>

          {topOrderedProducts.length > 1 ? (
            <div className="mb-4 rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[0_14px_34px_rgb(18_53_91_/_0.07)] sm:rounded-[1.65rem] sm:p-4 sm:shadow-[0_18px_48px_rgb(18_53_91_/_0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-[var(--primary)]">Mas pedidos</p>
                  <h2 className="text-lg font-black sm:text-xl">Lo que mas eligen</h2>
                </div>
              </div>
              <div className="-mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0">
                {topOrderedProducts.map((product) => (
                  <button className="grid min-w-[82%] snap-start grid-cols-[66px_1fr_38px] items-center gap-3 rounded-[1.1rem] bg-[var(--color-surface)] p-2 text-left shadow-sm ring-1 ring-[var(--border)] transition hover:-translate-y-0.5 hover:bg-[var(--accent-soft)] sm:min-w-0 sm:grid-cols-[78px_1fr_auto] sm:rounded-[1.25rem]" key={product.id} onClick={() => setSelectedProduct(product)} type="button">
                    <ProductVisual className="h-16 w-[66px] rounded-[0.95rem] sm:h-20 sm:w-[78px] sm:rounded-[1.1rem]" fit={product} name={product.name} src={product.imageUrl} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black">{product.name}</span>
                      <span className="block text-xs font-bold text-[var(--muted)]">{product.orderCount} pedidos</span>
                    </span>
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent)] text-[var(--primary)] sm:h-10 sm:w-10">
                      <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mb-4">
            <label className="flex min-h-14 items-center gap-3 rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface)] px-4 shadow-[0_18px_48px_rgb(18_53_91_/_0.08)] transition focus-within:border-[var(--primary)] focus-within:ring-4 focus-within:ring-[var(--accent-ring)]">
              <Search className="h-5 w-5 text-[var(--muted)]" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm font-black outline-none placeholder:text-[var(--color-placeholder)]"
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Busca productos o combos"
                value={productQuery}
              />
              {productQuery ? (
                <button className="grid h-9 w-9 place-items-center rounded-full bg-[var(--primary)] text-white" onClick={() => setProductQuery("")} type="button">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </label>
          </div>

          <div className="sticky top-[73px] z-20 -mx-3 mb-4 border-y border-[var(--border)] bg-[var(--color-card-elevated)] px-3 py-2.5 shadow-sm backdrop-blur sm:mx-0 sm:rounded-[1.5rem] sm:border sm:py-3" id="menu">
            <div className="flex snap-x gap-2 overflow-x-auto pb-1">
              <CategoryButton active={selectedCategory === "all"} label="Todo" onClick={() => setSelectedCategory("all")} />
              {categories.map((category) => (
                <CategoryButton active={selectedCategory === category.id} key={category.id} label={category.name} onClick={() => setSelectedCategory(category.id)} />
              ))}
            </div>
          </div>

          {selectedCategory !== "all" ? (
            <div className="public-sheet-enter mb-4 rounded-[1.5rem] border border-[var(--border)] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dark)_100%)] p-4 text-[var(--color-on-primary)] shadow-[var(--shadow-card)]">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--accent)]">Categoria activa</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-black">{selectedCategoryName}</h2>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-on-primary-muted)]">{filteredProducts.length} productos disponibles</p>
                </div>
                <button className="shrink-0 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-black text-[var(--primary)]" onClick={() => setSelectedCategory("all")} type="button">
                  Ver todo
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {filteredProducts.map((product) => (
              <ProductTile availability={stockByProduct.get(product.id)} config={configByProduct[product.id]} key={product.id} onSelect={() => setSelectedProduct(product)} product={product} />
            ))}
          </div>

          {!filteredProducts.length ? <div className="rounded-[1.5rem] bg-[var(--surface)] p-6 text-center text-sm font-semibold text-[var(--muted)] ring-1 ring-[var(--border)]">
              <IllustrationAsset className="mx-auto max-w-[190px]" name="emptyCart" sizes="190px" />
              <p className="mt-3 font-black text-[var(--text)]">No hay productos disponibles</p>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Prueba con otra categoria o vuelve a ver todo el {catalogLabel}.</p>
            </div> : null}
        </section>
      </div>

      <button className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 flex min-h-14 items-center justify-between gap-3 rounded-[1.15rem] bg-[var(--primary)] px-3.5 py-2.5 text-left text-sm font-black text-[var(--color-on-primary)] shadow-2xl ring-1 ring-[var(--color-on-primary-border-strong)] lg:hidden" onClick={openDrawer} type="button">
        <span className="inline-flex min-w-0 items-center gap-3">
          <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-[var(--primary)] shadow-sm">
            <ShoppingCart className="h-5 w-5" />
            {cartQuantity ? <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--color-success-strong)] text-[10px] text-[var(--color-on-primary)]">{cartQuantity}</span> : null}
          </span>
          <span className="min-w-0">
            <span className="block truncate">{cartQuantity ? "Ver pedido" : "Tu pedido"}</span>
            <span className="block text-xs font-semibold text-[var(--color-on-primary-muted)]">{cartQuantity ? `${cartQuantity} producto${cartQuantity === 1 ? "" : "s"}` : "Carrito vacio"}</span>
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-sm text-[var(--primary)]">
          {formatMoney(total)}
          <ArrowRight className="h-4 w-4" />
        </span>
      </button>

      {restaurantMenuOpen ? (
        <RestaurantMenuSheet
          onClose={() => setRestaurantMenuOpen(false)}
          onInfo={() => {
            setRestaurantMenuOpen(false);
            setRestaurantInfoOpen(true);
          }}
          onReport={() => {
            setRestaurantMenuOpen(false);
            window.alert("Gracias. Revisaremos este local con el equipo de Yopido.");
          }}
          onShare={() => {
            setRestaurantMenuOpen(false);
            void shareRestaurant();
          }}
          onShowHours={() => {
            setRestaurantMenuOpen(false);
            setRestaurantHoursOpen(true);
          }}
          shareState={shareState}
        />
      ) : null}

      {restaurantInfoOpen ? <RestaurantInfoDialog mapHref={restaurantMapHref} onClose={() => setRestaurantInfoOpen(false)} restaurant={restaurant} /> : null}

      {restaurantHoursOpen ? (
        <RestaurantHoursDialog
          hasConfiguredHours={hasConfiguredHours}
          hourRows={hourRows}
          onClose={() => setRestaurantHoursOpen(false)}
          statusText={businessStatus.hasSchedule ? heroStatusText : availabilityLabel}
        />
      ) : null}

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-x-hidden bg-[var(--color-overlay)] px-2 pb-2 pt-16 backdrop-blur-sm sm:items-center sm:p-4" onClick={requestCloseDrawer}>
          <div className={cn("max-h-[min(92dvh,820px)] w-full max-w-[min(100%,620px)] overflow-hidden rounded-t-[2rem] bg-[var(--surface)] text-[var(--text)] shadow-2xl sm:rounded-[2rem]", drawerClosing ? "public-sheet-exit" : "public-sheet-enter")} data-order-sheet onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--color-card-elevated)] px-4 py-4 backdrop-blur">
              <div>
                <h2 className="min-w-0 truncate text-xl font-black sm:text-2xl">Tu pedido</h2>
                <p className="text-sm font-semibold text-[var(--muted)]">{cartQuantity} item{cartQuantity === 1 ? "" : "s"}</p>
              </div>
              <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-neutral-100)]" onClick={requestCloseDrawer} type="button">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[calc(min(92dvh,760px)-68px)] overflow-x-hidden overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
              <PublicOrderPanel
                cart={cart}
                cartJson={cartJson}
                changeQuantity={changeQuantity}
                compact
                notes={notes}
                orderError={orderError}
                orderType={orderType}
                paymentMethod={paymentMethod}
                fulfillmentMode={fulfillmentMode}
                requiresInvoice={requiresInvoice}
                restaurant={restaurant}
                deliveryZones={deliveryZones}
                businessHours={businessHours}
                businessStatus={businessStatus}
                activeClosure={activeClosure}
                setOrderType={setOrderType}
                setPaymentMethod={setPaymentMethod}
                setFulfillmentMode={setFulfillmentMode}
                setRequiresInvoice={setRequiresInvoice}
                settings={settings}
                total={total}
              />
            </div>
          </div>
        </div>
      ) : null}

      {selectedProduct ? <ProductOptionModal config={configByProduct[selectedProduct.id]} onAdd={addConfiguredProduct} onClose={() => setSelectedProduct(null)} product={selectedProduct} /> : null}
    </main>
  );
}

function HeroStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
      <span className="grid h-6 w-6 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-black leading-4 text-white sm:text-sm">{value}</span>
        <span className="block truncate text-[10px] font-semibold leading-3 text-white/70 sm:text-xs">{label}</span>
      </span>
    </div>
  );
}

function RestaurantMenuSheet({
  onClose,
  onInfo,
  onReport,
  onShare,
  onShowHours,
  shareState,
}: {
  onClose: () => void;
  onInfo: () => void;
  onReport: () => void;
  onShare: () => void;
  onShowHours: () => void;
  shareState: "idle" | "copied";
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-[var(--color-overlay)] backdrop-blur-sm sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Opciones del local">
      <button className="absolute inset-0" onClick={onClose} type="button" aria-label="Cerrar opciones" />
      <div className="relative w-full rounded-t-[1.7rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl sm:max-w-md sm:rounded-[1.7rem]">
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--border)] sm:hidden" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">Local</p>
            <h2 className="text-2xl font-black text-[var(--text)]">Opciones</h2>
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-[var(--color-surface)] text-[var(--primary)]" onClick={onClose} type="button" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          <RestaurantMenuRow icon={<Clock3 className="h-5 w-5" />} onClick={onShowHours} text="Ver horarios de atencion" />
          <RestaurantMenuRow icon={<Info className="h-5 w-5" />} onClick={onInfo} text="Informacion del local" />
          <RestaurantMenuRow icon={shareState === "copied" ? <Check className="h-5 w-5" /> : <Share2 className="h-5 w-5" />} onClick={onShare} text={shareState === "copied" ? "Enlace copiado" : "Compartir"} />
          <RestaurantMenuRow icon={<AlertTriangle className="h-5 w-5" />} onClick={onReport} text="Reportar local" />
        </div>
      </div>
    </div>
  );
}

function RestaurantMenuRow({ icon, onClick, text }: { icon: ReactNode; onClick: () => void; text: string }) {
  return (
    <button className="flex min-h-14 items-center gap-3 rounded-[1.1rem] border border-[var(--border)] bg-[var(--color-surface)] px-3 text-left font-black text-[var(--text)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-light)]" onClick={onClick} type="button">
      <span className="grid h-10 w-10 place-items-center rounded-[0.9rem] bg-[var(--primary-light)] text-[var(--primary)]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <ArrowRight className="h-4 w-4 text-[var(--primary)]" />
    </button>
  );
}

function RestaurantInfoDialog({ mapHref, onClose, restaurant }: { mapHref: string; onClose: () => void; restaurant: Restaurant }) {
  return (
    <div className="fixed inset-0 z-[85] flex items-end bg-[var(--color-overlay)] backdrop-blur-sm sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Informacion del local">
      <button className="absolute inset-0" onClick={onClose} type="button" aria-label="Cerrar informacion" />
      <div className="relative w-full rounded-t-[1.7rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl sm:max-w-md sm:rounded-[1.7rem]">
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--border)] sm:hidden" />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">Informacion</p>
            <h2 className="truncate text-2xl font-black text-[var(--text)]">{restaurant.name}</h2>
          </div>
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-surface)] text-[var(--primary)]" onClick={onClose} type="button" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          <div className="rounded-[1.1rem] border border-[var(--border)] bg-[var(--color-surface)] p-3">
            <p className="text-xs font-black uppercase text-[var(--muted)]">Ubicacion</p>
            <p className="mt-1 text-sm font-bold leading-5 text-[var(--text)]">{[restaurant.address, restaurant.city].filter(Boolean).join(", ") || "Ubicacion disponible en mapa"}</p>
          </div>
          <div className="rounded-[1.1rem] border border-[var(--border)] bg-[var(--color-surface)] p-3">
            <p className="text-xs font-black uppercase text-[var(--muted)]">Categoria</p>
            <p className="mt-1 text-sm font-bold leading-5 text-[var(--text)]">{restaurant.publicCategory || restaurant.description || "Local en Yopido"}</p>
          </div>
        </div>
        <a className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-[1rem] bg-[var(--accent)] px-4 text-sm font-black text-[var(--primary)]" href={mapHref} rel="noreferrer" target="_blank">
          <MapPin className="h-5 w-5" />
          Ver ubicacion en mapa
        </a>
      </div>
    </div>
  );
}

function RestaurantHoursDialog({
  hasConfiguredHours,
  hourRows,
  onClose,
  statusText,
}: {
  hasConfiguredHours: boolean;
  hourRows: { day: string; value: string }[];
  onClose: () => void;
  statusText: string;
}) {
  return (
    <div className="fixed inset-0 z-[85] flex items-end bg-[var(--color-overlay)] backdrop-blur-sm sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Horarios de atencion">
      <button className="absolute inset-0" onClick={onClose} type="button" aria-label="Cerrar horarios" />
      <div className="relative w-full rounded-t-[1.7rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl sm:max-w-md sm:rounded-[1.7rem]">
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--border)] sm:hidden" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">Horarios</p>
            <h2 className="text-2xl font-black text-[var(--text)]">Atencion del negocio</h2>
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-[var(--color-surface)] text-[var(--primary)]" onClick={onClose} type="button" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 rounded-[1.1rem] border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm font-black text-[var(--primary)]">{statusText}</div>
        {hasConfiguredHours ? (
          <div className="mt-3 grid gap-2">
            {hourRows.map((row) => (
              <div className="flex min-h-10 items-center justify-between gap-3 rounded-[0.95rem] border border-[var(--border)] bg-[var(--color-surface)] px-3 text-sm font-black" key={row.day}>
                <span className="text-[var(--primary)]">{row.day}</span>
                <span className={cn("text-[var(--text)]", row.value === "Cerrado" && "text-[var(--muted)]")}>{row.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-[1rem] bg-[var(--color-surface)] p-3 text-sm font-semibold text-[var(--muted)]">El negocio aun no guardo sus horarios. Por ahora permitimos pedidos.</p>
        )}
      </div>
    </div>
  );
}

function OrderErrorMessage({ error }: { error: string }) {
  const message =
    error === "rate-limit"
      ? "Se enviaron demasiados pedidos en pocos minutos. Espera un momento antes de intentar nuevamente."
      : error === "qr-required-distance"
      ? "Por la distancia de entrega, este pedido requiere pago QR con comprobante."
      : error === "different-city"
        ? "El delivery solo esta disponible dentro de la misma ciudad del restaurante."
      : error === "delivery-location"
          ? "Marca la ubicacion exacta para calcular la distancia del envio."
      : error === "minimum"
        ? "El pedido no alcanza el monto minimo configurado por el restaurante."
        : error === "disabled"
          ? "La modalidad elegida no esta disponible en este restaurante."
          : error === "settings"
            ? "El restaurante todavia no termino de configurar la recepcion de pedidos."
      : error === "receipt-required"
        ? "Para pago QR debes subir el comprobante antes de confirmar."
        : error === "qr-unavailable"
          ? "Este restaurante todavia no tiene QR configurado. Elige pago en efectivo."
          : error === "temporarily-closed"
            ? "El restaurante esta cerrado temporalmente y no esta recibiendo pedidos."
          : error === "outside-hours"
            ? "El restaurante esta fuera de horario. Programa el pedido dentro del horario de atencion."
            : error === "no-open-cash"
              ? "El restaurante no tiene caja abierta para pedidos inmediatos. Puedes programar el pedido dentro del horario de atencion."
              : error === "scheduled-not-available"
                ? "Los pedidos programados solo estan disponibles para recojo o envio."
            : error === "schedule-past"
              ? "La hora programada debe ser posterior a la hora actual."
              : error === "invoice-disabled"
                ? "Este restaurante no tiene factura habilitada para pedidos publicos."
                : error === "delivery-address"
                  ? "Para delivery debes registrar una direccion de entrega."
                  : error === "invalid-restaurant"
                    ? "La tienda ya no esta disponible para recibir pedidos."
                    : error === "invalid-table"
                      ? "La mesa no esta disponible o no pertenece a esta tienda."
                  : error === "invoice"
                    ? "Completa los datos de factura para confirmar el pedido."
                    : error === "product-not-found"
                      ? "Uno de los productos ya no esta disponible. Actualiza el catalogo e intenta nuevamente."
                      : error === "product-configuration"
                        ? "Uno de los productos necesita opciones validas. Vuelve a agregarlo al pedido."
                        : error === "service-role-required"
                          ? "Falta una configuracion segura del servidor para recibir pedidos."
                          : "No se pudo confirmar el pedido. Revisa los datos e intenta nuevamente.";

  return <div className="rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm font-bold text-[var(--color-danger-strong)] md:col-span-2">{message}</div>;
}

function ProductVisual({ fit, name, src, className }: { fit?: ProductImageFit; name: string; src?: string | null; className?: string }) {
  if (isDisplayImage(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt={name} className={cn("object-cover", className)} src={src ?? undefined} style={productImageFitStyle(fit)} />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={name} className={cn("object-cover", className)} src={defaultImage} />
  );
}

function CategoryButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={cn("h-11 shrink-0 snap-start rounded-full px-4 text-sm font-black transition", active ? "bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)]" : "bg-[var(--primary-light)] text-[var(--muted)] hover:text-[var(--primary-dark)]")} onClick={onClick} type="button">
      {label}
    </button>
  );
}

function ProductTile({ product, config, availability, onSelect }: { product: Product; config?: ProductConfigMap[string]; availability?: ProductStockAvailability; onSelect: () => void }) {
  const hasConfiguration = Boolean(config?.variants.length || config?.optionGroups.length);
  const isStockAvailable = availability?.isAvailableHere ?? true;
  const firstAlternative = availability?.alternatives[0];
  const availabilityLabels = productAvailabilityLabels(product);

  function selectFromTile(eventTarget: EventTarget | null) {
    if (!isStockAvailable) {
      return;
    }

    if (eventTarget instanceof HTMLElement && eventTarget.closest("a,button")) {
      return;
    }

    onSelect();
  }

  return (
    <div
      aria-disabled={!isStockAvailable}
      className={cn("grid grid-cols-[92px_minmax(0,1fr)_42px] items-center gap-2.5 rounded-[1.15rem] border border-[var(--border)] bg-[var(--surface)] p-2 text-left text-[var(--text)] shadow-[0_12px_32px_rgb(18_53_91_/_0.07)] transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)] sm:grid-cols-[132px_minmax(0,1fr)_52px] sm:gap-3 sm:rounded-[1.35rem] sm:shadow-[0_18px_48px_rgb(18_53_91_/_0.08)]", isStockAvailable ? "cursor-pointer hover:-translate-y-0.5 hover:bg-[var(--accent-soft)] hover:shadow-[0_22px_56px_rgb(18_53_91_/_0.12)]" : "opacity-80")}
      onClick={(event) => selectFromTile(event.target)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectFromTile(event.target);
        }
      }}
      role={isStockAvailable ? "button" : undefined}
      tabIndex={isStockAvailable ? 0 : undefined}
    >
      <span className="relative h-24 overflow-hidden rounded-[1rem] bg-[var(--primary-light)] sm:h-32 sm:rounded-[1.2rem]">
        <ProductVisual className="h-full w-full" fit={product} name={product.name} src={product.imageUrl} />
        {product.isAutoFeatured || product.isFeatured ? <span className="absolute left-2 top-2 rounded-full bg-[var(--accent)] px-2 py-1 text-[10px] font-black text-[var(--primary)]">Top</span> : null}
        {!isStockAvailable ? <span className="absolute inset-x-2 bottom-2 rounded-full bg-[var(--color-danger)] px-2 py-1 text-center text-[10px] font-black text-white">Agotado aqui</span> : null}
      </span>
      <span className="min-w-0 py-1">
        <span className="flex flex-wrap items-center gap-1.5">
          {hasConfiguration ? <span className="rounded-full bg-[var(--primary-light)] px-2 py-1 text-[10px] font-black text-[var(--primary-dark)]">Personalizable</span> : null}
          {product.isPromotion ? <span className="rounded-full bg-[var(--color-warning-soft)] px-2 py-1 text-[10px] font-black text-[var(--color-warning-strong)]">Promo</span> : null}
        </span>
        <span className="mt-1 block line-clamp-2 text-base font-black leading-5 sm:text-lg">{product.name}</span>
        <span className="mt-1 hidden line-clamp-2 text-sm leading-5 text-[var(--muted)] min-[420px]:block">{product.description || "Listo para pedir."}</span>
        {availabilityLabels.length ? (
          <span className="mt-2 flex flex-wrap gap-1.5">
            {availabilityLabels.slice(0, 2).map((label) => (
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--primary-light)] px-2 py-1 text-[10px] font-black text-[var(--primary-dark)]" key={label}>
                <CalendarClock className="h-3 w-3 shrink-0" />
                <span className="truncate">{label}</span>
              </span>
            ))}
          </span>
        ) : null}
        <span className="mt-2 flex items-center gap-2 text-sm font-black sm:mt-3 sm:gap-3">
          {product.orderCount ? <span className="hidden items-center gap-1 rounded-full bg-[var(--primary-light)] px-2 py-1 text-[var(--primary)] min-[420px]:inline-flex">{product.orderCount} pedidos</span> : null}
          <span className="inline-flex items-baseline gap-2 text-base text-[var(--primary)]">
            {formatMoney(product.price)}
            {product.compareAtPrice ? <span className="text-xs font-bold text-[var(--muted)] line-through">{formatMoney(product.compareAtPrice)}</span> : null}
          </span>
        </span>
        {!isStockAvailable ? (
          <span className="mt-2 block rounded-xl bg-[var(--color-warning-soft)] px-3 py-2 text-xs font-black text-[var(--color-warning-strong)]">
            {firstAlternative ? (
              <>
                Disponible en{" "}
                <Link className="underline" href={publicRestaurantPath(firstAlternative.restaurantSlug)}>
                  {firstAlternative.restaurantName}
                </Link>
              </>
            ) : (
              "Sin stock en esta sucursal"
            )}
          </span>
        ) : null}
      </span>
      <button aria-disabled={!isStockAvailable} className={cn("grid h-10 w-10 place-items-center rounded-full shadow-[var(--shadow-glow)] sm:h-12 sm:w-12", isStockAvailable ? "bg-[var(--accent)] text-[var(--primary)]" : "bg-[var(--color-neutral-100)] text-[var(--muted)]")} disabled={!isStockAvailable} onClick={onSelect} type="button">
        <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
      </button>
    </div>
  );
}

function ProductOptionModal({
  product,
  config,
  onClose,
  onAdd,
}: {
  product: Product;
  config?: ProductConfigMap[string];
  onClose: () => void;
  onAdd: (product: Product, variant: ProductVariant | null, selectedOptions: ProductOption[]) => void;
}) {
  const variants = config?.variants ?? [];
  const optionGroups = config?.optionGroups ?? [];
  const [variantId, setVariantId] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<SelectedOptions>(() => {
    const initial: SelectedOptions = {};
    for (const group of optionGroups) {
      initial[group.id] = group.isRequired && group.maxChoices === 1 && group.options[0] ? [group.options[0].id] : [];
    }
    return initial;
  });
  const [isClosing, setIsClosing] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");

  const selectedVariant = variants.find((variant) => variant.id === variantId) ?? null;
  const flatOptions = optionGroups.flatMap((group) => group.options);
  const chosenOptions = Object.values(selectedOptions)
    .flat()
    .map((optionId) => flatOptions.find((option) => option.id === optionId))
    .filter((option): option is ProductOption => Boolean(option));
  const total = product.price + (selectedVariant?.priceDelta ?? 0) + chosenOptions.reduce((sum, option) => sum + option.priceDelta, 0);
  const canAdd = (!variants.length || Boolean(selectedVariant)) && optionGroups.every((group) => (selectedOptions[group.id]?.length ?? 0) >= group.minChoices);
  const totalLabel = variants.length && !selectedVariant ? `Desde ${formatMoney(product.price)}` : formatMoney(total);
  const availabilityLabels = productAvailabilityLabels(product);

  function toggleOption(group: ProductOptionGroup, option: ProductOption) {
    setSelectedOptions((current) => {
      const currentGroup = current[group.id] ?? [];
      const exists = currentGroup.includes(option.id);
      if (group.maxChoices === 1) {
        return { ...current, [group.id]: exists && !group.isRequired ? [] : [option.id] };
      }
      if (exists) {
        return { ...current, [group.id]: currentGroup.filter((id) => id !== option.id) };
      }
      if (currentGroup.length >= group.maxChoices) {
        return { ...current, [group.id]: [...currentGroup.slice(1), option.id] };
      }
      return { ...current, [group.id]: [...currentGroup, option.id] };
    });
  }

  function requestClose() {
    setIsClosing(true);
    window.setTimeout(onClose, 210);
  }

  async function shareProduct() {
    if (typeof window === "undefined") {
      return;
    }

    const shareUrl = window.location.href;
    const shareText = `${product.name} - ${formatMoney(total)}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, text: shareText, url: shareUrl });
        return;
      }

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setShareState("copied");
        window.setTimeout(() => setShareState("idle"), 1400);
      }
    } catch {
      setShareState("idle");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-[var(--color-overlay)] p-0 text-[var(--text)] backdrop-blur-sm sm:place-items-center sm:p-4" onClick={requestClose}>
      <div className={cn("relative isolate max-h-[94dvh] w-full overflow-y-auto overscroll-contain rounded-t-[2rem] bg-[var(--surface)] shadow-2xl sm:max-h-[94vh] sm:max-w-3xl sm:rounded-[2rem]", isClosing ? "public-sheet-exit" : "public-sheet-enter")} onClick={(event) => event.stopPropagation()}>
        <div className="relative z-0 h-72 overflow-hidden bg-[var(--primary)] sm:h-80">
          <ProductVisual className="pointer-events-none h-full w-full" fit={product} name={product.name} src={product.imageUrl} />
          <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/42 to-transparent" />
          <div className="pointer-events-none absolute left-4 right-4 top-[calc(1rem+env(safe-area-inset-top))] z-40 flex items-center justify-between">
            <button aria-label="Volver" className="pointer-events-auto grid h-12 w-12 shrink-0 touch-manipulation place-items-center rounded-full bg-white text-[var(--primary)] shadow-xl transition hover:scale-105 active:scale-95" data-product-modal-close="" onClick={requestClose} type="button">
              <ArrowRight className="h-5 w-5 rotate-180" />
            </button>
            <div className="flex items-center gap-2">
              <button aria-label="Compartir producto" className="pointer-events-auto grid h-12 w-12 shrink-0 touch-manipulation place-items-center rounded-full bg-white text-[var(--primary)] shadow-xl transition hover:scale-105 active:scale-95" data-product-modal-share="" onClick={shareProduct} type="button">
                {shareState === "copied" ? <Check className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="relative z-20 -mt-8 grid gap-5 rounded-t-[2rem] bg-[var(--surface)] p-4 sm:p-6">
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase text-[var(--primary)]">Personalizar</p>
              <h2 className="mt-1 text-3xl font-black leading-tight">{product.name}</h2>
              <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-[var(--muted)]">{product.description || "Elige las opciones y agrega este producto a tu pedido."}</p>
              {availabilityLabels.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {availabilityLabels.map((label) => (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-light)] px-2.5 py-1 text-[11px] font-black text-[var(--primary-dark)]" key={label}>
                      <CalendarClock className="h-3.5 w-3.5" />
                      {label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 border-y border-[var(--border)] py-3 text-center text-xs font-bold text-[var(--muted)]">
            <span>
              <strong className="block text-sm text-[var(--text)]">{Math.max(variants.length, 1)}</strong>
              {variants.length === 1 ? "Variante" : "Variantes"}
            </span>
            <span>
              <strong className="block text-sm text-[var(--text)]">{optionGroups.length}</strong>
              Personalizaciones
            </span>
            <span>
              <strong className="block text-sm text-[var(--text)]">{formatMoney(product.price)}</strong>
              {product.compareAtPrice ? <span className="line-through">{formatMoney(product.compareAtPrice)}</span> : "Base"}
            </span>
          </div>
          {variants.length ? (
            <section>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-black">Variante</h3>
                {!selectedVariant ? <span className="rounded-full bg-[var(--color-warning-soft)] px-3 py-1 text-xs font-black text-[var(--color-warning-strong)]">Elige una</span> : null}
              </div>
              <div className="mt-2 grid gap-2">
                {variants.map((variant) => (
                  <button className={cn("flex min-h-14 items-center justify-between rounded-2xl border px-4 text-left transition", variantId === variant.id ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary-dark)]" : "border-[var(--border)] bg-[var(--surface)]")} key={variant.id} onClick={() => setVariantId((current) => (current === variant.id ? "" : variant.id))} type="button">
                    <span>
                      <span className="block text-sm font-black">{variant.name}</span>
                      {variant.description ? <span className="block text-xs font-semibold text-[var(--muted)]">{variant.description}</span> : null}
                    </span>
                    <span className="text-sm font-black">{variant.priceDelta > 0 ? `+ ${formatMoney(variant.priceDelta)}` : "Incluido"}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {optionGroups.map((group) => {
            const selectedCount = selectedOptions[group.id]?.length ?? 0;
            return (
              <section className="rounded-[1.25rem] border border-[var(--border)] p-3" key={group.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black">{group.name}</h3>
                    <p className="text-xs font-semibold text-[var(--muted)]">
                      {group.isRequired ? "Obligatorio" : "Opcional"} | elige {group.minChoices}-{group.maxChoices}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-3 py-1 text-xs font-black", selectedCount >= group.minChoices ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]")}>
                    {selectedCount}/{group.maxChoices}
                  </span>
                </div>
                <div className="mt-3 grid gap-2">
                  {group.options.map((option) => {
                    const selected = selectedOptions[group.id]?.includes(option.id) ?? false;
                    return (
                      <button className={cn("flex min-h-12 items-center justify-between rounded-2xl border px-3 text-left transition", selected ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary-dark)]" : "border-[var(--border)] bg-[var(--surface)]")} key={option.id} onClick={() => toggleOption(group, option)} type="button">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border", selected ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--color-on-primary)]" : "border-[var(--border)]")}>
                            {selected ? <Check className="h-3.5 w-3.5" /> : null}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-black">{option.name}</span>
                            {option.description ? <span className="block truncate text-xs font-semibold text-[var(--muted)]">{option.description}</span> : null}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-black">{option.priceDelta > 0 ? `+ ${formatMoney(option.priceDelta)}` : "0"}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <div className="sticky bottom-0 z-30 grid gap-3 border-t border-[var(--border)] bg-[var(--color-card-elevated)] p-4 backdrop-blur sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-xs font-black uppercase text-[var(--muted)]">Total producto</p>
            <p className="text-2xl font-black text-[var(--primary)]">{totalLabel}</p>
          </div>
          <Button className="min-h-14 rounded-[1.1rem] bg-[var(--accent)] px-8 text-[var(--primary)] shadow-[var(--shadow-glow)] hover:bg-[#d9ff22]" disabled={!canAdd} onClick={() => onAdd(product, selectedVariant, chosenOptions)} type="button">
            {canAdd ? "Agregar al pedido" : variants.length && !selectedVariant ? "Elige una variante" : "Completa opciones"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

type OrderStepKey = "fulfillment" | "customer" | "invoice" | "payment" | "review";

function PublicOrderPanel({
  restaurant,
  deliveryZones,
  settings,
  businessHours,
  businessStatus,
  activeClosure,
  cart,
  cartJson,
  total,
  paymentMethod,
  fulfillmentMode,
  orderType,
  orderError,
  requiresInvoice,
  notes,
  compact = false,
  changeQuantity,
  setOrderType,
  setPaymentMethod,
  setFulfillmentMode,
  setRequiresInvoice,
}: {
  restaurant: Restaurant;
  deliveryZones: RestaurantDeliveryZone[];
  settings: RestaurantSettings | null;
  businessHours: BusinessHour[];
  businessStatus: ReturnType<typeof getBusinessStatus>;
  activeClosure?: RestaurantAnnouncement;
  cart: CartItem[];
  cartJson: string;
  total: number;
  paymentMethod: "cash" | "qr";
  fulfillmentMode: "now" | "scheduled";
  orderType: PublicOrderType;
  orderError?: string;
  requiresInvoice: boolean;
  notes: string;
  compact?: boolean;
  changeQuantity: (cartId: string, delta: number) => void;
  setOrderType: (type: PublicOrderType) => void;
  setPaymentMethod: (method: "cash" | "qr") => void;
  setFulfillmentMode: (mode: "now" | "scheduled") => void;
  setRequiresInvoice: (value: boolean) => void;
}) {
  const deliveryEnabled = settings?.deliveryEnabled ?? true;
  const pickupEnabled = settings?.pickupEnabled ?? true;
  const invoiceEnabled = settings?.invoiceEnabled ?? false;
  const qrPaymentUrl = normalizeQrPaymentUrl(settings?.qrPaymentUrl);
  const qrAvailable = hasQrPaymentConfigured(settings);
  const nowAvailable = !activeClosure && (!businessStatus.hasSchedule || businessStatus.isOpen);
  const [deliveryCoordinates, setDeliveryCoordinates] = useState<{ latitude: number; longitude: number }>();
  const deliveryPolicy = useMemo(
    () =>
      resolveDeliveryPolicy({
        restaurantLocation:
          restaurant.latitude != null && restaurant.longitude != null
            ? { latitude: restaurant.latitude, longitude: restaurant.longitude }
            : undefined,
        deliveryLocation: deliveryCoordinates,
        restaurantCity: restaurant.city,
        deliveryCity: restaurant.city,
        zones: deliveryZones,
        subtotal: total,
        baseDeliveryFee: settings?.deliveryFee ?? 0,
        baseMinOrderAmount: settings?.minOrderAmount ?? 0,
        qrPrepaymentEnabled: settings?.deliveryQrPrepaymentEnabled ?? true,
        freeDeliveryFrom: settings?.freeDeliveryFrom ?? 0,
        farDeliveryDistanceKm: settings?.farDeliveryDistanceKm,
      }),
    [deliveryCoordinates, deliveryZones, restaurant.city, restaurant.latitude, restaurant.longitude, settings, total],
  );
  const deliveryFee = orderType === "delivery" ? deliveryPolicy.deliveryFee : 0;
  const deliveryPreviewFee = deliveryPolicy.deliveryFee;
  const deliveryFeeLabel = orderType === "delivery" && deliveryFee <= 0 ? "Gratis" : formatMoney(deliveryFee, settings?.currency);
  const deliveryChoiceText = !deliveryEnabled ? "No disponible" : deliveryPreviewFee > 0 ? `${formatMoney(deliveryPreviewFee, settings?.currency)} de envio` : "Envio gratis";
  const deliveryDistanceHint = deliveryPolicy.requiresQrPrepayment
    ? "Por seguridad, esta distancia requiere pago QR con comprobante."
    : deliveryFee > 0
      ? `${formatMoney(deliveryFee, settings?.currency)} de envio. Puedes pagar en efectivo o QR.`
      : "Envio gratis aplicado. Puedes pagar en efectivo o QR.";
  const grandTotal = total + deliveryFee;
  const effectivePaymentMethod = orderType === "delivery" && deliveryPolicy.requiresQrPrepayment ? "qr" : paymentMethod;
  const paymentReceiptRef = useRef<HTMLInputElement>(null);
  const [activeStep, setActiveStep] = useState<OrderStepKey>("fulfillment");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [customerAccount, setCustomerAccount] = useState<PublicCustomerAccount>({ profile: null, addresses: [] });
  const [customerAccountLoaded, setCustomerAccountLoaded] = useState(false);
  const [selectedCustomerAddressId, setSelectedCustomerAddressId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [deliveryAddressDetail, setDeliveryAddressDetail] = useState("");
  const [deliveryMapsUrl, setDeliveryMapsUrl] = useState("");
  const applySavedCustomerAddress = useCallback((address: PublicCustomerAccount["addresses"][number]) => {
    setSelectedCustomerAddressId(address.id);
    setCustomerAddress(address.address);
    setDeliveryMapsUrl(address.mapsUrl ?? "");
    if (address.latitude != null && address.longitude != null) {
      setDeliveryCoordinates({
        latitude: address.latitude,
        longitude: address.longitude,
      });
    }
  }, []);
  const handleDeliveryCoordinatesChange = useCallback(({ latitude, longitude, mapsUrl }: { latitude: number; longitude: number; mapsUrl: string }) => {
    setDeliveryCoordinates({ latitude, longitude });
    setDeliveryMapsUrl(mapsUrl);
    setCustomerAddress((currentAddress) => (currentAddress.trim() ? currentAddress : "Ubicacion marcada en el mapa"));
  }, []);
  const [requestedFulfillmentAt, setRequestedFulfillmentAt] = useState(() => (!businessStatus.isOpen && businessStatus.hasSchedule ? businessStatus.nextOpeningInputValue : ""));
  const [invoiceDocumentType, setInvoiceDocumentType] = useState("nit");
  const [invoiceDocumentNumber, setInvoiceDocumentNumber] = useState("");
  const [invoiceName, setInvoiceName] = useState("");
  const selectedCustomerAddress = useMemo(
    () => customerAccount.addresses.find((address) => address.id === selectedCustomerAddressId) ?? null,
    [customerAccount.addresses, selectedCustomerAddressId],
  );
  const canUseSavedCustomer = Boolean(customerAccount.profile && (orderType !== "delivery" || selectedCustomerAddress));

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      try {
        const account = await fetchPublicCustomerAccount();
        if (!active) return;
        setCustomerAccount(account);
        setCustomerAccountLoaded(true);
        if (account.profile) {
          setCustomerName(account.profile.fullName);
          setCustomerPhone(account.profile.phone);
          setCustomerEmail(account.profile.email);
        }
        const preferredAddress = account.addresses.find((address) => address.isDefault) ?? account.addresses[0];
        if (preferredAddress) {
          applySavedCustomerAddress(preferredAddress);
        } else {
          setSelectedCustomerAddressId("");
        }
      } catch {
        if (!active) return;
        setCustomerAccount({ profile: null, addresses: [] });
        setCustomerAccountLoaded(true);
        setSelectedCustomerAddressId("");
      }
    }

    void loadAccount();
    window.addEventListener(customerAccountChangedEvent, loadAccount);
    return () => {
      active = false;
      window.removeEventListener(customerAccountChangedEvent, loadAccount);
    };
  }, [applySavedCustomerAddress]);

  const steps = useMemo<Array<{ key: OrderStepKey; label: string; icon: ReactNode }>>(
    () => [
      { key: "fulfillment", label: "Entrega", icon: orderType === "delivery" ? <Bike className="h-4 w-4" /> : <Store className="h-4 w-4" /> },
      { key: "customer", label: "Datos", icon: <UserRound className="h-4 w-4" /> },
      ...(invoiceEnabled ? [{ key: "invoice" as const, label: "Factura", icon: <ReceiptText className="h-4 w-4" /> }] : []),
      { key: "payment", label: "Pago", icon: <CreditCard className="h-4 w-4" /> },
      { key: "review", label: "Confirmar", icon: <Check className="h-4 w-4" /> },
    ],
    [invoiceEnabled, orderType],
  );

  const activeStepIndex = Math.max(0, steps.findIndex((step) => step.key === activeStep));
  const activeStepNumber = activeStepIndex + 1;

  function reject(message: string) {
    setFormError(message);
    return false;
  }

  function validateStep(step: OrderStepKey) {
    setFormError("");

    if (step === "fulfillment") {
      if (activeClosure) {
        return reject(activeClosure.body || activeClosure.title || "El restaurante esta cerrado temporalmente.");
      }
      if (orderType === "delivery" && !deliveryEnabled) {
        return reject("El restaurante no tiene envio a domicilio disponible ahora.");
      }
      if (orderType === "pickup" && !pickupEnabled) {
        return reject("El restaurante no tiene recojo habilitado ahora.");
      }
      if (fulfillmentMode === "now" && !nowAvailable) {
        return reject("El restaurante esta fuera de horario. Programa tu pedido para una hora de atencion.");
      }
      if (fulfillmentMode === "scheduled") {
        if (!requestedFulfillmentAt) {
          return reject("Elige la hora para programar el pedido.");
        }
        if (requestedFulfillmentAt < businessStatus.currentInputValue) {
          return reject("La hora programada debe ser posterior a la hora actual.");
        }
        if (!isLocalDateTimeWithinBusinessHours(requestedFulfillmentAt, businessHours)) {
          return reject("La hora programada debe estar dentro del horario de atencion del restaurante.");
        }
      }
    }

    if (step === "customer") {
      if (!customerName.trim()) {
        return reject("Escribe tu nombre para que el restaurante identifique el pedido.");
      }
      if (orderType === "delivery" && !customerPhone.trim()) {
        return reject("Para envio necesitamos un WhatsApp de contacto.");
      }
      if (orderType === "delivery" && !customerAddress.trim()) {
        return reject("Para envio debes registrar la direccion de entrega.");
      }
      if (orderType === "delivery" && !deliveryCoordinates) {
        return reject("Marca la ubicacion exacta para calcular la distancia y confirmar el envio.");
      }
    }

    if (step === "invoice" && invoiceEnabled && requiresInvoice) {
      if (!invoiceDocumentType || !invoiceDocumentNumber.trim() || !invoiceName.trim()) {
        return reject("Completa los datos de factura o marca que no necesitas factura.");
      }
    }

    if (step === "payment") {
      if (orderType === "delivery" && deliveryPolicy.requiresQrPrepayment && effectivePaymentMethod !== "qr") {
        return reject("Por la distancia de entrega, este pedido requiere pago QR.");
      }
      if (effectivePaymentMethod === "qr" && !qrAvailable) {
        return reject(deliveryPolicy.requiresQrPrepayment ? "Este envio requiere QR, pero el restaurante aun no lo configuro." : "Este restaurante todavia no tiene QR configurado. Elige efectivo.");
      }
      if (effectivePaymentMethod === "qr" && !(paymentReceiptRef.current?.files?.length ?? 0)) {
        return reject("Sube el comprobante QR antes de confirmar el pedido.");
      }
    }

    return true;
  }

  function goToStep(target: OrderStepKey) {
    const targetIndex = steps.findIndex((step) => step.key === target);
    if (targetIndex <= activeStepIndex) {
      setActiveStep(target);
      setFormError("");
      return;
    }

    for (let index = activeStepIndex; index < targetIndex; index += 1) {
      if (!validateStep(steps[index].key)) {
        return;
      }
    }
    setActiveStep(target);
  }

  function goNext() {
    if (!validateStep(activeStep)) {
      return;
    }

    const nextIndex = Math.min(activeStepIndex + 1, steps.length - 1);
    const nextStep = steps[nextIndex];
    if (nextStep.key === "customer" && canUseSavedCustomer && validateStep("customer")) {
      setActiveStep(steps[Math.min(nextIndex + 1, steps.length - 1)].key);
      return;
    }

    setActiveStep(nextStep.key);
  }

  function goBack() {
    const previousStep = steps[Math.max(activeStepIndex - 1, 0)];
    setActiveStep(previousStep.key);
    setFormError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    for (const step of steps) {
      if (!validateStep(step.key)) {
        event.preventDefault();
        setActiveStep(step.key);
        return;
      }
    }
    const requestIdInput = event.currentTarget.elements.namedItem("requestId");
    if (requestIdInput instanceof HTMLInputElement && !requestIdInput.value) {
      requestIdInput.value = crypto.randomUUID();
    }
    setIsSubmitting(true);
  }

  return (
    <form action={createPublicOrderAction} className={cn("w-full min-w-0 rounded-[1.5rem] bg-[var(--surface)] text-[var(--text)] shadow-sm", compact ? "rounded-none p-0 shadow-none" : "p-4")} onSubmit={handleSubmit}>
      <input defaultValue="" name="requestId" type="hidden" />
      <input name="restaurantId" type="hidden" value={restaurant.id} />
      <input name="restaurantSlug" type="hidden" value={restaurant.slug} />
      <input name="orderType" type="hidden" value={orderType} />
      <input name="deliveryCity" type="hidden" value={restaurant.city} />
      <input name="paymentMethod" type="hidden" value={effectivePaymentMethod} />
      <input name="notes" type="hidden" value={notes} />
      <input name="invoiceRequired" type="hidden" value={invoiceEnabled && requiresInvoice ? "on" : ""} />
      <input name="cartJson" type="hidden" value={cartJson} />

      {!compact ? <h2 className="text-2xl font-black">Tu pedido</h2> : null}
      {orderError ? <div className="mb-3"><OrderErrorMessage error={orderError} /></div> : null}

      <div className="rounded-[1.35rem] bg-[var(--primary-light)] p-2">
        <div className="flex items-center justify-between gap-3 px-2 py-2">
          <div>
            <p className="text-xs font-black uppercase text-[var(--primary)]">Paso {activeStepNumber} de {steps.length}</p>
            <h3 className="text-xl font-black">{steps[activeStepIndex]?.label ?? "Tu pedido"}</h3>
          </div>
          <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-sm font-black text-[var(--primary)]">{formatMoney(grandTotal, settings?.currency)}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {steps.map((step, index) => (
            <button
              className={cn(
                "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-black transition",
                index === activeStepIndex ? "bg-[var(--primary)] text-[var(--color-on-primary)]" : index < activeStepIndex ? "bg-[var(--surface)] text-[var(--primary)]" : "bg-[var(--color-card-muted)] text-[var(--muted)]",
              )}
              key={step.key}
              onClick={() => goToStep(step.key)}
              type="button"
            >
              {step.icon}
              <span className="truncate">{step.label}</span>
            </button>
          ))}
        </div>
      </div>

      {formError ? <div className="mt-3 rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm font-bold text-[var(--color-danger-strong)]">{formError}</div> : null}

      <section className={cn("mt-4 space-y-4", activeStep === "fulfillment" ? "block" : "hidden")}>
        {businessStatus.hasSchedule && !businessStatus.isOpen ? (
          <div className="rounded-[1.35rem] border border-[var(--color-warning-strong)]/20 bg-[var(--color-warning-soft)] p-4 text-[var(--color-warning-strong)]">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-black">Aun no puedes pedir para ahora.</p>
                <p className="mt-1 text-sm font-semibold">Horario de atencion de hoy: {businessStatus.todayHours}. Puedes programarlo desde {businessStatus.nextOpeningInputValue.replace("T", " ")}.</p>
              </div>
            </div>
          </div>
        ) : null}

        <StepIntro icon={<Store className="h-5 w-5" />} title="Como quieres recibirlo" description="Primero elegimos recojo o envio; despues aparecen solo los datos necesarios." />
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard active={orderType === "pickup"} disabled={!pickupEnabled} icon={<Store className="h-5 w-5" />} label="Recojo en local" onClick={() => setOrderType("pickup")} text={restaurant.address || "El restaurante confirmara la direccion."} />
          <ChoiceCard active={orderType === "delivery"} disabled={!deliveryEnabled} icon={<Bike className="h-5 w-5" />} label="Envio a domicilio" onClick={() => setOrderType("delivery")} text={deliveryChoiceText} />
        </div>

        <StepIntro icon={<CalendarClock className="h-5 w-5" />} title="Cuando lo necesitas" description={businessStatus.hasSchedule ? `Horario de hoy: ${businessStatus.todayHours}` : "Este restaurante aun no configuro horarios; permitimos pedidos por ahora."} />
        <div className="grid grid-cols-2 rounded-2xl bg-[var(--primary-light)] p-1">
          <button className={cn("min-h-11 rounded-full px-2 text-xs font-black text-[var(--muted)] disabled:opacity-45 min-[380px]:text-sm", fulfillmentMode === "now" && "bg-[var(--primary)] text-[var(--color-on-primary)]")} disabled={!nowAvailable} onClick={() => setFulfillmentMode("now")} type="button">
            Ahora mismo
          </button>
          <button className={cn("min-h-11 rounded-full px-2 text-xs font-black text-[var(--muted)] min-[380px]:text-sm", fulfillmentMode === "scheduled" && "bg-[var(--primary)] text-[var(--color-on-primary)]")} onClick={() => setFulfillmentMode("scheduled")} type="button">
            Programar hora
          </button>
        </div>
        <div className={cn(fulfillmentMode === "scheduled" ? "block" : "hidden")}>
          <label className="block text-sm font-black">
            Hora de entrega o recojo
            <Input className="mt-2" min={nowAvailable ? businessStatus.currentInputValue : businessStatus.nextOpeningInputValue} name="requestedFulfillmentAt" onChange={(event) => setRequestedFulfillmentAt(event.target.value)} type="datetime-local" value={requestedFulfillmentAt} />
          </label>
          <p className="mt-2 text-xs font-semibold text-[var(--muted)]">La hora debe estar dentro del horario configurado del restaurante.</p>
        </div>
      </section>

      <section className={cn("mt-4 space-y-3", activeStep === "customer" ? "block" : "hidden")}>
        <StepIntro
          icon={<UserRound className="h-5 w-5" />}
          title={customerAccount.profile ? "Datos listos" : "Datos del cliente"}
          description={customerAccount.profile ? "Usaremos tu perfil y direccion guardada en Mi Yopido." : orderType === "delivery" ? "Para envio necesitamos nombre, WhatsApp y direccion." : "Para recojo bastan tus datos principales."}
        />
        {customerAccount.profile ? (
          <>
            <input name="customerName" type="hidden" value={customerName} />
            <input name="customerPhone" type="hidden" value={customerPhone} />
            <input name="customerEmail" type="hidden" value={customerEmail} />
            <input name="customerAddress" type="hidden" value={customerAddress} />
            <input name="deliveryAddressDetail" type="hidden" value={deliveryAddressDetail} />
            {orderType === "delivery" && selectedCustomerAddress ? (
              <>
                <input name="deliveryLatitude" type="hidden" value={selectedCustomerAddress.latitude ?? ""} />
                <input name="deliveryLongitude" type="hidden" value={selectedCustomerAddress.longitude ?? ""} />
                <input name="deliveryMapsUrl" type="hidden" value={selectedCustomerAddress.mapsUrl ?? deliveryMapsUrl} />
              </>
            ) : null}
            <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--color-card)] p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-sm font-black text-[var(--primary)]">
                  {customerAccount.profile.fullName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-black">{customerAccount.profile.fullName}</p>
                  <p className="truncate text-sm font-semibold text-[var(--muted)]">{customerAccount.profile.phone}</p>
                </div>
                <div className="ml-auto">
                  <PublicCustomerAccountButton compact tone="surface" />
                </div>
              </div>
            </div>
            {orderType === "delivery" ? (
              <div className="space-y-3">
                {customerAccount.addresses.length ? (
                  <>
                    <p className="text-sm font-black">Elige direccion de entrega</p>
                    <div className="grid gap-2">
                      {customerAccount.addresses.map((address) => (
                        <button
                          className={cn(
                            "flex items-start gap-3 rounded-[1.1rem] border p-3 text-left transition",
                            selectedCustomerAddressId === address.id ? "border-[var(--primary)] bg-[var(--primary-light)]" : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary-light)]",
                          )}
                          key={address.id}
                          onClick={() => applySavedCustomerAddress(address)}
                          type="button"
                        >
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white">
                            <MapPin className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block font-black">{address.label}</span>
                            <span className="mt-1 line-clamp-2 text-sm font-semibold text-[var(--muted)]">{address.address}</span>
                            {address.latitude != null && address.longitude != null ? <span className="mt-1 block text-xs font-black text-[var(--primary)]">Ubicacion GPS guardada</span> : null}
                          </span>
                        </button>
                      ))}
                    </div>
                    <label className="block text-sm font-black">
                      Numero de casa, apartamento o aclaracion
                      <Input className="mt-2" onChange={(event) => setDeliveryAddressDetail(event.target.value)} value={deliveryAddressDetail} />
                    </label>
                  </>
                ) : (
                  <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--color-surface)] p-4">
                    <p className="font-black">No tienes direccion guardada.</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--muted)]">Agrega una direccion en Mi Yopido para no volver a escribirla.</p>
                    <div className="mt-3">
                      <PublicCustomerAccountButton tone="plain" />
                    </div>
                  </div>
                )}
                {deliveryPolicy.distanceKm != null ? (
                  <div className={cn("rounded-2xl p-3 text-sm font-bold", deliveryPolicy.requiresQrPrepayment ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]" : "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]")}>
                    <p>{deliveryPolicy.distanceKm.toFixed(1)} km desde el local{deliveryPolicy.matchedZone ? ` · ${deliveryPolicy.matchedZone.name}` : ""}.</p>
                    <p className="mt-1 text-xs">{deliveryDistanceHint}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <>
            {customerAccountLoaded ? (
              <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--color-card)] p-4">
                <p className="font-black">Pide mas rapido con Mi Yopido</p>
                <p className="mt-1 text-sm font-semibold text-[var(--muted)]">Inicia sesion y usaremos tus datos y direcciones guardadas automaticamente.</p>
                <div className="mt-3">
                  <PublicCustomerAccountButton tone="plain" />
                </div>
              </div>
            ) : null}
        <label className="block text-sm font-black">
          Nombre completo
          <Input className="mt-2" name="customerName" onChange={(event) => setCustomerName(event.target.value)} value={customerName} />
        </label>
        <label className="block text-sm font-black">
          WhatsApp {orderType === "delivery" ? <span className="text-[var(--danger)]">*</span> : null}
          <Input className="mt-2" name="customerPhone" onChange={(event) => setCustomerPhone(event.target.value)} type="tel" value={customerPhone} />
        </label>
        <label className="block text-sm font-black">
          Correo electronico
          <Input className="mt-2" name="customerEmail" onChange={(event) => setCustomerEmail(event.target.value)} type="email" value={customerEmail} />
        </label>
        <div className={cn(orderType === "delivery" ? "space-y-3" : "hidden")}>
          <label className="block text-sm font-black">
            Direccion de entrega
            <Input className="mt-2" name="customerAddress" onChange={(event) => setCustomerAddress(event.target.value)} value={customerAddress} />
          </label>
          <label className="block text-sm font-black">
            Numero de casa, apartamento o aclaracion
            <Input className="mt-2" name="deliveryAddressDetail" onChange={(event) => setDeliveryAddressDetail(event.target.value)} value={deliveryAddressDetail} />
          </label>
          <GoogleLocationFields
            hideCoordinateInputs
            hideMapsUrlInput
            label="Ubicacion de entrega"
            latitudeName="deliveryLatitude"
            longitudeName="deliveryLongitude"
            mapHeightClassName="h-[320px]"
            mapsUrlName="deliveryMapsUrl"
            onCoordinatesChange={handleDeliveryCoordinatesChange}
            showMapByDefault
          />
          {deliveryPolicy.distanceKm != null ? (
            <div className={cn("rounded-2xl p-3 text-sm font-bold", deliveryPolicy.requiresQrPrepayment ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]" : "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]")}>
              <p>{deliveryPolicy.distanceKm.toFixed(1)} km desde el local{deliveryPolicy.matchedZone ? ` · ${deliveryPolicy.matchedZone.name}` : ""}.</p>
              <p className="mt-1 text-xs">{deliveryDistanceHint}</p>
            </div>
          ) : null}
          {restaurant.city ? (
            <div className="rounded-2xl bg-[var(--primary-light)]/55 p-3 text-sm font-semibold text-[var(--muted)]">
              Ciudad de entrega: <strong className="text-[var(--text)]">{restaurant.city}</strong>
            </div>
          ) : null}
        </div>
          </>
        )}
        <div className={cn(orderType === "pickup" && (restaurant.mapsUrl || restaurant.address) ? "rounded-2xl bg-[var(--primary-light)]/55 p-3 text-sm font-semibold text-[var(--muted)]" : "hidden")}>
          <p className="font-black text-[var(--text)]">Recojo en local</p>
          <p className="mt-1">{restaurant.address || "El restaurante confirmara la direccion."}</p>
          {restaurant.addressReference ? <p className="mt-1">{restaurant.addressReference}</p> : null}
          {restaurant.mapsUrl ? (
            <a className="mt-2 inline-flex font-black text-[var(--primary)]" href={restaurant.mapsUrl} rel="noreferrer" target="_blank">
              Abrir en Google Maps
            </a>
          ) : null}
        </div>
      </section>

      {invoiceEnabled ? (
        <section className={cn("mt-4 space-y-3", activeStep === "invoice" ? "block" : "hidden")}>
          <StepIntro icon={<ReceiptText className="h-5 w-5" />} title="Factura" description="Es opcional. Si no necesitas factura, sigue al pago." />
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard active={!requiresInvoice} icon={<Check className="h-5 w-5" />} label="Sin factura" onClick={() => setRequiresInvoice(false)} text="Solo quiero confirmar el pedido." />
            <ChoiceCard active={requiresInvoice} icon={<ReceiptText className="h-5 w-5" />} label="Necesito factura" onClick={() => setRequiresInvoice(true)} text="Ingresare NIT/CI y razon social." />
          </div>
          <div className={cn("grid gap-3 rounded-2xl border border-[var(--border)] p-3", requiresInvoice ? "block" : "hidden")}>
            <select className="h-12 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--text)]" name="invoiceDocumentType" onChange={(event) => setInvoiceDocumentType(event.target.value)} value={invoiceDocumentType}>
              <option value="nit">NIT</option>
              <option value="ci">Carnet</option>
              <option value="cex">CEX extranjero</option>
              <option value="passport">Pasaporte</option>
              <option value="other">Otro documento</option>
            </select>
            <Input name="invoiceDocumentNumber" onChange={(event) => setInvoiceDocumentNumber(event.target.value)} placeholder="Numero de documento" value={invoiceDocumentNumber} />
            <Input name="invoiceName" onChange={(event) => setInvoiceName(event.target.value)} placeholder="Nombre o razon social" value={invoiceName} />
          </div>
        </section>
      ) : null}

      <section className={cn("mt-4 space-y-3", activeStep === "payment" ? "block" : "hidden")}>
        <StepIntro icon={<CreditCard className="h-5 w-5" />} title="Forma de pago" description="El efectivo queda registrado para caja. En QR el comprobante es obligatorio." />
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard active={effectivePaymentMethod === "cash"} disabled={orderType === "delivery" && deliveryPolicy.requiresQrPrepayment} icon={<CreditCard className="h-5 w-5" />} label="Efectivo" onClick={() => setPaymentMethod("cash")} text={deliveryPolicy.requiresQrPrepayment ? "No disponible por distancia." : "Caja validara el cobro antes de preparar."} />
          <ChoiceCard active={effectivePaymentMethod === "qr"} disabled={!qrAvailable} icon={<ReceiptText className="h-5 w-5" />} label="Pago QR" onClick={() => setPaymentMethod("qr")} text={qrAvailable ? "QR activo para esta sucursal." : "Sin QR configurado."} />
        </div>
        <div className={cn(effectivePaymentMethod === "qr" && qrAvailable ? "grid gap-3 rounded-2xl bg-[var(--primary-light)]/55 p-3 sm:grid-cols-[150px_1fr] sm:items-center" : "hidden")}>
          <QrPaymentViewer
            downloadFileName={`${restaurant.slug}-qr-pago.png`}
            imageClassName="h-28 w-28"
            subtitle="QR de pago de esta sucursal."
            title="QR de pago"
            url={qrPaymentUrl}
          />
          <div>
            <p className="text-sm font-black text-[var(--text)]">Escanea el QR del restaurante</p>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Realiza el pago y luego sube el comprobante para que el equipo lo valide.</p>
            {settings?.qrAccountName || settings?.qrBankName ? (
              <p className="mt-2 text-xs font-bold text-[var(--muted)]">
                {settings.qrAccountName ? settings.qrAccountName : ""}
                {settings.qrBankName ? ` · ${settings.qrBankName}` : ""}
                {settings.qrAccountType ? ` · ${settings.qrAccountType === "checking" ? "Cuenta corriente" : "Caja de ahorro"}` : ""}
                {settings.qrCurrency ? ` · ${settings.qrCurrency}` : ""}
              </p>
            ) : null}
          </div>
        </div>
        <div className={cn(effectivePaymentMethod === "qr" && qrAvailable ? "block" : "hidden")}>
          <CompressedImageInput acceptPdf help="Sube captura o PDF del pago. Las imagenes se optimizan en WebP." inputRef={paymentReceiptRef} label="Comprobante QR" name="paymentReceiptFile" />
        </div>
        <p className="rounded-2xl bg-[var(--color-card-muted)] p-3 text-sm leading-6 text-[var(--muted)]">
          {effectivePaymentMethod === "cash" ? "El pedido quedara guardado como pago en efectivo pendiente de validacion en caja." : "El equipo confirmara el comprobante antes de preparar el pedido."}
        </p>
      </section>

      <section className={cn("mt-4 space-y-3", activeStep === "review" ? "block" : "hidden")}>
        <StepIntro icon={<ShoppingCart className="h-5 w-5" />} title="Revision final" description="Confirma productos, entrega, pago y total antes de enviar." />
        <div className="space-y-2">
          {cart.length ? (
            cart.map((item) => (
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-[1.25rem] bg-[var(--surface)] p-3 shadow-sm ring-1 ring-[var(--border)]" key={item.cartId}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={item.name} className="h-[72px] w-[72px] rounded-[1rem] object-cover" src={item.imageUrl || defaultImage} />
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black">{item.name}</p>
                      {item.notes ? <p className="line-clamp-2 text-xs font-semibold text-[var(--muted)]">{item.notes}</p> : null}
                      <p className="text-xs font-semibold text-[var(--muted)]">{formatMoney(item.price, settings?.currency)} c/u</p>
                    </div>
                    <strong className="shrink-0 text-sm">{formatMoney(item.price * item.quantity, settings?.currency)}</strong>
                  </div>
                  <div className="mt-3 inline-flex overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]">
                    <button className="grid h-9 w-10 place-items-center" onClick={() => changeQuantity(item.cartId, -1)} type="button">
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="grid h-9 w-10 place-items-center border-x border-[var(--border)] text-sm font-black">{item.quantity}</span>
                    <button className="grid h-9 w-10 place-items-center" onClick={() => changeQuantity(item.cartId, 1)} type="button">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[1.25rem] bg-[var(--color-surface)] p-5 text-center ring-1 ring-[var(--border)]">
                <IllustrationAsset className="mx-auto max-w-[170px]" name="emptyCart" sizes="170px" />
                <p className="mt-3 text-sm font-black text-[var(--primary)]">No agregaste productos todavia</p>
                <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Agrega productos del menu para continuar.</p>
              </div>
          )}
        </div>
        <div className="grid gap-2 rounded-[1.25rem] bg-[var(--color-surface)] p-4 text-sm ring-1 ring-[var(--border)]">
          <ReviewLine label="Modalidad" value={orderType === "delivery" ? "Envio a domicilio" : "Recojo en local"} />
          <ReviewLine label="Horario" value={fulfillmentMode === "scheduled" ? requestedFulfillmentAt.replace("T", " ") : "Ahora mismo"} />
          <ReviewLine label="Cliente" value={customerName || "Sin nombre"} />
          {orderType === "delivery" ? <ReviewLine label="Direccion" value={customerAddress || "Sin direccion"} /> : null}
          {orderType === "delivery" && deliveryPolicy.distanceKm != null ? <ReviewLine label="Distancia" value={`${deliveryPolicy.distanceKm.toFixed(1)} km${deliveryPolicy.requiresQrPrepayment ? " · QR obligatorio" : ""}`} /> : null}
          {invoiceEnabled ? <ReviewLine label="Factura" value={requiresInvoice ? `${invoiceDocumentNumber || "Documento"} - ${invoiceName || "Nombre"}` : "No requiere"} /> : null}
          <ReviewLine label="Pago" value={effectivePaymentMethod === "cash" ? "Efectivo" : "QR con comprobante"} />
        </div>
      </section>

      <div className="mt-4 rounded-[1.25rem] bg-[var(--color-surface)] p-4 text-base ring-1 ring-[var(--border)]">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-[var(--muted)]">Subtotal</span>
          <strong>{formatMoney(total, settings?.currency)}</strong>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-semibold text-[var(--muted)]">Envio</span>
          <strong>{deliveryFeeLabel}</strong>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-dashed border-[var(--border)] pt-3">
          <span className="font-black">Total a pagar</span>
          <strong className="text-2xl text-[var(--primary)]">{formatMoney(grandTotal, settings?.currency)}</strong>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[auto_1fr]">
        <Button className={cn("min-h-12 rounded-[1.1rem]", activeStepIndex === 0 && "hidden")} onClick={goBack} type="button" variant="secondary">
          Volver
        </Button>
        {activeStep === "review" ? (
          <Button className={cn("min-h-14 w-full overflow-hidden rounded-[1.25rem] bg-[var(--accent)] text-base text-[var(--primary)] shadow-[var(--shadow-glow)] transition-all hover:bg-[#d9ff22]", isSubmitting && "justify-center bg-[var(--color-success)] text-white")} disabled={!cart.length || isSubmitting} type="submit">
            {isSubmitting ? (
              <span className="inline-flex items-center gap-3">
                <span className="relative grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--surface)]/40">
                  <span className="order-ring absolute inset-0 rounded-full border-2 border-transparent border-t-white" />
                  <ShoppingCart className="cart-roll-forward h-4 w-4" />
                </span>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface)] text-[var(--color-success-strong)]">
                  <Check className="h-4 w-4" />
                </span>
              </span>
            ) : (
              <>
                Confirmar pedido
                <span>{formatMoney(grandTotal, settings?.currency)}</span>
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </Button>
        ) : (
          <Button className="min-h-14 w-full rounded-[1.25rem] bg-[var(--accent)] text-base text-[var(--primary)] shadow-[var(--shadow-glow)] hover:bg-[#d9ff22]" disabled={!cart.length} onClick={goNext} type="button">
            Guardar y continuar
            <ArrowRight className="h-5 w-5" />
          </Button>
        )}
      </div>
    </form>
  );
}

function StepIntro({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex gap-3 rounded-[1.25rem] bg-[var(--color-card-muted)] p-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-[var(--color-on-primary)]">{icon}</span>
      <div>
        <h4 className="font-black">{title}</h4>
        <p className="mt-1 text-sm font-semibold leading-5 text-[var(--muted)]">{description}</p>
      </div>
    </div>
  );
}

function ChoiceCard({ active, disabled = false, icon, label, text, onClick }: { active: boolean; disabled?: boolean; icon: ReactNode; label: string; text: string; onClick: () => void }) {
  return (
    <button
      className={cn(
        "flex min-h-24 items-start gap-3 rounded-[1.25rem] border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45",
        active ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary-dark)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--primary-light)]",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", active ? "bg-[var(--primary)] text-[var(--color-on-primary)]" : "bg-[var(--color-card-muted)] text-[var(--primary)]")}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-black">{label}</span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-[var(--muted)]">{text}</span>
      </span>
    </button>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[var(--muted)]">{label}</span>
      <strong className="text-right text-[var(--text)]">{value}</strong>
    </div>
  );
}
