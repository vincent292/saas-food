import type { WhatsAppCrmBotTone } from "@/types/whatsapp-crm.types";

export type PlatformWhatsAppSettings = {
  botEnabled: boolean;
  responseTone: WhatsAppCrmBotTone;
  welcomeMessage: string;
  restaurantPickerMessage: string;
  fallbackMessage: string;
  humanHandoffMessage: string;
  draftTimeoutMinutes: number;
  updatedAt?: string;
};
