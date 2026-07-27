"use client";

import { Check, Maximize2, Minimize2, Minus, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useDeferredValue, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createPosSaleAction } from "@/app/admin/actions";
import { orderOriginLabels } from "@/components/orders/orderPresentation";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { BrandLoadingOverlay } from "@/components/ui/BrandLoadingOverlay";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { businessPreparationAreaLabel, businessTypeSupportsKitchen } from "@/lib/restaurant-directory-options";
import { cn } from "@/lib/utils/cn";
import { defaultProductImage } from "@/lib/utils/default-images";
import { formatMoney } from "@/lib/utils/money";
import type { OrderOrigin } from "@/types/order.types";
import type { Category, Product, ProductConfiguration, ProductOption, ProductOptionGroup, ProductVariant } from "@/types/product.types";
import type { BusinessType } from "@/types/restaurant.types";

type SelectedOptions = Record<string, string[]>;
type ProductConfigMap = Record<string, { variants: ProductVariant[]; optionGroups: ProductOptionGroup[] }>;

type PosCartItem = {
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

export function POSProductGrid({
  categories,
  products,
  configuration,
  restaurantId,
  restaurantSlug,
  businessType,
  disabled,
}: {
  categories: Category[];
  products: Product[];
  configuration: ProductConfiguration;
  restaurantId: string;
  restaurantSlug: string;
  businessType: BusinessType;
  disabled?: boolean;
}) {
  const [categoryId, setCategoryId] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [orderOrigin, setOrderOrigin] = useState<OrderOrigin>("pos_counter");
  const [expanded, setExpanded] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
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
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartJson = JSON.stringify(cart.map(({ productId, variantId, optionIds, name, price, quantity, notes }) => ({ productId, variantId, optionIds, name, price, quantity, notes })));
  const preparationAreaLabel = businessPreparationAreaLabel(businessType);
  const submitLabel = businessTypeSupportsKitchen(businessType) ? "Cobrar y enviar a cocina" : "Cobrar y registrar pedido";

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
    const nextCart = cart
      .map((item) => (item.cartId === cartId ? { ...item, quantity: item.quantity + delta } : item))
      .filter((item) => item.quantity > 0);
    setCart(nextCart);
    if (!nextCart.length) {
      setMobileCartOpen(false);
    }
  }

  function removeItem(cartId: string) {
    const nextCart = cart.filter((item) => item.cartId !== cartId);
    setCart(nextCart);
    if (!nextCart.length) {
      setMobileCartOpen(false);
    }
  }

  if (!products.length) {
    return <Card className="text-sm text-[var(--color-secondary-text)]">Aun no hay productos disponibles para vender.</Card>;
  }

  return (
    <>
      <div className={cn(expanded && "fixed inset-0 z-[65] overflow-y-auto bg-[var(--background)] p-3 sm:p-5 xl:p-6")}>
        <div className={cn("grid gap-3 sm:gap-4", expanded ? "xl:grid-cols-[minmax(0,1fr)_420px]" : "xl:grid-cols-[1fr_360px]", cart.length ? "pb-28 xl:pb-0" : "")}>
          <section className="min-w-0 space-y-3 sm:space-y-4">
            <Card className="rounded-[1.1rem] p-2.5 sm:rounded-[1.25rem] sm:p-3">
              <div className="grid gap-2 sm:gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                  <Input className="min-h-10 pl-11 sm:min-h-11" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto" value={query} />
                </label>
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
                    <CategoryButton active={categoryId === "all"} label="Todo" onClick={() => setCategoryId("all")} />
                    {categories.map((category) => (
                      <CategoryButton active={categoryId === category.id} key={category.id} label={category.name} onClick={() => setCategoryId(category.id)} />
                    ))}
                  </div>
                  <button
                    aria-label={expanded ? "Salir de modo grande" : "Abrir modo grande"}
                    className={buttonClasses("secondary", "min-h-10 shrink-0 px-3 text-xs font-black")}
                    onClick={() => setExpanded((current) => !current)}
                    title={expanded ? "Salir de modo grande" : "Abrir modo grande"}
                    type="button"
                  >
                    {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    <span className="hidden sm:inline">{expanded ? "Salir" : "Modo grande"}</span>
                  </button>
                </div>
              </div>
            </Card>

            {disabled ? <div className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-sm font-bold text-[var(--color-warning-strong)]">Abre caja para habilitar la venta rapida.</div> : null}

            <div className={cn("grid gap-2.5 sm:gap-3 sm:grid-cols-2", expanded ? "lg:grid-cols-3 2xl:grid-cols-4" : "2xl:grid-cols-3")}>
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

            {!filteredProducts.length ? <div className="rounded-[1.25rem] bg-[var(--surface)] p-6 text-center text-sm font-semibold text-[var(--muted)]">No hay productos para este filtro.</div> : null}
          </section>

          <aside className="hidden xl:block">
            <PosCartPanel
              cart={cart}
              cartJson={cartJson}
              changeQuantity={changeQuantity}
              className={cn("xl:sticky", expanded ? "xl:top-6" : "xl:top-4")}
              disabled={disabled}
              onClear={() => setCart([])}
              onOrderOriginChange={setOrderOrigin}
              onPaymentMethodChange={setPaymentMethod}
              orderOrigin={orderOrigin}
              paymentMethod={paymentMethod}
              submitLabel={submitLabel}
              preparationAreaLabel={preparationAreaLabel}
              removeItem={removeItem}
              restaurantId={restaurantId}
              restaurantSlug={restaurantSlug}
              total={total}
              totalItems={totalItems}
            />
          </aside>
        </div>

        {cart.length ? (
          <button
            className={cn(
              "fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] flex min-h-16 items-center justify-between gap-3 rounded-[1.15rem] bg-[var(--primary)] px-4 py-3 text-left text-sm font-black text-[var(--color-on-primary)] shadow-2xl xl:hidden",
              expanded ? "z-[80]" : "z-40",
            )}
            onClick={() => setMobileCartOpen(true)}
            type="button"
          >
            <span className="min-w-0">
              <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-[var(--color-on-primary)]/80">
                <ShoppingCart className="h-4 w-4" />
                {totalItems} productos
              </span>
              <span className="mt-1 block truncate text-lg font-black">{formatMoney(total)}</span>
            </span>
            <span className="shrink-0 rounded-full bg-[var(--color-on-primary-soft)] px-4 py-2 text-xs font-black">Cobrar</span>
          </button>
        ) : null}
      </div>

      {mobileCartOpen ? (
        <div className={cn("fixed inset-0 bg-[var(--color-overlay)] xl:hidden", expanded ? "z-[85]" : "z-50")}>
          <div className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-[1.5rem] bg-[var(--surface)] p-3 text-[var(--text)] shadow-2xl sm:p-4">
            <PosCartPanel
              cart={cart}
              cartJson={cartJson}
              changeQuantity={changeQuantity}
              disabled={disabled}
              onClear={() => {
                setCart([]);
                setMobileCartOpen(false);
              }}
              onClose={() => setMobileCartOpen(false)}
              onOrderOriginChange={setOrderOrigin}
              onPaymentMethodChange={setPaymentMethod}
              orderOrigin={orderOrigin}
              paymentMethod={paymentMethod}
              submitLabel={submitLabel}
              preparationAreaLabel={preparationAreaLabel}
              removeItem={removeItem}
              restaurantId={restaurantId}
              restaurantSlug={restaurantSlug}
              total={total}
              totalItems={totalItems}
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
    </>
  );
}

function PosCartPanel({
  cart,
  cartJson,
  changeQuantity,
  className,
  disabled,
  onClear,
  onClose,
  onOrderOriginChange,
  onPaymentMethodChange,
  orderOrigin,
  paymentMethod,
  submitLabel,
  preparationAreaLabel,
  removeItem,
  restaurantId,
  restaurantSlug,
  total,
  totalItems,
}: {
  cart: PosCartItem[];
  cartJson: string;
  changeQuantity: (cartId: string, delta: number) => void;
  className?: string;
  disabled?: boolean;
  onClear: () => void;
  onClose?: () => void;
  onOrderOriginChange: (value: OrderOrigin) => void;
  onPaymentMethodChange: (value: string) => void;
  orderOrigin: OrderOrigin;
  paymentMethod: string;
  submitLabel: string;
  preparationAreaLabel: string;
  removeItem: (cartId: string) => void;
  restaurantId: string;
  restaurantSlug: string;
  total: number;
  totalItems: number;
}) {
  const headerAction: ReactNode = onClose ? (
    <button className="grid h-11 w-11 place-items-center rounded-full bg-[var(--color-neutral-100)]" onClick={onClose} type="button">
      <X className="h-5 w-5" />
    </button>
  ) : (
    <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--primary-light)] text-[var(--primary)]">
      <ShoppingCart className="h-5 w-5" />
    </span>
  );

  return (
    <Card className={cn("h-fit max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-[1.25rem] p-3 sm:p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Venta rapida</p>
          <h2 className="text-2xl font-black text-[var(--text)]">Pedido POS</h2>
          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{totalItems} productos listos para revisar antes del cobro.</p>
        </div>
        {headerAction}
      </div>

      <div className="mt-4 space-y-2">
        {cart.length ? (
          cart.map((item) => (
            <div className="grid grid-cols-[56px_1fr_auto] gap-3 rounded-2xl bg-[var(--color-surface)] p-3" key={item.cartId}>
              <div className="overflow-hidden rounded-xl bg-[var(--primary-light)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={item.name} className="h-14 w-14 object-cover" src={item.imageUrl || defaultImage} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{item.name}</p>
                {item.notes ? <p className="line-clamp-2 text-xs font-semibold text-[var(--muted)]">{item.notes}</p> : null}
                <p className="text-xs font-semibold text-[var(--muted)]">{formatMoney(item.price)} c/u</p>
                <p className="mt-1 text-sm font-black text-[var(--text)]">{formatMoney(item.price * item.quantity)}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button className="text-[11px] font-black text-[var(--color-danger-strong)]" onClick={() => removeItem(item.cartId)} type="button">
                  Quitar
                </button>
                <div className="flex items-center gap-2">
                  <button className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface)]" onClick={() => changeQuantity(item.cartId, -1)} type="button">
                    {item.quantity === 1 ? <Trash2 className="h-4 w-4 text-[var(--color-danger)]" /> : <Minus className="h-4 w-4" />}
                  </button>
                  <span className="w-5 text-center text-sm font-black">{item.quantity}</span>
                  <button className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary)] text-[var(--color-on-primary)]" onClick={() => changeQuantity(item.cartId, 1)} type="button">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--muted)]">Agrega productos para iniciar la venta.</p>
        )}
      </div>

      <form action={createPosSaleAction} className="mt-4 space-y-3">
        <input name="restaurantId" type="hidden" value={restaurantId} />
        <input name="restaurantSlug" type="hidden" value={restaurantSlug} />
        <input name="cartJson" type="hidden" value={cartJson} />
        <div className="grid gap-3 rounded-2xl border border-[var(--border)] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">Origen del pedido</p>
            {cart.length ? (
              <button className="text-xs font-black text-[var(--color-danger-strong)]" onClick={onClear} type="button">
                Vaciar carrito
              </button>
            ) : null}
          </div>
          <Select name="orderOrigin" onChange={(event) => onOrderOriginChange(event.target.value as OrderOrigin)} value={orderOrigin}>
            <option value="pos_counter">{orderOriginLabels.pos_counter}</option>
            <option value="phone_whatsapp">{orderOriginLabels.phone_whatsapp}</option>
            <option value="external_platform">{orderOriginLabels.external_platform}</option>
          </Select>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--border)] pt-4 text-xl font-black">
          <span>Total</span>
          <span>{formatMoney(total)}</span>
        </div>
        <Input name="customerName" placeholder="Cliente opcional" />
        <Input name="customerPhone" placeholder="Telefono o WhatsApp del cliente" />
        <Select name="paymentMethod" onChange={(event) => onPaymentMethodChange(event.target.value)} value={paymentMethod}>
          <option value="cash">Efectivo</option>
          <option value="qr">QR</option>
          <option value="bank_transfer">Transferencia</option>
          <option value="card">Tarjeta</option>
          <option value="other">Otro</option>
        </Select>
        {paymentMethod === "qr" ? (
          <div className="space-y-2 rounded-2xl border border-[var(--border)] p-3">
            <Input name="paymentReceiptReference" placeholder="Numero de comprobante o referencia QR" />
            <CompressedImageInput acceptPdf help="Opcional: captura o PDF del pago. Las imagenes se optimizan en WebP." label="Comprobante QR" name="paymentReceiptFile" />
            <p className="text-xs font-semibold text-[var(--muted)]">En POS puedes subir una captura o registrar la referencia del pago digital.</p>
          </div>
        ) : null}
        <p className="text-xs font-semibold text-[var(--muted)]">Al confirmar, el pedido queda registrado para {preparationAreaLabel} y seguimiento.</p>
        <PosSubmitButton disabled={disabled || !cart.length} label={submitLabel} />
      </form>
    </Card>
  );
}

function PosSubmitButton({ disabled, label }: { disabled?: boolean; label: string }) {
  const { pending } = useFormStatus();

  return (
    <>
      <Button className="sticky bottom-0 z-10 w-full shadow-lg" disabled={disabled || pending} type="submit">
        {pending ? "Enviando venta..." : label}
      </Button>
      {pending ? <BrandLoadingOverlay description="Creando el pedido, registrando caja y enviandolo al panel." title="Registrando venta" zIndexClassName="z-[160]" /> : null}
    </>
  );
}

function CategoryButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={cn(buttonClasses(active ? "primary" : "secondary"), "h-10 shrink-0 px-3 text-xs font-black sm:px-4 sm:text-sm")} onClick={onClick} type="button">
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
      className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 rounded-[1.1rem] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-left shadow-sm transition hover:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50 sm:block sm:rounded-[1.25rem] sm:p-3"
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <div className="aspect-square overflow-hidden rounded-[0.9rem] bg-[var(--primary-light)] sm:aspect-[4/3] sm:rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={product.name} className="h-full w-full object-cover" src={product.imageUrl || defaultImage} />
      </div>
      <div className="min-w-0 self-center sm:mt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-black leading-5 text-[var(--text)] sm:truncate sm:text-base">{product.name}</p>
            <p className="mt-0.5 text-sm font-bold text-[var(--primary)]">{formatMoney(product.price)}</p>
          </div>
          {hasConfiguration ? <span className="hidden shrink-0 rounded-full bg-[var(--primary-light)] px-2 py-1 text-[10px] font-black text-[var(--primary-dark)] sm:inline-flex">Configurable</span> : null}
        </div>
        {product.description ? <p className="mt-1 line-clamp-1 text-xs font-semibold text-[var(--muted)] sm:mt-2 sm:line-clamp-2 sm:text-sm sm:font-normal">{product.description}</p> : null}
        <span className={buttonClasses("secondary", "mt-2 min-h-9 w-full bg-[var(--color-neutral-100)] px-3 text-xs font-black sm:mt-3 sm:min-h-10 sm:text-sm")}>{hasConfiguration ? "Personalizar" : "Agregar"}</span>
      </div>
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
  const [variantId, setVariantId] = useState(variants.length === 1 ? (variants[0]?.id ?? "") : "");
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
  const canAdd = (!variants.length || Boolean(selectedVariant)) && optionGroups.every((group) => (selectedOptions[group.id]?.length ?? 0) >= group.minChoices);

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
    <div className="fixed inset-0 z-[90] grid place-items-end bg-[var(--color-overlay)] p-0 text-[var(--text)] backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-[1.5rem] bg-[var(--surface)] shadow-2xl sm:max-w-2xl sm:rounded-[1.5rem]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] p-3 sm:gap-4 sm:p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Configurar venta</p>
            <h2 className="text-xl font-black leading-tight sm:text-2xl">{product.name}</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">Precio base {formatMoney(product.price)}</p>
          </div>
          <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-neutral-100)] hover:bg-[var(--color-neutral-200)]" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 p-3 sm:gap-5 sm:p-4">
          <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 sm:grid-cols-[180px_1fr] sm:gap-4">
            <div className="overflow-hidden rounded-[0.9rem] bg-[var(--primary-light)] sm:rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={product.name} className="aspect-square h-full w-full object-cover" src={product.imageUrl || defaultImage} />
            </div>
            <p className="self-center text-sm font-semibold leading-5 text-[var(--muted)] sm:font-normal sm:leading-6">{product.description || "Configura el producto antes de cobrarlo."}</p>
          </div>

          {variants.length ? (
            <section>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-black">Variante</h3>
                {!selectedVariant ? <span className="rounded-full bg-[var(--color-warning-soft)] px-3 py-1 text-xs font-black text-[var(--color-warning-strong)]">Elige una</span> : null}
              </div>
              <div className="mt-2 grid gap-2">
                {variants.map((variant) => (
                  <button
                    className={cn(
                      "flex min-h-12 items-center justify-between rounded-[1rem] border px-3 text-left transition sm:min-h-14 sm:rounded-2xl sm:px-4",
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
              <section className="rounded-[1.1rem] border border-[var(--border)] p-3 sm:rounded-[1.25rem]" key={group.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black">{group.name}</h3>
                    <p className="text-xs font-semibold text-[var(--muted)]">
                      {group.isRequired ? "Obligatorio" : "Opcional"} - elige {group.minChoices}-{group.maxChoices}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-black",
                      selectedCount >= group.minChoices ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]",
                    )}
                  >
                    {selectedCount}/{group.maxChoices}
                  </span>
                </div>

                <div className="mt-3 grid gap-2">
                  {group.options.map((option) => {
                    const selected = selectedOptions[group.id]?.includes(option.id) ?? false;
                    return (
                      <button
                        className={cn(
                          "flex min-h-11 items-center justify-between rounded-[1rem] border px-3 text-left transition sm:min-h-12 sm:rounded-2xl",
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

        <div className="sticky bottom-0 grid gap-3 border-t border-[var(--border)] bg-[var(--surface)] p-3 shadow-[0_-18px_40px_rgb(255_255_255_/_0.92)] sm:grid-cols-[1fr_auto] sm:items-center sm:p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">Total producto</p>
            <p className="text-2xl font-black text-[var(--primary)]">{formatMoney(total)}</p>
          </div>
          <Button className="min-h-12 px-8" disabled={!canAdd} onClick={() => onAdd(product, selectedVariant, chosenOptions)} type="button">
            {canAdd ? "Agregar al pedido POS" : "Completa opciones"}
          </Button>
        </div>
      </div>
    </div>
  );
}
