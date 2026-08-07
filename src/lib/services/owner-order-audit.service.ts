import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { Json } from "@/types/database.types";
import type { UserRestaurantMembership } from "@/lib/services/membership.service";

type SnapshotItem = {
  product_name?: string;
  quantity?: number;
  unit_price?: number;
  subtotal?: number;
  notes?: string | null;
};

export type OwnerCancellationReview = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  orderId: string;
  orderNumber: string;
  orderType: string;
  orderStatusAtCancellation: string;
  paymentStatusAtCancellation: string;
  paymentMethod?: string;
  total: number;
  cancellationKind: "rejected" | "cancelled" | "deleted";
  reason: string;
  cancelledByName?: string;
  cancelledByEmail?: string;
  cancelledAt: string;
  requestedFulfillmentAt?: string;
  acceptedAt?: string;
  readyAt?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  cashSessionId?: string;
  cashMovementId?: string;
  paymentReceiptUrl?: string;
  paymentReceiptReference?: string;
  ownerReviewStatus: "pending" | "approved" | "observed";
  ownerReviewNotes?: string;
  ownerReviewedAt?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  notes?: string;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    notes?: string;
  }[];
};

function localDateInLaPaz(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(date);
}

function businessDayUtcRange(date: string) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDateInLaPaz();
  const [year, month, day] = safeDate.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, 4, 0, 0, 0));
  return { safeDate, start: start.toISOString(), end: end.toISOString() };
}

function recordFromJson(value: Json | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Json | undefined> : {};
}

function stringFromJson(value: Json | undefined) {
  return typeof value === "string" ? value : undefined;
}

function mapSnapshotItems(value: Json | undefined): OwnerCancellationReview["items"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const row = item as SnapshotItem;
    return {
      name: row.product_name ?? "Producto",
      quantity: Number(row.quantity ?? 0),
      unitPrice: Number(row.unit_price ?? 0),
      subtotal: Number(row.subtotal ?? 0),
      notes: row.notes ?? undefined,
    };
  });
}

export const ownerOrderAuditService = {
  todayDate() {
    return localDateInLaPaz();
  },

  async listCancellationReviews(
    ownerMemberships: UserRestaurantMembership[],
    filters: { date?: string; restaurantId?: string } = {},
  ): Promise<{ date: string; reviews: OwnerCancellationReview[] }> {
    if (!hasSupabaseEnv()) {
      return { date: filters.date ?? localDateInLaPaz(), reviews: [] };
    }

    const ownedRestaurants = new Map(ownerMemberships.map((membership) => [membership.restaurant.id, membership.restaurant.name]));
    const restaurantIds = Array.from(ownedRestaurants.keys());
    const selectedRestaurantId = filters.restaurantId && ownedRestaurants.has(filters.restaurantId) ? filters.restaurantId : undefined;
    const targetRestaurantIds = selectedRestaurantId ? [selectedRestaurantId] : restaurantIds;

    if (!targetRestaurantIds.length) {
      return { date: filters.date ?? localDateInLaPaz(), reviews: [] };
    }

    const { safeDate, start, end } = businessDayUtcRange(filters.date ?? localDateInLaPaz());
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("order_cancellation_reviews")
      .select("*")
      .in("restaurant_id", targetRestaurantIds)
      .gte("cancelled_at", start)
      .lt("cancelled_at", end)
      .order("cancelled_at", { ascending: false });

    if (error || !data?.length) {
      return { date: safeDate, reviews: [] };
    }

    return {
      date: safeDate,
      reviews: data.map((review) => {
        const snapshot = recordFromJson(review.snapshot);
        const order = recordFromJson(snapshot.order);
        return {
          id: review.id,
          restaurantId: review.restaurant_id,
          restaurantName: ownedRestaurants.get(review.restaurant_id) ?? "Sucursal",
          orderId: review.order_id,
          orderNumber: review.order_number,
          orderType: review.order_type,
          orderStatusAtCancellation: review.order_status_at_cancellation,
          paymentStatusAtCancellation: review.payment_status_at_cancellation,
          paymentMethod: review.payment_method ?? undefined,
          total: Number(review.total ?? 0),
          cancellationKind: review.cancellation_kind,
          reason: review.reason,
          cancelledByName: review.cancelled_by_name ?? undefined,
          cancelledByEmail: review.cancelled_by_email ?? undefined,
          cancelledAt: review.cancelled_at,
          requestedFulfillmentAt: review.requested_fulfillment_at ?? undefined,
          acceptedAt: review.accepted_at ?? undefined,
          readyAt: review.ready_at ?? undefined,
          dispatchedAt: review.dispatched_at ?? undefined,
          deliveredAt: review.delivered_at ?? undefined,
          cashSessionId: review.cash_session_id ?? undefined,
          cashMovementId: review.cash_movement_id ?? undefined,
          paymentReceiptUrl: review.payment_receipt_url ?? undefined,
          paymentReceiptReference: review.payment_receipt_reference ?? undefined,
          ownerReviewStatus: review.owner_review_status,
          ownerReviewNotes: review.owner_review_notes ?? undefined,
          ownerReviewedAt: review.owner_reviewed_at ?? undefined,
          customerName: stringFromJson(order.customer_name),
          customerPhone: stringFromJson(order.customer_phone),
          customerAddress: stringFromJson(order.customer_address),
          notes: stringFromJson(order.notes),
          items: mapSnapshotItems(snapshot.items),
        };
      }),
    };
  },
};
