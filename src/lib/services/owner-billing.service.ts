import { additionalLocationPriceMonthly, fullPlanName, primaryLocationPriceMonthly } from "@/lib/billing/full-plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { RestaurantStatus } from "@/types/restaurant.types";

const defaultBillingAnchorDay = 15;
const defaultReminderDays = 4;
const defaultCurrency = "BOB";

type OwnerBillingSettingsRow = {
  owner_user_id: string;
  billing_anchor_day: number;
  next_due_date: string;
  reminder_days: number;
  currency: string;
  platform_qr_url: string | null;
  platform_qr_note: string | null;
  created_at: string;
  updated_at: string;
};

type OwnerBillingCycleRow = {
  id: string;
  owner_user_id: string;
  due_date: string;
  period_key: string;
  branch_count: number;
  primary_price_monthly: number;
  additional_price_monthly: number;
  amount_due: number;
  currency: string;
  status: OwnerBillingCycleStatus;
  proof_url: string | null;
  proof_uploaded_at: string | null;
  proof_verified_at: string | null;
  proof_verified_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  notes: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
};

type OwnerRestaurantRow = {
  id: string;
  name: string;
  slug: string;
  status: RestaurantStatus;
  deleted_at: string | null;
  created_at: string;
};

export type OwnerBillingCycleStatus = "pending" | "proof_uploaded" | "verified" | "paid" | "overdue" | "cancelled";

export type OwnerBillingSettings = {
  ownerUserId: string;
  billingAnchorDay: number;
  nextDueDate: string;
  reminderDays: number;
  currency: string;
  platformQrUrl?: string;
  platformQrNote?: string;
  createdAt: string;
  updatedAt: string;
};

export type OwnerBillingCycle = {
  id: string;
  ownerUserId: string;
  dueDate: string;
  periodKey: string;
  branchCount: number;
  primaryPriceMonthly: number;
  additionalPriceMonthly: number;
  amountDue: number;
  currency: string;
  status: OwnerBillingCycleStatus;
  proofUrl?: string;
  proofUploadedAt?: string;
  proofVerifiedAt?: string;
  proofVerifiedBy?: string;
  paidAt?: string;
  paidBy?: string;
  notes?: string;
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
};

export type OwnerBillingSnapshot = {
  settings: OwnerBillingSettings;
  currentCycle: OwnerBillingCycle;
  recentCycles: OwnerBillingCycle[];
  branchCount: number;
  planName: string;
  primaryPriceMonthly: number;
  additionalPriceMonthly: number;
  monthlyTotal: number;
  isConfigured: boolean;
  isPaid: boolean;
  isOverdue: boolean;
  isSuspendedForBilling: boolean;
  daysUntilDue: number;
  reminderStartsAt: string;
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

function diffDays(fromDate: string, toDate: string) {
  return Math.round((parseDate(toDate).getTime() - parseDate(fromDate).getTime()) / 86_400_000);
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

function defaultNextDueDate(anchorDay = defaultBillingAnchorDay) {
  const today = parseDate(localTodayDate());
  const currentMonthDue = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), anchorDay));
  if (today.getTime() <= currentMonthDue.getTime()) {
    return formatDate(currentMonthDue);
  }

  return formatDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, anchorDay)));
}

function periodKeyForDueDate(dueDate: string) {
  return dueDate.slice(0, 7);
}

function calculateMonthlyTotal(branchCount: number, primaryPrice: number, additionalPrice: number) {
  return branchCount > 0 ? primaryPrice + Math.max(0, branchCount - 1) * additionalPrice : 0;
}

function mapSettings(row: OwnerBillingSettingsRow): OwnerBillingSettings {
  return {
    ownerUserId: row.owner_user_id,
    billingAnchorDay: row.billing_anchor_day,
    nextDueDate: row.next_due_date,
    reminderDays: row.reminder_days,
    currency: row.currency,
    platformQrUrl: row.platform_qr_url ?? undefined,
    platformQrNote: row.platform_qr_note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCycle(row: OwnerBillingCycleRow): OwnerBillingCycle {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    dueDate: row.due_date,
    periodKey: row.period_key,
    branchCount: Number(row.branch_count ?? 0),
    primaryPriceMonthly: Number(row.primary_price_monthly ?? primaryLocationPriceMonthly),
    additionalPriceMonthly: Number(row.additional_price_monthly ?? additionalLocationPriceMonthly),
    amountDue: Number(row.amount_due ?? 0),
    currency: row.currency ?? defaultCurrency,
    status: row.status,
    proofUrl: row.proof_url ?? undefined,
    proofUploadedAt: row.proof_uploaded_at ?? undefined,
    proofVerifiedAt: row.proof_verified_at ?? undefined,
    proofVerifiedBy: row.proof_verified_by ?? undefined,
    paidAt: row.paid_at ?? undefined,
    paidBy: row.paid_by ?? undefined,
    notes: row.notes ?? undefined,
    resolutionNotes: row.resolution_notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getFullPlanPricing() {
  const supabase = await createClient();
  const { data: plans } = await supabase
    .from("subscription_plans")
    .select("name,price_monthly,additional_restaurant_price_monthly")
    .eq("key", "premium")
    .eq("is_active", true)
    .limit(1);

  type PlanRow = {
    name?: string | null;
    price_monthly?: number | string | null;
    additional_restaurant_price_monthly?: number | string | null;
  };
  const fullPlan = (((plans ?? []) as unknown) as PlanRow[])[0];

  return {
    planName: fullPlan?.name ?? fullPlanName,
    primaryPriceMonthly: Number(fullPlan?.price_monthly ?? primaryLocationPriceMonthly),
    additionalPriceMonthly: Number(fullPlan?.additional_restaurant_price_monthly ?? additionalLocationPriceMonthly),
  };
}

async function listOwnerRestaurants(ownerUserId: string) {
  const admin = createAdminClient();
  const supabase = await createClient();
  const accessClient = admin ?? supabase;
  const { data, error } = await accessClient
    .from("restaurants")
    .select("id,name,slug,status,deleted_at,created_at")
    .eq("owner_user_id", ownerUserId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`owner-billing-restaurants:${error.code}`);
  }

  return ((data ?? []) as unknown) as OwnerRestaurantRow[];
}

async function ensureSettings(ownerUserId: string, createdBy?: string) {
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  const { data: existing } = await admin
    .from("owner_platform_billing_settings")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (existing) {
    return existing as OwnerBillingSettingsRow;
  }

  const { data, error } = await admin
    .from("owner_platform_billing_settings")
    .insert({
      owner_user_id: ownerUserId,
      billing_anchor_day: defaultBillingAnchorDay,
      next_due_date: defaultNextDueDate(),
      reminder_days: defaultReminderDays,
      currency: defaultCurrency,
      created_by: createdBy ?? null,
      updated_by: createdBy ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`owner-billing-settings:${error.code}`);
  }

  return data as OwnerBillingSettingsRow;
}

async function ensureCycle({
  additionalPriceMonthly,
  branchCount,
  currency,
  dueDate,
  ownerUserId,
  primaryPriceMonthly,
}: {
  additionalPriceMonthly: number;
  branchCount: number;
  currency: string;
  dueDate: string;
  ownerUserId: string;
  primaryPriceMonthly: number;
}) {
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  const amountDue = calculateMonthlyTotal(branchCount, primaryPriceMonthly, additionalPriceMonthly);
  const { data: existing } = await admin
    .from("owner_platform_payment_cycles")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .eq("due_date", dueDate)
    .maybeSingle();

  if (existing) {
    if (!existing.paid_at) {
      const { data, error } = await admin
        .from("owner_platform_payment_cycles")
        .update({
          additional_price_monthly: additionalPriceMonthly,
          amount_due: amountDue,
          branch_count: branchCount,
          currency,
          primary_price_monthly: primaryPriceMonthly,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) {
        throw new Error(`owner-billing-cycle-update:${error.code}`);
      }

      return data as OwnerBillingCycleRow;
    }

    return existing as OwnerBillingCycleRow;
  }

  const { data, error } = await admin
    .from("owner_platform_payment_cycles")
    .insert({
      owner_user_id: ownerUserId,
      due_date: dueDate,
      period_key: periodKeyForDueDate(dueDate),
      branch_count: branchCount,
      primary_price_monthly: primaryPriceMonthly,
      additional_price_monthly: additionalPriceMonthly,
      amount_due: amountDue,
      currency,
      status: amountDue > 0 ? "pending" : "paid",
      paid_at: amountDue > 0 ? null : new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`owner-billing-cycle:${error.code}`);
  }

  return data as OwnerBillingCycleRow;
}

async function listCycles(ownerUserId: string, limit = 12) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const accessClient = admin ?? supabase;
  const { data, error } = await accessClient
    .from("owner_platform_payment_cycles")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .order("due_date", { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return (((data ?? []) as unknown) as OwnerBillingCycleRow[]).map(mapCycle);
}

async function suspendOwnerRestaurantsForBilling(ownerUserId: string, restaurantIds: string[]) {
  const admin = createAdminClient();
  if (!admin || !restaurantIds.length) {
    return;
  }

  const now = new Date().toISOString();
  await admin
    .from("restaurants")
    .update({
      status: "suspended",
      deactivated_at: now,
      deactivated_by: null,
      updated_at: now,
    })
    .eq("owner_user_id", ownerUserId)
    .eq("status", "active")
    .is("deleted_at", null);

  await admin.from("restaurant_subscriptions").update({ status: "past_due" }).in("restaurant_id", restaurantIds).in("status", ["trialing", "active"]);

  await admin
    .from("restaurant_access_sessions")
    .update({
      status: "released",
      released_at: now,
      release_reason: "Cuenta suspendida por mora de plataforma",
    })
    .in("restaurant_id", restaurantIds)
    .eq("status", "active");
}

async function reactivateOwnerRestaurantsAfterPayment(ownerUserId: string, restaurantIds: string[]) {
  const admin = createAdminClient();
  if (!admin || !restaurantIds.length) {
    return;
  }

  const now = new Date().toISOString();
  await admin
    .from("restaurants")
    .update({
      status: "active",
      deactivated_at: null,
      deactivated_by: null,
      updated_at: now,
    })
    .eq("owner_user_id", ownerUserId)
    .is("deactivated_by", null)
    .is("deleted_at", null);

  await admin.from("restaurant_subscriptions").update({ status: "active" }).in("restaurant_id", restaurantIds).in("status", ["trialing", "past_due"]);
}

export const ownerBillingService = {
  addMonthsClamped,
  defaultNextDueDate,

  async getSnapshot(ownerUserId: string, options: { actorUserId?: string; enforce?: boolean } = {}): Promise<OwnerBillingSnapshot | null> {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const settingsRow = await ensureSettings(ownerUserId, options.actorUserId);
    if (!settingsRow) {
      return null;
    }

    const [pricing, restaurants] = await Promise.all([getFullPlanPricing(), listOwnerRestaurants(ownerUserId)]);
    const branchCount = restaurants.length;
    const currentCycleRow = await ensureCycle({
      additionalPriceMonthly: pricing.additionalPriceMonthly,
      branchCount,
      currency: settingsRow.currency ?? defaultCurrency,
      dueDate: settingsRow.next_due_date,
      ownerUserId,
      primaryPriceMonthly: pricing.primaryPriceMonthly,
    });

    if (!currentCycleRow) {
      return null;
    }

    const today = localTodayDate();
    const daysUntilDue = diffDays(today, settingsRow.next_due_date);
    const isPaid = Boolean(currentCycleRow.paid_at);
    const isOverdue = branchCount > 0 && daysUntilDue < 0 && !isPaid;
    let effectiveCycleRow = currentCycleRow;

    if (isOverdue && currentCycleRow.status !== "overdue") {
      const admin = createAdminClient();
      if (admin) {
        const { data } = await admin
          .from("owner_platform_payment_cycles")
          .update({ status: "overdue" })
          .eq("id", currentCycleRow.id)
          .select("*")
          .single();
        effectiveCycleRow = (data as OwnerBillingCycleRow | null) ?? currentCycleRow;
      }
    }

    if (isOverdue && options.enforce !== false) {
      await suspendOwnerRestaurantsForBilling(ownerUserId, restaurants.map((restaurant) => restaurant.id));
    }

    const recentCycles = await listCycles(ownerUserId);
    const monthlyTotal = calculateMonthlyTotal(branchCount, pricing.primaryPriceMonthly, pricing.additionalPriceMonthly);

    return {
      settings: mapSettings(settingsRow),
      currentCycle: mapCycle(effectiveCycleRow),
      recentCycles: recentCycles.length ? recentCycles : [mapCycle(effectiveCycleRow)],
      branchCount,
      planName: pricing.planName,
      primaryPriceMonthly: pricing.primaryPriceMonthly,
      additionalPriceMonthly: pricing.additionalPriceMonthly,
      monthlyTotal,
      isConfigured: Boolean(settingsRow.platform_qr_url),
      isPaid,
      isOverdue,
      isSuspendedForBilling: isOverdue || restaurants.some((restaurant) => restaurant.status === "suspended"),
      daysUntilDue,
      reminderStartsAt: addDays(settingsRow.next_due_date, -settingsRow.reminder_days),
    };
  },

  async markPaid({
    actorUserId,
    cycleId,
    notes,
    ownerUserId,
  }: {
    actorUserId: string;
    cycleId: string;
    notes?: string;
    ownerUserId: string;
  }) {
    const admin = createAdminClient();
    if (!admin) {
      throw new Error("service-role-required");
    }

    const [{ data: settings }, { data: cycle }, restaurants] = await Promise.all([
      admin.from("owner_platform_billing_settings").select("*").eq("owner_user_id", ownerUserId).maybeSingle(),
      admin.from("owner_platform_payment_cycles").select("*").eq("id", cycleId).eq("owner_user_id", ownerUserId).maybeSingle(),
      listOwnerRestaurants(ownerUserId),
    ]);

    if (!settings || !cycle) {
      throw new Error("owner-billing-cycle-missing");
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from("owner_platform_payment_cycles")
      .update({
        proof_verified_at: cycle.proof_verified_at ?? now,
        proof_verified_by: actorUserId,
        paid_at: now,
        paid_by: actorUserId,
        resolution_notes: notes ?? null,
        status: "paid",
      })
      .eq("id", cycleId);

    if (error) {
      throw new Error(`owner-billing-paid:${error.code}`);
    }

    if (settings.next_due_date === cycle.due_date) {
      const nextDueDate = addMonthsClamped(cycle.due_date, 1);
      await admin.from("owner_platform_billing_settings").update({ next_due_date: nextDueDate, updated_by: actorUserId }).eq("owner_user_id", ownerUserId);

      const pricing = await getFullPlanPricing();
      await ensureCycle({
        additionalPriceMonthly: pricing.additionalPriceMonthly,
        branchCount: restaurants.length,
        currency: settings.currency ?? defaultCurrency,
        dueDate: nextDueDate,
        ownerUserId,
        primaryPriceMonthly: pricing.primaryPriceMonthly,
      });
    }

    await reactivateOwnerRestaurantsAfterPayment(ownerUserId, restaurants.map((restaurant) => restaurant.id));
  },
};
