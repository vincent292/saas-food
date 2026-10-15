import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { authService } from "@/lib/services/auth.service";
import { getActiveSupportSession } from "@/lib/services/support-impersonation.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { bankVaultConfigured, openBankCredentials, sealBankCredentials } from "@/lib/payments/credential-vault";
import { bankCredentialSchema, bankErrorDetails, boliviaDate, BanecoError, createBanecoClient, verifyBankStatus, type BanecoEnvironment } from "@/lib/payments/baneco";
import type { Database, Json } from "@/types/database.types";

type TestRequest = Database["public"]["Tables"]["bank_qr_test_requests"]["Row"];
type BankConnection = Database["public"]["Tables"]["bank_qr_connections"]["Row"];
export const publicConnectionFields = "id,restaurant_id,environment,label,encryption_mode,branch_code,active,orders_enabled,checked_at,check_result,last_error_code,last_error_stage,last_http_status,last_bank_code,created_at";
export const publicTestFields = "id,connection_id,restaurant_id,environment,transaction_id,amount,currency,due_date,description,status,qr_id,order_id,application_state,application_code,notification_received_at,verified_at,last_attempt_at,next_check_at,consecutive_failures,last_error_code,last_error_stage,last_http_status,last_bank_code,created_at";
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
  const known = new Set(["bank-forbidden", "bank-support-readonly", "bank-storage-unavailable", "bank-vault-not-configured", "bank-vault-unreadable", "bank-connection-unverified", "bank-order-ineligible", "bank-invalid-amount", "bank-timeout", "bank-unavailable", "bank-http-error", "bank-invalid-response", "bank-invalid-qr-image", "bank-rejected", "bank-connection-unavailable", "bank-request-unavailable", "bank-operation-busy", "bank-invalid-input"]);
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

async function generateReservedQr(admin: ReturnType<typeof adminClient>, request: TestRequest, bank: ReturnType<typeof createBanecoClient>, branchCode: string) {
  let generated: { qrId: string; image: string } | undefined;
  try {
    generated = await bank.generate({ transactionId: request.transaction_id, amount: Number(request.amount), currency: request.currency,
      dueDate: request.due_date, description: request.description, branchCode });
    const saved = checked(await admin.from("bank_qr_test_requests").update({ qr_id: generated.qrId, qr_image: generated.image,
      status: "pending", updated_at: new Date().toISOString() }).eq("id", request.id).eq("status", "generating").select("id").maybeSingle());
    if (!saved) throw new BanecoError("bank-operation-busy", "generation");
  } catch (error) {
    const details = bankErrorDetails(error);
    const beforeGeneration = details.last_error_stage && ["password-encryption", "authentication", "account-encryption"].includes(details.last_error_stage);
    const candidateQrId = generated?.qrId ?? (error instanceof BanecoError && error.stage === "generation" ? error.qrId : null);
    const receivedQrId = candidateQrId && /^[A-Za-z0-9_-]{1,100}$/.test(candidateQrId) ? candidateQrId : null;
    await admin.from("bank_qr_test_requests").update({ ...details, ...(receivedQrId ? { qr_id: receivedQrId } : {}), ...(generated ? { qr_image: generated.image } : {}),
      status: beforeGeneration ? "failed" : "unknown", last_error_code: safeBankError(error), updated_at: new Date().toISOString() })
      .eq("id", request.id).eq("status", "generating");
    throw error;
  }
}

// Not exported: callers must pass either the superadmin guard or worker auth.
async function reconcileClaim(admin: ReturnType<typeof adminClient>, current: TestRequest, operationToken: string, cancel = false) {
  try {
    const { bank, row } = await connection(admin, current.connection_id, true);
    let response = await bank.status(current.qr_id!);
    const expected = { qrId: current.qr_id!, amount: Number(current.amount), currency: current.currency,
      branchCode: row.branch_code, dueDate: current.due_date };
    let status = verifyBankStatus(response, expected);
    if (cancel && (status === "pending" || status === "expired")) {
      await bank.cancel(current.qr_id!);
      response = await bank.status(current.qr_id!);
      status = verifyBankStatus(response, expected);
    }
    const payment = Array.isArray(response.payment) ? response.payment[0] : response.payment;
    const transaction = status === "paid" && payment && typeof payment === "object"
      ? String((payment as Record<string, Json>).transactionId) : null;
    const saved = checked(await admin.rpc("finish_baneco_reconciliation", { p_id: current.id, p_token: operationToken,
      p_status: status, p_transaction: transaction, p_error: null, p_details: {} }));
    if (!saved) throw new BanecoError("bank-operation-busy");
  } catch (error) {
    await admin.rpc("finish_baneco_reconciliation", { p_id: current.id, p_token: operationToken,
      p_status: null, p_transaction: null, p_error: safeBankError(error), p_details: bankErrorDetails(error) });
    throw error;
  }
}

type WorkerSignature = { timestamp: string | null; signature: string | null };
export function bankWorkerAuthorized({ timestamp, signature }: WorkerSignature) {
  const secret = process.env.BANK_QR_WORKER_SECRET;
  if (!secret || secret.length < 32 || !timestamp || !/^\d{10}$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  if (Math.abs(Date.now() - Number(timestamp) * 1000) > 60_000) return false;
  const expected = createHmac("sha256", secret).update(`baneco-worker-v1:${timestamp}`).digest();
  return timingSafeEqual(Buffer.from(signature, "hex"), expected);
}

export async function runBankQrWorker(authentication: WorkerSignature) {
  if (!bankWorkerAuthorized(authentication)) throw new BanecoError("bank-forbidden");
  const admin = adminClient();
  const deadline = Date.now() + 35_000;
  let claimed = 0, completed = 0, failed = 0;
  const work = async () => {
    while (claimed < 10 && Date.now() < deadline) {
      // Reserve a local slot before await, then claim exclusively using DB time.
      claimed++;
      const token = randomUUID();
      const row = checked(await admin.rpc("claim_baneco_reconciliation", { p_token: token })) as TestRequest | null;
      if (!row) return;
      try { await reconcileClaim(admin, row, token); completed++; } catch { failed++; }
    }
  };
  await Promise.all([work(), work(), work()]);
  const posted = checked(await admin.rpc("post_waiting_baneco_payments", {}));
  return { completed, failed, posted };
}

// This endpoint receives an unauthenticated hint because Baneco's manual has no
// signature contract. Only locally known IDs can trigger authenticated queries.
export async function acceptBanecoPaymentNotice(qrId: string) {
  const admin = adminClient();
  const id = checked(await admin.rpc("queue_baneco_payment_notification", { p_qr_id: qrId }));
  if (!id) return null;
  return async () => {
    try {
      for (let attempt = 0; attempt < 18; attempt++) {
        const operationToken = randomUUID();
        const row = checked(await admin.rpc("claim_baneco_reconciliation", { p_token: operationToken, p_id: id })) as TestRequest | null;
        if (row) { await reconcileClaim(admin, row, operationToken); return; }
        const current = checked(await admin.from("bank_qr_test_requests").select("operation_until,status,last_attempt_at,notification_received_at").eq("id", id).maybeSingle());
        if (!current?.operation_until || ["paid", "cancelled"].includes(current.status) ||
          (current.last_attempt_at && current.notification_received_at && current.last_attempt_at >= current.notification_received_at)) return;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch { /* Persistent reservation/backoff and cron recover interrupted work. */ }
  };
}

async function publicOrder(admin: ReturnType<typeof adminClient>, orderId: string, token: string) {
  const order = checked(await admin.from("orders").select("id,restaurant_id,total,payment_status,payment_method,status,group_order_session_id,payment_receipt_url,payment_receipt_reference")
    .eq("id", orderId).eq("tracking_token", token).maybeSingle());
  if (!order) throw new BanecoError("bank-request-unavailable");
  return order;
}

export const bankOrderPaymentService = {
  async availableForRestaurant(restaurantId: string, currency = "BOB") {
    if (currency !== "BOB" || !bankVaultConfigured()) return false;
    try {
      const account = checked(await adminClient().from("bank_qr_connections").select("id").eq("restaurant_id", restaurantId)
        .eq("environment", "production").eq("active", true).eq("orders_enabled", true).eq("check_result", "ok").maybeSingle());
      return Boolean(account);
    } catch { return false; }
  },
  async get(orderId: string, token: string) {
    const admin = adminClient();
    const order = await publicOrder(admin, orderId, token);
    const request = checked(await admin.from("bank_qr_test_requests").select("id,status,qr_image,amount,application_state,due_date")
      .eq("order_id", order.id).not("status", "in", "(failed,cancelled)").order("created_at", { ascending: false }).limit(1).maybeSingle());
    if (request) {
      const compatible = order.status !== "cancelled" && !["cancelled", "refunded"].includes(order.payment_status)
        && Number(order.total) === Number(request.amount) && (order.payment_status !== "paid" || request.status === "paid");
      return { available: true, requestId: request.id, status: compatible || request.status === "paid" ? request.status : "review", amount: Number(request.amount), applicationState: compatible ? request.application_state : "review",
        image: compatible && request.status === "pending" && request.due_date >= boliviaDate() ? request.qr_image : null };
    }
    if (order.payment_status === "paid") return { available: false, status: "paid" };
    const eligible = order.payment_status === "pending" && order.payment_method === "qr" && order.status !== "cancelled" && order.status !== "delivered"
      && !order.group_order_session_id && !order.payment_receipt_url && !order.payment_receipt_reference && Number(order.total) >= .01 && Number(order.total) <= 50000;
    if (!eligible) return { available: false, status: "unavailable" };
    const [account, child] = await Promise.all([
      admin.from("bank_qr_connections").select("id").eq("restaurant_id", order.restaurant_id).eq("environment", "production")
        .eq("active", true).eq("orders_enabled", true).eq("check_result", "ok").maybeSingle(),
      admin.from("multisite_order_children").select("id").eq("order_id", order.id).limit(1).maybeSingle(),
    ]);
    return { available: Boolean(checked(account)) && !checked(child), status: "not_created", amount: Number(order.total) };
  },
  async generate(orderId: string, token: string) {
    const admin = adminClient();
    await publicOrder(admin, orderId, token);
    const result = await admin.rpc("reserve_baneco_order_qr", { p_order_id: orderId, p_tracking_token: token });
    if (result.error?.message === "bank-order-ineligible") throw new BanecoError("bank-order-ineligible");
    const reservation = checked(result) as { claimed: boolean; request: TestRequest } | null;
    if (!reservation?.request) throw new BanecoError("bank-storage-unavailable");
    if (reservation.claimed) {
      const resolved = await connection(admin, reservation.request.connection_id, true).catch(async error => {
        await admin.from("bank_qr_test_requests").update({ status: "failed", last_error_code: safeBankError(error) })
          .eq("id", reservation.request.id).eq("status", "generating");
        throw error;
      });
      const { bank, row } = resolved;
      await generateReservedQr(admin, reservation.request, bank, row.branch_code);
    }
    return this.get(orderId, token);
  },
  async cancel(orderId: string, token: string) {
    const admin = adminClient();
    await publicOrder(admin, orderId, token);
    const request = checked(await admin.from("bank_qr_test_requests").select("id,status").eq("order_id", orderId)
      .not("status", "in", "(failed,cancelled)").order("created_at", { ascending: false }).limit(1).maybeSingle());
    if (!request || request.status === "paid") return this.get(orderId, token);
    const operationToken = randomUUID();
    const row = checked(await admin.rpc("claim_baneco_reconciliation", { p_token: operationToken, p_id: request.id, p_cancel: true })) as TestRequest | null;
    if (!row) throw new BanecoError("bank-operation-busy");
    await reconcileClaim(admin, row, operationToken, true);
    return this.get(orderId, token);
  },
};

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
  async retryApplication(requestId: string) {
    await requireBankSuperadmin();
    checked(await adminClient().rpc("retry_baneco_order_payment", { p_request_id: requestId }));
  },
  async setOrdersEnabled(id: string, enabled: boolean) {
    await requireBankSuperadmin();
    const admin = adminClient();
    const { row } = await connection(admin, id);
    if (row.environment !== "production" || row.check_result !== "ok") throw new BanecoError("bank-connection-unverified");
    checked(await admin.from("bank_qr_connections").update({ orders_enabled: enabled }).eq("id", id));
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
    await generateReservedQr(admin, reservation.request, bank, row.branch_code);
    return { id: input.requestId, created: true };
  },
  async reconcile(requestId: string, cancel = false) {
    await requireBankSuperadmin();
    const admin = adminClient();
    const current = checked(await admin.from("bank_qr_test_requests").select("id,qr_id,status").eq("id", requestId).maybeSingle());
    if (!current?.qr_id) throw new BanecoError("bank-request-unavailable");
    if (current.status === "paid" || current.status === "cancelled") return;
    const operationToken = randomUUID();
    const locked = checked(await admin.rpc("claim_baneco_reconciliation", { p_token: operationToken, p_id: requestId, p_cancel: cancel })) as TestRequest | null;
    if (!locked) throw new BanecoError("bank-operation-busy");
    await reconcileClaim(admin, locked, operationToken, cancel);
  },
};

// These fields/types never include a password, bank key, account or bearer token.
export type PublicBankConnection = Omit<BankConnection, "credentials_ciphertext" | "created_by">;
