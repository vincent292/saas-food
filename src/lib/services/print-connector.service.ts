import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { RestaurantPrintConnector } from "@/types/restaurant.types";

type PrintConnectorRow = {
  id: string;
  restaurant_id: string;
  token: string;
  linked_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function mapPrintConnector(row: PrintConnectorRow): RestaurantPrintConnector {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    token: row.token,
    status: row.linked_at ? "linked" : "token_active",
    createdAt: row.created_at,
    linkedAt: row.linked_at ?? undefined,
    lastSeenAt: row.last_seen_at ?? undefined,
  };
}

function generateConnectorToken() {
  return `ypw_${randomBytes(32).toString("base64url")}`;
}

export const printConnectorService = {
  async getActiveForRestaurant(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("restaurant_print_connectors")
      .select("id,restaurant_id,token,linked_at,last_seen_at,revoked_at,created_at")
      .eq("restaurant_id", restaurantId)
      .is("revoked_at", null)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapPrintConnector(data);
  },

  async generateForRestaurant(restaurantId: string, userId: string) {
    const admin = createAdminClient();
    if (!admin) {
      throw new Error("service-role-required");
    }

    const { data, error } = await admin
      .from("restaurant_print_connectors")
      .upsert(
        {
          restaurant_id: restaurantId,
          token: generateConnectorToken(),
          linked_at: null,
          last_seen_at: null,
          revoked_at: null,
          revoked_by: null,
          created_by: userId,
        },
        { onConflict: "restaurant_id" },
      )
      .select("id,restaurant_id,token,linked_at,last_seen_at,revoked_at,created_at")
      .single();

    if (error || !data) {
      throw new Error(error?.code ?? "print-token-generate-failed");
    }

    return mapPrintConnector(data);
  },

  async revokeForRestaurant(restaurantId: string, userId: string) {
    const admin = createAdminClient();
    if (!admin) {
      throw new Error("service-role-required");
    }

    const { error } = await admin
      .from("restaurant_print_connectors")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: userId,
      })
      .eq("restaurant_id", restaurantId)
      .is("revoked_at", null);

    if (error) {
      throw new Error(error.code);
    }
  },

  async getBootstrapByToken(token: string) {
    const admin = createAdminClient();
    if (!admin) {
      throw new Error("service-role-required");
    }

    const { data: connector, error: connectorError } = await admin
      .from("restaurant_print_connectors")
      .select("restaurant_id,linked_at")
      .eq("token", token)
      .is("revoked_at", null)
      .maybeSingle();

    if (connectorError || !connector) {
      return null;
    }

    const [{ data: restaurant, error: restaurantError }, { data: settings, error: settingsError }] = await Promise.all([
      admin
        .from("restaurants")
        .select("id,slug,name")
        .eq("id", connector.restaurant_id)
        .is("deleted_at", null)
        .maybeSingle(),
      admin
        .from("restaurant_settings")
        .select("print_format,auto_print_kitchen,print_logo")
        .eq("restaurant_id", connector.restaurant_id)
        .maybeSingle(),
    ]);

    if (restaurantError || settingsError || !restaurant) {
      return null;
    }

    const now = new Date().toISOString();
    await admin
      .from("restaurant_print_connectors")
      .update({
        linked_at: connector.linked_at ?? now,
        last_seen_at: now,
      })
      .eq("restaurant_id", connector.restaurant_id)
      .eq("token", token)
      .is("revoked_at", null);

    return {
      restaurantId: restaurant.id,
      restaurantSlug: restaurant.slug,
      restaurantName: restaurant.name,
      printFormat: settings?.print_format ?? "thermal_80",
      autoPrintKitchen: settings?.auto_print_kitchen ?? false,
      printLogo: settings?.print_logo ?? true,
    };
  },
};
