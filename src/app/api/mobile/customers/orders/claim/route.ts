import { NextResponse } from "next/server";
import { z } from "zod";
import { claimCustomerOrders } from "@/lib/services/customer-account.service";

const claimSchema = z.object({
  orders: z
    .array(
      z.object({
        orderId: z.string().uuid(),
        trackingToken: z.string().trim().min(12).max(200),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-customer-order-claim" }, { status: 400 });
  }

  const result = await claimCustomerOrders(request, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
