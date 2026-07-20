"use client";

import { Check, Minus, Plus, ShoppingCart, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createPublicOrderAction } from "@/app/r/actions";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { defaultProductImage } from "@/lib/utils/default-images";
import { formatMoney } from "@/lib/utils/money";
import type { RestaurantTable } from "@/types/order.types";
import type { Category, Product, ProductConfiguration, ProductOption, ProductOptionGroup, ProductVariant } from "@/types/product.types";
import type { Restaurant, RestaurantSettings } from "@/types/restaurant.types";

type CartItem = {
  cartId: string;
  productId: string;
  variantId?: string;
  optionIds: string[];
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
  notes?: string;
};

type ProductConfigMap = Record<string, { variants: ProductVariant[]; optionGroups: ProductOptionGroup[] }>;
type SelectedOptions = Record<string, string[]>;

const defaultImage = defaultProductImage;

export function TableOrderClient({
  restaurant,
  table,
  categories,
  products,
  settings,
  configuration,
  orderError,
}: {
  restaurant: Restaurant;
  table: RestaurantTable;
  categories: Category[];
  products: Product[];
  settings: RestaurantSettings | null;
  configuration: ProductConfiguration;
  orderError?: string;
}) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "qr">("cash");
  const [requiresInvoice, setRequiresInvoice] = useState(false);

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
  const orderNotes = `${table.name} (${table.code})${requiresInvoice ? " - Requiere factura" : ""}`;
  const cartJson = JSON.stringify(cart.map(({ productId, variantId, optionIds, name, price, quantity, notes }) => ({ productId, variantId, optionIds, name, price, quantity, notes })));

  function addConfiguredProduct(product: Product, variant: ProductVariant | null, selectedOptions: ProductOption[]) {
    const price = product.price + (variant?.priceDelta ?? 0) + selectedOptions.reduce((sum, option) => sum + option.priceDelta, 0);
    const detailParts = [variant?.name, ...selectedOptions.map((option) => option.name)].filter(Boolean);
    const notes = detailParts.length ? detailParts.join(" | ") : undefined;
    const name = variant ? `${product.name} - ${variant.name}` : product.name;
    const cartId = [product.id, variant?.id ?? "base", ...selectedOptions.map((option) => option.id).sort()].join(":");

    setCart((current) => {
      const existing = current.find((item) => item.cartId === cartId);
      if (existing) {
        return current.map((item) => (item.cartId === cartId ? { ...item, quantity: item.quantity + 1 } : item));
      }

      return [
        ...current,
        {
          cartId,
          productId: product.id,
          variantId: variant?.id,
          optionIds: selectedOptions.map((option) => option.id),
          name,
          price,
          quantity: 1,
          imageUrl: product.imageUrl || defaultImage,
          notes,
        },
      ];
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
    <main className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--primary)] text-sm font-black text-[var(--color-on-primary)]">
              {restaurant.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={restaurant.name} className="h-full w-full object-cover" src={restaurant.logoUrl} />
              ) : (
                restaurant.name.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-[var(--text)]">{restaurant.name}</p>
              <p className="truncate text-xs font-bold text-[var(--muted)]">Mesa {table.name.replace(/^mesa\s*/i, "")}</p>
            </div>
          </div>
          <button className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--primary-light)] text-[var(--primary)]" onClick={() => setDrawerOpen(true)} type="button">
            <ShoppingCart className="h-5 w-5" />
            {cartQuantity ? <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--accent)] text-[10px] font-black text-[var(--primary-dark)]">{cartQuantity}</span> : null}
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-3 pb-28 pt-5 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8 lg:pb-8 lg:pt-8">
        <section className="min-w-0">
          <div className="mb-5 overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
            <div className="relative min-h-[11rem] p-5 sm:min-h-[14rem] sm:p-7">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={restaurant.name} className="absolute inset-0 h-full w-full object-cover opacity-35" src={restaurant.bannerUrl || defaultImage} />
              <div className="relative max-w-2xl">
                <span className="inline-flex rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-black text-[var(--primary-dark)]">Pedido en mesa</span>
                <h1 className="mt-4 text-4xl font-black leading-none tracking-normal text-[var(--text)] sm:text-6xl">Mesa {table.name.replace(/^mesa\s*/i, "")}</h1>
                <p className="mt-3 max-w-[18rem] text-sm font-bold leading-6 text-[var(--muted)] sm:max-w-2xl sm:text-base">Elige tus productos. Para procesarlo, confirma el pago en caja.</p>
              </div>
            </div>
            {orderError ? <OrderErrorMessage error={orderError} /> : null}
          </div>

          <div className="sticky top-[68px] z-20 -mx-3 mb-3 border-y border-[var(--border)] bg-[var(--surface)]/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-[1.5rem] sm:border">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <CategoryButton active={selectedCategory === "all"} label="Todo" onClick={() => setSelectedCategory("all")} />
              {categories.map((category) => (
                <CategoryButton active={selectedCategory === category.id} key={category.id} label={category.name} onClick={() => setSelectedCategory(category.id)} />
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => (
              <ProductTile config={configByProduct[product.id]} key={product.id} onSelect={() => setSelectedProduct(product)} product={product} />
            ))}
          </div>

          {!filteredProducts.length ? <div className="rounded-[1.25rem] bg-[var(--surface)] p-6 text-center text-sm font-semibold text-[var(--muted)]">No hay productos disponibles en esta categoría.</div> : null}
        </section>

        <aside className="hidden lg:block">
          <OrderPanel
            cart={cart}
            cartJson={cartJson}
            changeQuantity={changeQuantity}
            notes={orderNotes}
            paymentMethod={paymentMethod}
            requiresInvoice={requiresInvoice}
            restaurant={restaurant}
            setPaymentMethod={setPaymentMethod}
            setRequiresInvoice={setRequiresInvoice}
            settings={settings}
            table={table}
            total={total}
          />
        </aside>
      </div>

      <button
        className="fixed inset-x-3 bottom-3 z-40 flex h-14 items-center justify-between rounded-full bg-[var(--primary)] px-5 text-sm font-black text-[var(--color-on-primary)] shadow-2xl lg:hidden"
        onClick={() => setDrawerOpen(true)}
        type="button"
      >
        <span className="inline-flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" />
          Pedido ({cartQuantity})
        </span>
        <span>{formatMoney(total)}</span>
      </button>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 bg-[var(--color-overlay)] lg:hidden">
          <div className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-[1.5rem] bg-[var(--surface)] p-4 text-[var(--text)] shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-2xl font-black">Tu pedido</h2>
              <button className="grid h-11 w-11 place-items-center rounded-full bg-[var(--color-neutral-100)]" onClick={() => setDrawerOpen(false)} type="button">
                <X className="h-5 w-5" />
              </button>
            </div>
            <OrderPanel
              cart={cart}
              cartJson={cartJson}
              changeQuantity={changeQuantity}
              compact
              notes={orderNotes}
              paymentMethod={paymentMethod}
              requiresInvoice={requiresInvoice}
              restaurant={restaurant}
              setPaymentMethod={setPaymentMethod}
              setRequiresInvoice={setRequiresInvoice}
              settings={settings}
              table={table}
              total={total}
            />
          </div>
        </div>
      ) : null}

      {selectedProduct ? (
        <ProductOptionModal
          config={configByProduct[selectedProduct.id]}
          product={selectedProduct}
          onAdd={addConfiguredProduct}
          onClose={() => setSelectedProduct(null)}
        />
      ) : null}
    </main>
  );
}

function CategoryButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={cn(
        "h-11 shrink-0 rounded-full px-4 text-sm font-black transition",
        active ? "bg-[var(--primary)] text-[var(--color-on-primary)]" : "bg-[var(--primary-light)] text-[var(--muted)] hover:text-[var(--primary-dark)]",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function OrderErrorMessage({ error }: { error: string }) {
  const message =
    error === "no-open-cash"
      ? "La caja esta cerrada. El restaurante debe abrir caja para recibir pedidos."
      : error === "phone-required"
        ? "Para pedidos en mesa el WhatsApp es obligatorio. Lo usamos para avisarte si no pasaste por caja."
      : error === "receipt-required"
        ? "Para pago QR debes subir el comprobante antes de confirmar."
        : "No se pudo confirmar el pedido. Revisa los datos e intenta nuevamente.";

  return <div className="mt-4 rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm font-bold text-[var(--color-danger-strong)]">{message}</div>;
}

function ProductTile({ product, config, onSelect }: { product: Product; config?: ProductConfigMap[string]; onSelect: () => void }) {
  const hasConfiguration = Boolean(config?.variants.length || config?.optionGroups.length);

  return (
    <article className="grid grid-cols-[88px_1fr] gap-3 rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--text)] shadow-sm sm:block sm:p-4">
      <div className="aspect-square overflow-hidden rounded-2xl bg-[var(--primary-light)] sm:aspect-[4/3]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={product.name} className="h-full w-full object-cover" src={product.imageUrl || defaultImage} />
      </div>
      <div className="min-w-0 sm:mt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--primary)]">Producto</p>
          {hasConfiguration ? <span className="rounded-full bg-[var(--primary-light)] px-2 py-1 text-[10px] font-black text-[var(--primary-dark)]">Configurable</span> : null}
        </div>
        <h3 className="truncate text-lg font-black leading-5">{product.name}</h3>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--muted)]">{product.description || "Listo para pedir en mesa."}</p>
        <button className={buttonClasses("secondary", "mt-3 min-h-10 w-full bg-[var(--color-neutral-100)] font-black")} onClick={onSelect} type="button">
          {hasConfiguration ? "Personalizar" : "Agregar"} {formatMoney(product.price)}
        </button>
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
      if (group.isRequired && group.maxChoices === 1 && group.options[0]) {
        initial[group.id] = [group.options[0].id];
      } else {
        initial[group.id] = [];
      }
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
    <div className="fixed inset-0 z-[60] grid place-items-end bg-[var(--color-overlay)] p-0 text-[var(--text)] backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-[1.5rem] bg-[var(--surface)] shadow-2xl sm:max-w-2xl sm:rounded-[1.5rem]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Personalizar</p>
            <h2 className="text-2xl font-black">{product.name}</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">Precio base {formatMoney(product.price)}</p>
          </div>
          <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-neutral-100)] hover:bg-[var(--color-neutral-200)]" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 p-4">
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <div className="overflow-hidden rounded-2xl bg-[var(--primary-light)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={product.name} className="aspect-[4/3] h-full w-full object-cover sm:aspect-square" src={product.imageUrl || defaultImage} />
            </div>
            <p className="text-sm leading-6 text-[var(--muted)]">{product.description || "Configura tu producto antes de agregarlo al pedido."}</p>
          </div>

          {variants.length ? (
            <section>
              <h3 className="text-sm font-black">Variante</h3>
              <div className="mt-2 grid gap-2">
                {variants.map((variant) => (
                  <button
                    className={cn(
                      "flex min-h-14 items-center justify-between rounded-2xl border px-4 text-left transition",
                      variantId === variant.id ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary-dark)]" : "border-[var(--border)] bg-[var(--surface)]",
                    )}
                    key={variant.id}
                    onClick={() => setVariantId(variant.id)}
                    type="button"
                  >
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
                      {group.isRequired ? "Obligatorio" : "Opcional"} · elige {group.minChoices}-{group.maxChoices}
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
                      <button
                        className={cn(
                          "flex min-h-12 items-center justify-between rounded-2xl border px-3 text-left transition",
                          selected ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary-dark)]" : "border-[var(--border)] bg-[var(--surface)]",
                        )}
                        key={option.id}
                        onClick={() => toggleOption(group, option)}
                        type="button"
                      >
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

        <div className="sticky bottom-0 grid gap-3 border-t border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">Total producto</p>
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

function OrderPanel({
  restaurant,
  table,
  settings,
  cart,
  cartJson,
  total,
  paymentMethod,
  requiresInvoice,
  notes,
  compact = false,
  changeQuantity,
  setPaymentMethod,
  setRequiresInvoice,
}: {
  restaurant: Restaurant;
  table: RestaurantTable;
  settings: RestaurantSettings | null;
  cart: CartItem[];
  cartJson: string;
  total: number;
  paymentMethod: "cash" | "qr";
  requiresInvoice: boolean;
  notes: string;
  compact?: boolean;
  changeQuantity: (cartId: string, delta: number) => void;
  setPaymentMethod: (method: "cash" | "qr") => void;
  setRequiresInvoice: (value: boolean) => void;
}) {
  return (
    <form action={createPublicOrderAction} className={cn("rounded-[1.5rem] bg-[var(--surface)] p-4 text-[var(--text)] shadow-sm", compact && "rounded-none p-0 shadow-none")}>
      <input name="restaurantId" type="hidden" value={restaurant.id} />
      <input name="restaurantSlug" type="hidden" value={restaurant.slug} />
      <input name="tableId" type="hidden" value={table.id} />
      <input name="tableCode" type="hidden" value={table.code} />
      <input name="orderType" type="hidden" value="table" />
      <input name="paymentMethod" type="hidden" value={paymentMethod} />
      <input name="invoiceRequired" type="hidden" value={requiresInvoice ? "on" : ""} />
      <input name="notes" type="hidden" value={notes} />
      <input name="cartJson" type="hidden" value={cartJson} />

      {!compact ? <h2 className="text-2xl font-black">Tu pedido</h2> : null}

      <div className="mt-4 space-y-2">
        {cart.length ? (
          cart.map((item) => (
            <div className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl bg-[var(--primary-light)]/45 p-3" key={item.cartId}>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{item.name}</p>
                {item.notes ? <p className="line-clamp-2 text-xs font-semibold text-[var(--muted)]">{item.notes}</p> : null}
                <p className="text-xs font-semibold text-[var(--muted)]">{formatMoney(item.price)} c/u</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface)]" onClick={() => changeQuantity(item.cartId, -1)} type="button">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-5 text-center text-sm font-black">{item.quantity}</span>
                <button className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary)] text-[var(--color-on-primary)]" onClick={() => changeQuantity(item.cartId, 1)} type="button">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm font-semibold text-[var(--muted)]">No agregaste productos todavía.</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-base">
        <span>Total</span>
        <strong>{formatMoney(total)}</strong>
      </div>

      <label className="mt-4 block text-sm font-black">
        Nombre completo
        <Input className="mt-2" name="customerName" required />
      </label>
      <label className="mt-3 block text-sm font-black">
        WhatsApp *
        <Input className="mt-2" name="customerPhone" placeholder="Ej: 70707070" required type="tel" />
        <span className="mt-1 block text-xs font-semibold leading-5 text-[var(--muted)]">Obligatorio para avisarte si el pedido queda pendiente de pago en caja.</span>
      </label>

      <label className="mt-4 flex items-center justify-between text-sm font-black">
        ¿Requiere factura?
        <input checked={requiresInvoice} onChange={(event) => setRequiresInvoice(event.target.checked)} type="checkbox" />
      </label>

      <div className="mt-3 grid rounded-2xl bg-[var(--primary-light)] p-1 sm:grid-cols-2">
        <button className={cn("h-12 rounded-full text-sm font-black", paymentMethod === "cash" && "bg-[var(--primary)] text-[var(--color-on-primary)]")} onClick={() => setPaymentMethod("cash")} type="button">
          Caja / efectivo
        </button>
        <button className={cn("h-12 rounded-full text-sm font-black text-[var(--muted)]", paymentMethod === "qr" && "bg-[var(--primary)] text-[var(--color-on-primary)]")} onClick={() => setPaymentMethod("qr")} type="button">
          Pago QR
        </button>
      </div>

      {paymentMethod === "qr" && settings?.qrPaymentUrl ? (
        <div className="mt-3 grid gap-3 rounded-2xl bg-[var(--primary-light)]/55 p-3 sm:grid-cols-[92px_1fr] sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="QR de pago" className="h-24 w-24 rounded-2xl border border-[var(--border)] object-cover" src={settings.qrPaymentUrl} />
          <div>
            <p className="text-sm font-black text-[var(--text)]">Escanea el QR del restaurante</p>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Puedes pagar con QR y caja lo validara antes de mandar el pedido a cocina.</p>
          </div>
        </div>
      ) : null}

      {paymentMethod === "qr" ? (
        <CompressedImageInput acceptPdf className="mt-3" help="Opcional en mesa. Si no lo subes aqui, caja puede registrar la referencia cuando pagues." label="Comprobante QR opcional" name="paymentReceiptFile" />
      ) : null}

      <p className="mt-4 rounded-2xl bg-[var(--color-card-muted)] p-3 text-sm leading-6 text-[var(--muted)]">`r`n        Para procesar tu pedido, por favor acercate a caja y confirma el pago indicando tu numero de pedido y mesa.`r`n      </p>

      <Button className="mt-5 min-h-13 w-full" disabled={!cart.length} type="submit">
        Confirmar pedido
      </Button>
    </form>
  );
}
