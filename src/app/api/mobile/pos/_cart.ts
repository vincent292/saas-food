import { z } from "zod";
import { checked, PosError, type PosSession } from "./_shared";

export const cartSchema = z.array(z.object({ productId: z.string().uuid(), variantId: z.string().uuid().optional(), optionIds: z.array(z.string().uuid()).max(50).default([]), quantity: z.number().int().min(1).max(99), notes: z.string().max(500).optional() })).min(1).max(100);

export async function resolveCart(auth: PosSession, restaurantId: string, cart: z.infer<typeof cartSchema>) {
  const ids = [...new Set(cart.map((i) => i.productId))];
  const [p, v, g, o] = await Promise.all([
    auth.client.from("products").select("*").eq("restaurant_id", restaurantId).in("id", ids),
    auth.client.from("product_variants").select("*").eq("restaurant_id", restaurantId).in("product_id", ids).eq("is_active", true),
    auth.client.from("product_option_groups").select("*").eq("restaurant_id", restaurantId).in("product_id", ids).eq("is_active", true),
    auth.client.from("product_options").select("*").eq("restaurant_id", restaurantId).in("product_id", ids).eq("is_active", true),
  ]);
  const products = checked(p) ?? [], variants = checked(v) ?? [], groups = checked(g) ?? [], options = checked(o) ?? [];
  return cart.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product?.is_available) throw new PosError("Producto no disponible.");
    const now = new Date();
    if ((product.available_from && new Date(product.available_from) > now) || (product.available_until && new Date(product.available_until) < now)) throw new PosError("Producto fuera de temporada.");
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/La_Paz", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const part = (key: string) => parts.find((p) => p.type === key)?.value ?? "";
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(part("weekday"));
    const minutes = Number(part("hour")) * 60 + Number(part("minute"));
    const time = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
    const start = product.available_start_time ? time(product.available_start_time) : null;
    const end = product.available_end_time ? time(product.available_end_time) : null;
    const overnight = start !== null && end !== null && start > end;
    const scheduleDay = overnight && minutes <= end! ? (day + 6) % 7 : day;
    if (product.available_days?.length && !product.available_days.includes(scheduleDay)) throw new PosError("Producto no disponible hoy.");
    if (start !== null && end !== null && (overnight ? minutes > end && minutes < start : minutes < start || minutes > end)) throw new PosError("Producto fuera de horario.");
    if (start !== null && end === null && minutes < start) throw new PosError("Producto fuera de horario.");
    if (end !== null && start === null && minutes > end) throw new PosError("Producto fuera de horario.");
    const variant = variants.find((v) => v.id === item.variantId && v.product_id === product.id);
    if ((item.variantId && !variant) || (!variant && variants.some((v) => v.product_id === product.id))) throw new PosError("Selecciona la variante del producto.");
    if (new Set(item.optionIds).size !== item.optionIds.length) throw new PosError("Opciones duplicadas.");
    const selected = item.optionIds.map((id) => options.find((o) => o.id === id && o.product_id === product.id));
    if (selected.some((o) => !o)) throw new PosError("Opcion no disponible.");
    for (const group of groups.filter((g) => g.product_id === product.id)) {
      const count = selected.filter((o) => o?.option_group_id === group.id).length;
      if (count < Math.max(group.min_choices, group.is_required ? 1 : 0) || count > group.max_choices) throw new PosError(`Revisa las opciones de ${group.name}.`);
    }
    const price = Number(product.price) + Number(variant?.price_delta ?? 0) + selected.reduce((sum, o) => sum + Number(o?.price_delta ?? 0), 0);
    return { product_id: product.id, product_name: variant ? `${product.name} - ${variant.name}` : product.name, variant_id: variant?.id ?? null, option_ids: item.optionIds, quantity: item.quantity, unit_price: price, subtotal: Number((price * item.quantity).toFixed(2)), notes: [variant?.name, ...selected.map((o) => o?.name), item.notes].filter(Boolean).join(" | ") };
  });
}
