"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bankCredentialSchema } from "@/lib/payments/baneco";
import { bankBranchConnectionService, requireBankOwner, safeBankError } from "@/lib/services/bank-qr.service";
import { consumeRateLimit } from "@/lib/security/rate-limit";
export async function branchBankAction(form: FormData) {
  const restaurantId = z.string().uuid().parse(form.get("restaurantId"));
  const path = `/admin/restaurantes/${restaurantId}/configuracion/banco`;
  let result = "saved";
  try {
    const { profile } = await requireBankOwner(restaurantId);
    const limit = await consumeRateLimit({ scope: "bank-branch-config", identity: profile.id, maxAttempts: 12, windowSeconds: 60, blockSeconds: 60 });
    if (!limit.allowed) throw new Error("bank-operation-busy");
    const operation = z.enum(["save", "check", "enable", "disable"]).parse(form.get("operation"));
    if (operation === "save") {
      const input = z.object({ label: z.string().trim().min(1).max(100), branchCode: z.string().trim().max(5).regex(/^[A-Za-z0-9]*$/),
        acknowledged: z.literal(true), credentials: bankCredentialSchema }).parse({
        label: form.get("label"), branchCode: form.get("branchCode") ?? "", acknowledged: form.get("acknowledged") === "on",
        credentials: { userName: form.get("userName"), password: form.get("password"), aesKey: form.get("aesKey"), accountCredit: form.get("accountCredit"), encryptionMode: form.get("encryptionMode") },
      });
      await bankBranchConnectionService.save(restaurantId, input);
    } else {
      if (["enable", "disable"].includes(operation) && form.get("confirmed") !== "yes") throw new Error("bank-invalid-input");
      await bankBranchConnectionService.operate(restaurantId, z.string().uuid().parse(form.get("connectionId")), operation);
      result = operation;
    }
  } catch (error) { result = safeBankError(error); }
  revalidatePath(path);
  revalidatePath(`/admin/restaurantes/${restaurantId}/configuracion`);
  redirect(`${path}?result=${encodeURIComponent(result)}`);
}
