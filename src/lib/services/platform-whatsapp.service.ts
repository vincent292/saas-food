import { createAdminClient } from "@/lib/supabase/admin";
import type { PlatformWhatsAppSettings } from "@/types/platform-whatsapp.types";
import type { WhatsAppCrmBotTone } from "@/types/whatsapp-crm.types";

type PlatformWhatsAppSettingsRow = {
  id: string;
  bot_enabled: boolean;
  response_tone: WhatsAppCrmBotTone;
  welcome_message: string | null;
  restaurant_picker_message: string | null;
  fallback_message: string | null;
  human_handoff_message: string | null;
  draft_timeout_minutes: number;
  updated_at: string;
};

export const DEFAULT_PLATFORM_WHATSAPP_SETTINGS: PlatformWhatsAppSettings = {
  botEnabled: true,
  responseTone: "friendly",
  welcomeMessage: "",
  restaurantPickerMessage: "",
  fallbackMessage: "",
  humanHandoffMessage: "",
  draftTimeoutMinutes: 20,
};

function mapSettings(row?: PlatformWhatsAppSettingsRow | null): PlatformWhatsAppSettings {
  if (!row) {
    return DEFAULT_PLATFORM_WHATSAPP_SETTINGS;
  }

  return {
    botEnabled: row.bot_enabled,
    responseTone: row.response_tone,
    welcomeMessage: row.welcome_message ?? "",
    restaurantPickerMessage: row.restaurant_picker_message ?? "",
    fallbackMessage: row.fallback_message ?? "",
    humanHandoffMessage: row.human_handoff_message ?? "",
    draftTimeoutMinutes: Number(row.draft_timeout_minutes ?? DEFAULT_PLATFORM_WHATSAPP_SETTINGS.draftTimeoutMinutes),
    updatedAt: row.updated_at,
  };
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export const platformWhatsAppService = {
  async getSettings() {
    const admin = createAdminClient();
    if (!admin) {
      return DEFAULT_PLATFORM_WHATSAPP_SETTINGS;
    }

    const { data, error } = await admin
      .from("platform_whatsapp_settings")
      .select("id,bot_enabled,response_tone,welcome_message,restaurant_picker_message,fallback_message,human_handoff_message,draft_timeout_minutes,updated_at")
      .eq("id", "default")
      .maybeSingle();

    if (error) {
      return DEFAULT_PLATFORM_WHATSAPP_SETTINGS;
    }

    return mapSettings(data as PlatformWhatsAppSettingsRow | null);
  },

  async saveSettings({
    botEnabled,
    responseTone,
    welcomeMessage,
    restaurantPickerMessage,
    fallbackMessage,
    humanHandoffMessage,
    draftTimeoutMinutes,
    userId,
  }: PlatformWhatsAppSettings & { userId?: string }) {
    const admin = createAdminClient();
    if (!admin) {
      return { ok: false, error: "supabase-not-configured" };
    }

    const { error } = await admin.from("platform_whatsapp_settings").upsert(
      {
        id: "default",
        bot_enabled: botEnabled,
        response_tone: responseTone,
        welcome_message: emptyToNull(welcomeMessage),
        restaurant_picker_message: emptyToNull(restaurantPickerMessage),
        fallback_message: emptyToNull(fallbackMessage),
        human_handoff_message: emptyToNull(humanHandoffMessage),
        draft_timeout_minutes: draftTimeoutMinutes,
        updated_by: userId ?? null,
        created_by: userId ?? null,
      },
      { onConflict: "id" },
    );

    return error ? { ok: false, error: error.code || "platform-whatsapp-save-failed" } : { ok: true };
  },
};
