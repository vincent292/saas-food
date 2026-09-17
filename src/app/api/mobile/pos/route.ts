import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { businessTypeSupportsKitchen, businessTypeSupportsTableQr } from "@/lib/restaurant-directory-options";
import { getPrivateFileSignedUrl, uploadPrivateFile } from "@/lib/supabase/storage";
import { announcementService } from "@/lib/services/announcement.service";
import {
  registerRestaurantPosPushToken,
  sendOrderStatusPush,
  sendRestaurantNewOrderPush,
} from "@/lib/services/mobile-push.service";
import { sendOrderWhatsAppNotification } from "@/lib/services/order-whatsapp-notification.service";
import { claimRiderDeliveryOrder, offerNextRiderForOrder } from "@/lib/services/rider-dispatch.service";
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
  base.extend({ action: z.literal("accept"), orderId: z.string().uuid() }),
  base.extend({ action: z.literal("charge"), orderId: z.string().uuid(), paymentMethod: payment, reference: z.string().max(160).optional() }),
  base.extend({ action: z.literal("receipt"), orderId: z.string().uuid() }),
  base.extend({ action: z.literal("status"), orderId: z.string().uuid(), expected: z.enum(["accepted", "preparing", "ready"]), next: z.enum(["preparing", "ready", "delivered"]) }),
  base.extend({ action: z.literal("eta"), orderId: z.string().uuid(), adjustmentMinutes: z.number().int().min(0).max(180) }),
  base.extend({ action: z.literal("dispatch-rider"), orderId: z.string().uuid() }),
  base.extend({ action: z.literal("assign-rider"), orderId: z.string().uuid(), riderId: z.string().uuid() }),
  base.extend({
    action: z.literal("register-pos-push"),
    appVersion: z.string().trim().max(40).optional(),
    deviceId: z.string().trim().max(160).optional(),
    expoPushToken: z.string().trim().min(20).max(400),
    platform: z.string().trim().max(40).optional(),
  }),
  base.extend({ action: z.literal("open-cash"), amount: z.number().min(0).max(100000000), notes: z.string().max(500).optional() }),
  base.extend({ action: z.literal("close-cash"), sessionId: z.string().uuid(), amount: z.number().min(0).max(100000000), notes: z.string().max(500).optional() }),
  base.extend({ action: z.literal("open-waiter-shift") }),
  base.extend({ action: z.literal("close-waiter-shift") }),
  base.extend({ action: z.literal("cancel-order"), orderId: z.string().uuid(), reason: z.string().trim().min(5).max(500) }),
  base.extend({ action: z.literal("settle-table"), tableId: z.string().uuid(), paymentMethod: payment, reference: z.string().max(160).optional() }),
]);

async function getWaiterShift(auth: Awaited<ReturnType<typeof session>>, restaurantId: string) {
  const restaurant = auth.restaurants.find((item) => item.id === restaurantId);
  if (restaurant?.role !== "waiter") return null;
  const latest = checked(await auth.admin
    .from("admin_audit_logs")
    .select("action,created_at")
    .eq("actor_user_id", auth.profile.id)
    .eq("restaurant_id", restaurantId)
    .in("action", ["waiter_shift_opened", "waiter_shift_closed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle());
  return {
    active: latest?.action === "waiter_shift_opened",
    openedAt: latest?.action === "waiter_shift_opened" ? latest.created_at : null,
  };
}

async function writeWaiterAudit(
  auth: Awaited<ReturnType<typeof session>>,
  restaurantId: string,
  action: "waiter_shift_opened" | "waiter_shift_closed" | "waiter_order_created",
  metadata: Record<string, string> = {},
) {
  checked(await auth.client.rpc("write_admin_audit", {
    p_action: action,
    p_entity_type: action === "waiter_order_created" ? "order" : "waiter_shift",
    p_entity_id: action === "waiter_order_created" && metadata.orderId ? metadata.orderId : auth.profile.id,
    p_restaurant_id: restaurantId,
    p_severity: "info",
    p_metadata: metadata,
  }));
}

async function releaseTableWhenEmpty(auth: Awaited<ReturnType<typeof session>>, restaurantId: string, tableId: string | null) {
  if (!tableId) return;
  const { count, error } = await auth.admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("table_id", tableId)
    .in("status", ["pending", "accepted", "preparing", "ready"]);
  if (error) throw new PosError(error.message);
  if ((count ?? 0) === 0) {
    checked(await auth.admin.from("tables").update({ status: "available" }).eq("restaurant_id", restaurantId).eq("id", tableId));
  }
}

async function createCancellationReview(
  auth: Awaited<ReturnType<typeof session>>,
  restaurantId: string,
  order: {
    id: string;
    order_number: string;
    order_type: "table" | "delivery" | "pickup" | "pos";
    status: "pending" | "accepted" | "preparing" | "ready" | "delivered" | "cancelled";
    payment_status: "pending" | "paid" | "cancelled" | "refunded";
    payment_method: "cash" | "qr" | "bank_transfer" | "card" | "other";
    payment_receipt_url: string | null;
    payment_receipt_reference: string | null;
    payment_receipt_uploaded_at: string | null;
    requested_fulfillment_at: string | null;
    accepted_at: string | null;
    ready_at: string | null;
    delivered_at: string | null;
    total: number;
  },
  reason: string,
) {
  const [itemsResult, movementResult] = await Promise.all([
    auth.admin.from("order_items").select("id,order_id,product_id,product_name,unit_price,quantity,subtotal,prep_minutes,notes").eq("order_id", order.id).order("created_at"),
    auth.admin.from("cash_movements").select("id,cash_session_id,amount,payment_method,description,created_at").eq("restaurant_id", restaurantId).eq("order_id", order.id).eq("type", "sale").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const items = checked(itemsResult) ?? [];
  const movement = checked(movementResult);
  checked(await auth.admin.from("order_cancellation_reviews").insert({
    restaurant_id: restaurantId,
    order_id: order.id,
    order_number: order.order_number,
    order_status_at_cancellation: order.status,
    payment_status_at_cancellation: order.payment_status,
    order_type: order.order_type,
    total: order.total,
    payment_method: order.payment_method,
    cancellation_kind: order.payment_status === "paid" ? "cancelled" : "rejected",
    reason,
    cancelled_by: auth.profile.id,
    cancelled_by_name: auth.profile.full_name,
    cancelled_by_email: auth.profile.email,
    cancelled_at: new Date().toISOString(),
    payment_receipt_url: order.payment_receipt_url,
    payment_receipt_reference: order.payment_receipt_reference,
    payment_receipt_uploaded_at: order.payment_receipt_uploaded_at,
    requested_fulfillment_at: order.requested_fulfillment_at,
    accepted_at: order.accepted_at,
    ready_at: order.ready_at,
    delivered_at: order.delivered_at,
    cash_session_id: movement?.cash_session_id ?? null,
    cash_movement_id: movement?.id ?? null,
    owner_review_status: "pending",
    snapshot: { order, items, cashMovement: movement ?? null },
  }));
}

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
    let ordersQuery = client.from("orders").select("id,restaurant_id,table_id,order_number,order_type,status,payment_status,payment_method,payment_receipt_url,payment_receipt_reference,customer_name,customer_phone,total,notes,created_at,eta_adjustment_minutes,order_items(id,product_name,quantity,subtotal,prep_minutes,notes)").eq("restaurant_id", id).order("created_at", { ascending: false }).order("id");
    // Keep every active order, including those created before today's shift.
    ordersQuery = ordersQuery.or(`status.in.(pending,accepted,preparing,ready),created_at.gte.${new Date(Date.now() - 86400000).toISOString()}`);
    if (!restaurant.canManage) ordersQuery = ordersQuery.eq("order_type", "table");
    const [ordersResult, tablesResult, settingsResult, openResult, waiterShift] = await Promise.all([
      allRows((from, to) => ordersQuery.range(from, to)),
      client.from("tables").select("id,name,code,status,capacity").eq("restaurant_id", id).eq("is_active", true).order("name"),
      client.from("restaurant_settings").select("currency,qr_payment_url,table_orders_enabled,kitchen_enabled").eq("restaurant_id", id).maybeSingle(),
      restaurant.canManage ? client.from("cash_sessions").select("*").eq("restaurant_id", id).eq("status", "open").maybeSingle() : Promise.resolve({ data: null, error: null }),
      getWaiterShift(auth, id),
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
    const orderIds = ordersResult.map((order) => order.id);
    const [ridersResult, assignmentsResult] = restaurant.canManage
      ? await Promise.all([
          auth.admin
            .from("restaurant_riders")
            .select("id,full_name,phone,plate_number,status,membership_valid_until")
            .eq("restaurant_id", id)
            .eq("status", "active")
            .gte("membership_valid_until", new Date().toISOString().slice(0, 10))
            .order("full_name"),
          orderIds.length
            ? auth.admin
                .from("order_delivery_links")
                .select("order_id,restaurant_rider_id,delivery_name,delivery_phone,status,pickup_confirmation_code,pickup_code_verified_at,assigned_at")
                .eq("restaurant_id", id)
                .in("order_id", orderIds)
            : Promise.resolve({ data: [], error: null }),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    const riders = checked(ridersResult) ?? [];
    const deliveryAssignments = checked(assignmentsResult) ?? [];
    return json({ restaurant, orders: ordersResult, tables: checked(tablesResult), settings, cashSession, cashOpen, movements, waiterShift, products, categories, variants, groups, options, riders, deliveryAssignments });
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
    const waiterActions = ["table-order", "receipt", "open-waiter-shift", "close-waiter-shift"];
    const restaurant = restaurantAccess(auth, input.restaurantId, !waiterActions.includes(input.action));
    const client = auth.client;
    const id = restaurant.id;
    const upload = () => uploadPrivateFile(file, `restaurants/${id}/payment-receipts`);
    let result: unknown = null;

    if (input.action === "open-waiter-shift" || input.action === "close-waiter-shift") {
      if (restaurant.role !== "waiter") throw new PosError("Esta operacion es solo para meseros.", 403);
      const current = await getWaiterShift(auth, id);
      const opening = input.action === "open-waiter-shift";
      if (opening !== current?.active) {
        await writeWaiterAudit(auth, id, opening ? "waiter_shift_opened" : "waiter_shift_closed");
      }
      result = { active: opening, openedAt: opening ? current?.openedAt ?? new Date().toISOString() : null };
    } else if (input.action === "table-order") {
      const existing = checked(await auth.client.from("orders").select("id,order_number").eq("restaurant_id", id).eq("public_request_id", input.requestId).maybeSingle());
      if (existing) return json(existing);
      if (restaurant.role === "waiter" && !(await getWaiterShift(auth, id))?.active) {
        throw new PosError("Abre tu turno antes de enviar pedidos.", 409);
      }
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
      const notes = `${table.name} (${table.code}) | Mesero: ${auth.profile.full_name || "Personal"} | Usuario: ${auth.profile.id}${input.notes ? ` | ${input.notes}` : ""}`;
      const created = await auth.admin.rpc("create_public_order_transaction", { p_request_id: input.requestId, p_order: { restaurant_id: id, table_id: table.id, order_number: orderNumber, customer_name: input.customerName || table.name, customer_phone: input.customerPhone || null, order_type: "table", order_origin: "table_qr", payment_method: input.paymentMethod, payment_receipt_url: receipt, payment_receipt_uploaded_at: receipt ? new Date().toISOString() : null, subtotal: total, total, delivery_fee: 0, discount_total: 0, notes }, p_items: items });
      if (created.error?.code === "23505") {
        const retry = checked(await client.from("orders").select("id,order_number").eq("restaurant_id", id).eq("public_request_id", input.requestId).maybeSingle());
        if (retry) return json(retry);
      }
      const createdOrderId = checked(created)?.[0]?.id;
      if (createdOrderId) {
        checked(await auth.admin.from("tables").update({ status: "occupied" }).eq("restaurant_id", id).eq("id", table.id));
        if (restaurant.role === "waiter") {
          await writeWaiterAudit(auth, id, "waiter_order_created", { orderId: createdOrderId, orderNumber, tableId: table.id, tableName: table.name });
        }
        after(async () => {
          await sendRestaurantNewOrderPush(createdOrderId);
        });
      }
      result = { id: createdOrderId, order_number: orderNumber };
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
    } else if (input.action === "register-pos-push") {
      const registration = await registerRestaurantPosPushToken({
        appVersion: input.appVersion,
        deviceId: input.deviceId,
        expoPushToken: input.expoPushToken,
        platform: input.platform,
        restaurantId: id,
        userId: auth.profile.id,
      }, auth.admin);
      if (!registration.ok) throw new PosError("No se pudo registrar este dispositivo para notificaciones.", 400);
      result = { ok: true };
    } else if (input.action === "eta") {
      const order = checked(await client
        .from("orders")
        .update({
          eta_adjustment_minutes: input.adjustmentMinutes,
          eta_adjusted_at: new Date().toISOString(),
          eta_adjusted_by: auth.profile.id,
        })
        .eq("restaurant_id", id)
        .eq("id", input.orderId)
        .in("status", ["pending", "accepted", "preparing"])
        .select("id,eta_adjustment_minutes")
        .maybeSingle());
      if (!order) throw new PosError("El pedido ya no permite cambiar el tiempo.", 409);
      checked(await client.rpc("write_admin_audit", {
        p_action: "order_eta_adjusted",
        p_entity_type: "order",
        p_entity_id: input.orderId,
        p_restaurant_id: id,
        p_severity: "info",
        p_metadata: { adjustmentMinutes: input.adjustmentMinutes },
      }));
      after(async () => {
        await sendOrderWhatsAppNotification({ event: "eta_updated", orderId: input.orderId });
      });
      result = order;
    } else if (input.action === "dispatch-rider") {
      const order = checked(await client.from("orders").select("id,order_type,status").eq("restaurant_id", id).eq("id", input.orderId).maybeSingle());
      if (!order || order.order_type !== "delivery") throw new PosError("Pedido delivery no encontrado.", 404);
      if (order.status !== "ready") throw new PosError("Marca el pedido como listo antes de buscar rider.", 409);
      const dispatch = await offerNextRiderForOrder(order.id);
      if (!dispatch.ok) throw new PosError("No se pudo iniciar la busqueda de rider.", 409);
      result = dispatch;
    } else if (input.action === "assign-rider") {
      const [order, rider] = await Promise.all([
        client.from("orders").select("id,order_type,status").eq("restaurant_id", id).eq("id", input.orderId).maybeSingle(),
        auth.admin
          .from("restaurant_riders")
          .select("id,full_name,phone,status,membership_valid_until")
          .eq("restaurant_id", id)
          .eq("id", input.riderId)
          .maybeSingle(),
      ]).then(([orderResult, riderResult]) => [checked(orderResult), checked(riderResult)] as const);
      if (!order || order.order_type !== "delivery") throw new PosError("Pedido delivery no encontrado.", 404);
      if (order.status !== "ready") throw new PosError("Marca el pedido como listo antes de asignar rider.", 409);
      if (!rider || rider.status !== "active" || rider.membership_valid_until < new Date().toISOString().slice(0, 10)) {
        throw new PosError("El rider no esta activo para esta sucursal.", 409);
      }
      const assigned = await claimRiderDeliveryOrder(auth.admin, {
        deliveryName: rider.full_name,
        deliveryPhone: rider.phone,
        deliveryToken: `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`,
        dispatchSource: "rider_manual",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        orderId: order.id,
        restaurantId: id,
        riderId: rider.id,
      });
      if (!assigned.ok) throw new PosError("No se pudo asignar el rider. Actualiza e intenta otra vez.", assigned.status);
      await auth.admin
        .from("rider_delivery_offers")
        .update({ status: "cancelled", responded_at: new Date().toISOString(), response_reason: "manual-rider-assigned" })
        .eq("order_id", order.id)
        .eq("status", "pending");
      result = { ...assigned.data, riderId: rider.id, riderName: rider.full_name };
    } else if (input.action === "cancel-order") {
      const order = checked(await client
        .from("orders")
        .select("id,table_id,order_number,order_type,status,payment_status,payment_method,payment_receipt_url,payment_receipt_reference,payment_receipt_uploaded_at,requested_fulfillment_at,accepted_at,ready_at,delivered_at,total")
        .eq("restaurant_id", id)
        .eq("id", input.orderId)
        .maybeSingle());
      if (!order) throw new PosError("Pedido no encontrado.", 404);
      if (["cancelled", "delivered"].includes(order.status)) throw new PosError("Este pedido ya no se puede anular.", 409);
      if (order.payment_status === "paid") {
        checked(await client.rpc("refund_order_atomic", { p_restaurant_id: id, p_order_id: order.id, p_reason: input.reason }));
      } else {
        const cancelled = checked(await client
          .from("orders")
          .update({ status: "cancelled", payment_status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: input.reason })
          .eq("restaurant_id", id)
          .eq("id", order.id)
          .in("status", ["pending", "accepted", "preparing", "ready"])
          .select("id")
          .maybeSingle());
        if (!cancelled) throw new PosError("El pedido cambio. Actualiza para continuar.", 409);
      }
      await createCancellationReview(auth, id, order, input.reason);
      await releaseTableWhenEmpty(auth, id, order.table_id);
      after(async () => {
        await sendOrderStatusPush({ orderId: order.id, status: "cancelled" });
      });
      result = { id: order.id };
    } else if (input.action === "settle-table") {
      const table = checked(await client.from("tables").select("id,name").eq("restaurant_id", id).eq("id", input.tableId).eq("is_active", true).maybeSingle());
      if (!table) throw new PosError("Mesa no encontrada.", 404);
      const orders = checked(await client
        .from("orders")
        .select("id,status,payment_status")
        .eq("restaurant_id", id)
        .eq("table_id", table.id)
        .in("status", ["pending", "accepted", "preparing", "ready"])
        .order("created_at")) ?? [];
      if (!orders.length) {
        checked(await auth.admin.from("tables").update({ status: "available" }).eq("restaurant_id", id).eq("id", table.id));
        result = { tableId: table.id, orders: 0 };
      } else {
        const receipt = await upload();
        for (const order of orders) {
          if (order.payment_status === "pending") {
            checked(await client.rpc("charge_order_with_cash_movement", {
              p_restaurant_id: id,
              p_order_id: order.id,
              p_payment_method: input.paymentMethod,
              p_receipt_url: receipt,
              p_receipt_reference: input.reference ?? null,
            }));
          }
          let current = checked(await client.from("orders").select("status,payment_status").eq("restaurant_id", id).eq("id", order.id).maybeSingle());
          if (!current || current.payment_status !== "paid") throw new PosError("No se pudo confirmar el pago completo de la mesa.", 409);
          if (current.status === "pending") {
            current = checked(await client
              .from("orders")
              .update({ status: "accepted", accepted_at: new Date().toISOString() })
              .eq("restaurant_id", id)
              .eq("id", order.id)
              .eq("status", "pending")
              .select("status,payment_status")
              .maybeSingle());
            if (!current) throw new PosError("El pedido cambio. Actualiza para continuar.", 409);
          }
          let status = current.status;
          if (status === "accepted") {
            checked(await client.rpc("update_operational_order_status", { p_restaurant_id: id, p_order_id: order.id, p_expected_status: "accepted", p_next_status: "ready" }));
            status = "ready";
          } else if (status === "preparing") {
            checked(await client.rpc("update_operational_order_status", { p_restaurant_id: id, p_order_id: order.id, p_expected_status: "preparing", p_next_status: "ready" }));
            status = "ready";
          }
          if (status === "ready") {
            checked(await client.rpc("update_operational_order_status", { p_restaurant_id: id, p_order_id: order.id, p_expected_status: "ready", p_next_status: "delivered" }));
          }
        }
        await releaseTableWhenEmpty(auth, id, table.id);
        checked(await client.rpc("write_admin_audit", {
          p_action: "table_settled",
          p_entity_type: "restaurant_table",
          p_entity_id: table.id,
          p_restaurant_id: id,
          p_severity: "info",
          p_metadata: { orderCount: orders.length, tableName: table.name },
        }));
        after(async () => {
          await Promise.allSettled(orders.map((order) => sendOrderStatusPush({ orderId: order.id, status: "delivered" })));
        });
        result = { tableId: table.id, orders: orders.length };
      }
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
        } else if (input.action === "accept") {
          const accepted = checked(await client
            .from("orders")
            .update({ accepted_at: new Date().toISOString(), status: "accepted" })
            .eq("restaurant_id", id)
            .eq("id", order.id)
            .eq("status", "pending")
            .select("id")
            .maybeSingle());
          if (!accepted) throw new PosError("El pedido cambio. Actualiza para continuar.", 409);
          changed = true;
          const settings = checked(await client.from("restaurant_settings").select("kitchen_enabled").eq("restaurant_id", id).maybeSingle());
          if (!businessTypeSupportsKitchen(restaurant.business_type) || settings?.kitchen_enabled === false) {
            const ready = checked(await client
              .from("orders")
              .update({ ready_at: new Date().toISOString(), status: "ready" })
              .eq("restaurant_id", id)
              .eq("id", order.id)
              .eq("status", "accepted")
              .select("id")
              .maybeSingle());
            if (ready) next = "ready";
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
