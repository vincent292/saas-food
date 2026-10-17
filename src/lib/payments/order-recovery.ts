import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { BanecoError } from "@/lib/payments/baneco";
export function orderRecoveryHash(key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new BanecoError("bank-invalid-input");
  return createHash("sha256").update(`yopido-order-recovery-v1:${key}`).digest("hex");
}
export async function findRecoverableOrder(restaurantId: string, requestId: string, recoveryKey: string) {
  const admin = createAdminClient();
  if (!admin) throw new BanecoError("bank-storage-unavailable");
  const { data, error } = await admin.from("orders").select("id,tracking_token,order_number,status,restaurant_id,bank_payment_required,bank_checkout_hold")
    .eq("restaurant_id", restaurantId).eq("public_request_id", requestId).eq("recovery_key_hash", orderRecoveryHash(recoveryKey)).maybeSingle();
  if (error) throw new BanecoError("bank-storage-unavailable");
  return data;
}
