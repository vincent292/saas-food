import { NextResponse } from "next/server";
import { mobileDirectoryService } from "@/lib/services/mobile-directory.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await context.params;

  try {
    const data = await mobileDirectoryService.getRestaurant(restaurantSlug);
    if (!data) {
      return NextResponse.json({ error: "restaurant-not-found" }, { status: 404 });
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("mobile-restaurant:get", { error, restaurantSlug });
    return NextResponse.json({ error: "restaurant-read-failed" }, { status: 500 });
  }
}
