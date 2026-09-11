import { NextResponse } from "next/server";
import { z } from "zod";
import { getRestaurantDeliveryQuote } from "@/lib/services/delivery-quote.service";
import { createAdminClient } from "@/lib/supabase/admin";

const quoteSchema = z.object({
  restaurantId: z.string().uuid(),
  deliveryLatitude: z.coerce.number().min(-90).max(90),
  deliveryLongitude: z.coerce.number().min(-180).max(180),
  subtotal: z.coerce.number().nonnegative().optional().default(0),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid-delivery-quote" }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "service-role-required" }, { status: 500 });
  const quote = await getRestaurantDeliveryQuote(supabase, parsed.data);
  if (!quote) return NextResponse.json({ error: "invalid-restaurant" }, { status: 404 });

  return NextResponse.json(quote);
}

