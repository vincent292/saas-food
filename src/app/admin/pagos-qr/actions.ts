"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { bankAmount, bankCredentialSchema, bankErrorDetails, boliviaDate, validBankDate } from "@/lib/payments/baneco";
import { bankQrService, requireBankSuperadmin, safeBankError } from "@/lib/services/bank-qr.service";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const path = "/admin/pagos-qr";
const connectionSchema = z.object({
  restaurantId: z.string().uuid(), label: z.string().trim().min(1).max(100),
  environment: z.enum(["certification", "production"]), branchCode: z.string().trim().max(5).regex(/^[A-Za-z0-9]*$/),
  credentials: bankCredentialSchema, acknowledged: z.literal(true),
});
async function limited() {
  const profile = await requireBankSuperadmin();
  const limit = await consumeRateLimit({ scope: "bank-qr-superadmin", identity: profile.id,
    maxAttempts: 20, windowSeconds: 60, blockSeconds: 60 });
  if (!limit.allowed) throw new Error("bank-operation-busy");
}
function feedback(code: string, details?: ReturnType<typeof bankErrorDetails>) {
  revalidatePath(path);
  const query = new URLSearchParams({ result: code });
  if (details?.last_error_stage) query.set("stage", details.last_error_stage);
  if (details?.last_http_status !== undefined && details.last_http_status !== null) query.set("http", String(details.last_http_status));
  if (details?.last_bank_code !== undefined && details.last_bank_code !== null) query.set("bank", String(details.last_bank_code));
  redirect(`${path}?${query.toString()}`);
}

export async function saveBankConnectionAction(form: FormData) {
  let failure: string | undefined;
  try {
    await limited();
    const input = connectionSchema.parse({ restaurantId: form.get("restaurantId"), label: form.get("label"),
      environment: form.get("environment"), branchCode: form.get("branchCode") ?? "",
      acknowledged: form.get("acknowledged") === "on",
      credentials: { userName: form.get("userName"), password: form.get("password"), aesKey: form.get("aesKey"),
        accountCredit: form.get("accountCredit"), encryptionMode: form.get("encryptionMode") } });
    await bankQrService.save(input);
  } catch (error) { failure = safeBankError(error); }
  feedback(failure ?? "saved");
}

export async function bankConnectionOperationAction(form: FormData) {
  let failure: string | undefined;
  let details: ReturnType<typeof bankErrorDetails> | undefined;
  const input = z.object({ id: z.string().uuid(), operation: z.enum(["check", "disable", "production", "enable-orders", "disable-orders"]) }).safeParse({
    id: form.get("connectionId"), operation: form.get("operation"),
  });
  try {
    await limited();
    if (!input.success) throw new Error("bank-invalid-input");
    if (input.data.operation === "check") await bankQrService.check(input.data.id);
    else if (input.data.operation === "production") await bankQrService.useProduction(input.data.id);
    else if (input.data.operation === "enable-orders" || input.data.operation === "disable-orders") await bankQrService.setOrdersEnabled(input.data.id, input.data.operation === "enable-orders");
    else await bankQrService.disable(input.data.id);
  } catch (error) { failure = safeBankError(error); details = bankErrorDetails(error); }
  feedback(failure ?? (input.success && input.data.operation === "check" ? "checked" : input.success && input.data.operation === "production" ? "production-ready" : input.success && ["enable-orders", "disable-orders"].includes(input.data.operation) ? "orders-updated" : "disabled"), details);
}

export async function generateBankTestQrAction(form: FormData) {
  let failure: string | undefined;
  let details: ReturnType<typeof bankErrorDetails> | undefined;
  let created = false;
  try {
    await limited();
    const input = z.object({ requestId: z.string().uuid(), connectionId: z.string().uuid(),
      currency: z.enum(["BOB", "USD"]), dueDate: z.string(), description: z.string().trim().max(150),
      acknowledged: z.literal(true) }).parse({ requestId: form.get("requestId"), connectionId: form.get("connectionId"),
      currency: form.get("currency"), dueDate: form.get("dueDate"), description: form.get("description") ?? "",
      acknowledged: form.get("testAcknowledged") === "on" });
    const maxDate = new Date(`${boliviaDate()}T12:00:00Z`); maxDate.setUTCDate(maxDate.getUTCDate() + 30);
    if (!validBankDate(input.dueDate) || input.dueDate < boliviaDate() || input.dueDate > maxDate.toISOString().slice(0, 10)) throw new Error("bank-invalid-input");
    const result = await bankQrService.generate({ ...input, amount: bankAmount(form.get("amount")) });
    created = result.created;
  } catch (error) { failure = safeBankError(error); details = bankErrorDetails(error); }
  feedback(failure ?? (created ? "generated" : "already-registered"), details);
}

export async function bankTestQrOperationAction(form: FormData) {
  let failure: string | undefined;
  let details: ReturnType<typeof bankErrorDetails> | undefined;
  try {
    await limited();
    const input = z.object({ requestId: z.string().uuid(), operation: z.enum(["status", "cancel", "apply"]) }).parse({
      requestId: form.get("requestId"), operation: form.get("operation"),
    });
    if (input.operation === "apply") await bankQrService.retryApplication(input.requestId);
    else await bankQrService.reconcile(input.requestId, input.operation === "cancel");
  } catch (error) { failure = safeBankError(error); details = bankErrorDetails(error); }
  feedback(failure ?? "reconciled", details);
}
