import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { CashMovement, CashSession } from "@/types/cash.types";
import type { PaymentMethodType } from "@/types/order.types";

type CashSessionRow = {
  id: string;
  restaurant_id: string;
  opened_by: string | null;
  closed_by: string | null;
  status: CashSession["status"];
  opening_amount: number;
  expected_amount: number;
  counted_amount: number | null;
  difference_amount: number | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
};

type CashMovementRow = {
  id: string;
  restaurant_id: string;
  cash_session_id: string | null;
  order_id: string | null;
  type: CashMovement["type"];
  payment_method: PaymentMethodType;
  amount: number;
  description: string | null;
  created_by: string | null;
  created_at: string;
};

type PaidOrderRow = {
  id: string;
  payment_method: PaymentMethodType;
  total: number;
  created_at: string;
};

function mapSession(row: CashSessionRow): CashSession {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    openedBy: row.opened_by ?? "",
    closedBy: row.closed_by ?? undefined,
    status: row.status,
    openingAmount: Number(row.opening_amount),
    expectedAmount: Number(row.expected_amount),
    countedAmount: row.counted_amount === null ? undefined : Number(row.counted_amount),
    differenceAmount: row.difference_amount === null ? undefined : Number(row.difference_amount),
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function mapMovement(row: CashMovementRow): CashMovement {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    cashSessionId: row.cash_session_id ?? "",
    orderId: row.order_id ?? undefined,
    type: row.type,
    paymentMethod: row.payment_method,
    amount: Number(row.amount),
    description: row.description ?? "",
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
  };
}

function startOfTodayIso() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString();
}

export const cashService = {
  async getOpenSession(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cash_sessions")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapSession(data);
  },

  async listMovements(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cash_movements")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error || !data?.length) {
      return [];
    }

    return data.map(mapMovement);
  },

  async getSummary(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return {
        session: null,
        salesTotal: 0,
        cashTotal: 0,
        qrTotal: 0,
        transferTotal: 0,
        orderCount: 0,
        averageTicket: 0,
        expenses: 0,
        netTotal: 0,
      };
    }

    const supabase = await createClient();
    const session = await this.getOpenSession(restaurantId);
    const fromDate = session?.openedAt ?? startOfTodayIso();
    const [{ data: orders }, { data: movements }] = await Promise.all([
      supabase
        .from("orders")
        .select("id,payment_method,total,created_at")
        .eq("restaurant_id", restaurantId)
        .eq("payment_status", "paid")
        .gte("created_at", fromDate),
      supabase
        .from("cash_movements")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", fromDate),
    ]);

    const paidOrders = (orders ?? []) as PaidOrderRow[];
    const cashMovements = ((movements ?? []) as CashMovementRow[]).map(mapMovement);
    const salesTotal = paidOrders.reduce((sum, order) => sum + Number(order.total), 0);
    const cashTotal = paidOrders.filter((order) => order.payment_method === "cash").reduce((sum, order) => sum + Number(order.total), 0);
    const qrTotal = paidOrders.filter((order) => order.payment_method === "qr").reduce((sum, order) => sum + Number(order.total), 0);
    const transferTotal = paidOrders.filter((order) => order.payment_method === "bank_transfer").reduce((sum, order) => sum + Number(order.total), 0);
    const expenses = cashMovements.filter((movement) => movement.type === "expense").reduce((sum, movement) => sum + movement.amount, 0);

    return {
      session,
      salesTotal,
      cashTotal,
      qrTotal,
      transferTotal,
      orderCount: paidOrders.length,
      averageTicket: paidOrders.length ? salesTotal / paidOrders.length : 0,
      expenses,
      netTotal: salesTotal - expenses,
    };
  },
};
