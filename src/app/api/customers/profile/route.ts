import { NextResponse } from "next/server";
import { z } from "zod";
import { getCustomerAccount, normalizeCustomerDocument, normalizeCustomerPhone, updateCustomerProfile } from "@/lib/services/customer-account.service";

const profileSchema = z.object({
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

export async function GET(request: Request) {
  const result = await getCustomerAccount(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-customer-profile" }, { status: 400 });
  }

  const result = await updateCustomerProfile(request, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ profile: result.data });
}
