import { NextResponse } from "next/server";
import { z } from "zod";
import { createCustomerAddress } from "@/lib/services/customer-account.service";

const addressSchema = z.object({
  label: z.string().trim().min(1).max(60),
  address: z.string().trim().min(4).max(500),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  mapsUrl: z.string().trim().url().max(500).optional(),
  city: z.string().trim().max(120).optional(),
  apartment: z.string().trim().max(120).optional(),
  buildingName: z.string().trim().max(120).optional(),
  reference: z.string().trim().max(300).optional(),
  isDefault: z.boolean().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = addressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-customer-address" }, { status: 400 });
  }

  const result = await createCustomerAddress(request, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ addresses: result.data });
}
