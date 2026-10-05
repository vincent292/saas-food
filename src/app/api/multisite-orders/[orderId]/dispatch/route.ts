import { NextResponse } from "next/server";
import { z } from "zod";
import {
  acceptMultisiteCustomerCounterOffer,
  getPublicMultisiteDispatch,
  rejectMultisiteCustomerCounterOffer,
} from "@/lib/services/multisite-rider-negotiation.service";

const tokenSchema = z.string().regex(/^[a-f0-9]{32}$/i);
const decisionSchema = z.object({
  action: z.enum(["accept_counter", "reject_counter"]),
  offerId: z.string().uuid(),
  token: tokenSchema,
});

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!z.string().uuid().safeParse(orderId).success || !tokenSchema.safeParse(token).success) {
    return NextResponse.json({ error: "invalid-multisite-dispatch-request" }, { status: 400 });
  }
  const result = await getPublicMultisiteDispatch({ multisiteOrderId: orderId, trackingToken: token });
  return result.ok
    ? NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ error: result.error }, { status: result.status });
}

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-multisite-dispatch-decision" }, { status: 400 });
  }
  const parsed = decisionSchema.safeParse(body);
  if (!z.string().uuid().safeParse(orderId).success || !parsed.success) {
    return NextResponse.json({ error: "invalid-multisite-dispatch-decision" }, { status: 400 });
  }
  const result = parsed.data.action === "accept_counter"
    ? await acceptMultisiteCustomerCounterOffer({ multisiteOrderId: orderId, trackingToken: parsed.data.token, offerId: parsed.data.offerId })
    : await rejectMultisiteCustomerCounterOffer({ multisiteOrderId: orderId, trackingToken: parsed.data.token, offerId: parsed.data.offerId });
  return result.ok
    ? NextResponse.json(result.data)
    : NextResponse.json({ error: result.error }, { status: result.status });
}
