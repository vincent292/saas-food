"use client";

import { Minus, Plus, ShoppingCart, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createPublicOrderAction } from "@/app/r/actions";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import type { RestaurantTable } from "@/types/order.types";
import type { Category, Product } from "@/types/product.types";
import type { Restaurant, RestaurantSettings } from "@/types/restaurant.types";

type CartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
};

const defaultImage = "/imagendefault.jpeg";

export function TableOrderClient({
  restaurant,
  table,
  categories,
  products,
  settings,
}: {
  restaurant: Restaurant;
  table: RestaurantTable;
  categories: Category[];
  products: Product[];
  settings: RestaurantSettings | null;
}) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "qr">("cash");
  const [requiresInvoice, setRequiresInvoice] = useState(false);

  const filteredProducts = useMemo(() => {
    if (selectedCategory === "all") {
      return products;
    }
    return products.filter((product) => product.categoryId === selectedCategory);
  }, [products, selectedCategory]);

  const cartQuantity = cart.reduce((total, item) => total + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const orderNotes = `${table.name} (${table.code})${requiresInvoice ? " - Requiere factura" : ""}`;
  const cartJson = JSON.stringify(cart.map(({ productId, name, price, quantity }) => ({ productId, name, price, quantity })));

  function addProduct(product: Product) {
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current.map((item) => (item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }

      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
          imageUrl: product.imageUrl || defaultImage,
        },
      ];
    });
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((current) =>
      current
        .map((item) => (item.productId === productId ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0),
    );
  }

  return (
    <main className="min-h-screen bg-[var(--primary-dark)] text-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-3 pb-28 pt-5 sm:px-6 lg:grid-cols-[1fr_345px] lg:px-8 lg:pb-8 lg:pt-8">
        <section className="min-w-0">
          <div className="mb-5">
            <h1 className="text-5xl font-black leading-none tracking-normal sm:text-6xl">Mesa {table.name.replace(/^mesa\s*/i, "")}</h1>
            <p className="mt-3 max-w-2xl text-sm font-bold text-white/90 sm:text-base">Elige tus productos, confirma tu pedido y lo enviamos directo al equipo.</p>
          </div>

          <div className="sticky top-0 z-20 -mx-3 mb-3 border-y border-white/10 bg-[var(--primary-dark)]/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-[1.5rem] sm:border sm:bg-white sm:text-[var(--text)]">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <CategoryButton active={selectedCategory === "all"} label="Todo" onClick={() => setSelectedCategory("all")} />
              {categories.map((category) => (
                <CategoryButton active={selectedCategory === category.id} key={category.id} label={category.name} onClick={() => setSelectedCategory(category.id)} />
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => (
              <ProductTile addProduct={addProduct} key={product.id} product={product} />
            ))}
          </div>

          {!filteredProducts.length ? (
            <div className="rounded-[1.25rem] bg-white p-6 text-center text-sm font-semibold text-[var(--muted)]">No hay productos disponibles en esta categoría.</div>
          ) : null}
        </section>

        <aside className="hidden lg:block">
          <OrderPanel
            cart={cart}
            cartJson={cartJson}
            changeQuantity={changeQuantity}
            paymentMethod={paymentMethod}
            requiresInvoice={requiresInvoice}
            restaurant={restaurant}
            setPaymentMethod={setPaymentMethod}
            setRequiresInvoice={setRequiresInvoice}
            settings={settings}
            table={table}
            total={total}
            notes={orderNotes}
          />
        </aside>
      </div>

      <button
        className="fixed inset-x-3 bottom-3 z-40 flex h-14 items-center justify-between rounded-full bg-[var(--primary)] px-5 text-sm font-black text-white shadow-2xl lg:hidden"
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
        <div className="fixed inset-0 z-50 bg-slate-950/45 lg:hidden">
          <div className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-[1.5rem] bg-[var(--surface)] p-4 text-[var(--text)] shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-2xl font-black">Tu pedido</h2>
              <button className="grid h-11 w-11 place-items-center rounded-full bg-slate-100" onClick={() => setDrawerOpen(false)} type="button">
                <X className="h-5 w-5" />
              </button>
            </div>
            <OrderPanel
              cart={cart}
              cartJson={cartJson}
              changeQuantity={changeQuantity}
              compact
              paymentMethod={paymentMethod}
              requiresInvoice={requiresInvoice}
              restaurant={restaurant}
              setPaymentMethod={setPaymentMethod}
              setRequiresInvoice={setRequiresInvoice}
              settings={settings}
              table={table}
              total={total}
              notes={orderNotes}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}

function CategoryButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={cn(
        "h-11 shrink-0 rounded-full px-4 text-sm font-black transition",
        active ? "bg-[var(--primary)] text-white" : "bg-[var(--primary-light)] text-[var(--muted)] hover:text-[var(--primary-dark)]",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function ProductTile({ product, addProduct }: { product: Product; addProduct: (product: Product) => void }) {
  return (
    <article className="grid grid-cols-[88px_1fr] gap-3 rounded-[1.25rem] border border-[var(--border)] bg-white p-3 text-[var(--text)] shadow-sm sm:block sm:p-4">
      <div className="aspect-square overflow-hidden rounded-2xl bg-[var(--primary-light)] sm:aspect-[4/3]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={product.name} className="h-full w-full object-cover" src={product.imageUrl || defaultImage} />
      </div>
      <div className="min-w-0 sm:mt-3">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--primary)]">Producto</p>
        <h3 className="truncate text-lg font-black leading-5">{product.name}</h3>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--muted)]">{product.description || "Listo para pedir en mesa."}</p>
        <button className={buttonClasses("secondary", "mt-3 min-h-10 w-full bg-slate-100 font-black")} onClick={() => addProduct(product)} type="button">
          Agregar {formatMoney(product.price)}
        </button>
      </div>
    </article>
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
  changeQuantity: (productId: string, delta: number) => void;
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
      <input name="notes" type="hidden" value={notes} />
      <input name="cartJson" type="hidden" value={cartJson} />

      {!compact ? <h2 className="text-2xl font-black">Tu pedido</h2> : null}

      <div className="mt-4 space-y-2">
        {cart.length ? (
          cart.map((item) => (
            <div className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl bg-[var(--primary-light)]/45 p-3" key={item.productId}>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{item.name}</p>
                <p className="text-xs font-semibold text-[var(--muted)]">{formatMoney(item.price)} c/u</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="grid h-8 w-8 place-items-center rounded-full bg-white" onClick={() => changeQuantity(item.productId, -1)} type="button">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-5 text-center text-sm font-black">{item.quantity}</span>
                <button className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary)] text-white" onClick={() => changeQuantity(item.productId, 1)} type="button">
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
        WhatsApp
        <Input className="mt-2" name="customerPhone" type="tel" />
      </label>

      <label className="mt-4 flex items-center justify-between text-sm font-black">
        ¿Requiere factura?
        <input checked={requiresInvoice} onChange={(event) => setRequiresInvoice(event.target.checked)} type="checkbox" />
      </label>

      <div className="mt-3 grid rounded-2xl bg-[var(--primary-light)] p-1 sm:grid-cols-2">
        <button className={cn("h-12 rounded-full text-sm font-black", paymentMethod === "cash" && "bg-[var(--primary)] text-white")} onClick={() => setPaymentMethod("cash")} type="button">
          Caja / efectivo
        </button>
        <button className={cn("h-12 rounded-full text-sm font-black text-[var(--muted)]", paymentMethod === "qr" && "bg-[var(--primary)] text-white")} onClick={() => setPaymentMethod("qr")} type="button">
          Pago QR
        </button>
      </div>

      <p className="mt-4 rounded-2xl bg-white/60 p-3 text-sm leading-6 text-[var(--muted)]">
        {paymentMethod === "cash"
          ? "Para procesar tu pedido, por favor acércate a caja y realiza el pago."
          : settings?.qrPaymentUrl
            ? "Seleccionaste pago QR. El equipo confirmará el pago antes de preparar el pedido."
            : "Seleccionaste pago QR. El equipo te indicará el QR disponible para completar el pago."}
      </p>

      <Button className="mt-5 min-h-13 w-full" disabled={!cart.length} type="submit">
        Confirmar pedido
      </Button>
    </form>
  );
}
