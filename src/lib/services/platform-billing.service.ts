import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { PlatformBilling, PlatformBillingAlert, RestaurantOwnerChangeRequest, OwnerChangePolicy, RestaurantStatus } from "@/types/restaurant.types";

type BillingRow = {
  id: string;
  restaurant_id: string;
  billing_anchor_date: string;
  next_due_date: string;
  reminder_days: number;
  platform_qr_url: string | null;
  platform_qr_note: string | null;
};

type BillingCycleRow = {
  id: string;
  restaurant_id: string;
  due_date: string;
  proof_url: string | null;
  proof_uploaded_at: string | null;
  proof_verified_at: string | null;
  proof_verified_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  notes: string | null;
};

type OwnerChangeRequestRow = {
  id: string;
  restaurant_id: string;
  requested_by: string;
  current_owner_name: string | null;
  current_owner_email: string | null;
  requested_owner_name: string;
  requested_owner_email: string;
  reason: string | null;
  eligible_at: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  resolution_notes: string | null;
  created_at: string;
};

function localTodayDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateValue: string, days: number) {
  const date = parseDate(dateValue);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function addMonthsClamped(dateValue: string, months: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const baseMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(baseMonthIndex / 12);
  const targetMonthIndex = ((baseMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  return formatDate(new Date(Date.UTC(targetYear, targetMonthIndex, Math.min(day, lastDay))));
}

function diffDays(fromDate: string, toDate: string) {
  return Math.round((parseDate(toDate).getTime() - parseDate(fromDate).getTime()) / 86_400_000);
}

function mapOwnerChangeRequest(row: OwnerChangeRequestRow): RestaurantOwnerChangeRequest {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    requestedBy: row.requested_by,
    currentOwnerName: row.current_owner_name ?? undefined,
    currentOwnerEmail: row.current_owner_email ?? undefined,
    requestedOwnerName: row.requested_owner_name,
    requestedOwnerEmail: row.requested_owner_email,
    reason: row.reason ?? undefined,
    eligibleAt: row.eligible_at,
    status: row.status,
    approvedAt: row.approved_at ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    rejectedAt: row.rejected_at ?? undefined,
    rejectedBy: row.rejected_by ?? undefined,
    resolutionNotes: row.resolution_notes ?? undefined,
    createdAt: row.created_at,
  };
}

function ownerCooldownDays(approvedCount: number) {
  if (approvedCount <= 0) return 0;
  if (approvedCount === 1) return 3;
  if (approvedCount === 2) return 7;
  return 30 * (approvedCount - 2);
}

async function getPlanPriceMonthly(restaurantId: string) {
  const supabase = await createClient();
  const { data: subscription } = await supabase
    .from("restaurant_subscriptions")
    .select("plan_id")
    .eq("restaurant_id", restaurantId)
    .in("status", ["trialing", "active", "past_due"])
    .maybeSingle();

  if (!subscription?.plan_id) {
    return undefined;
  }

  const { data: plan } = await supabase.from("subscription_plans").select("price_monthly").eq("id", subscription.plan_id).maybeSingle();
  return plan ? Number(plan.price_monthly) : undefined;
}

async function ensureCycleExists(restaurantId: string, dueDate: string) {
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  const { data: existing } = await admin
    .from("restaurant_platform_payment_cycles")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("due_date", dueDate)
    .maybeSingle();

  if (existing) {
    return existing as BillingCycleRow;
  }

  const { data } = await admin
    .from("restaurant_platform_payment_cycles")
    .insert({
      restaurant_id: restaurantId,
      due_date: dueDate,
    })
    .select("*")
    .single();

  return (data as BillingCycleRow | null) ?? null;
}

function mapBillingProfile(
  billing: BillingRow | null,
  cycle: BillingCycleRow | null,
  restaurantStatus: RestaurantStatus,
  planPriceMonthly?: number,
): PlatformBilling | null {
  if (!billing) {
    return null;
  }

  const today = localTodayDate();
  const daysUntilDue = diffDays(today, billing.next_due_date);
  const isPaid = Boolean(cycle?.paid_at);
  const isOverdue = daysUntilDue < 0 && !isPaid;

  return {
    id: billing.id,
    restaurantId: billing.restaurant_id,
    billingAnchorDate: billing.billing_anchor_date,
    nextDueDate: billing.next_due_date,
    reminderDays: billing.reminder_days,
    platformQrUrl: billing.platform_qr_url ?? undefined,
    platformQrNote: billing.platform_qr_note ?? undefined,
    currentCycle: cycle
      ? {
          id: cycle.id,
          restaurantId: cycle.restaurant_id,
          dueDate: cycle.due_date,
          proofUrl: cycle.proof_url ?? undefined,
          proofUploadedAt: cycle.proof_uploaded_at ?? undefined,
          proofVerifiedAt: cycle.proof_verified_at ?? undefined,
          proofVerifiedBy: cycle.proof_verified_by ?? undefined,
          paidAt: cycle.paid_at ?? undefined,
          paidBy: cycle.paid_by ?? undefined,
          notes: cycle.notes ?? undefined,
        }
      : null,
    planPriceMonthly,
    isConfigured: Boolean(billing.platform_qr_url),
    isOverdue,
    isSuspendedForBilling: restaurantStatus === "suspended" && isOverdue,
    reminderStartsAt: addDays(billing.next_due_date, -billing.reminder_days),
    daysUntilDue,
  };
}

function buildAlert(restaurantId: string, billing: PlatformBilling | null): PlatformBillingAlert | null {
  if (!billing?.isConfigured || billing.daysUntilDue === undefined) {
    return null;
  }

  const actionHref = `/admin/restaurantes/${restaurantId}/configuracion?tab=plataforma`;

  if (billing.isSuspendedForBilling) {
    return {
      showModal: true,
      tone: "danger",
      title: "Plataforma suspendida por pago pendiente",
      body: `La renovacion vencio el ${billing.nextDueDate}. Sube el comprobante y espera validacion para reactivar los modulos.`,
      actionHref,
      actionLabel: "Ir a pagos de plataforma",
      dueDate: billing.nextDueDate,
    };
  }

  if (!billing.currentCycle?.paidAt && billing.daysUntilDue <= billing.reminderDays && billing.daysUntilDue >= 0) {
    return {
      showModal: true,
      tone: "warning",
      title: "Renovacion de plataforma pendiente",
      body:
        billing.daysUntilDue === 0
          ? "Hoy vence la renovacion de la plataforma. Sube el comprobante para evitar la suspension."
          : `Faltan ${billing.daysUntilDue} dias para la renovacion de la plataforma. Te conviene subir el comprobante ahora.`,
      actionHref,
      actionLabel: "Revisar pago",
      dueDate: billing.nextDueDate,
    };
  }

  return null;
}

export const platformBillingService = {
  ownerCooldownDays,

  async enforceRestaurantStatus(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const admin = createAdminClient();
    if (!admin) {
      return null;
    }

    const { data: restaurant } = await admin.from("restaurants").select("id,status,deleted_at").eq("id", restaurantId).maybeSingle();
    if (!restaurant || restaurant.deleted_at) {
      return null;
    }

    const { data: billing } = await admin.from("restaurant_platform_billing").select("*").eq("restaurant_id", restaurantId).maybeSingle();
    if (!billing) {
      return restaurant.status as RestaurantStatus;
    }

    const cycle = await ensureCycleExists(restaurantId, billing.next_due_date);
    const snapshot = mapBillingProfile(billing as BillingRow, cycle, restaurant.status as RestaurantStatus);
    if (!snapshot) {
      return restaurant.status as RestaurantStatus;
    }

    if (snapshot.isOverdue && restaurant.status !== "suspended") {
      await admin.from("restaurants").update({ status: "suspended" }).eq("id", restaurantId);
      await admin.from("restaurant_subscriptions").update({ status: "past_due" }).eq("restaurant_id", restaurantId).in("status", ["trialing", "active"]);
      return "suspended";
    }

    return restaurant.status as RestaurantStatus;
  },

  async getBillingSnapshot(restaurantId: string, restaurantStatus: RestaurantStatus) {
    if (!hasSupabaseEnv()) {
      return { alert: null, billing: null };
    }

    const supabase = await createClient();
    const { data: billingRow } = await supabase.from("restaurant_platform_billing").select("*").eq("restaurant_id", restaurantId).maybeSingle();
    const cycleRow = billingRow ? await ensureCycleExists(restaurantId, billingRow.next_due_date) : null;
    const planPriceMonthly = await getPlanPriceMonthly(restaurantId);
    const billing = mapBillingProfile(billingRow as BillingRow | null, cycleRow, restaurantStatus, planPriceMonthly);

    return {
      billing,
      alert: buildAlert(restaurantId, billing),
    };
  },

  async listOwnerChangeRequests(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("restaurant_owner_change_requests")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false });

    if (error || !data) {
      return [];
    }

    return (data as OwnerChangeRequestRow[]).map(mapOwnerChangeRequest);
  },

  async getOwnerChangePolicy(restaurantId: string): Promise<OwnerChangePolicy> {
    const requests = await this.listOwnerChangeRequests(restaurantId);
    const approvedRequests = requests.filter((request) => request.status === "approved" && request.approvedAt);
    const approvedCount = approvedRequests.length;
    const cooldownDays = ownerCooldownDays(approvedCount);
    const lastApprovedAt = approvedRequests[0]?.approvedAt;
    const pendingRequest = requests.find((request) => request.status === "pending");

    if (!lastApprovedAt || cooldownDays === 0) {
      return {
        approvedCount,
        cooldownDays,
        canRequestNow: !pendingRequest,
      };
    }

    const nextAllowedAt = new Date(lastApprovedAt);
    nextAllowedAt.setUTCDate(nextAllowedAt.getUTCDate() + cooldownDays);

    return {
      approvedCount,
      cooldownDays,
      nextAllowedAt: nextAllowedAt.toISOString(),
      canRequestNow: !pendingRequest && Date.now() >= nextAllowedAt.getTime(),
    };
  },

  addMonthsClamped,
};
