import { notFound } from "next/navigation";
import { WhatsAppCrmClient } from "@/components/whatsapp/WhatsAppCrmClient";
import { restaurantService } from "@/lib/services/restaurant.service";
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

  const workspace = await whatsappCrmService.getWorkspace(restaurant.id, query.conversation);
  const feedback = query.error ?? (query.sent ? "sent" : query.handoff ? "handoff" : query.released ? "released" : query.replySaved ? "replySaved" : query.replyDeleted ? "replyDeleted" : "");

  return <WhatsAppCrmClient feedback={feedback} restaurant={restaurant} workspace={workspace} />;
}
