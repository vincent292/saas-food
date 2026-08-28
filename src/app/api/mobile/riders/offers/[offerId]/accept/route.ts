import { NextResponse } from "next/server";
import { after } from "next/server";
import { acceptMobileRiderOffer, getMobileRiderSession } from "@/lib/services/rider-mobile.service";
import { sendOrderWhatsAppNotification } from "@/lib/services/order-whatsapp-notification.service";

export async function POST(request: Request, { params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  const session = await getMobileRiderSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const result = await acceptMobileRiderOffer(session.data, offerId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  after(async () => {
    await sendOrderWhatsAppNotification({ event: "delivery_dispatched", orderId: result.data.order.id }).catch((error) => {
      console.error("delivery-dispatched-whatsapp-failed", error);
    });
  });

  return NextResponse.json(result.data);
}
