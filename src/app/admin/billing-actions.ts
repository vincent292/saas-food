"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authService } from "@/lib/services/auth.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownerBillingService } from "@/lib/services/owner-billing.service";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function submitBillingPromiseAction(form: FormData) {
  const profile = await authService.getCurrentProfile();
  if (!profile || profile.isCustomerAccount || profile.mustChangePassword) redirect("/admin/login?error=session");
  const parsed = z.object({ cycleId: z.string().uuid(), promisedOn: date, note: z.string().max(1000) }).safeParse({
    cycleId: form.get("cycleId"), promisedOn: form.get("promisedOn"), note: form.get("note") || "",
  });
  if (!parsed.success) redirect("/admin/pagos?error=billing-invalid-date");
  const admin = createAdminClient();
  if (!admin) redirect("/admin/pagos?error=billing-unavailable");
  const { error } = await admin.rpc("resolve_owner_billing_promise", {
    p_cycle_id: parsed.data.cycleId, p_actor_id: profile.id, p_action: "request", p_date: parsed.data.promisedOn, p_note: parsed.data.note,
  });
  if (error) redirect(`/admin/pagos?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin", "layout"); revalidatePath("/dueno", "layout");
  redirect("/admin/pagos?requested=1");
}

export async function resolveBillingPromiseAction(form: FormData) {
  const profile = await authService.getCurrentProfile();
  if (profile?.globalRole !== "superadmin" || profile.mustChangePassword) redirect("/admin?error=superadmin-required");
  const parsed = z.object({ cycleId: z.string().uuid(), restaurantId: z.string().uuid(), action: z.enum(["approve", "reject"]), approvedOn: date.optional() }).safeParse({
    cycleId: form.get("cycleId"), restaurantId: form.get("restaurantId"), action: form.get("decision"), approvedOn: form.get("approvedOn") || undefined,
  });
  if (!parsed.success) redirect("/admin?error=billing-invalid-date");
  const path = `/admin/restaurantes/${parsed.data.restaurantId}/cuenta`;
  const admin = createAdminClient();
  if (!admin) redirect(`${path}?error=billing-unavailable`);
  const { data: cycle } = await admin.from("owner_platform_payment_cycles").select("owner_user_id").eq("id", parsed.data.cycleId).maybeSingle();
  const { data: restaurant } = await admin.from("restaurants").select("owner_user_id").eq("id", parsed.data.restaurantId).is("deleted_at", null).maybeSingle();
  if (!cycle || !restaurant || cycle.owner_user_id !== restaurant.owner_user_id) redirect(`${path}?error=billing-forbidden`);
  const { error } = await admin.rpc("resolve_owner_billing_promise", {
    p_cycle_id: parsed.data.cycleId, p_actor_id: profile.id, p_action: parsed.data.action, p_date: parsed.data.approvedOn ?? null, p_note: null,
  });
  if (error) redirect(`${path}?error=${encodeURIComponent(error.message)}`);
  if (parsed.data.action === "approve") await ownerBillingService.restoreApprovedExtension(cycle.owner_user_id);
  revalidatePath("/admin", "layout"); revalidatePath("/dueno", "layout"); revalidatePath("/");
  redirect(`${path}?saved=1`);
}
