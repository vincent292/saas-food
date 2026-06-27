"use client";

import { ArrowRight, Check, Clock3, Minus, Plus, Search, ShoppingCart, Star, X } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, useMemo, useState } from "react";
import { createPublicOrderAction } from "@/app/r/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import type { Category, Product, ProductConfiguration, ProductOption, ProductOptionGroup, ProductVariant } from "@/types/product.types";
import type { Restaurant, RestaurantSettings } from "@/types/restaurant.types";

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

export function PublicRestaurantOrderClient({
  restaurant,
  categories,
  products,
  settings,
  configuration,
  orderError,
}: {
  restaurant: Restaurant;
  categories: Category[];
  products: Product[];
  settings: RestaurantSettings | null;
  configuration: ProductConfiguration;
  orderError?: string;
}) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "qr">("cash");
  const [requiresInvoice, setRequiresInvoice] = useState(false);
  const [fulfillmentMode, setFulfillmentMode] = useState<"now" | "scheduled">("now");
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
    if (selectedCategory === "all") {
      return products;
    }
    return products.filter((product) => product.categoryId === selectedCategory);
  }, [products, selectedCategory]);

  const cartQuantity = cart.reduce((total, item) => total + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const notes = `Pedido desde menú público${requiresInvoice ? " - Requiere factura" : ""}`;
  const cartJson = JSON.stringify(cart.map(({ productId, name, price, quantity, notes: itemNotes }) => ({ productId, name, price, quantity, notes: itemNotes })));
  const hasLogoImage = restaurant.logoUrl.startsWith("http") || restaurant.logoUrl.startsWith("/");
  const logoText = restaurant.logoUrl || restaurant.name.slice(0, 1).toUpperCase();
  const heroImage = restaurant.bannerUrl || products.find((product) => product.isFeatured && product.imageUrl)?.imageUrl || products.find((product) => product.imageUrl)?.imageUrl || defaultImage;
  const topOrderedProducts = useMemo(() => products.filter((product) => product.isAutoFeatured).slice(0, 3), [products]);
  const bannerHeightClass = restaurant.publicBannerSize === "large" ? "min-h-[300px] sm:min-h-[380px]" : restaurant.publicBannerSize === "standard" ? "min-h-[240px] sm:min-h-[320px]" : "min-h-[190px] sm:min-h-[260px]";
  const publicBackgroundStyle: CSSProperties = restaurant.menuBackgroundImageUrl
    ? {
        backgroundImage: `linear-gradient(rgba(255,255,255,.88), rgba(255,255,255,.88)), url(${restaurant.menuBackgroundImageUrl})`,
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

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--text)]" style={publicBackgroundStyle}>
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--nav-background)] text-[var(--nav-text)] shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2.5 sm:px-6 lg:px-8">
          <Link className="flex min-w-0 items-center" href={`/r/${restaurant.slug}`}>
            <span className="grid h-12 min-w-12 place-items-center overflow-hidden rounded-2xl bg-[var(--primary)] px-3 text-base font-black text-white shadow-sm">
              {hasLogoImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={restaurant.name} className="h-12 w-12 object-cover" src={restaurant.logoUrl} />
              ) : (
                logoText
              )}
            </span>
            <span className="ml-3 max-w-[42vw] truncate text-sm font-black uppercase sm:max-w-[260px] sm:text-base">{restaurant.name}</span>
          </Link>

          <div className="flex shrink-0 items-center justify-end gap-2">
            <span className="hidden items-center gap-1 rounded-full bg-[var(--primary-light)] px-3 py-1 text-xs font-black text-[var(--primary)] md:inline-flex">
              <Clock3 className="h-3.5 w-3.5" />
              Abierto hoy
            </span>
            <Link className="hidden rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-black text-[var(--primary)] shadow-sm sm:inline-flex" href={`/r/${restaurant.slug}/seguimiento`}>
              Rastrear pedido
            </Link>
            <button className="relative inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 text-[var(--text)] shadow-sm transition hover:-translate-y-0.5" onClick={() => setDrawerOpen(true)} type="button">
              <ShoppingCart className="h-5 w-5" />
              <span className="hidden text-sm font-black md:inline">Tu pedido</span>
              {cartQuantity ? <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--primary)] text-[10px] font-black text-white">{cartQuantity}</span> : null}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-3 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-8">
        <section className="min-w-0">
          <div className="relative mb-5 overflow-hidden rounded-tl-[1.75rem] rounded-br-[2.5rem] border border-[var(--border)] bg-white shadow-sm">
            <div className={cn("relative", bannerHeightClass)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={restaurant.name} className="absolute inset-0 h-full w-full object-cover" src={heroImage} />
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent" />
              <div className={cn("relative z-10 flex max-w-xl flex-col justify-end p-5 pb-20 text-white sm:p-8 sm:pb-8", bannerHeightClass)}>
                <span className="mb-3 inline-flex w-fit items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-[var(--primary)]">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  Menú online
                </span>
                <h1 className="text-4xl font-black leading-none sm:text-6xl">{restaurant.name}</h1>
                <p className="mt-3 max-w-md text-sm font-semibold leading-6 text-white/90 sm:text-base">
                  {restaurant.description || "Elige tus productos, confirma tu pedido y el equipo lo recibe al instante."}
                </p>
                <button className="mt-5 inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-[var(--primary)] px-5 text-sm font-black text-white shadow-lg" onClick={() => document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" })} type="button">
                  Pedir ahora
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <div className="absolute bottom-4 left-4 z-20 grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border-4 border-white bg-[var(--primary)] text-xl font-black text-white shadow-xl sm:hidden">
                {hasLogoImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={restaurant.name} className="h-full w-full object-cover" src={restaurant.logoUrl} />
                ) : (
                  logoText
                )}
              </div>
            </div>
          </div>

          {topOrderedProducts.length ? (
            <div className="mb-4 rounded-[1.5rem] border border-[var(--border)] bg-white/95 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-[var(--primary)]">Mas pedido</p>
                  <h2 className="text-xl font-black">Productos estrella por demanda</h2>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {topOrderedProducts.map((product) => (
                  <button className="grid grid-cols-[64px_1fr] gap-3 rounded-2xl bg-[var(--primary-light)] p-2 text-left" key={product.id} onClick={() => setSelectedProduct(product)} type="button">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={product.name} className="h-16 w-16 rounded-2xl object-cover" src={product.imageUrl || defaultImage} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black">{product.name}</span>
                      <span className="block text-xs font-bold text-[var(--muted)]">{product.orderCount} pedidos</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 shadow-sm">
              <Search className="h-5 w-5 text-[var(--muted)]" />
              <span className="text-sm font-semibold text-[var(--muted)]">Busca por categoría y elige tus favoritos</span>
            </div>
            <Link className="inline-flex rounded-full bg-[var(--primary-light)] px-4 py-2 text-sm font-black text-[var(--primary)] sm:hidden" href={`/r/${restaurant.slug}/seguimiento`}>
              Rastrear pedido
            </Link>
            {orderError ? <OrderErrorMessage error={orderError} /> : null}
          </div>

          <div className="sticky top-[73px] z-20 -mx-3 mb-4 border-y border-[var(--border)] bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:mx-0 sm:rounded-[1.5rem] sm:border" id="catalogo">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <CategoryButton active={selectedCategory === "all"} label="Todo" onClick={() => setSelectedCategory("all")} />
              {categories.map((category) => (
                <CategoryButton active={selectedCategory === category.id} key={category.id} label={category.name} onClick={() => setSelectedCategory(category.id)} />
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => (
              <ProductTile config={configByProduct[product.id]} key={product.id} onSelect={() => setSelectedProduct(product)} product={product} />
            ))}
          </div>

          {!filteredProducts.length ? <div className="rounded-[1.25rem] bg-white p-6 text-center text-sm font-semibold text-[var(--muted)]">No hay productos disponibles en esta categoría.</div> : null}
        </section>
      </div>

      <button className="fixed bottom-3 left-14 right-3 z-40 flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-[var(--primary)] px-4 py-3 text-left text-sm font-black text-white shadow-2xl ring-1 ring-white/30 sm:left-4 lg:hidden" onClick={() => setDrawerOpen(true)} type="button">
        <span className="inline-flex min-w-0 items-center gap-3">
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[var(--primary)] shadow-sm">
            <ShoppingCart className="h-5 w-5" />
            {cartQuantity ? <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-950 text-[10px] text-white">{cartQuantity}</span> : null}
          </span>
          <span className="min-w-0">
            <span className="block truncate">Tu pedido</span>
            <span className="block text-xs font-semibold text-white/80">{cartQuantity ? `${cartQuantity} producto${cartQuantity === 1 ? "" : "s"}` : "Carrito vacio"}</span>
          </span>
        </span>
        <span className="shrink-0 text-base">{formatMoney(total)}</span>
      </button>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-x-hidden bg-slate-950/45 px-2 pb-2 pt-16 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[min(92dvh,760px)] w-full max-w-[min(100%,560px)] overflow-hidden rounded-[1.35rem] bg-[var(--surface)] text-[var(--text)] shadow-2xl" data-order-sheet>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              <h2 className="min-w-0 truncate text-xl font-black sm:text-2xl">Tu pedido</h2>
              <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100" onClick={() => setDrawerOpen(false)} type="button">
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
        : error === "delivery-address"
          ? "Para delivery debes registrar una direccion de entrega."
          : error === "invoice"
            ? "Completa los datos de factura para confirmar el pedido."
            : "No se pudo confirmar el pedido. Revisa los datos e intenta nuevamente.";

  return <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700 md:col-span-2">{message}</div>;
}

function CategoryButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={cn("h-11 shrink-0 rounded-full px-4 text-sm font-black transition", active ? "bg-[var(--primary)] text-white" : "bg-[var(--primary-light)] text-[var(--muted)] hover:text-[var(--primary-dark)]")} onClick={onClick} type="button">
      {label}
    </button>
  );
}

function ProductTile({ product, config, onSelect }: { product: Product; config?: ProductConfigMap[string]; onSelect: () => void }) {
  const hasConfiguration = Boolean(config?.variants.length || config?.optionGroups.length);

  return (
    <article className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 rounded-2xl border border-[var(--border)] bg-white p-3 text-[var(--text)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:block sm:overflow-hidden sm:p-0">
      <div className="h-24 overflow-hidden rounded-2xl bg-[var(--primary-light)] sm:h-auto sm:aspect-[4/3] sm:rounded-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={product.name} className="h-full w-full object-cover" src={product.imageUrl || defaultImage} />
      </div>
      <div className="grid min-w-0 content-between gap-2 sm:p-4 sm:pt-3">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="pt-1 text-[10px] font-black uppercase text-[var(--primary)]">Producto</p>
            <div className="flex max-w-[64%] shrink-0 flex-wrap justify-end gap-1">
            {product.isFeatured ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">Estrella</span> : null}
            {product.isAutoFeatured ? <span className="rounded-full bg-[var(--primary-light)] px-2 py-1 text-[10px] font-black text-[var(--primary-dark)]">Mas pedido</span> : null}
            {hasConfiguration ? <span className="rounded-full bg-[var(--primary-light)] px-2 py-1 text-[10px] font-black text-[var(--primary-dark)]">Configurable</span> : null}
            </div>
          </div>
          <h3 className="mt-1 line-clamp-2 text-lg font-black leading-5">{product.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--muted)]">{product.description || "Listo para pedir."}</p>
        </div>
        <div className="flex items-end justify-between gap-2">
          <span className="text-base font-black text-[var(--primary)]">{formatMoney(product.price)}</span>
          <button className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-full bg-[var(--primary)] px-3 text-sm font-black text-white shadow-sm transition hover:bg-[var(--primary-dark)]" onClick={onSelect} type="button">
            <span className="hidden min-[390px]:inline">{hasConfiguration ? "Personalizar" : "Agregar"}</span>
            <span className="min-[390px]:hidden">{hasConfiguration ? "Editar" : "Sumar"}</span>
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
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

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-slate-950/55 p-0 text-[var(--text)] backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-[1.5rem] bg-[var(--surface)] shadow-2xl sm:max-w-2xl sm:rounded-[1.5rem]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] p-4">
          <div>
            <p className="text-xs font-black uppercase text-[var(--primary)]">Personalizar</p>
            <h2 className="text-2xl font-black">{product.name}</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">Precio base {formatMoney(product.price)}</p>
          </div>
          <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 hover:bg-slate-200" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 p-4">
          {variants.length ? (
            <section>
              <h3 className="text-sm font-black">Variante</h3>
              <div className="mt-2 grid gap-2">
                {variants.map((variant) => (
                  <button className={cn("flex min-h-14 items-center justify-between rounded-2xl border px-4 text-left transition", variantId === variant.id ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary-dark)]" : "border-[var(--border)] bg-white")} key={variant.id} onClick={() => setVariantId(variant.id)} type="button">
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
                  <span className={cn("rounded-full px-3 py-1 text-xs font-black", selectedCount >= group.minChoices ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                    {selectedCount}/{group.maxChoices}
                  </span>
                </div>
                <div className="mt-3 grid gap-2">
                  {group.options.map((option) => {
                    const selected = selectedOptions[group.id]?.includes(option.id) ?? false;
                    return (
                      <button className={cn("flex min-h-12 items-center justify-between rounded-2xl border px-3 text-left transition", selected ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary-dark)]" : "border-[var(--border)] bg-white")} key={option.id} onClick={() => toggleOption(group, option)} type="button">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border", selected ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)]")}>
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

        <div className="sticky bottom-0 grid gap-3 border-t border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-xs font-black uppercase text-[var(--muted)]">Total producto</p>
            <p className="text-2xl font-black text-[var(--primary)]">{formatMoney(total)}</p>
          </div>
          <Button className="min-h-12 px-8" disabled={!canAdd} onClick={() => onAdd(product, selectedVariant, chosenOptions)} type="button">
            Agregar al pedido
          </Button>
        </div>
      </div>
    </div>
  );
}

function PublicOrderPanel({
  restaurant,
  settings,
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form action={createPublicOrderAction} className={cn("w-full min-w-0 rounded-[1.5rem] bg-[var(--surface)] text-[var(--text)] shadow-sm", compact ? "rounded-none p-0 shadow-none" : "p-4")} onSubmit={() => setIsSubmitting(true)}>
      <input name="restaurantId" type="hidden" value={restaurant.id} />
      <input name="restaurantSlug" type="hidden" value={restaurant.slug} />
      <input name="orderType" type="hidden" value={orderType} />
      <input name="paymentMethod" type="hidden" value={paymentMethod} />
      <input name="notes" type="hidden" value={notes} />
      <input name="invoiceRequired" type="hidden" value={requiresInvoice ? "on" : ""} />
      <input name="cartJson" type="hidden" value={cartJson} />

      {!compact ? <h2 className="text-2xl font-black">Tu pedido</h2> : null}

      <div className="mt-2 grid grid-cols-2 rounded-2xl bg-[var(--primary-light)] p-1">
        <button className={cn("min-h-11 rounded-full px-2 text-xs font-black text-[var(--muted)] disabled:opacity-40 min-[380px]:text-sm", orderType === "pickup" && "bg-[var(--primary)] text-white")} disabled={!pickupEnabled} onClick={() => setOrderType("pickup")} type="button">
          Recojo
        </button>
        <button className={cn("min-h-11 rounded-full px-2 text-xs font-black text-[var(--muted)] disabled:opacity-40 min-[380px]:text-sm", orderType === "delivery" && "bg-[var(--primary)] text-white")} disabled={!deliveryEnabled} onClick={() => setOrderType("delivery")} type="button">
          Envío a domicilio
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 rounded-2xl bg-[var(--primary-light)] p-1">
        <button className={cn("min-h-11 rounded-full px-2 text-xs font-black text-[var(--muted)] min-[380px]:text-sm", fulfillmentMode === "now" && "bg-[var(--primary)] text-white")} onClick={() => setFulfillmentMode("now")} type="button">
          Ahora mismo
        </button>
        <button className={cn("min-h-11 rounded-full px-2 text-xs font-black text-[var(--muted)] min-[380px]:text-sm", fulfillmentMode === "scheduled" && "bg-[var(--primary)] text-white")} onClick={() => setFulfillmentMode("scheduled")} type="button">
          Programar hora
        </button>
      </div>

      {fulfillmentMode === "scheduled" ? (
        <label className="mt-3 block text-sm font-black">
          Hora de entrega o recojo
          <Input className="mt-2" name="requestedFulfillmentAt" required type="datetime-local" />
        </label>
      ) : null}

      <div className="mt-3 space-y-2">
        {cart.length ? (
          cart.map((item) => (
            <div className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl bg-[var(--primary-light)]/45 p-3" key={item.cartId}>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{item.name}</p>
                {item.notes ? <p className="line-clamp-2 text-xs font-semibold text-[var(--muted)]">{item.notes}</p> : null}
                <p className="text-xs font-semibold text-[var(--muted)]">{formatMoney(item.price)} c/u</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="grid h-8 w-8 place-items-center rounded-full bg-white" onClick={() => changeQuantity(item.cartId, -1)} type="button">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-5 text-center text-sm font-black">{item.quantity}</span>
                <button className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary)] text-white" onClick={() => changeQuantity(item.cartId, 1)} type="button">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm font-semibold text-[var(--muted)]">No agregaste productos todavía.</p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3 text-base">
        <span>Total</span>
        <strong>{formatMoney(total)}</strong>
      </div>

      <label className="mt-3 block text-sm font-black">
        Nombre completo
        <Input className="mt-2" name="customerName" required />
      </label>
      <label className="mt-3 block text-sm font-black">
        WhatsApp
        <Input className="mt-2" name="customerPhone" type="tel" />
      </label>
      <label className="mt-3 block text-sm font-black">
        Correo electronico
        <Input className="mt-2" name="customerEmail" type="email" />
      </label>
      {orderType === "delivery" ? (
        <label className="mt-3 block text-sm font-black">
          Dirección de entrega
          <Input className="mt-2" name="customerAddress" required />
        </label>
      ) : null}
      {orderType === "delivery" ? (
        <div className="mt-3 space-y-3">
          <label className="block text-sm font-black">
            Numero de casa, apartamento o aclaracion
            <Input className="mt-2" name="deliveryAddressDetail" />
          </label>
          <label className="block text-sm font-black">
            Link de Google Maps
            <Input className="mt-2" name="deliveryMapsUrl" placeholder="https://maps.google.com/..." />
          </label>
        </div>
      ) : restaurant.mapsUrl || restaurant.address ? (
        <div className="mt-3 rounded-2xl bg-[var(--primary-light)]/55 p-3 text-sm font-semibold text-[var(--muted)]">
          <p className="font-black text-[var(--text)]">Recojo en local</p>
          <p className="mt-1">{restaurant.address || "El restaurante confirmara la direccion."}</p>
          {restaurant.addressReference ? <p className="mt-1">{restaurant.addressReference}</p> : null}
          {restaurant.mapsUrl ? (
            <a className="mt-2 inline-flex font-black text-[var(--primary)]" href={restaurant.mapsUrl} rel="noreferrer" target="_blank">
              Abrir en Google Maps
            </a>
          ) : null}
        </div>
      ) : null}

      <label className="mt-4 flex items-center justify-between text-sm font-black">
        ¿Requiere factura?
        <input checked={requiresInvoice} onChange={(event) => setRequiresInvoice(event.target.checked)} type="checkbox" />
      </label>

      {requiresInvoice ? (
        <div className="mt-3 grid gap-3 rounded-2xl border border-[var(--border)] p-3">
          <select className="h-12 rounded-2xl border border-[var(--border)] bg-white px-4 text-sm font-bold text-[var(--text)]" name="invoiceDocumentType" required>
            <option value="nit">NIT</option>
            <option value="ci">Carnet</option>
            <option value="cex">CEX extranjero</option>
            <option value="passport">Pasaporte</option>
            <option value="other">Otro documento</option>
          </select>
          <Input name="invoiceDocumentNumber" placeholder="Numero de documento" required />
          <Input name="invoiceName" placeholder="Nombre o razon social" required />
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 rounded-2xl bg-[var(--primary-light)] p-1">
        <button className={cn("min-h-11 rounded-full px-2 text-xs font-black min-[380px]:text-sm", paymentMethod === "cash" && "bg-[var(--primary)] text-white")} onClick={() => setPaymentMethod("cash")} type="button">
          Efectivo
        </button>
        <button className={cn("min-h-11 rounded-full px-2 text-xs font-black text-[var(--muted)] min-[380px]:text-sm", paymentMethod === "qr" && "bg-[var(--primary)] text-white")} onClick={() => setPaymentMethod("qr")} type="button">
          Pago QR
        </button>
      </div>

      {paymentMethod === "qr" && settings?.qrPaymentUrl ? (
        <div className="mt-3 grid gap-3 rounded-2xl bg-[var(--primary-light)]/55 p-3 sm:grid-cols-[92px_1fr] sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="QR de pago" className="h-24 w-24 rounded-2xl border border-[var(--border)] object-cover" src={settings.qrPaymentUrl} />
          <div>
            <p className="text-sm font-black text-[var(--text)]">Escanea el QR del restaurante</p>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Realiza el pago y luego sube tu comprobante para que el equipo lo valide.</p>
            {settings.qrAccountName || settings.qrBankName ? (
              <p className="mt-2 text-xs font-bold text-[var(--muted)]">
                {settings.qrAccountName ? settings.qrAccountName : ""}
                {settings.qrBankName ? ` · ${settings.qrBankName}` : ""}
                {settings.qrAccountType ? ` · ${settings.qrAccountType === "checking" ? "Cuenta corriente" : "Caja de ahorro"}` : ""}
                {settings.qrCurrency ? ` · ${settings.qrCurrency}` : ""}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {paymentMethod === "qr" ? (
        <label className="mt-3 block text-sm font-black">
          Comprobante QR
          <Input accept="image/*,.pdf" className="mt-2" name="paymentReceiptFile" required type="file" />
        </label>
      ) : null}

      <p className="mt-4 rounded-2xl bg-white/60 p-3 text-sm leading-6 text-[var(--muted)]">
        {paymentMethod === "cash"
          ? "El equipo confirmará tu pedido y coordinará el pago."
          : settings?.qrPaymentUrl
            ? "Seleccionaste pago QR. El equipo confirmará el pago antes de preparar el pedido."
            : "Seleccionaste pago QR. El equipo te indicará el QR disponible para completar el pago."}
      </p>

      <div className="mt-4">
      <Button className={cn("min-h-12 w-full overflow-hidden transition-all", isSubmitting && "justify-center bg-emerald-600")} disabled={!cart.length || isSubmitting} type="submit">
        {isSubmitting ? (
          <span className="inline-flex items-center gap-3">
            <span className="relative grid h-8 w-8 place-items-center rounded-full border-2 border-white/40">
              <span className="order-ring absolute inset-0 rounded-full border-2 border-transparent border-t-white" />
              <ShoppingCart className="cart-roll-forward h-4 w-4" />
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-emerald-700">
              <Check className="h-4 w-4" />
            </span>
          </span>
        ) : (
          "Confirmar pedido"
        )}
      </Button>
      </div>
    </form>
  );
}
