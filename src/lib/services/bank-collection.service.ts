import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBankSuperadmin } from "./bank-qr.service";
import { BanecoError } from "@/lib/payments/baneco";

export async function bankCollectionOverview() {
  await requireBankSuperadmin();
  const admin = createAdminClient();
  if (!admin) throw new BanecoError("bank-storage-unavailable");
  const [settings, receivables] = await Promise.all([
    admin.from("bank_collection_settings").select("connection_id,enabled,authorized_at").eq("singleton", true).single(),
    admin.from("bank_collection_receivables").select("request_id,restaurant_id,receiver_restaurant_id,amount,currency,created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  if (settings.error || receivables.error) throw new BanecoError("bank-storage-unavailable");
  return { settings: settings.data, receivables: receivables.data ?? [] };
}
export async function configureBankCollection(connectionId: string | null, enabled: boolean, authorized: boolean) {
  const actor = await requireBankSuperadmin();
  const admin = createAdminClient();
  if (!admin) throw new BanecoError("bank-storage-unavailable");
  if (enabled) {
    if (!authorized || !connectionId) throw new BanecoError("bank-invalid-input");
    const account = await admin.from("bank_qr_connections").select("id").eq("id", connectionId).eq("environment", "production")
      .eq("active", true).eq("orders_enabled", true).eq("check_result", "ok").maybeSingle();
    if (account.error || !account.data) throw new BanecoError("bank-connection-unavailable");
  }
  const result = await admin.from("bank_collection_settings").update({ connection_id: connectionId, enabled,
    authorized_at: enabled ? new Date().toISOString() : null, authorized_by: enabled ? actor.id : null, updated_at: new Date().toISOString() }).eq("singleton", true).select("singleton").single();
  if (result.error || !result.data) throw new BanecoError("bank-storage-unavailable");
}
