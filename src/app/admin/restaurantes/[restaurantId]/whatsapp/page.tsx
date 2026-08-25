import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { WhatsAppCrmClient } from "@/components/whatsapp/WhatsAppCrmClient";
import { modulesForAdminLayout } from "@/lib/modules";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
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
  const accessPromise = restaurantAccessService.claimOrRedirect(restaurantId, `/admin/restaurantes/${restaurantId}/whatsapp`, {
    skipRestaurantLookup: true,
  });
  const [restaurant] = await Promise.all([restaurantPromise, accessPromise]);

  if (!restaurant) {
    notFound();
  }

  const workspace = await whatsappCrmService.getWorkspace(restaurant.id, query.conversation);
  const feedback = query.error ?? (query.sent ? "sent" : query.handoff ? "handoff" : query.released ? "released" : query.replySaved ? "replySaved" : query.replyDeleted ? "replyDeleted" : "");

  return (
    <AdminLayout
      active="whatsapp"
      enabledModules={modulesForAdminLayout(restaurant)}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      restaurantStatus={restaurant.status}
      title="CRM WhatsApp"
    >
      <WhatsAppCrmClient feedback={feedback} restaurant={restaurant} workspace={workspace} />
    </AdminLayout>
  );
}
