import { createHash, randomBytes } from "crypto";
import { buildOrderTicketHtml, type PrintFormat } from "@/components/orders/printOrder";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Order } from "@/types/order.types";
import type { RestaurantPrintConnector } from "@/types/restaurant.types";

type PrintConnectorRow = {
  id: string;
  restaurant_id: string;
  token: string;
  linked_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function mapPrintConnector(row: PrintConnectorRow): RestaurantPrintConnector {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    token: row.token,
    status: row.linked_at ? "linked" : "token_active",
    createdAt: row.created_at,
    linkedAt: row.linked_at ?? undefined,
    lastSeenAt: row.last_seen_at ?? undefined,
  };
}

function generateConnectorToken() {
  return `ypw_${randomBytes(32).toString("base64url")}`;
}

function realtimeTopicForToken(token: string) {
  return `print:${createHash("sha256").update(token).digest("hex")}`;
}

function realtimeConfiguration(token: string) {
  return {
    realtimeUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    realtimeKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    realtimeTopic: realtimeTopicForToken(token),
  };
}

async function findConnectorByToken(token: string) {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("service-role-required");
  }

  const { data, error } = await admin
    .from("restaurant_print_connectors")
    .select("restaurant_id,linked_at")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.code);
  }

  return { admin, connector: data };
}

export const printConnectorService = {
  async getActiveForRestaurant(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("restaurant_print_connectors")
      .select("id,restaurant_id,token,linked_at,last_seen_at,revoked_at,created_at")
      .eq("restaurant_id", restaurantId)
      .is("revoked_at", null)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapPrintConnector(data);
  },

  async generateForRestaurant(restaurantId: string, userId: string) {
    const admin = createAdminClient();
    if (!admin) {
      throw new Error("service-role-required");
    }

    const { data, error } = await admin
      .from("restaurant_print_connectors")
      .upsert(
        {
          restaurant_id: restaurantId,
          token: generateConnectorToken(),
          linked_at: null,
          last_seen_at: null,
          revoked_at: null,
          revoked_by: null,
          created_by: userId,
        },
        { onConflict: "restaurant_id" },
      )
      .select("id,restaurant_id,token,linked_at,last_seen_at,revoked_at,created_at")
      .single();

    if (error || !data) {
      throw new Error(error?.code ?? "print-token-generate-failed");
    }

    return mapPrintConnector(data);
  },

  async revokeForRestaurant(restaurantId: string, userId: string) {
    const admin = createAdminClient();
    if (!admin) {
      throw new Error("service-role-required");
    }

    const { error } = await admin
      .from("restaurant_print_connectors")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: userId,
      })
      .eq("restaurant_id", restaurantId)
      .is("revoked_at", null);

    if (error) {
      throw new Error(error.code);
    }
  },

  async getBootstrapByToken(token: string) {
    const { admin, connector } = await findConnectorByToken(token);
    if (!connector) {
      return null;
    }

    const [{ data: restaurant, error: restaurantError }, { data: settings, error: settingsError }] = await Promise.all([
      admin
        .from("restaurants")
        .select("id,slug,name")
        .eq("id", connector.restaurant_id)
        .is("deleted_at", null)
        .maybeSingle(),
      admin
        .from("restaurant_settings")
        .select("print_format,auto_print_kitchen,print_logo")
        .eq("restaurant_id", connector.restaurant_id)
        .maybeSingle(),
    ]);

    if (restaurantError || settingsError || !restaurant) {
      return null;
    }

    const now = new Date().toISOString();
    await admin
      .from("restaurant_print_connectors")
      .update({
        linked_at: connector.linked_at ?? now,
        last_seen_at: now,
      })
      .eq("restaurant_id", connector.restaurant_id)
      .eq("token", token)
      .is("revoked_at", null);

    return {
      restaurantId: restaurant.id,
      restaurantSlug: restaurant.slug,
      restaurantName: restaurant.name,
      printFormat: settings?.print_format ?? "thermal_80",
      autoPrintKitchen: settings?.auto_print_kitchen ?? false,
      printLogo: settings?.print_logo ?? true,
      ...realtimeConfiguration(token),
    };
  },

  async getNextJobByToken(token: string) {
    const { admin, connector } = await findConnectorByToken(token);
    if (!connector) {
      return { authorized: false as const, job: null };
    }

    const [{ data: restaurant, error: restaurantError }, { data: settings, error: settingsError }, { data: order, error: orderError }] = await Promise.all([
      admin
        .from("restaurants")
        .select("name,logo_url")
        .eq("id", connector.restaurant_id)
        .is("deleted_at", null)
        .maybeSingle(),
      admin
        .from("restaurant_settings")
        .select("print_format,print_logo")
        .eq("restaurant_id", connector.restaurant_id)
        .maybeSingle(),
      admin
        .from("orders")
        .select(
          "id,restaurant_id,table_id,order_number,customer_name,customer_phone,customer_email,customer_address,delivery_address_detail,delivery_latitude,delivery_longitude,delivery_maps_url,delivery_distance_km,requires_prepayment,requested_fulfillment_at,order_type,order_origin,status,payment_status,payment_method,payment_receipt_url,payment_receipt_uploaded_at,payment_receipt_reference,payment_verified_at,subtotal,delivery_fee,discount_total,total,notes,created_at,accepted_at,preparing_at,ready_at,delivered_at,cancelled_at,cancellation_reason,print_requested_at,printed_at",
        )
        .eq("restaurant_id", connector.restaurant_id)
        .not("print_requested_at", "is", null)
        .is("printed_at", null)
        .neq("status", "cancelled")
        .order("print_requested_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (restaurantError || settingsError || orderError) {
      throw new Error(restaurantError?.code ?? settingsError?.code ?? orderError?.code ?? "print-job-query-failed");
    }

    if (!restaurant || !order) {
      return { authorized: true as const, job: null };
    }

    const { data: itemRows, error: itemsError } = await admin
      .from("order_items")
      .select("id,order_id,product_id,product_name,unit_price,quantity,subtotal,prep_minutes,notes")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });

    if (itemsError) {
      throw new Error(itemsError.code);
    }

    const items: Order["items"] = (itemRows ?? []).map((item) => ({
      id: item.id,
      orderId: item.order_id,
      productId: item.product_id ?? "",
      productName: item.product_name,
      unitPrice: Number(item.unit_price),
      quantity: item.quantity,
      subtotal: Number(item.subtotal),
      prepMinutes: item.prep_minutes == null ? undefined : Number(item.prep_minutes),
      notes: item.notes ?? undefined,
    }));
    const mappedOrder: Order = {
      id: order.id,
      restaurantId: order.restaurant_id,
      tableId: order.table_id ?? undefined,
      orderNumber: order.order_number,
      customerName: order.customer_name ?? "",
      customerPhone: order.customer_phone ?? "",
      customerEmail: order.customer_email ?? undefined,
      customerAddress: order.customer_address ?? undefined,
      deliveryAddressDetail: order.delivery_address_detail ?? undefined,
      deliveryLatitude: order.delivery_latitude == null ? undefined : Number(order.delivery_latitude),
      deliveryLongitude: order.delivery_longitude == null ? undefined : Number(order.delivery_longitude),
      deliveryMapsUrl: order.delivery_maps_url ?? undefined,
      deliveryDistanceKm: order.delivery_distance_km == null ? undefined : Number(order.delivery_distance_km),
      requiresPrepayment: order.requires_prepayment,
      requestedFulfillmentAt: order.requested_fulfillment_at ?? undefined,
      orderType: order.order_type,
      orderOrigin: order.order_origin,
      status: order.status,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      paymentReceiptUrl: order.payment_receipt_url ?? undefined,
      paymentReceiptUploadedAt: order.payment_receipt_uploaded_at ?? undefined,
      paymentReceiptReference: order.payment_receipt_reference ?? undefined,
      paymentVerifiedAt: order.payment_verified_at ?? undefined,
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.delivery_fee),
      discountTotal: Number(order.discount_total),
      total: Number(order.total),
      notes: order.notes ?? undefined,
      createdAt: order.created_at,
      acceptedAt: order.accepted_at ?? undefined,
      preparingAt: order.preparing_at ?? undefined,
      readyAt: order.ready_at ?? undefined,
      deliveredAt: order.delivered_at ?? undefined,
      cancelledAt: order.cancelled_at ?? undefined,
      cancellationReason: order.cancellation_reason ?? undefined,
      printedAt: order.printed_at ?? undefined,
      items,
    };
    const format = (settings?.print_format ?? "thermal_80") as PrintFormat;

    return {
      authorized: true as const,
      job: {
        id: order.id,
        orderNumber: order.order_number,
        requestedAt: order.print_requested_at,
        html: buildOrderTicketHtml({
          order: mappedOrder,
          restaurantName: restaurant.name,
          restaurantLogoUrl: restaurant.logo_url ?? undefined,
          format,
          printLogo: settings?.print_logo ?? true,
        }),
      },
    };
  },

  async completeJobByToken(token: string, orderId: string) {
    const { admin, connector } = await findConnectorByToken(token);
    if (!connector) {
      return { authorized: false as const, completed: false };
    }

    const { data, error } = await admin
      .from("orders")
      .update({ printed_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("restaurant_id", connector.restaurant_id)
      .not("print_requested_at", "is", null)
      .is("printed_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.code);
    }

    if (data) {
      return { authorized: true as const, completed: true };
    }

    const { data: existingOrder, error: existingOrderError } = await admin
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .eq("restaurant_id", connector.restaurant_id)
      .not("printed_at", "is", null)
      .maybeSingle();

    if (existingOrderError) {
      throw new Error(existingOrderError.code);
    }

    return { authorized: true as const, completed: Boolean(existingOrder) };
  },

  async touchByToken(token: string) {
    const admin = createAdminClient();
    if (!admin) {
      throw new Error("service-role-required");
    }

    const { data, error } = await admin
      .from("restaurant_print_connectors")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("token", token)
      .is("revoked_at", null)
      .select("restaurant_id")
      .maybeSingle();

    if (error) {
      throw new Error(error.code);
    }

    return Boolean(data);
  },
};
