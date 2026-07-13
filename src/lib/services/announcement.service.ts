import { createClient } from "@/lib/supabase/server";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { RestaurantAnnouncement } from "@/types/restaurant.types";

type AnnouncementRow = {
  id: string;
  restaurant_id: string;
  type: "announcement" | "closure";
  title: string;
  body: string | null;
  image_url: string | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function mapAnnouncement(row: AnnouncementRow): RestaurantAnnouncement {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    type: row.type,
    title: row.title,
    body: row.body ?? "",
    imageUrl: row.image_url ?? "",
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? undefined,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const announcementService = {
  async listForAdmin(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("restaurant_announcements")
      .select("id,restaurant_id,type,title,body,image_url,starts_at,ends_at,is_active,created_at,updated_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(12);

    if (error || !data?.length) {
      return [];
    }

    return (data as AnnouncementRow[]).map(mapAnnouncement);
  },

  async listCurrentPublic(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = createPublicServerClient();
    if (!supabase) {
      return [];
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("restaurant_announcements")
      .select("id,restaurant_id,type,title,body,image_url,starts_at,ends_at,is_active,created_at,updated_at")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("type", { ascending: false })
      .order("starts_at", { ascending: false })
      .limit(3);

    if (error || !data?.length) {
      return [];
    }

    return (data as AnnouncementRow[]).map(mapAnnouncement);
  },

  async hasActiveClosure(restaurantId: string) {
    const announcements = await this.listCurrentPublic(restaurantId);
    return announcements.some((announcement) => announcement.type === "closure");
  },
};
