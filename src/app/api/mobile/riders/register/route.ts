import { NextResponse } from "next/server";
import { z } from "zod";
import { registerMobileRiderAccount } from "@/lib/services/rider-mobile.service";

const registerSchema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(8).max(120),
  documentNumber: z.string().trim().min(4).max(40),
  plateNumber: z.string().trim().min(4).max(30),
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
    return NextResponse.json({ error: "invalid-rider-register" }, { status: 400 });
  }

  const result = await registerMobileRiderAccount(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
