import { authService } from "./auth.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownerBillingService } from "./owner-billing.service";

// Resolve account access from the authenticated user, never from a submitted
// owner ID. Admin reads are intentionally limited to billing, not operations.
export async function getMyBillingAccounts(restaurantId?: string) {
  const profile = await authService.getCurrentProfile();
  const admin = createAdminClient();
  if (!profile || profile.isCustomerAccount || profile.globalRole === "superadmin" || !admin) return [];
  const { data: memberships, error: membershipError } = await admin.from("restaurant_memberships")
    .select("restaurant_id").eq("user_id", profile.id).eq("is_active", true);
  if (membershipError) throw new Error("billing-access-check-failed");
  const ids = (memberships ?? []).map((membership) => membership.restaurant_id);
  const [{ data: owned, error: ownedError }, { data: linked, error: linkedError }] = await Promise.all([
    admin.from("restaurants").select("id,name,owner_user_id").eq("owner_user_id", profile.id).is("deleted_at", null),
    ids.length ? admin.from("restaurants").select("id,name,owner_user_id").in("id", ids).is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
  ]);
  if (ownedError || linkedError) throw new Error("billing-access-check-failed");
  const restaurants = [...(owned ?? []), ...(linked ?? [])].filter((restaurant) => !restaurantId || restaurant.id === restaurantId);
  const owners = new Map<string, string>();
  for (const restaurant of restaurants) if (restaurant.owner_user_id) owners.set(restaurant.owner_user_id, restaurant.name);
  return Promise.all([...owners].map(async ([ownerId, name]) => ({ ownerId, name, isOwner: ownerId === profile.id,
    billing: await ownerBillingService.getSnapshot(ownerId, { enforce: false }) })));
}
