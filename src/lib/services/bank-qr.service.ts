import "server-only";

import { randomUUID } from "node:crypto";
import { authService } from "@/lib/services/auth.service";
import { getActiveSupportSession } from "@/lib/services/support-impersonation.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { openBankCredentials, sealBankCredentials } from "@/lib/payments/credential-vault";
import { bankCredentialSchema, bankErrorDetails, BanecoError, createBanecoClient, verifyBankStatus, type BanecoEnvironment } from "@/lib/payments/baneco";
import type { Database, Json } from "@/types/database.types";

type TestRequest = Database["public"]["Tables"]["bank_qr_test_requests"]["Row"];
type BankConnection = Database["public"]["Tables"]["bank_qr_connections"]["Row"];
export const publicConnectionFields = "id,restaurant_id,environment,label,encryption_mode,branch_code,active,checked_at,check_result,last_error_code,last_error_stage,last_http_status,last_bank_code,created_at";
export const publicTestFields = "id,connection_id,restaurant_id,environment,transaction_id,amount,currency,due_date,description,status,qr_id,verified_at,last_error_code,last_error_stage,last_http_status,last_bank_code,created_at";
const clearDiagnostics = { last_error_code: null, last_error_stage: null, last_http_status: null, last_bank_code: null };

export async function requireBankSuperadmin() {
  const profile = await authService.getCurrentProfile();
  if (!profile || profile.globalRole !== "superadmin" || profile.mustChangePassword || profile.isCustomerAccount) throw new BanecoError("bank-forbidden");
  if (await getActiveSupportSession(profile.id)) throw new BanecoError("bank-support-readonly");
  return profile;
}
function adminClient() {
  const admin = createAdminClient();
  if (!admin) throw new BanecoError("bank-storage-unavailable");
  return admin;
}
function checked<T>(result: { data: T; error: unknown }) {
  if (result.error) throw new BanecoError("bank-storage-unavailable");
  return result.data;
}
export function safeBankError(error: unknown) {
  const known = new Set(["bank-forbidden", "bank-support-readonly", "bank-storage-unavailable", "bank-vault-not-configured", "bank-vault-unreadable", "bank-connection-unverified", "bank-invalid-amount", "bank-timeout", "bank-unavailable", "bank-http-error", "bank-invalid-response", "bank-invalid-qr-image", "bank-rejected", "bank-connection-unavailable", "bank-request-unavailable", "bank-operation-busy", "bank-invalid-input"]);
  const code = error instanceof Error ? error.message : "";
  return known.has(code) ? code : "bank-operation-failed";
}

async function connection(admin: ReturnType<typeof adminClient>, id: string, allowDisabled = false) {
  const row = checked(await admin.from("bank_qr_connections").select("*").eq("id", id).maybeSingle());
  if (!row || (!allowDisabled && !row.active)) throw new BanecoError("bank-connection-unavailable");
  const credentials = bankCredentialSchema.safeParse(openBankCredentials(row.credentials_ciphertext, row.id, row.restaurant_id, row.environment));
  if (!credentials.success) throw new BanecoError("bank-vault-unreadable");
  return { row, credentials: credentials.data, bank: createBanecoClient(row.environment, credentials.data) };
}

// Public methods enforce server-side role checks too, not just page visibility.
export const bankQrService = {
  async list(imageRequestId?: string) {
    await requireBankSuperadmin();
    const admin = adminClient();
    const [connections, requests] = await Promise.all([
      admin.from("bank_qr_connections").select(publicConnectionFields).order("created_at", { ascending: false }).limit(100),
      admin.from("bank_qr_test_requests").select(publicTestFields).order("created_at", { ascending: false }).limit(30),
    ]);
    const rows = checked(requests) ?? [];
    const selectedId = rows.find(row => row.id === imageRequestId)?.id ?? rows[0]?.id;
    // Fetch only one QR image, not up to 30 multi-megabyte blobs per render.
    const selected = selectedId ? checked(await admin.from("bank_qr_test_requests").select("id,qr_image").eq("id", selectedId).maybeSingle()) : null;
    return { connections: checked(connections) ?? [], requests: rows.map(row => ({ ...row, qr_image: selected?.id === row.id ? selected.qr_image : null })) };
  },
  async save(input: { restaurantId: string; label: string; environment: BanecoEnvironment; branchCode: string; credentials: unknown }) {
    const profile = await requireBankSuperadmin();
    const admin = adminClient();
    const restaurant = checked(await admin.from("restaurants").select("id").eq("id", input.restaurantId).is("deleted_at", null).maybeSingle());
    if (!restaurant) throw new BanecoError("bank-connection-unavailable");
    const credentials = bankCredentialSchema.parse(input.credentials);
    const id = randomUUID();
    const ciphertext = sealBankCredentials(credentials, id, restaurant.id, input.environment);
    const result = await admin.from("bank_qr_connections").insert({ id, restaurant_id: restaurant.id,
      environment: input.environment, label: input.label, branch_code: input.branchCode,
      encryption_mode: credentials.encryptionMode, credentials_ciphertext: ciphertext, created_by: profile.id });
    if (result.error?.code === "23505") throw new BanecoError("bank-connection-unavailable");
    checked(result);
    return id;
  },
  async disable(id: string) {
    await requireBankSuperadmin();
    checked(await adminClient().from("bank_qr_connections").update({ active: false }).eq("id", id));
    // Existing QR records retain this immutable credential version for reconciliation.
  },
  async useProduction(id: string) {
    const profile = await requireBankSuperadmin();
    const admin = adminClient();
    const { row, credentials } = await connection(admin, id);
    if (row.environment !== "certification") throw new BanecoError("bank-invalid-input");
    const existing = checked(await admin.from("bank_qr_connections").select("id").eq("restaurant_id", row.restaurant_id)
      .eq("environment", "production").eq("active", true).maybeSingle());
    if (existing) throw new BanecoError("bank-connection-unavailable");
    // Authenticate the intended environment before creating a new immutable version.
    // Never modify the source: historical certification attempts retain their AAD.
    await createBanecoClient("production", credentials).checkConnection();
    const newId = randomUUID();
    checked(await admin.from("bank_qr_connections").insert({ id: newId, restaurant_id: row.restaurant_id,
      environment: "production", label: `${row.label.slice(0, 80)} · producción`, branch_code: row.branch_code,
      encryption_mode: row.encryption_mode, credentials_ciphertext: sealBankCredentials(credentials, newId, row.restaurant_id, "production"),
      created_by: profile.id, checked_at: new Date().toISOString(), check_result: "ok" }));
    return newId;
  },
  async check(id: string) {
    await requireBankSuperadmin();
    const admin = adminClient();
    const { bank } = await connection(admin, id);
    try {
      await bank.checkConnection();
      checked(await admin.from("bank_qr_connections").update({ ...clearDiagnostics, checked_at: new Date().toISOString(), check_result: "ok" }).eq("id", id));
    } catch (error) {
      await admin.from("bank_qr_connections").update({ ...bankErrorDetails(error), last_error_code: safeBankError(error), checked_at: new Date().toISOString(), check_result: "error" }).eq("id", id);
      throw error;
    }
  },
  async generate(input: { requestId: string; connectionId: string; amount: number; currency: "BOB" | "USD"; dueDate: string; description: string }) {
    const profile = await requireBankSuperadmin();
    const admin = adminClient();
    // Resolve/decrypt before reserving so missing vault configuration creates no attempt.
    const { row, bank } = await connection(admin, input.connectionId);
    const reserved = await admin.rpc("reserve_baneco_test_qr", { p_id: input.requestId,
      p_connection_id: input.connectionId, p_actor_id: profile.id, p_amount: input.amount,
      p_currency: input.currency, p_due_date: input.dueDate, p_description: input.description });
    if (reserved.error?.message === "bank-connection-unverified") throw new BanecoError("bank-connection-unverified");
    const result = checked(reserved);
    const reservation = result as { claimed: boolean; request: TestRequest } | null;
    if (!reservation?.request) throw new BanecoError("bank-storage-unavailable");
    if (!reservation.claimed) return { id: reservation.request.id, created: false };
    let generated: { qrId: string; image: string } | undefined;
    try {
      generated = await bank.generate({ transactionId: reservation.request.transaction_id,
        amount: Number(reservation.request.amount), currency: reservation.request.currency,
        dueDate: reservation.request.due_date, description: reservation.request.description, branchCode: row.branch_code });
      const saved = checked(await admin.from("bank_qr_test_requests").update({ qr_id: generated.qrId, qr_image: generated.image,
        status: "pending", updated_at: new Date().toISOString() }).eq("id", input.requestId).eq("status", "generating").select("id").maybeSingle());
      if (!saved) throw new BanecoError("bank-operation-busy", "generation");
    } catch (error) {
      const details = bankErrorDetails(error);
      const beforeGeneration = details.last_error_stage && ["password-encryption", "authentication", "account-encryption"].includes(details.last_error_stage);
      const candidateQrId = generated?.qrId ?? (error instanceof BanecoError && error.stage === "generation" ? error.qrId : null);
      const receivedQrId = candidateQrId && /^[A-Za-z0-9_-]{1,100}$/.test(candidateQrId) ? candidateQrId : null;
      // Only positively identified preflight failures prove generateQR was not sent.
      await admin.from("bank_qr_test_requests").update({ ...details, ...(receivedQrId ? { qr_id: receivedQrId } : {}), ...(generated ? { qr_image: generated.image } : {}), status: beforeGeneration ? "failed" : "unknown", last_error_code: safeBankError(error), updated_at: new Date().toISOString() })
        .eq("id", input.requestId).eq("status", "generating");
      throw error;
    }
    return { id: input.requestId, created: true };
  },
  async reconcile(requestId: string, cancel = false) {
    await requireBankSuperadmin();
    const admin = adminClient();
    const current = checked(await admin.from("bank_qr_test_requests").select("*").eq("id", requestId).maybeSingle());
    if (!current?.qr_id) throw new BanecoError("bank-request-unavailable");
    if (current.status === "paid" || current.status === "cancelled") return;
    const operationToken = randomUUID();
    const now = new Date().toISOString();
    const locked = checked(await admin.from("bank_qr_test_requests").update({ operation_token: operationToken,
      operation_until: new Date(Date.now() + 90_000).toISOString() }).eq("id", requestId)
      .in("status", ["pending", "expired", "review", "unknown"])
      .or(`operation_until.is.null,operation_until.lt.${now}`).select("id").maybeSingle());
    if (!locked) throw new BanecoError("bank-operation-busy");
    try {
      const { bank, row } = await connection(admin, current.connection_id, true);
      let response = await bank.status(current.qr_id);
      const expected = { qrId: current.qr_id, amount: Number(current.amount), currency: current.currency,
        branchCode: row.branch_code, dueDate: current.due_date };
      let status = verifyBankStatus(response, expected);
      if (cancel && (status === "pending" || status === "expired")) {
        await bank.cancel(current.qr_id);
        // DELETE success is not enough: payment and cancellation can race at the bank.
        response = await bank.status(current.qr_id);
        status = verifyBankStatus(response, expected);
      }
      const payment = Array.isArray(response.payment) ? response.payment[0] : response.payment;
      const bankTransactionId = status === "paid" && payment && typeof payment === "object"
        ? String((payment as Record<string, Json>).transactionId) : null;
      const updated = checked(await admin.from("bank_qr_test_requests").update({ status, verified_at: new Date().toISOString(),
        bank_transaction_id: bankTransactionId, ...clearDiagnostics, operation_token: null, operation_until: null,
        updated_at: new Date().toISOString() }).eq("id", requestId).eq("operation_token", operationToken).select("id").maybeSingle());
      if (!updated) throw new BanecoError("bank-operation-busy");
    } catch (error) {
      await admin.from("bank_qr_test_requests").update({ ...bankErrorDetails(error), last_error_code: safeBankError(error), operation_token: null, operation_until: null })
        .eq("id", requestId).eq("operation_token", operationToken);
      throw error;
    }
  },
};

// These fields/types never include a password, bank key, account or bearer token.
export type PublicBankConnection = Omit<BankConnection, "credentials_ciphertext" | "created_by">;
