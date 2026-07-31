import { NextResponse } from "next/server";
import { z } from "zod";
import { setCustomerFavorite } from "@/lib/services/customer-account.service";

const favoriteSchema = z.object({
  kind: z.enum(["restaurant", "product"]),
  restaurantId: z.string().uuid(),
  productId: z.string().uuid().optional(),
  favorite: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.kind === "product" && !value.productId) {
    ctx.addIssue({ code: "custom", message: "product-required", path: ["productId"] });
  }
});

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = favoriteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-customer-favorite" }, { status: 400 });
  }

  const result = await setCustomerFavorite(request, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ favorites: result.data });
}
