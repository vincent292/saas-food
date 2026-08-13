import { NextResponse } from "next/server";
import { z } from "zod";
import { prepareInventoryQuickAdd } from "@/lib/services/inventory-quick-add-ai.service";
import { inventoryService } from "@/lib/services/inventory.service";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

const previewSchema = z.object({
  restaurantId: z.string().uuid(),
  text: z.string().trim().min(2).max(220),
  contextText: z.string().trim().max(300).optional(),
});

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "supabase-not-configured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-quick-add-preview" }, { status: 400 });
  }

  const access = await requireInventoryAccess(parsed.data.restaurantId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const [items, lots, openCount] = await Promise.all([
    inventoryService.listItems(parsed.data.restaurantId),
    inventoryService.listLots(parsed.data.restaurantId),
    inventoryService.getOpenCount(parsed.data.restaurantId),
  ]);
  const text = [parsed.data.contextText, parsed.data.text].filter(Boolean).join(" ");

  try {
    const preview = await prepareInventoryQuickAdd({
      restaurantId: parsed.data.restaurantId,
      text,
      items,
      lots,
      openCount,
    });

    return NextResponse.json({ preview });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "quick-add-preview-failed" }, { status: 400 });
  }
}

async function requireInventoryAccess(restaurantId: string) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, error: "unauthorized", status: 401 };
  }

  const { data: profile } = await supabase.from("profiles").select("global_role").eq("id", userData.user.id).maybeSingle();
  if (profile?.global_role === "superadmin") {
    return { ok: true as const };
  }

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id,status,deleted_at")
    .eq("id", restaurantId)
    .is("deleted_at", null)
    .eq("status", "active")
    .maybeSingle();

  if (!restaurant) {
    return { ok: false as const, error: "restaurant-not-found", status: 404 };
  }

  const { data: membership } = await supabase
    .from("restaurant_memberships")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .in("role", ["restaurant_admin", "cashier"])
    .maybeSingle();

  if (!membership) {
    return { ok: false as const, error: "inventory-access-denied", status: 403 };
  }

  return { ok: true as const };
}
