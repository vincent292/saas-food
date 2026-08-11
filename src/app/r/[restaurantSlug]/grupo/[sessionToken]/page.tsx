import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { GroupOrderSessionClient, type GroupOrderItemView, type GroupOrderParticipantView, type GroupOrderSessionView } from "@/components/group-orders/GroupOrderSessionClient";
import { RestaurantThemeProvider } from "@/components/restaurant/RestaurantThemeProvider";
import { categoryService } from "@/lib/services/category.service";
import { productService } from "@/lib/services/product.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { settingsService } from "@/lib/services/settings.service";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProductConfigMap } from "@/components/public-menu/PublicRestaurantOrderClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const getGroupOrderCatalog = unstable_cache(
  async (restaurantId: string) => {
    const [categories, products, configuration] = await Promise.all([
      categoryService.listPublicByRestaurant(restaurantId),
      productService.listPublicAvailableByRestaurant(restaurantId),
      productService.listPublicConfigurationsByRestaurant(restaurantId),
    ]);

    return { categories, products, configuration };
  },
  ["group-order-catalog-v1"],
  { revalidate: 60 },
);

export default async function GroupOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string; sessionToken: string }>;
  searchParams: Promise<{ host?: string; participant?: string; error?: string }>;
}) {
  const [{ restaurantSlug, sessionToken }, query] = await Promise.all([params, searchParams]);
  const restaurant = await restaurantService.getPublicBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  const admin = createAdminClient();
  if (!admin) {
    notFound();
  }

  const { data: sessionRow } = await admin
    .from("group_order_sessions")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .eq("public_token", sessionToken)
    .maybeSingle();

  if (!sessionRow) {
    notFound();
  }

  const [catalog, participantRows, itemRows, settings, deliveryZones] = await Promise.all([
    getGroupOrderCatalog(restaurant.id),
    admin.from("group_order_participants").select("*").eq("session_id", sessionRow.id).order("created_at", { ascending: true }),
    admin.from("group_order_items").select("*").eq("session_id", sessionRow.id).order("created_at", { ascending: true }),
    settingsService.getPublicRestaurantSettings(restaurant.id),
    restaurantService.listPublicDeliveryZones(restaurant.id),
  ]);
  const stockAvailability = await productService.listPublicStockAvailability(restaurant, catalog.products);
  const rawParticipants = participantRows.data ?? [];
  const currentParticipant = query.participant
    ? rawParticipants.find((participant) => participant.participant_token === query.participant)
    : undefined;
  const validatedHostAccessToken = query.host === sessionRow.host_access_token ? query.host : undefined;
  let submittedOrderTrackingToken: string | undefined;
  if (sessionRow.submitted_order_id && (validatedHostAccessToken || currentParticipant)) {
    const { data: submittedOrder } = await admin
      .from("orders")
      .select("tracking_token")
      .eq("id", sessionRow.submitted_order_id)
      .maybeSingle();
    submittedOrderTrackingToken = submittedOrder?.tracking_token ?? undefined;
  }
  const participants = rawParticipants.map<GroupOrderParticipantView>((participant) => {
    const canSeePrivateFields = Boolean(validatedHostAccessToken || participant.id === currentParticipant?.id);
    return {
    id: participant.id,
    displayName: participant.display_name,
    phone: canSeePrivateFields ? (participant.phone ?? undefined) : undefined,
    role: participant.role,
    paymentStatus: participant.payment_status,
    paymentReceiptUrl: canSeePrivateFields ? (participant.payment_receipt_url ?? undefined) : undefined,
    paymentReceiptUploadedAt: canSeePrivateFields ? (participant.payment_receipt_uploaded_at ?? undefined) : undefined,
    };
  });
  const items = (itemRows.data ?? []).map<GroupOrderItemView>((item) => ({
    id: item.id,
    participantId: item.participant_id,
    productName: item.product_name,
    unitPrice: Number(item.unit_price),
    quantity: item.quantity,
    subtotal: Number(item.subtotal),
    notes: item.notes ?? undefined,
  }));
  // eslint-disable-next-line react-hooks/purity
  const expired = new Date(sessionRow.expires_at).getTime() <= Date.now();
  const sessionStatus =
    expired && sessionRow.status !== "submitted" && sessionRow.status !== "cancelled"
      ? "expired"
      : sessionRow.status;
  const session: GroupOrderSessionView = {
    id: sessionRow.id,
    publicToken: sessionRow.public_token,
    hostName: sessionRow.host_name,
    hostPhone: sessionRow.host_phone ?? undefined,
    collectMode: sessionRow.collect_mode,
    hostQrUrl: sessionRow.host_qr_url ?? undefined,
    multisiteEnabled: Boolean(sessionRow.multisite_enabled),
    multisiteRadiusKm: Number(sessionRow.multisite_radius_km ?? 3),
    multisiteMaxPickups: Number(sessionRow.multisite_max_pickups ?? 3),
    status: sessionStatus,
    expiresAt: sessionRow.expires_at,
    submittedOrderId: sessionRow.submitted_order_id ?? undefined,
    submittedOrderTrackingToken,
    subtotal: Number(sessionRow.subtotal),
    deliveryFee: Number(sessionRow.delivery_fee),
    total: Number(sessionRow.total),
  };
  const configByProduct: ProductConfigMap = {};
  for (const product of catalog.products) {
    configByProduct[product.id] = {
      variants: catalog.configuration.variants.filter((variant) => variant.productId === product.id && variant.isActive),
      optionGroups: catalog.configuration.optionGroups
        .filter((group) => group.productId === product.id && group.isActive)
        .map((group) => ({ ...group, options: group.options.filter((option) => option.isActive) })),
    };
  }

  return (
    <RestaurantThemeProvider>
      <GroupOrderSessionClient
        categories={catalog.categories}
        configuration={configByProduct}
        currentParticipantId={currentParticipant?.id}
        initialHostAccessToken={validatedHostAccessToken}
        initialParticipantToken={currentParticipant ? query.participant : undefined}
        items={items}
        orderError={query.error}
        participants={participants}
        products={catalog.products}
        restaurant={restaurant}
        session={session}
        settings={settings}
        deliveryZones={deliveryZones}
        stockAvailability={stockAvailability}
      />
    </RestaurantThemeProvider>
  );
}
