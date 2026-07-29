import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeCustomerDocument, normalizeCustomerPhone, registerCustomerAccount } from "@/lib/services/customer-account.service";

const registerSchema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(6).max(120),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40),
  documentNumber: z.string().trim().min(4).max(40),
}).superRefine((value, ctx) => {
  if (normalizeCustomerPhone(value.phone).length < 6) {
    ctx.addIssue({ code: "custom", message: "phone-invalid", path: ["phone"] });
  }

  if (normalizeCustomerDocument(value.documentNumber).length < 4) {
    ctx.addIssue({ code: "custom", message: "document-invalid", path: ["documentNumber"] });
  }
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-customer-registration" }, { status: 400 });
  }

  const result = await registerCustomerAccount(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ profile: result.data });
}
