import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { UserRestaurantMembership } from "@/lib/services/membership.service";
import type {
  OwnerRiderBranch,
  RestaurantRider,
  RiderApplication,
  RiderInvitePublic,
  RiderPaymentSettings,
  RiderRenewalRequest,
} from "@/types/rider.types";

const riderPaymentDefaultAmount = 30;
const riderPaymentDefaultCurrency = "BOB";

type RiderPaymentRow = {
  amount: number | string | null;
  currency: string | null;
  qr_note: string | null;
  qr_url: string | null;
  updated_at: string | null;
};

type RiderInviteRow = {
  id: string;
  invite_token: string;
  restaurant_id: string;
};

type RiderApplicationRow = {
  id: string;
  restaurant_id: string;
  full_name: string;
  email: string;
  phone: string;
  document_number: string;
  plate_number: string;
  vehicle_owner_name: string;
  ruat_number: string;
  ci_front_url: string;
  ci_back_url: string;
  ruat_front_url: string;
  ruat_back_url: string;
  owner_document_url: string;
  plate_photo_url: string;
  payment_proof_url: string;
  payment_proof_file_name: string | null;
  payment_proof_file_size: number | string | null;
  payment_amount: number | string | null;
  payment_currency: string | null;
  payment_qr_url: string | null;
  payment_qr_note: string | null;
  status: RiderApplication["status"];
  resolution_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type RestaurantRiderRow = {
  id: string;
  restaurant_id: string;
  full_name: string;
  email: string;
  phone: string;
  document_number: string;
  plate_number: string;
  vehicle_owner_name: string;
  ruat_number: string;
  status: RestaurantRider["status"];
  membership_amount: number | string | null;
  membership_currency: string | null;
  membership_started_at: string;
  membership_valid_until: string;
  approved_at: string;
};

type RiderRenewalRequestRow = {
  id: string;
  restaurant_rider_id: string;
  restaurant_id: string;
  payment_amount: number | string | null;
  payment_currency: string | null;
  payment_qr_url: string | null;
  payment_qr_note: string | null;
  payment_proof_url: string;
  payment_proof_file_name: string | null;
  payment_proof_file_size: number | string | null;
  status: RiderRenewalRequest["status"];
  approved_valid_until: string | null;
  reviewed_at: string | null;
  resolution_notes: string | null;
  created_at: string;
};

function mapPayment(row?: RiderPaymentRow | null): RiderPaymentSettings {
  return {
    amount: Number(row?.amount ?? riderPaymentDefaultAmount),
    currency: row?.currency ?? riderPaymentDefaultCurrency,
    qrNote: row?.qr_note ?? undefined,
    qrUrl: row?.qr_url ?? undefined,
    updatedAt: row?.updated_at ?? undefined,
  };
}

function mapRestaurantRider(
  row: RestaurantRiderRow,
  restaurantNames: Map<string, string>,
  pendingRenewalRiderIds: Set<string>,
): RestaurantRider {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    restaurantName: restaurantNames.get(row.restaurant_id) ?? "Restaurante",
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    documentNumber: row.document_number,
    plateNumber: row.plate_number,
    vehicleOwnerName: row.vehicle_owner_name,
    ruatNumber: row.ruat_number,
    status: row.status,
    membershipAmount: Number(row.membership_amount ?? riderPaymentDefaultAmount),
    membershipCurrency: row.membership_currency ?? riderPaymentDefaultCurrency,
    membershipStartedAt: row.membership_started_at,
    membershipValidUntil: row.membership_valid_until,
    approvedAt: row.approved_at,
    hasPendingRenewal: pendingRenewalRiderIds.has(row.id),
  };
}

function mapApplication(row: RiderApplicationRow, restaurantNames: Map<string, string>): RiderApplication {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    restaurantName: restaurantNames.get(row.restaurant_id) ?? "Restaurante",
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    documentNumber: row.document_number,
    plateNumber: row.plate_number,
    vehicleOwnerName: row.vehicle_owner_name,
    ruatNumber: row.ruat_number,
    ciFrontUrl: row.ci_front_url,
    ciBackUrl: row.ci_back_url,
    ruatFrontUrl: row.ruat_front_url,
    ruatBackUrl: row.ruat_back_url,
    ownerDocumentUrl: row.owner_document_url,
    platePhotoUrl: row.plate_photo_url,
    paymentProofUrl: row.payment_proof_url,
    paymentProofFileName: row.payment_proof_file_name ?? undefined,
    paymentProofFileSize: Number(row.payment_proof_file_size ?? 0),
    paymentAmount: Number(row.payment_amount ?? riderPaymentDefaultAmount),
    paymentCurrency: row.payment_currency ?? riderPaymentDefaultCurrency,
    paymentQrUrl: row.payment_qr_url ?? undefined,
    paymentQrNote: row.payment_qr_note ?? undefined,
    status: row.status,
    resolutionNotes: row.resolution_notes ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    createdAt: row.created_at,
  };
}

function mapRenewalRequest(
  row: RiderRenewalRequestRow,
  restaurantNames: Map<string, string>,
  riders: Map<string, Pick<RestaurantRider, "fullName" | "phone" | "plateNumber">>,
): RiderRenewalRequest {
  const rider = riders.get(row.restaurant_rider_id);

  return {
    id: row.id,
    restaurantRiderId: row.restaurant_rider_id,
    restaurantId: row.restaurant_id,
    restaurantName: restaurantNames.get(row.restaurant_id) ?? "Restaurante",
    riderName: rider?.fullName ?? "Rider",
    riderPhone: rider?.phone ?? "",
    riderPlateNumber: rider?.plateNumber ?? "",
    paymentAmount: Number(row.payment_amount ?? riderPaymentDefaultAmount),
    paymentCurrency: row.payment_currency ?? riderPaymentDefaultCurrency,
    paymentQrUrl: row.payment_qr_url ?? undefined,
    paymentQrNote: row.payment_qr_note ?? undefined,
    paymentProofUrl: row.payment_proof_url,
    paymentProofFileName: row.payment_proof_file_name ?? undefined,
    paymentProofFileSize: Number(row.payment_proof_file_size ?? 0),
    status: row.status,
    approvedValidUntil: row.approved_valid_until ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    resolutionNotes: row.resolution_notes ?? undefined,
    createdAt: row.created_at,
  };
}

function groupByRestaurant<T extends { restaurantId: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const current = grouped.get(item.restaurantId) ?? [];
    current.push(item);
    grouped.set(item.restaurantId, current);
  }

  return grouped;
}

export const riderService = {
  async getPaymentSettings(): Promise<RiderPaymentSettings> {
    if (!hasSupabaseEnv()) {
      return mapPayment(null);
    }

    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());
    const { data } = await supabase.from("platform_rider_payment_settings").select("amount,currency,qr_url,qr_note,updated_at").eq("id", true).maybeSingle();
    return mapPayment(data as RiderPaymentRow | null);
  },

  async ensureRestaurantInvite(restaurantId: string, actorUserId?: string | null): Promise<RiderInviteRow | null> {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const supabase = createAdminClient() ?? (await createClient());
    const { data: existing } = await supabase
      .from("restaurant_rider_invites")
      .select("id,restaurant_id,invite_token")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    if (existing) {
      if (!existing.invite_token) {
        return null;
      }

      await supabase.from("restaurant_rider_invites").update({ is_active: true }).eq("id", existing.id);
      return existing as RiderInviteRow;
    }

    const { data } = await supabase
      .from("restaurant_rider_invites")
      .insert({
        created_by: actorUserId ?? null,
        is_active: true,
        restaurant_id: restaurantId,
      })
      .select("id,restaurant_id,invite_token")
      .single();

    return (data as RiderInviteRow | null) ?? null;
  },

  async getPublicInvite(inviteToken: string): Promise<RiderInvitePublic | null> {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const admin = createAdminClient();
    if (!admin) {
      return null;
    }

    const { data: invite } = await admin
      .from("restaurant_rider_invites")
      .select("id,restaurant_id,invite_token,is_active")
      .eq("invite_token", inviteToken)
      .eq("is_active", true)
      .maybeSingle();

    if (!invite) {
      return null;
    }

    const [{ data: restaurant }, payment] = await Promise.all([
      admin
        .from("restaurants")
        .select("id,name,slug,status,logo_url,city,deleted_at")
        .eq("id", invite.restaurant_id)
        .eq("status", "active")
        .is("deleted_at", null)
        .maybeSingle(),
      this.getPaymentSettings(),
    ]);

    if (!restaurant) {
      return null;
    }

    return {
      id: invite.id,
      inviteToken: invite.invite_token,
      payment,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        logoUrl: restaurant.logo_url ?? undefined,
        city: restaurant.city ?? undefined,
      },
    };
  },

  async listApplications(limit = 80): Promise<RiderApplication[]> {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("rider_applications")
      .select(
        "id,restaurant_id,full_name,email,phone,document_number,plate_number,vehicle_owner_name,ruat_number,ci_front_url,ci_back_url,ruat_front_url,ruat_back_url,owner_document_url,plate_photo_url,payment_proof_url,payment_proof_file_name,payment_proof_file_size,payment_amount,payment_currency,payment_qr_url,payment_qr_note,status,resolution_notes,reviewed_at,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data?.length) {
      return [];
    }

    const restaurantIds = Array.from(new Set(data.map((application) => application.restaurant_id)));
    const { data: restaurants } = restaurantIds.length ? await supabase.from("restaurants").select("id,name").in("id", restaurantIds) : { data: [] };
    const names = new Map((restaurants ?? []).map((restaurant) => [restaurant.id, restaurant.name]));

    return (data as RiderApplicationRow[]).map((application) => mapApplication(application, names));
  },

  async listRestaurantRiders(restaurantIds?: string[], limit = 200): Promise<RestaurantRider[]> {
    if (!hasSupabaseEnv()) {
      return [];
    }

    if (restaurantIds && restaurantIds.length === 0) {
      return [];
    }

    const supabase = await createClient();
    let query = supabase
      .from("restaurant_riders")
      .select(
        "id,restaurant_id,full_name,email,phone,document_number,plate_number,vehicle_owner_name,ruat_number,status,membership_amount,membership_currency,membership_started_at,membership_valid_until,approved_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (restaurantIds?.length) {
      query = query.in("restaurant_id", restaurantIds);
    }

    const { data, error } = await query;

    if (error || !data?.length) {
      return [];
    }

    const resolvedRestaurantIds = Array.from(new Set(data.map((rider) => rider.restaurant_id)));
    const riderIds = data.map((rider) => rider.id);
    const [{ data: restaurants }, { data: pendingRenewals }] = await Promise.all([
      supabase.from("restaurants").select("id,name").in("id", resolvedRestaurantIds),
      supabase.from("rider_renewal_requests").select("restaurant_rider_id").in("restaurant_rider_id", riderIds).eq("status", "submitted"),
    ]);
    const names = new Map((restaurants ?? []).map((restaurant) => [restaurant.id, restaurant.name]));
    const pendingRenewalRiderIds = new Set((pendingRenewals ?? []).map((renewal) => renewal.restaurant_rider_id));

    return (data as RestaurantRiderRow[]).map((rider) => mapRestaurantRider(rider, names, pendingRenewalRiderIds));
  },

  async listRenewalRequests(restaurantIds?: string[], limit = 120): Promise<RiderRenewalRequest[]> {
    if (!hasSupabaseEnv()) {
      return [];
    }

    if (restaurantIds && restaurantIds.length === 0) {
      return [];
    }

    const supabase = await createClient();
    let query = supabase
      .from("rider_renewal_requests")
      .select(
        "id,restaurant_rider_id,restaurant_id,payment_amount,payment_currency,payment_qr_url,payment_qr_note,payment_proof_url,payment_proof_file_name,payment_proof_file_size,status,approved_valid_until,reviewed_at,resolution_notes,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (restaurantIds?.length) {
      query = query.in("restaurant_id", restaurantIds);
    }

    const { data, error } = await query;

    if (error || !data?.length) {
      return [];
    }

    const resolvedRestaurantIds = Array.from(new Set(data.map((renewal) => renewal.restaurant_id)));
    const riderIds = Array.from(new Set(data.map((renewal) => renewal.restaurant_rider_id)));
    const [{ data: restaurants }, { data: riders }] = await Promise.all([
      supabase.from("restaurants").select("id,name").in("id", resolvedRestaurantIds),
      supabase.from("restaurant_riders").select("id,full_name,phone,plate_number").in("id", riderIds),
    ]);
    const names = new Map((restaurants ?? []).map((restaurant) => [restaurant.id, restaurant.name]));
    const riderMap = new Map(
      (riders ?? []).map((rider) => [
        rider.id,
        {
          fullName: rider.full_name,
          phone: rider.phone,
          plateNumber: rider.plate_number,
        },
      ]),
    );

    return (data as RiderRenewalRequestRow[]).map((renewal) => mapRenewalRequest(renewal, names, riderMap));
  },

  async getOwnerRiderBranches(memberships: UserRestaurantMembership[], actorUserId: string, origin: string): Promise<OwnerRiderBranch[]> {
    if (!memberships.length) {
      return [];
    }

    const restaurantIds = memberships.map((membership) => membership.restaurant.id);
    const [invites, riders, renewalRequests] = await Promise.all([
      Promise.all(restaurantIds.map((restaurantId) => this.ensureRestaurantInvite(restaurantId, actorUserId))),
      this.listRestaurantRiders(restaurantIds),
      this.listRenewalRequests(restaurantIds),
    ]);
    const invitesByRestaurant = new Map(
      invites.flatMap((invite) => (invite ? [[invite.restaurant_id, invite] as const] : [])),
    );
    const ridersByRestaurant = groupByRestaurant(riders);
    const renewalsByRestaurant = groupByRestaurant(renewalRequests);

    return memberships.map((membership) => {
      const invite = invitesByRestaurant.get(membership.restaurant.id);

      return {
        restaurantId: membership.restaurant.id,
        restaurantName: membership.restaurant.name,
        restaurantCity: membership.restaurant.city || undefined,
        inviteUrl: invite ? `${origin}/riders/${invite.invite_token}` : "",
        riders: ridersByRestaurant.get(membership.restaurant.id) ?? [],
        renewalRequests: renewalsByRestaurant.get(membership.restaurant.id) ?? [],
      };
    });
  },
};
