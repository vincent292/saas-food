import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_DELIVERY_RATE_TIERS, type DeliveryRateTier } from "@/lib/delivery-rates";
import { createAdminClient } from "@/lib/supabase/admin";

type DeliveryRateRow = {
  id: string;
  min_distance_km: number | string;
  max_distance_km: number | string;
  delivery_fee: number | string;
  is_active: boolean;
  sort_order: number;
};

function mapRate(row: DeliveryRateRow): DeliveryRateTier {
  return {
    id: row.id,
    minDistanceKm: Number(row.min_distance_km),
    maxDistanceKm: Number(row.max_distance_km),
    deliveryFee: Number(row.delivery_fee),
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

async function list(client: SupabaseClient | null = createAdminClient()): Promise<DeliveryRateTier[]> {
  if (!client) return DEFAULT_DELIVERY_RATE_TIERS;
  const { data, error } = await client
    .from("platform_delivery_rate_tiers")
    .select("id,min_distance_km,max_distance_km,delivery_fee,is_active,sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("min_distance_km");

  if (error || !data?.length) return DEFAULT_DELIVERY_RATE_TIERS;
  return (data as DeliveryRateRow[]).map(mapRate);
}

export const deliveryRateService = { list };

