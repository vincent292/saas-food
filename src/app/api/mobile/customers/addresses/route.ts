import { NextResponse } from "next/server";
import { z } from "zod";
import { createCustomerAddress, mutateCustomerAddress } from "@/lib/services/customer-account.service";

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

const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), id: z.string().uuid(), address: addressSchema }),
  z.object({ action: z.literal("default"), id: z.string().uuid() }),
]);

export async function PATCH(request: Request) {
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid-customer-address" }, { status: 400 });
  const input = parsed.data;
  const result = await mutateCustomerAddress(request, input.action, input.id, input.action === "update" ? input.address : {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ addresses: result.data });
}

export async function DELETE(request: Request) {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid-customer-address" }, { status: 400 });
  const result = await mutateCustomerAddress(request, "delete", parsed.data.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ addresses: result.data });
}
