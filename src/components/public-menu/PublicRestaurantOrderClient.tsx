"use client";

import { AlertTriangle, ArrowRight, Bike, CalendarClock, Check, Clock3, CreditCard, Flame, Heart, MapPin, Minus, Plus, ReceiptText, Search, Share2, ShoppingCart, Star, Store, UserRound, X } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, type FormEvent, type ReactNode, useMemo, useRef, useState } from "react";
import { createPublicOrderAction } from "@/app/r/actions";
import { Button } from "@/components/ui/Button";
import { IllustrationAsset } from "@/components/ui/IllustrationAsset";
import { Input } from "@/components/ui/Input";
import { DEFAULT_RESTAURANT_TIME_ZONE, getBusinessStatus, isLocalDateTimeWithinBusinessHours } from "@/lib/utils/business-hours";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import type { Category, Product, ProductConfiguration, ProductOption, ProductOptionGroup, ProductVariant } from "@/types/product.types";
import type { BusinessHour, Restaurant, RestaurantSettings } from "@/types/restaurant.types";

type PublicOrderType = "delivery" | "pickup";
type SelectedOptions = Record<string, string[]>;
type ProductConfigMap = Record<string, { variants: ProductVariant[]; optionGroups: ProductOptionGroup[] }>;

type CartItem = {
  cartId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
  notes?: string;
};

const defaultImage = "/imagendefault.jpeg";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function PublicRestaurantOrderClient({
  restaurant,
  categories,
  products,
  settings,
  businessHours,
  configuration,
  orderError,
}: {
  restaurant: Restaurant;
  categories: Category[];
  products: Product[];
  settings: RestaurantSettings | null;
  businessHours: BusinessHour[];
  configuration: ProductConfiguration;
  orderError?: string;
}) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [productQuery, setProductQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const businessStatus = useMemo(() => getBusinessStatus(businessHours, new Date(), DEFAULT_RESTAURANT_TIME_ZONE), [businessHours]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "qr">("cash");
  const [requiresInvoice, setRequiresInvoice] = useState(false);
  const [fulfillmentMode, setFulfillmentMode] = useState<"now" | "scheduled">(() => (businessStatus.hasSchedule && !businessStatus.isOpen ? "scheduled" : "now"));
  const [orderType, setOrderType] = useState<PublicOrderType>(() => (settings?.pickupEnabled === false && settings?.deliveryEnabled ? "delivery" : "pickup"));

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

  const filteredProducts = useMemo(() => {
    const queryNeedle = normalize(productQuery);
    return products.filter((product) => {
      const matchesCategory = selectedCategory === "all" || product.categoryId === selectedCategory;
      const matchesSearch = !queryNeedle || normalize(`${product.name} ${product.description}`).includes(queryNeedle);
      return matchesCategory && matchesSearch;
    });
  }, [productQuery, products, selectedCategory]);
  const selectedCategoryName = selectedCategory === "all" ? "Todo el menu" : (categories.find((category) => category.id === selectedCategory)?.name ?? "Categoria");

  const cartQuantity = cart.reduce((total, item) => total + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const notes = `Pedido desde menu publico${requiresInvoice ? " - Requiere factura" : ""}`;
  const cartJson = JSON.stringify(cart.map(({ productId, name, price, quantity, notes: itemNotes }) => ({ productId, name, price, quantity, notes: itemNotes })));
  const hasLogoImage = restaurant.logoUrl.startsWith("http") || restaurant.logoUrl.startsWith("/");
  const logoText = restaurant.logoUrl || restaurant.name.slice(0, 1).toUpperCase();
  const heroImage = restaurant.bannerUrl || products.find((product) => product.isFeatured && product.imageUrl)?.imageUrl || products.find((product) => product.imageUrl)?.imageUrl || defaultImage;
  const topOrderedProducts = useMemo(() => {
    const featured = products.filter((product) => product.isAutoFeatured || product.isFeatured);
    return (featured.length ? featured : products).slice(0, 3);
  }, [products]);
  const bannerHeightClass = restaurant.publicBannerSize === "large" ? "min-h-[300px] sm:min-h-[380px]" : restaurant.publicBannerSize === "standard" ? "min-h-[240px] sm:min-h-[320px]" : "min-h-[190px] sm:min-h-[260px]";
  const publicBackgroundStyle: CSSProperties = restaurant.menuBackgroundImageUrl
    ? {
        backgroundImage: `linear-gradient(var(--color-menu-background-scrim), var(--color-menu-background-scrim)), url(${restaurant.menuBackgroundImageUrl})`,
        backgroundSize: "cover",
        backgroundAttachment: "fixed",
        backgroundPosition: "center",
      }
    : {};

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
      return [...current, { cartId, productId: product.id, name, price, quantity: 1, imageUrl: product.imageUrl || defaultImage, notes: itemNotes }];
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

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,var(--color-surface)_0%,#FFFFFF_44%,var(--color-surface)_100%)] text-[var(--text)]" style={publicBackgroundStyle}>
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-white/92 text-[var(--text)] shadow-[0_12px_34px_rgb(18_53_91_/_0.08)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-6 lg:px-8">
          <Link className="flex min-w-0 items-center" href={`/r/${restaurant.slug}`}>
            <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)] p-1 text-base font-black text-[var(--color-on-primary)] shadow-sm">
              {hasLogoImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={restaurant.name} className="h-full w-full rounded-full object-cover" src={restaurant.logoUrl} />
              ) : (
                <span className="grid h-full w-full place-items-center rounded-full bg-[var(--primary)] px-2 text-center leading-none">{logoText}</span>
              )}
            </span>
            <span className="ml-3 min-w-0">
              <span className="block truncate text-sm font-black text-[var(--text)] sm:max-w-[260px] sm:text-base">{restaurant.name}</span>
              <span className="mt-0.5 flex max-w-[46vw] items-center gap-1 truncate text-xs font-semibold text-[var(--muted)] sm:max-w-[320px]">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
                {restaurant.city || restaurant.address || "Menu online"}
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center justify-end gap-2">
            <span className="hidden items-center gap-1 rounded-full bg-[var(--primary-light)] px-3 py-1 text-xs font-black text-[var(--primary)] md:inline-flex">
              <Clock3 className="h-3.5 w-3.5" />
              Abierto hoy
            </span>
            <Link className="hidden rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-black text-[var(--primary)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)] sm:inline-flex" href={`/r/${restaurant.slug}/seguimiento`}>
              Rastrear pedido
            </Link>
            <button className="relative inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)]" onClick={openDrawer} type="button">
              <ShoppingCart className="h-5 w-5" />
              <span className="hidden text-sm font-black md:inline">Tu pedido</span>
              {cartQuantity ? <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--primary)] text-[10px] font-black text-[var(--color-on-primary)]">{cartQuantity}</span> : null}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-3 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-8">
        <section className="min-w-0">
          <div className="relative mb-5 overflow-hidden rounded-[2rem] bg-[var(--primary)] shadow-[0_28px_70px_rgb(8_36_65_/_0.22)]">
            <div className={cn("relative", bannerHeightClass)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={restaurant.name} className="absolute inset-0 h-full w-full object-cover" src={heroImage} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(8_36_65_/_0.16)_0%,rgb(8_36_65_/_0.34)_42%,rgb(8_36_65_/_0.88)_100%)]" />
              <div className="absolute left-4 right-4 top-4 z-20 flex items-center justify-between gap-3">
                <Link className="grid h-12 w-12 place-items-center rounded-full bg-white text-[var(--primary)] shadow-xl" href="/">
                  <ArrowRight className="h-5 w-5 rotate-180" />
                </Link>
                <div className="flex items-center gap-2">
                  <button className="grid h-12 w-12 place-items-center rounded-full bg-white text-[var(--primary)] shadow-xl" type="button">
                    <Share2 className="h-5 w-5" />
                  </button>
                  <button className="grid h-12 w-12 place-items-center rounded-full bg-white text-[var(--primary)] shadow-xl" type="button">
                    <Heart className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className={cn("relative z-10 flex max-w-2xl flex-col justify-end p-5 pb-7 text-[var(--color-on-primary)] sm:p-8", bannerHeightClass)}>
                <span className="mb-3 inline-flex w-fit items-center gap-2 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-black text-[var(--primary)] shadow-[var(--shadow-glow)]">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  4.8
                </span>
                <h1 className="text-4xl font-black leading-none sm:text-6xl">{restaurant.name}</h1>
                <p className="mt-3 max-w-md text-sm font-semibold leading-6 text-white/86 sm:text-base">
                  {restaurant.description || "Elige tus productos, confirma tu pedido y el equipo lo recibe al instante."}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-black text-white">
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-4 w-4" />
                    25-35 min
                  </span>
                  <span className="h-1 w-1 rounded-full bg-[var(--accent)]" />
                  <span>{settings?.deliveryFee ? `${formatMoney(settings.deliveryFee)} envio` : "Delivery disponible"}</span>
                  <span className="h-1 w-1 rounded-full bg-[var(--accent)]" />
                  <span>{products.length} platos</span>
                </div>
              </div>
              <div className="absolute bottom-5 right-5 z-20 hidden max-w-xs rounded-[1.35rem] bg-[var(--primary)]/92 p-4 text-white shadow-xl ring-1 ring-white/15 backdrop-blur sm:block">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--accent)] text-[var(--primary)]">
                    <Flame className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-black">Ofertas y favoritos</p>
                    <p className="mt-1 text-xs font-semibold text-white/76">Agrega platos al pedido y confirma en minutos.</p>
                  </div>
                </div>
              </div>
              <div className="absolute bottom-4 left-4 z-20 grid h-20 w-20 place-items-center overflow-hidden rounded-[1.35rem] border-4 border-[var(--surface)] bg-[var(--surface)] p-1 text-xl font-black text-[var(--color-on-primary)] shadow-xl sm:hidden">
                {hasLogoImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={restaurant.name} className="h-full w-full rounded-[1rem] object-cover" src={restaurant.logoUrl} />
                ) : (
                  <span className="grid h-full w-full place-items-center rounded-[1rem] bg-[var(--primary)] px-2 text-center leading-none">{logoText}</span>
                )}
              </div>
            </div>
          </div>

          {topOrderedProducts.length ? (
            <div className="mb-4 rounded-[1.65rem] border border-[var(--border)] bg-white p-4 shadow-[0_18px_48px_rgb(18_53_91_/_0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-[var(--primary)]">Favoritos</p>
                  <h2 className="text-xl font-black">Top picks para ti</h2>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {topOrderedProducts.map((product) => (
                  <button className="grid grid-cols-[78px_1fr_auto] items-center gap-3 rounded-[1.25rem] bg-[var(--color-surface)] p-2 text-left shadow-sm ring-1 ring-[var(--border)] transition hover:-translate-y-0.5 hover:bg-[var(--accent-soft)]" key={product.id} onClick={() => setSelectedProduct(product)} type="button">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={product.name} className="h-20 w-[78px] rounded-[1.1rem] object-cover" src={product.imageUrl || defaultImage} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black">{product.name}</span>
                      <span className="block text-xs font-bold text-[var(--muted)]">{product.orderCount ? `${product.orderCount} pedidos` : "Nuevo"}</span>
                    </span>
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent)] text-[var(--primary)]">
                      <Plus className="h-5 w-5" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="flex min-h-14 items-center gap-3 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 shadow-[0_18px_48px_rgb(18_53_91_/_0.08)] transition focus-within:border-[var(--primary)] focus-within:ring-4 focus-within:ring-[var(--accent-ring)]">
              <Search className="h-5 w-5 text-[var(--muted)]" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm font-black outline-none placeholder:text-[var(--color-placeholder)]"
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Busca platos, combos o favoritos"
                value={productQuery}
              />
              {productQuery ? (
                <button className="grid h-9 w-9 place-items-center rounded-full bg-[var(--primary)] text-white" onClick={() => setProductQuery("")} type="button">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </label>
            <Link className="inline-flex rounded-full bg-[var(--primary-light)] px-4 py-2 text-sm font-black text-[var(--primary)] sm:hidden" href={`/r/${restaurant.slug}/seguimiento`}>
              Rastrear pedido
            </Link>
            {orderError ? <OrderErrorMessage error={orderError} /> : null}
          </div>

          <div className="sticky top-[73px] z-20 -mx-3 mb-4 border-y border-[var(--border)] bg-[var(--color-card-elevated)] px-3 py-3 shadow-sm backdrop-blur sm:mx-0 sm:rounded-[1.5rem] sm:border" id="catalogo">
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
              <ProductTile config={configByProduct[product.id]} key={product.id} onSelect={() => setSelectedProduct(product)} product={product} />
            ))}
          </div>

          {!filteredProducts.length ? <div className="rounded-[1.5rem] bg-[var(--surface)] p-6 text-center text-sm font-semibold text-[var(--muted)] ring-1 ring-[var(--border)]">
              <IllustrationAsset className="mx-auto max-w-[190px]" name="emptyCart" sizes="190px" />
              <p className="mt-3 font-black text-[var(--text)]">No hay productos disponibles</p>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Prueba con otra categoria o vuelve a ver todo el menu.</p>
            </div> : null}
        </section>
      </div>

      <button className="fixed bottom-3 left-3 right-3 z-40 flex min-h-16 items-center justify-between gap-3 rounded-[1.25rem] bg-[var(--primary)] px-4 py-3 text-left text-sm font-black text-[var(--color-on-primary)] shadow-2xl ring-1 ring-[var(--color-on-primary-border-strong)] lg:hidden" onClick={openDrawer} type="button">
        <span className="inline-flex min-w-0 items-center gap-3">
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-[var(--primary)] shadow-sm">
            <ShoppingCart className="h-5 w-5" />
            {cartQuantity ? <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--color-success-strong)] text-[10px] text-[var(--color-on-primary)]">{cartQuantity}</span> : null}
          </span>
          <span className="min-w-0">
            <span className="block truncate">{cartQuantity ? "Ver pedido" : "Tu pedido"}</span>
            <span className="block text-xs font-semibold text-[var(--color-on-primary-muted)]">{cartQuantity ? `${cartQuantity} producto${cartQuantity === 1 ? "" : "s"}` : "Carrito vacio"}</span>
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-base text-[var(--primary)]">
          {formatMoney(total)}
          <ArrowRight className="h-4 w-4" />
        </span>
      </button>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-x-hidden bg-[var(--color-overlay)] px-2 pb-2 pt-16 backdrop-blur-sm sm:items-center sm:p-4" onClick={requestCloseDrawer}>
          <div className={cn("max-h-[min(92dvh,820px)] w-full max-w-[min(100%,620px)] overflow-hidden rounded-t-[2rem] bg-[var(--surface)] text-[var(--text)] shadow-2xl sm:rounded-[2rem]", drawerClosing ? "public-sheet-exit" : "public-sheet-enter")} data-order-sheet onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-white/95 px-4 py-4 backdrop-blur">
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
                orderType={orderType}
                paymentMethod={paymentMethod}
                fulfillmentMode={fulfillmentMode}
                requiresInvoice={requiresInvoice}
                restaurant={restaurant}
                businessHours={businessHours}
                businessStatus={businessStatus}
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

function OrderErrorMessage({ error }: { error: string }) {
  const message =
    error === "no-open-cash"
      ? "La caja está cerrada. El restaurante debe abrir caja para recibir pedidos."
      : error === "receipt-required"
        ? "Para pago QR debes subir el comprobante antes de confirmar."
        : error === "qr-unavailable"
          ? "Este restaurante todavia no tiene QR configurado. Elige pago en efectivo."
          : error === "outside-hours"
            ? "El restaurante esta fuera de horario. Programa el pedido dentro del horario de atencion."
            : error === "schedule-past"
              ? "La hora programada debe ser posterior a la hora actual."
              : error === "invoice-disabled"
                ? "Este restaurante no tiene factura habilitada para pedidos publicos."
                : error === "delivery-address"
                  ? "Para delivery debes registrar una direccion de entrega."
                  : error === "invoice"
                    ? "Completa los datos de factura para confirmar el pedido."
                    : "No se pudo confirmar el pedido. Revisa los datos e intenta nuevamente.";

  return <div className="rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm font-bold text-[var(--color-danger-strong)] md:col-span-2">{message}</div>;
}

function CategoryButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={cn("h-11 shrink-0 snap-start rounded-full px-4 text-sm font-black transition", active ? "bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)]" : "bg-[var(--primary-light)] text-[var(--muted)] hover:text-[var(--primary-dark)]")} onClick={onClick} type="button">
      {label}
    </button>
  );
}

function ProductTile({ product, config, onSelect }: { product: Product; config?: ProductConfigMap[string]; onSelect: () => void }) {
  const hasConfiguration = Boolean(config?.variants.length || config?.optionGroups.length);

  return (
    <button className="grid grid-cols-[108px_minmax(0,1fr)_46px] items-center gap-3 rounded-[1.35rem] border border-[var(--border)] bg-white p-2 text-left text-[var(--text)] shadow-[0_18px_48px_rgb(18_53_91_/_0.08)] transition hover:-translate-y-0.5 hover:bg-[var(--accent-soft)] hover:shadow-[0_22px_56px_rgb(18_53_91_/_0.12)] sm:grid-cols-[132px_minmax(0,1fr)_52px]" onClick={onSelect} type="button">
      <span className="relative h-28 overflow-hidden rounded-[1.2rem] bg-[var(--primary-light)] sm:h-32">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={product.name} className="h-full w-full object-cover" src={product.imageUrl || defaultImage} />
        {product.isAutoFeatured || product.isFeatured ? <span className="absolute left-2 top-2 rounded-full bg-[var(--accent)] px-2 py-1 text-[10px] font-black text-[var(--primary)]">Top</span> : null}
      </span>
      <span className="min-w-0 py-1">
        <span className="flex flex-wrap items-center gap-1.5">
          {hasConfiguration ? <span className="rounded-full bg-[var(--primary-light)] px-2 py-1 text-[10px] font-black text-[var(--primary-dark)]">Personalizable</span> : null}
          {product.isPromotion ? <span className="rounded-full bg-[var(--color-warning-soft)] px-2 py-1 text-[10px] font-black text-[var(--color-warning-strong)]">Promo</span> : null}
        </span>
        <span className="mt-1 block line-clamp-2 text-lg font-black leading-5">{product.name}</span>
        <span className="mt-1 block line-clamp-2 text-sm leading-5 text-[var(--muted)]">{product.description || "Listo para pedir."}</span>
        <span className="mt-3 flex items-center gap-3 text-sm font-black">
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-light)] px-2 py-1 text-[var(--primary)]">
            <Star className="h-3.5 w-3.5 fill-current" />
            4.{Math.min(9, Math.max(3, product.orderCount || 6))}
          </span>
          <span className="text-base text-[var(--primary)]">{formatMoney(product.price)}</span>
        </span>
      </span>
      <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)] sm:h-12 sm:w-12">
        <Plus className="h-6 w-6" />
      </span>
    </button>
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
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [selectedOptions, setSelectedOptions] = useState<SelectedOptions>(() => {
    const initial: SelectedOptions = {};
    for (const group of optionGroups) {
      initial[group.id] = group.isRequired && group.maxChoices === 1 && group.options[0] ? [group.options[0].id] : [];
    }
    return initial;
  });
  const [isClosing, setIsClosing] = useState(false);

  const selectedVariant = variants.find((variant) => variant.id === variantId) ?? null;
  const flatOptions = optionGroups.flatMap((group) => group.options);
  const chosenOptions = Object.values(selectedOptions)
    .flat()
    .map((optionId) => flatOptions.find((option) => option.id === optionId))
    .filter((option): option is ProductOption => Boolean(option));
  const total = product.price + (selectedVariant?.priceDelta ?? 0) + chosenOptions.reduce((sum, option) => sum + option.priceDelta, 0);
  const canAdd = optionGroups.every((group) => (selectedOptions[group.id]?.length ?? 0) >= group.minChoices);

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

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-[var(--color-overlay)] p-0 text-[var(--text)] backdrop-blur-sm sm:place-items-center sm:p-4" onClick={requestClose}>
      <div className={cn("max-h-[94vh] w-full overflow-y-auto rounded-t-[2rem] bg-[var(--surface)] shadow-2xl sm:max-w-3xl sm:rounded-[2rem]", isClosing ? "public-sheet-exit" : "public-sheet-enter")} onClick={(event) => event.stopPropagation()}>
        <div className="relative h-72 overflow-hidden bg-[var(--primary)] sm:h-80">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={product.name} className="h-full w-full object-cover" src={product.imageUrl || defaultImage} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/42 to-transparent" />
          <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
            <button className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-[var(--primary)] shadow-xl" onClick={requestClose} type="button">
              <ArrowRight className="h-5 w-5 rotate-180" />
            </button>
            <div className="flex items-center gap-2">
              <button className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-[var(--primary)] shadow-xl" type="button">
                <Heart className="h-5 w-5" />
              </button>
              <button className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-[var(--primary)] shadow-xl" type="button">
                <Share2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="-mt-8 grid gap-5 rounded-t-[2rem] bg-[var(--surface)] p-4 sm:p-6">
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase text-[var(--primary)]">Personalizar</p>
              <h2 className="mt-1 text-3xl font-black leading-tight">{product.name}</h2>
              <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-[var(--muted)]">{product.description || "Elige las opciones y agrega este plato a tu pedido."}</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-2xl bg-[var(--primary-light)] px-3 py-2 text-sm font-black text-[var(--primary)]">
              <Star className="h-4 w-4 fill-current" />
              4.6
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 border-y border-[var(--border)] py-3 text-center text-xs font-bold text-[var(--muted)]">
            <span>
              <strong className="block text-sm text-[var(--text)]">Medio</strong>
              Picante
            </span>
            <span>
              <strong className="block text-sm text-[var(--text)]">25-35 min</strong>
              Entrega
            </span>
            <span>
              <strong className="block text-sm text-[var(--text)]">{formatMoney(product.price)}</strong>
              Base
            </span>
          </div>
          {variants.length ? (
            <section>
              <h3 className="text-sm font-black">Variante</h3>
              <div className="mt-2 grid gap-2">
                {variants.map((variant) => (
                  <button className={cn("flex min-h-14 items-center justify-between rounded-2xl border px-4 text-left transition", variantId === variant.id ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary-dark)]" : "border-[var(--border)] bg-[var(--surface)]")} key={variant.id} onClick={() => setVariantId(variant.id)} type="button">
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

        <div className="sticky bottom-0 grid gap-3 border-t border-[var(--border)] bg-white/95 p-4 backdrop-blur sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-xs font-black uppercase text-[var(--muted)]">Total producto</p>
            <p className="text-2xl font-black text-[var(--primary)]">{formatMoney(total)}</p>
          </div>
          <Button className="min-h-14 rounded-[1.1rem] bg-[var(--accent)] px-8 text-[var(--primary)] shadow-[var(--shadow-glow)] hover:bg-[#d9ff22]" disabled={!canAdd} onClick={() => onAdd(product, selectedVariant, chosenOptions)} type="button">
            Agregar al pedido
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
  settings,
  businessHours,
  businessStatus,
  cart,
  cartJson,
  total,
  paymentMethod,
  fulfillmentMode,
  orderType,
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
  settings: RestaurantSettings | null;
  businessHours: BusinessHour[];
  businessStatus: ReturnType<typeof getBusinessStatus>;
  cart: CartItem[];
  cartJson: string;
  total: number;
  paymentMethod: "cash" | "qr";
  fulfillmentMode: "now" | "scheduled";
  orderType: PublicOrderType;
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
  const qrAvailable = Boolean(settings?.qrPaymentUrl);
  const nowAvailable = !businessStatus.hasSchedule || businessStatus.isOpen;
  const freeDeliveryFrom = settings?.freeDeliveryFrom ?? 0;
  const deliveryFee = orderType === "delivery" && (!freeDeliveryFrom || total < freeDeliveryFrom) ? (settings?.deliveryFee ?? 0) : 0;
  const grandTotal = total + deliveryFee;
  const paymentReceiptRef = useRef<HTMLInputElement>(null);
  const [activeStep, setActiveStep] = useState<OrderStepKey>("fulfillment");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [deliveryAddressDetail, setDeliveryAddressDetail] = useState("");
  const [deliveryMapsUrl, setDeliveryMapsUrl] = useState("");
  const [requestedFulfillmentAt, setRequestedFulfillmentAt] = useState(() => (!businessStatus.isOpen && businessStatus.hasSchedule ? businessStatus.nextOpeningInputValue : ""));
  const [invoiceDocumentType, setInvoiceDocumentType] = useState("nit");
  const [invoiceDocumentNumber, setInvoiceDocumentNumber] = useState("");
  const [invoiceName, setInvoiceName] = useState("");

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
    }

    if (step === "invoice" && invoiceEnabled && requiresInvoice) {
      if (!invoiceDocumentType || !invoiceDocumentNumber.trim() || !invoiceName.trim()) {
        return reject("Completa los datos de factura o marca que no necesitas factura.");
      }
    }

    if (step === "payment") {
      if (paymentMethod === "qr" && !qrAvailable) {
        return reject("Este restaurante todavia no tiene QR configurado. Elige efectivo.");
      }
      if (paymentMethod === "qr" && !(paymentReceiptRef.current?.files?.length ?? 0)) {
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

    const nextStep = steps[Math.min(activeStepIndex + 1, steps.length - 1)];
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
    setIsSubmitting(true);
  }

  return (
    <form action={createPublicOrderAction} className={cn("w-full min-w-0 rounded-[1.5rem] bg-[var(--surface)] text-[var(--text)] shadow-sm", compact ? "rounded-none p-0 shadow-none" : "p-4")} onSubmit={handleSubmit}>
      <input name="restaurantId" type="hidden" value={restaurant.id} />
      <input name="restaurantSlug" type="hidden" value={restaurant.slug} />
      <input name="orderType" type="hidden" value={orderType} />
      <input name="paymentMethod" type="hidden" value={paymentMethod} />
      <input name="notes" type="hidden" value={notes} />
      <input name="invoiceRequired" type="hidden" value={invoiceEnabled && requiresInvoice ? "on" : ""} />
      <input name="cartJson" type="hidden" value={cartJson} />

      {!compact ? <h2 className="text-2xl font-black">Tu pedido</h2> : null}

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
          <ChoiceCard active={orderType === "delivery"} disabled={!deliveryEnabled} icon={<Bike className="h-5 w-5" />} label="Envio a domicilio" onClick={() => setOrderType("delivery")} text={deliveryFee ? `${formatMoney(deliveryFee, settings?.currency)} de envio` : "Delivery disponible"} />
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
        <StepIntro icon={<UserRound className="h-5 w-5" />} title="Datos del cliente" description={orderType === "delivery" ? "Para envio necesitamos nombre, WhatsApp y direccion." : "Para recojo bastan tus datos principales."} />
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
          <label className="block text-sm font-black">
            Link de Google Maps
            <Input className="mt-2" name="deliveryMapsUrl" onChange={(event) => setDeliveryMapsUrl(event.target.value)} placeholder="https://maps.google.com/..." value={deliveryMapsUrl} />
          </label>
        </div>
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
          <ChoiceCard active={paymentMethod === "cash"} icon={<CreditCard className="h-5 w-5" />} label="Efectivo" onClick={() => setPaymentMethod("cash")} text="Caja validara el cobro antes de preparar." />
          <ChoiceCard active={paymentMethod === "qr"} disabled={!qrAvailable} icon={<ReceiptText className="h-5 w-5" />} label="Pago QR" onClick={() => setPaymentMethod("qr")} text={qrAvailable ? "Escanea y sube comprobante." : "Sin QR configurado."} />
        </div>
        <div className={cn(paymentMethod === "qr" && qrAvailable ? "grid gap-3 rounded-2xl bg-[var(--primary-light)]/55 p-3 sm:grid-cols-[108px_1fr] sm:items-center" : "hidden")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="QR de pago" className="h-28 w-28 rounded-2xl border border-[var(--border)] object-cover" src={settings?.qrPaymentUrl} />
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
        <label className={cn("block text-sm font-black", paymentMethod === "qr" ? "block" : "hidden")}>
          Comprobante QR
          <Input accept="image/*,.pdf" className="mt-2" name="paymentReceiptFile" ref={paymentReceiptRef} type="file" />
        </label>
        <p className="rounded-2xl bg-[var(--color-card-muted)] p-3 text-sm leading-6 text-[var(--muted)]">
          {paymentMethod === "cash" ? "El pedido quedara guardado como pago en efectivo pendiente de validacion en caja." : "El equipo confirmara el comprobante antes de preparar el pedido."}
        </p>
      </section>

      <section className={cn("mt-4 space-y-3", activeStep === "review" ? "block" : "hidden")}>
        <StepIntro icon={<ShoppingCart className="h-5 w-5" />} title="Revision final" description="Confirma productos, entrega, pago y total antes de enviar." />
        <div className="space-y-2">
          {cart.length ? (
            cart.map((item) => (
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-[var(--border)]" key={item.cartId}>
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
                  <div className="mt-3 inline-flex overflow-hidden rounded-full border border-[var(--border)] bg-white">
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
                <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Elige tus platos favoritos para continuar.</p>
              </div>
          )}
        </div>
        <div className="grid gap-2 rounded-[1.25rem] bg-[var(--color-surface)] p-4 text-sm ring-1 ring-[var(--border)]">
          <ReviewLine label="Modalidad" value={orderType === "delivery" ? "Envio a domicilio" : "Recojo en local"} />
          <ReviewLine label="Horario" value={fulfillmentMode === "scheduled" ? requestedFulfillmentAt.replace("T", " ") : "Ahora mismo"} />
          <ReviewLine label="Cliente" value={customerName || "Sin nombre"} />
          {orderType === "delivery" ? <ReviewLine label="Direccion" value={customerAddress || "Sin direccion"} /> : null}
          {invoiceEnabled ? <ReviewLine label="Factura" value={requiresInvoice ? `${invoiceDocumentNumber || "Documento"} - ${invoiceName || "Nombre"}` : "No requiere"} /> : null}
          <ReviewLine label="Pago" value={paymentMethod === "cash" ? "Efectivo" : "QR con comprobante"} />
        </div>
      </section>

      <div className="mt-4 rounded-[1.25rem] bg-[var(--color-surface)] p-4 text-base ring-1 ring-[var(--border)]">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-[var(--muted)]">Subtotal</span>
          <strong>{formatMoney(total, settings?.currency)}</strong>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-semibold text-[var(--muted)]">Envio</span>
          <strong>{formatMoney(deliveryFee, settings?.currency)}</strong>
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
        active ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary-dark)]" : "border-[var(--border)] bg-white text-[var(--text)] hover:border-[var(--primary-light)]",
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
