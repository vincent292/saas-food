import { notFound } from "next/navigation";
import { WhatsAppCrmClient } from "@/components/whatsapp/WhatsAppCrmClient";
import { restaurantService } from "@/lib/services/restaurant.service";
import { authService } from "@/lib/services/auth.service";
import { membershipService } from "@/lib/services/membership.service";
import { whatsappCrmService } from "@/lib/services/whatsapp-crm.service";

export default async function WhatsAppCrmPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ conversation?: string; sent?: string; handoff?: string; released?: string; replySaved?: string; replyDeleted?: string; error?: string }>;
}) {
  const [{ restaurantId }, query] = await Promise.all([params, searchParams]);
  const restaurantPromise = restaurantService.getWorkspaceById(restaurantId);
  const restaurant = await restaurantPromise;

  if (!restaurant) {
    notFound();
  }

  const [workspace, profile] = await Promise.all([
    whatsappCrmService.getWorkspace(restaurant.id, query.conversation),
    authService.getCurrentProfile(),
  ]);
  const membership = profile && profile.globalRole !== "superadmin"
    ? (await membershipService.listActiveRestaurantsForUser(profile.id)).find((item) => item.restaurantId === restaurant.id)
    : undefined;
  const canViewUsage = profile?.globalRole === "superadmin" || restaurant.ownerUserId === profile?.id || membership?.role === "restaurant_admin";
  const feedback = query.error ?? (query.sent ? "sent" : query.handoff ? "handoff" : query.released ? "released" : query.replySaved ? "replySaved" : query.replyDeleted ? "replyDeleted" : "");

  return <WhatsAppCrmClient canViewUsage={canViewUsage} feedback={feedback} restaurant={restaurant} workspace={workspace} />;
}
