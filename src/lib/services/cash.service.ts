import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { CashMovement, CashSession, CashSessionReport, CashSummary } from "@/types/cash.types";
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

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type ProfileMap = Map<string, ProfileRow>;

function mapSession(row: CashSessionRow, profiles?: ProfileMap): CashSession {
  const openedByProfile = row.opened_by ? profiles?.get(row.opened_by) : undefined;
  const closedByProfile = row.closed_by ? profiles?.get(row.closed_by) : undefined;

  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    openedBy: row.opened_by ?? "",
    openedByName: openedByProfile?.full_name ?? openedByProfile?.email ?? undefined,
    openedByEmail: openedByProfile?.email ?? undefined,
    closedBy: row.closed_by ?? undefined,
    closedByName: closedByProfile?.full_name ?? closedByProfile?.email ?? undefined,
    closedByEmail: closedByProfile?.email ?? undefined,
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

function emptySummary(session: CashSession | null = null): CashSummary {
  return {
    session,
    salesTotal: 0,
    cashTotal: 0,
    qrTotal: 0,
    transferTotal: 0,
    cardTotal: 0,
    otherTotal: 0,
    digitalTotal: 0,
    orderCount: 0,
    averageTicket: 0,
    expenses: 0,
    cashExpenses: 0,
    nonCashExpenses: 0,
    incomeTotal: 0,
    adjustmentTotal: 0,
    expectedCash: session?.openingAmount ?? 0,
    netTotal: 0,
  };
}

function buildReport(session: CashSession, movements: CashMovement[]): CashSessionReport {
  const saleMovements = movements.filter((movement) => movement.type === "sale");
  const expenseMovements = movements.filter((movement) => movement.type === "expense");
  const incomeMovements = movements.filter((movement) => movement.type === "income");
  const adjustmentMovements = movements.filter((movement) => movement.type === "adjustment");
  const salesTotal = saleMovements.reduce((sum, movement) => sum + movement.amount, 0);
  const cashTotal = saleMovements.filter((movement) => movement.paymentMethod === "cash").reduce((sum, movement) => sum + movement.amount, 0);
  const qrTotal = saleMovements.filter((movement) => movement.paymentMethod === "qr").reduce((sum, movement) => sum + movement.amount, 0);
  const transferTotal = saleMovements.filter((movement) => movement.paymentMethod === "bank_transfer").reduce((sum, movement) => sum + movement.amount, 0);
  const cardTotal = saleMovements.filter((movement) => movement.paymentMethod === "card").reduce((sum, movement) => sum + movement.amount, 0);
  const otherTotal = saleMovements.filter((movement) => movement.paymentMethod === "other").reduce((sum, movement) => sum + movement.amount, 0);
  const expenses = expenseMovements.reduce((sum, movement) => sum + movement.amount, 0);
  const cashExpenses = expenseMovements.filter((movement) => movement.paymentMethod === "cash").reduce((sum, movement) => sum + movement.amount, 0);
  const nonCashExpenses = expenses - cashExpenses;
  const incomeTotal = incomeMovements.reduce((sum, movement) => sum + movement.amount, 0);
  const adjustmentTotal = adjustmentMovements.reduce((sum, movement) => sum + movement.amount, 0);
  const cashIncome = incomeMovements.filter((movement) => movement.paymentMethod === "cash").reduce((sum, movement) => sum + movement.amount, 0);
  const cashAdjustments = adjustmentMovements.filter((movement) => movement.paymentMethod === "cash").reduce((sum, movement) => sum + movement.amount, 0);
  const expectedCash = session.status === "closed" ? session.expectedAmount : session.openingAmount + cashTotal + cashIncome + cashAdjustments - cashExpenses;
  const netTotal = salesTotal + incomeTotal + adjustmentTotal - expenses;

  return {
    session,
    movements,
    salesTotal,
    cashTotal,
    qrTotal,
    transferTotal,
    cardTotal,
    otherTotal,
    digitalTotal: qrTotal + transferTotal + cardTotal + otherTotal,
    expenses,
    cashExpenses,
    nonCashExpenses,
    incomeTotal,
    adjustmentTotal,
    expectedCash,
    netTotal,
    orderCount: saleMovements.length,
    averageTicket: saleMovements.length ? salesTotal / saleMovements.length : 0,
  };
}

async function getProfiles(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) {
    return new Map<string, ProfileRow>();
  }

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id,full_name,email").in("id", uniqueIds);
  return new Map((data ?? []).map((profile) => [profile.id, profile as ProfileRow]));
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

    const profiles = await getProfiles([data.opened_by, data.closed_by].filter(Boolean) as string[]);
    return mapSession(data, profiles);
  },

  async listMovements(restaurantId: string, cashSessionId?: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const session = cashSessionId ? null : await this.getOpenSession(restaurantId);
    let query = supabase
      .from("cash_movements")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(80);

    if (cashSessionId || session?.id) {
      query = query.eq("cash_session_id", cashSessionId ?? session?.id ?? "");
    } else {
      query = query.gte("created_at", startOfTodayIso());
    }

    const { data, error } = await query;

    if (error || !data?.length) {
      return [];
    }

    return data.map(mapMovement);
  },

  async getSummary(restaurantId: string): Promise<CashSummary> {
    if (!hasSupabaseEnv()) {
      return emptySummary();
    }

    const supabase = await createClient();
    const session = await this.getOpenSession(restaurantId);
    if (!session) {
      return emptySummary();
    }

    const { data: movements } = await supabase.from("cash_movements").select("*").eq("restaurant_id", restaurantId).eq("cash_session_id", session.id);
    const report = buildReport(session, ((movements ?? []) as CashMovementRow[]).map(mapMovement));

    return {
      session,
      salesTotal: report.salesTotal,
      cashTotal: report.cashTotal,
      qrTotal: report.qrTotal,
      transferTotal: report.transferTotal,
      cardTotal: report.cardTotal,
      otherTotal: report.otherTotal,
      digitalTotal: report.digitalTotal,
      orderCount: report.orderCount,
      averageTicket: report.averageTicket,
      expenses: report.expenses,
      cashExpenses: report.cashExpenses,
      nonCashExpenses: report.nonCashExpenses,
      incomeTotal: report.incomeTotal,
      adjustmentTotal: report.adjustmentTotal,
      expectedCash: report.expectedCash,
      netTotal: report.netTotal,
    };
  },

  async listSessionReports(restaurantId: string, limit = 8): Promise<CashSessionReport[]> {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data: sessions, error } = await supabase
      .from("cash_sessions")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("opened_at", { ascending: false })
      .limit(limit);

    if (error || !sessions?.length) {
      return [];
    }

    const sessionRows = sessions as CashSessionRow[];
    const sessionIds = sessionRows.map((session) => session.id);
    const profileIds = sessionRows.flatMap((session) => [session.opened_by, session.closed_by]).filter(Boolean) as string[];
    const [{ data: movements }, profiles] = await Promise.all([
      supabase.from("cash_movements").select("*").eq("restaurant_id", restaurantId).in("cash_session_id", sessionIds).order("created_at", { ascending: false }),
      getProfiles(profileIds),
    ]);
    const movementsBySession = new Map<string, CashMovement[]>();

    for (const movement of ((movements ?? []) as CashMovementRow[]).map(mapMovement)) {
      const list = movementsBySession.get(movement.cashSessionId) ?? [];
      list.push(movement);
      movementsBySession.set(movement.cashSessionId, list);
    }

    return sessionRows.map((sessionRow) => {
      const session = mapSession(sessionRow, profiles);
      return buildReport(session, movementsBySession.get(session.id) ?? []);
    });
  },
};
