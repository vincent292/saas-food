import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { businessTypeSupportsKitchen, businessTypeSupportsTableQr } from "@/lib/restaurant-directory-options";
import { getPrivateFileSignedUrl, uploadPrivateFile } from "@/lib/supabase/storage";
import { announcementService } from "@/lib/services/announcement.service";
import { sendOrderStatusPush } from "@/lib/services/mobile-push.service";
import { sendOrderWhatsAppNotification } from "@/lib/services/order-whatsapp-notification.service";
import { offerNextRiderForOrder } from "@/lib/services/rider-dispatch.service";
import { getBusinessStatus, DEFAULT_RESTAURANT_TIME_ZONE } from "@/lib/utils/business-hours";
import { cartSchema, resolveCart } from "./_cart";
import { allRows, checked, cors, failure, json, PosError, restaurantAccess, session } from "./_shared";

export const runtime = "nodejs";
export function OPTIONS() { return new Response(null, { status: 204, headers: cors }); }

const base = z.object({ restaurantId: z.string().uuid() });
const payment = z.enum(["cash", "qr", "bank_transfer", "card", "other"]);
const schema = z.discriminatedUnion("action", [
  base.extend({ action: z.literal("table-order"), requestId: z.string().uuid(), tableCode: z.string().min(1).max(100), customerName: z.string().trim().max(120), customerPhone: z.string().max(40).optional(), notes: z.string().max(500).optional(), paymentMethod: payment, items: cartSchema }),
  base.extend({ action: z.literal("sale"), requestId: z.string().uuid(), customerName: z.string().trim().max(120), customerPhone: z.string().max(40).optional(), paymentMethod: payment, reference: z.string().max(160).optional(), items: cartSchema }),
  base.extend({ action: z.literal("charge"), orderId: z.string().uuid(), paymentMethod: payment, reference: z.string().max(160).optional() }),
  base.extend({ action: z.literal("receipt"), orderId: z.string().uuid() }),
  base.extend({ action: z.literal("status"), orderId: z.string().uuid(), expected: z.enum(["accepted", "preparing", "ready"]), next: z.enum(["preparing", "ready", "delivered"]) }),
  base.extend({ action: z.literal("open-cash"), amount: z.number().min(0).max(100000000), notes: z.string().max(500).optional() }),
  base.extend({ action: z.literal("close-cash"), sessionId: z.string().uuid(), amount: z.number().min(0).max(100000000), notes: z.string().max(500).optional() }),
]);

export async function GET(request: Request) {
  try {
    const auth = await session(request);
    const params = new URL(request.url).searchParams;
    const id = params.get("restaurantId");
    if (!id) return json({ profile: auth.profile, restaurants: auth.restaurants });
    const restaurant = restaurantAccess(auth, id);
    const receiptId = params.get("receiptOrderId");
    if (receiptId) {
      const order = checked(await auth.client.from("orders").select("payment_receipt_url,order_type").eq("restaurant_id", id).eq("id", receiptId).maybeSingle());
      if (!order || (!restaurant.canManage && order.order_type !== "table")) throw new PosError("Comprobante no encontrado.", 404);
      const url = order.payment_receipt_url;
      if (!url) throw new PosError("El pedido no tiene comprobante.", 404);
      const prefix = "/api/storage/private/";
      return json({ url: url.startsWith(prefix) ? await getPrivateFileSignedUrl(decodeURIComponent(url.slice(prefix.length))) : url });
    }
    const client = auth.client;
    const catalog = params.get("catalog") !== "0";
    let ordersQuery = client.from("orders").select("id,restaurant_id,table_id,order_number,order_type,status,payment_status,payment_method,payment_receipt_url,payment_receipt_reference,customer_name,customer_phone,total,notes,created_at,order_items(id,product_name,quantity,subtotal,notes)").eq("restaurant_id", id).order("created_at", { ascending: false }).order("id");
    // Keep every active order, including those created before today's shift.
    ordersQuery = ordersQuery.or(`status.in.(pending,accepted,preparing,ready),created_at.gte.${new Date(Date.now() - 86400000).toISOString()}`);
    if (!restaurant.canManage) ordersQuery = ordersQuery.eq("order_type", "table");
    const [ordersResult, tablesResult, settingsResult, openResult] = await Promise.all([
      allRows((from, to) => ordersQuery.range(from, to)),
      client.from("tables").select("id,name,code,status,capacity").eq("restaurant_id", id).eq("is_active", true).order("name"),
      client.from("restaurant_settings").select("currency,qr_payment_url,table_orders_enabled,kitchen_enabled").eq("restaurant_id", id).maybeSingle(),
      restaurant.canManage ? client.from("cash_sessions").select("*").eq("restaurant_id", id).eq("status", "open").maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    const cashSession = checked(openResult);
    const movements = cashSession ? await allRows((from, to) => client.from("cash_movements").select("*").eq("restaurant_id", id).eq("cash_session_id", cashSession.id).order("created_at", { ascending: false }).order("id").range(from, to)) : [];
    const cashOpen = restaurant.canManage ? Boolean(cashSession) : Boolean(checked(await client.rpc("has_open_cash_session_public", { p_restaurant_id: id })));
    let products, categories, variants, groups, options;
    if (catalog) {
      const results = await Promise.all([
        client.from("products").select("id,name,description,price,image_url,category_id").eq("restaurant_id", id).eq("is_available", true).order("sort_order"),
        client.from("categories").select("id,name").eq("restaurant_id", id).eq("is_active", true).order("sort_order"),
        client.from("product_variants").select("id,product_id,name,price_delta").eq("restaurant_id", id).eq("is_active", true).order("sort_order"),
        client.from("product_option_groups").select("id,product_id,name,min_choices,max_choices,is_required").eq("restaurant_id", id).eq("is_active", true).order("sort_order"),
        client.from("product_options").select("id,product_id,option_group_id,name,price_delta").eq("restaurant_id", id).eq("is_active", true).order("sort_order"),
      ]);
      [products, categories, variants, groups, options] = results.map((r) => checked(r));
    }
    const settings = checked(settingsResult);
    if (!settings) throw new PosError("El restaurante no tiene configuracion de venta.", 409);
    return json({ restaurant, orders: ordersResult, tables: checked(tablesResult), settings, cashSession, cashOpen, movements, products, categories, variants, groups, options });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await session(request);
    let raw: unknown, file: File | null = null;
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      try { raw = JSON.parse(String(form.get("payload"))); } catch { throw new PosError("Solicitud invalida."); }
      const upload = form.get("receipt");
      if (upload instanceof File && upload.size) {
        if (upload.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(upload.type)) throw new PosError("Adjunta una imagen JPG, PNG o WebP de hasta 5 MB.");
        file = upload;
      }
    } else {
      try { raw = await request.json(); } catch { throw new PosError("Solicitud invalida."); }
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new PosError("Revisa los datos de la operacion.");
    const input = parsed.data;
    const restaurant = restaurantAccess(auth, input.restaurantId, !["table-order", "receipt"].includes(input.action));
    const client = auth.client;
    const id = restaurant.id;
    const upload = () => uploadPrivateFile(file, `restaurants/${id}/payment-receipts`);
    let result: unknown = null;

    if (input.action === "table-order") {
      const existing = checked(await auth.client.from("orders").select("id,order_number").eq("restaurant_id", id).eq("public_request_id", input.requestId).maybeSingle());
      if (existing) return json(existing);
      const table = checked(await client.from("tables").select("id,name,code").eq("restaurant_id", id).eq("code", input.tableCode.toUpperCase()).eq("is_active", true).maybeSingle());
      if (!table) throw new PosError("La mesa no pertenece a este restaurante.");
      const settings = checked(await client.from("restaurant_settings").select("table_orders_enabled,min_order_amount,qr_payment_url").eq("restaurant_id", id).single());
      if (!settings?.table_orders_enabled || !businessTypeSupportsTableQr(restaurant.business_type)) throw new PosError("Los pedidos de mesa estan desactivados.");
      if (await announcementService.hasActiveClosure(id)) throw new PosError("El restaurante esta cerrado temporalmente.");
      const hours = checked(await client.from("business_hours").select("day_of_week,opens_at,closes_at,is_closed").eq("restaurant_id", id));
      const business = getBusinessStatus((hours ?? []).map((h) => ({ dayOfWeek: h.day_of_week, opensAt: h.opens_at ?? "", closesAt: h.closes_at ?? "", isClosed: h.is_closed })), new Date(), DEFAULT_RESTAURANT_TIME_ZONE);
      if (business.hasSchedule && !business.isOpen) throw new PosError("El restaurante esta fuera de horario.");
      if (input.paymentMethod === "qr" && !settings.qr_payment_url) throw new PosError("El restaurante no tiene QR de pago.");
      const items = await resolveCart(auth, id, input.items);
      const total = Number(items.reduce((sum, i) => sum + i.subtotal, 0).toFixed(2));
      if (total < Number(settings.min_order_amount)) throw new PosError("No se alcanza el pedido minimo del restaurante.");
      const receipt = await upload();
      const orderNumber = `M-${input.requestId.slice(0, 8).toUpperCase()}`;
      // Attribution is generated from the authenticated account, never from the payload.
      const notes = `${table.name} (${table.code}) | Mesero: ${auth.profile.full_name || "Personal"}${input.notes ? ` | ${input.notes}` : ""}`;
      const created = await auth.admin.rpc("create_public_order_transaction", { p_request_id: input.requestId, p_order: { restaurant_id: id, table_id: table.id, order_number: orderNumber, customer_name: input.customerName || table.name, customer_phone: input.customerPhone || null, order_type: "table", order_origin: "table_qr", payment_method: input.paymentMethod, payment_receipt_url: receipt, payment_receipt_uploaded_at: receipt ? new Date().toISOString() : null, subtotal: total, total, delivery_fee: 0, discount_total: 0, notes }, p_items: items });
      if (created.error?.code === "23505") {
        const retry = checked(await client.from("orders").select("id,order_number").eq("restaurant_id", id).eq("public_request_id", input.requestId).maybeSingle());
        if (retry) return json(retry);
      }
      result = { id: checked(created)?.[0]?.id, order_number: orderNumber };
    } else if (input.action === "open-cash" || input.action === "close-cash") {
      if (input.action === "close-cash") {
        const active = checked(await client.from("cash_sessions").select("id").eq("restaurant_id", id).eq("status", "open").maybeSingle());
        if (active?.id !== input.sessionId) throw new PosError("La caja cambio. Actualiza antes de cerrar.", 409);
      }
      result = input.action === "open-cash"
        ? checked(await client.rpc("open_cash_session_atomic", { p_restaurant_id: id, p_opening_amount: input.amount, p_notes: input.notes ?? null }))
        : checked(await client.rpc("close_cash_session_atomic", { p_restaurant_id: id, p_counted_amount: input.amount, p_notes: input.notes ?? null }));
    } else if (input.action === "sale") {
      const orderNumber = `POS-${input.requestId}`;
      const existing = checked(await client.from("orders").select("id,order_number").eq("restaurant_id", id).eq("order_number", orderNumber).maybeSingle());
      if (existing) return json(existing);
      await resolveCart(auth, id, input.items);
      const receipt = await upload();
      const sale = await client.rpc("create_pos_sale_with_cash_movement", { p_restaurant_id: id, p_order_number: orderNumber, p_customer_name: input.customerName || "Venta mostrador", p_customer_phone: input.customerPhone || null, p_order_origin: "pos_counter", p_payment_method: input.paymentMethod, p_receipt_url: receipt, p_receipt_reference: input.reference ?? null, p_items: input.items });
      if (sale.error?.code === "23505") {
        const duplicate = checked(await client.from("orders").select("id,order_number").eq("restaurant_id", id).eq("order_number", orderNumber).maybeSingle());
        if (duplicate) return json(duplicate);
      }
      const orderId = checked(sale);
      const settings = checked(await client.from("restaurant_settings").select("kitchen_enabled").eq("restaurant_id", id).maybeSingle());
      if (orderId && (!businessTypeSupportsKitchen(restaurant.business_type) || settings?.kitchen_enabled === false)) {
        checked(await client.from("orders").update({ status: "ready", ready_at: new Date().toISOString() }).eq("restaurant_id", id).eq("id", orderId).eq("status", "accepted"));
      }
      result = { id: orderId, order_number: orderNumber };
    } else {
      const order = checked(await client.from("orders").select("id,status,order_type,payment_status").eq("restaurant_id", id).eq("id", input.orderId).maybeSingle());
      if (!order) throw new PosError("Pedido no encontrado.", 404);
      if (input.action === "receipt") {
        if ((!restaurant.canManage && order.order_type !== "table") || order.payment_status !== "pending" || order.status === "cancelled") throw new PosError("No se puede adjuntar un comprobante a este pedido.", 403);
        if (!file) throw new PosError("Selecciona un comprobante.");
        const receipt = await upload();
        const updated = checked(await client.from("orders").update({ payment_receipt_url: receipt, payment_receipt_uploaded_at: new Date().toISOString() }).eq("restaurant_id", id).eq("id", order.id).eq("payment_status", "pending").neq("status", "cancelled").select("id").maybeSingle());
        if (!updated) throw new PosError("El pedido cambio. Actualiza para continuar.", 409);
        result = updated;
      } else {
        let changed = false;
        let next: "accepted" | "preparing" | "ready" | "delivered" = "accepted";
        if (input.action === "charge") {
          checked(await client.rpc("charge_order_with_cash_movement", { p_restaurant_id: id, p_order_id: order.id, p_payment_method: input.paymentMethod, p_receipt_url: await upload(), p_receipt_reference: input.reference ?? null }));
          changed = order.status === "pending";
          const settings = checked(await client.from("restaurant_settings").select("kitchen_enabled").eq("restaurant_id", id).maybeSingle());
          if (!businessTypeSupportsKitchen(restaurant.business_type) || settings?.kitchen_enabled === false) {
            const ready = checked(await client.from("orders").update({ status: "ready", ready_at: new Date().toISOString() }).eq("restaurant_id", id).eq("id", order.id).in("status", ["accepted", "preparing"]).select("id").maybeSingle());
            if (ready) { next = "ready"; changed = true; }
          }
        } else {
          if (input.next === "delivered" && order.order_type === "delivery") throw new PosError("La entrega se confirma desde el flujo del repartidor.");
          const updated = checked(await client.rpc("update_operational_order_status", { p_restaurant_id: id, p_order_id: order.id, p_expected_status: input.expected, p_next_status: input.next }));
          if (!updated?.length) throw new PosError("El pedido cambio. Actualiza para continuar.", 409);
          changed = updated[0].status_changed;
          next = input.next;
        }
        if (changed) after(async () => {
          const tasks: Promise<unknown>[] = [sendOrderStatusPush({ orderId: order.id, status: next })];
          if (next !== "preparing") tasks.push(sendOrderWhatsAppNotification({ orderId: order.id, event: next }));
          if (next === "ready" && order.order_type === "delivery") tasks.push(offerNextRiderForOrder(order.id));
          await Promise.allSettled(tasks);
        });
        result = { id: order.id };
      }
    }
    for (const path of ["caja", "pedidos", "dashboard"]) revalidatePath(`/admin/restaurantes/${id}/${path}`);
    revalidatePath(`/cocina/${restaurant.slug}`);
    return json(result);
  } catch (error) { return failure(error); }
}
