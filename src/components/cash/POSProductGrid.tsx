"use client";

import { Check, Minus, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { createPosSaleAction } from "@/app/admin/actions";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import type { Category, Product, ProductConfiguration, ProductOption, ProductOptionGroup, ProductVariant } from "@/types/product.types";

type SelectedOptions = Record<string, string[]>;
type ProductConfigMap = Record<string, { variants: ProductVariant[]; optionGroups: ProductOptionGroup[] }>;

type PosCartItem = {
  cartId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
  notes?: string;
};

const defaultImage = "/imagendefault.jpeg";

export function POSProductGrid({
  categories,
  products,
  configuration,
  restaurantId,
  restaurantSlug,
  disabled,
}: {
  categories: Category[];
  products: Product[];
  configuration: ProductConfiguration;
  restaurantId: string;
  restaurantSlug: string;
  disabled?: boolean;
}) {
  const [categoryId, setCategoryId] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const deferredQuery = useDeferredValue(query);

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
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = categoryId === "all" || product.categoryId === categoryId;
      const matchesQuery =
        !normalizedQuery ||
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.description.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [categoryId, deferredQuery, products]);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartJson = JSON.stringify(cart.map(({ productId, name, price, quantity, notes }) => ({ productId, name, price, quantity, notes })));

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

  if (!products.length) {
    return <Card className="text-sm text-slate-500">Aún no hay productos disponibles para vender.</Card>;
  }

  return (
    <>
      <div className={cn("grid gap-4 xl:grid-cols-[1fr_360px]", cart.length ? "pb-24 xl:pb-0" : "")}>
        <section className="min-w-0 space-y-4">
          <Card className="rounded-[1.25rem] p-3">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <Input className="pl-11" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto de caja" value={query} />
              </label>
              <div className="flex gap-2 overflow-x-auto">
                <CategoryButton active={categoryId === "all"} label="Todo" onClick={() => setCategoryId("all")} />
                {categories.map((category) => (
                  <CategoryButton active={categoryId === category.id} key={category.id} label={category.name} onClick={() => setCategoryId(category.id)} />
                ))}
              </div>
            </div>
          </Card>

          {disabled ? <div className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Abre caja para habilitar la venta rápida.</div> : null}

          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {filteredProducts.map((product) => {
              const productConfig = configByProduct[product.id];
              const hasConfiguration = Boolean(productConfig?.variants.length || productConfig?.optionGroups.length);

              return (
                <ProductCard
                  config={productConfig}
                  disabled={disabled}
                  key={product.id}
                  onSelect={() => {
                    if (hasConfiguration) {
                      setSelectedProduct(product);
                      return;
                    }

                    addConfiguredProduct(product, null, []);
                  }}
                  product={product}
                />
              );
            })}
          </div>

          {!filteredProducts.length ? <div className="rounded-[1.25rem] bg-white p-6 text-center text-sm font-semibold text-[var(--muted)]">No hay productos para este filtro.</div> : null}
        </section>

        <Card className="h-fit rounded-[1.25rem] p-4 xl:sticky xl:top-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Venta rápida</p>
              <h2 className="text-2xl font-black text-[var(--text)]">Pedido POS</h2>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--primary-light)] text-[var(--primary)]">
              <ShoppingCart className="h-5 w-5" />
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {cart.length ? (
              cart.map((item) => (
                <div className="grid grid-cols-[56px_1fr_auto] gap-3 rounded-2xl bg-slate-50 p-3" key={item.cartId}>
                  <div className="overflow-hidden rounded-xl bg-[var(--primary-light)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={item.name} className="h-14 w-14 object-cover" src={item.imageUrl || defaultImage} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{item.name}</p>
                    {item.notes ? <p className="line-clamp-2 text-xs font-semibold text-[var(--muted)]">{item.notes}</p> : null}
                    <p className="text-xs font-semibold text-[var(--muted)]">{formatMoney(item.price)} c/u</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="grid h-8 w-8 place-items-center rounded-full bg-white" onClick={() => changeQuantity(item.cartId, -1)} type="button">
                      {item.quantity === 1 ? <Trash2 className="h-4 w-4 text-red-600" /> : <Minus className="h-4 w-4" />}
                    </button>
                    <span className="w-5 text-center text-sm font-black">{item.quantity}</span>
                    <button className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary)] text-white" onClick={() => changeQuantity(item.cartId, 1)} type="button">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-[var(--muted)]">Agrega productos para iniciar la venta.</p>
            )}
          </div>

          <form action={createPosSaleAction} className="mt-4 space-y-3" id="pos-sale-form">
            <input name="restaurantId" type="hidden" value={restaurantId} />
            <input name="restaurantSlug" type="hidden" value={restaurantSlug} />
            <input name="cartJson" type="hidden" value={cartJson} />
            <div className="flex items-center justify-between border-t border-[var(--border)] pt-4 text-xl font-black">
              <span>Total</span>
              <span>{formatMoney(total)}</span>
            </div>
            <Input name="customerName" placeholder="Cliente opcional" />
            <Select name="paymentMethod" onChange={(event) => setPaymentMethod(event.target.value)} value={paymentMethod}>
              <option value="cash">Efectivo</option>
              <option value="qr">QR</option>
              <option value="bank_transfer">Transferencia</option>
              <option value="card">Tarjeta</option>
              <option value="other">Otro</option>
            </Select>
            {paymentMethod === "qr" ? (
              <div className="space-y-2 rounded-2xl border border-[var(--border)] p-3">
                <Input name="paymentReceiptReference" placeholder="Número de comprobante o referencia QR" />
                <Input accept="image/*,.pdf" name="paymentReceiptFile" type="file" />
                <p className="text-xs font-semibold text-[var(--muted)]">En POS puedes subir una captura o registrar la referencia del pago QR.</p>
              </div>
            ) : null}
            <Button className="w-full" disabled={disabled || !cart.length} type="submit">
              Cobrar y enviar a cocina
            </Button>
          </form>
        </Card>
      </div>

      {cart.length ? (
        <div className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-[var(--border)] bg-white p-3 shadow-2xl xl:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">{cart.length} ítems</p>
              <p className="truncate text-xl font-black text-[var(--text)]">{formatMoney(total)}</p>
            </div>
            <Button className="min-h-11 shrink-0 px-5" disabled={disabled || !cart.length} form="pos-sale-form" type="submit">
              Cobrar
            </Button>
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
    </>
  );
}

function CategoryButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={cn(buttonClasses(active ? "primary" : "secondary"), "h-10 shrink-0 px-4")} onClick={onClick} type="button">
      {label}
    </button>
  );
}

function ProductCard({
  product,
  config,
  disabled,
  onSelect,
}: {
  product: Product;
  config?: ProductConfigMap[string];
  disabled?: boolean;
  onSelect: () => void;
}) {
  const hasConfiguration = Boolean(config?.variants.length || config?.optionGroups.length);

  return (
    <button
      className="rounded-[1.25rem] border border-[var(--border)] bg-white p-3 text-left shadow-sm transition hover:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-[var(--primary-light)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={product.name} className="h-full w-full object-cover" src={product.imageUrl || defaultImage} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-black text-[var(--text)]">{product.name}</p>
          <p className="text-sm font-bold text-[var(--primary)]">{formatMoney(product.price)}</p>
        </div>
        {hasConfiguration ? <span className="rounded-full bg-[var(--primary-light)] px-2 py-1 text-[10px] font-black text-[var(--primary-dark)]">Configurable</span> : null}
      </div>
      {product.description ? <p className="mt-2 line-clamp-2 text-sm text-[var(--muted)]">{product.description}</p> : null}
      <span className={buttonClasses("secondary", "mt-3 min-h-10 w-full bg-slate-100 font-black")}>{hasConfiguration ? "Personalizar" : "Agregar"}</span>
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
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Configurar venta</p>
            <h2 className="text-2xl font-black">{product.name}</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">Precio base {formatMoney(product.price)}</p>
          </div>
          <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 hover:bg-slate-200" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 p-4">
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <div className="overflow-hidden rounded-2xl bg-[var(--primary-light)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={product.name} className="aspect-[4/3] h-full w-full object-cover sm:aspect-square" src={product.imageUrl || defaultImage} />
            </div>
            <p className="text-sm leading-6 text-[var(--muted)]">{product.description || "Configura el producto antes de cobrarlo."}</p>
          </div>

          {variants.length ? (
            <section>
              <h3 className="text-sm font-black">Variante</h3>
              <div className="mt-2 grid gap-2">
                {variants.map((variant) => (
                  <button
                    className={cn(
                      "flex min-h-14 items-center justify-between rounded-2xl border px-4 text-left transition",
                      variantId === variant.id ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary-dark)]" : "border-[var(--border)] bg-white",
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
                  <span className={cn("rounded-full px-3 py-1 text-xs font-black", selectedCount >= group.minChoices ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
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
                          selected ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary-dark)]" : "border-[var(--border)] bg-white",
                        )}
                        key={option.id}
                        onClick={() => toggleOption(group, option)}
                        type="button"
                      >
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
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">Total producto</p>
            <p className="text-2xl font-black text-[var(--primary)]">{formatMoney(total)}</p>
          </div>
          <Button className="min-h-12 px-8" disabled={!canAdd} onClick={() => onAdd(product, selectedVariant, chosenOptions)} type="button">
            Agregar al pedido POS
          </Button>
        </div>
      </div>
    </div>
  );
}
