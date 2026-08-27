"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { whatsappCrmService } from "@/lib/services/whatsapp-crm.service";
import { absoluteUrl } from "@/lib/seo/site-url";
import { createClient } from "@/lib/supabase/server";

const conversationActionSchema = z.object({
  restaurantId: z.string().uuid(),
  conversationId: z.string().uuid(),
});

const sendMessageSchema = conversationActionSchema.extend({
  body: z.string().trim().min(1).max(4096),
});

const quickReplySchema = z.object({
  restaurantId: z.string().uuid(),
  conversationId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(2).max(1200),
});

const quickReplyIdSchema = z.object({
  restaurantId: z.string().uuid(),
  conversationId: z.string().uuid().optional().or(z.literal("")),
  quickReplyId: z.string().uuid(),
});

const botSettingsSchema = z.object({
  restaurantId: z.string().uuid(),
  conversationId: z.string().uuid().optional().or(z.literal("")),
  botEnabled: z.boolean(),
  responseTone: z.enum(["friendly", "direct", "formal"]),
  greetingMessage: z.string().trim().max(600),
  menuIntroMessage: z.string().trim().max(600),
  checkoutMessage: z.string().trim().max(240),
  locationRequestMessage: z.string().trim().max(400),
  qrPaymentMessage: z.string().trim().max(400),
  receiptRequestMessage: z.string().trim().max(300),
  fallbackMessage: z.string().trim().max(600),
  humanHandoffMessage: z.string().trim().max(600),
});

function crmPath(restaurantId: string, conversationId?: string, suffix = "") {
  const params = conversationId ? `?conversation=${conversationId}${suffix}` : suffix ? `?${suffix.replace(/^[?&]/, "")}` : "";
  return `/admin/restaurantes/${restaurantId}/whatsapp${params}`;
}

async function requireRestaurantCrmAccess(restaurantId: string, conversationId?: string) {
  await restaurantAccessService.claimOrRedirect(restaurantId, crmPath(restaurantId, conversationId));
}

async function currentUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id;
}

export async function sendWhatsAppCrmMessageAction(formData: FormData) {
  const parsed = sendMessageSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    redirect("/admin?error=invalid-whatsapp-message");
  }

  await requireRestaurantCrmAccess(parsed.data.restaurantId, parsed.data.conversationId);
  const result = await whatsappCrmService.sendTextMessage({
    restaurantId: parsed.data.restaurantId,
    conversationId: parsed.data.conversationId,
    body: parsed.data.body,
    source: "crm_manual",
  });

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/whatsapp`);
  redirect(crmPath(parsed.data.restaurantId, parsed.data.conversationId, result.ok ? "&sent=1" : `&error=${result.error}`));
}

export async function sendWhatsAppCrmMenuAction(formData: FormData) {
  const parsed = conversationActionSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    conversationId: formData.get("conversationId"),
  });

  if (!parsed.success) {
    redirect("/admin?error=invalid-whatsapp-conversation");
  }

  await requireRestaurantCrmAccess(parsed.data.restaurantId, parsed.data.conversationId);
  const restaurant = await restaurantService.getWorkspaceById(parsed.data.restaurantId);
  if (!restaurant) {
    redirect(crmPath(parsed.data.restaurantId, parsed.data.conversationId, "&error=restaurant-not-found"));
  }

  const result = await whatsappCrmService.sendTextMessage({
    restaurantId: parsed.data.restaurantId,
    conversationId: parsed.data.conversationId,
    body: `Te comparto el menu de ${restaurant.name}: ${absoluteUrl(`/r/${restaurant.slug}`)}`,
    source: "crm_menu",
  });

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/whatsapp`);
  redirect(crmPath(parsed.data.restaurantId, parsed.data.conversationId, result.ok ? "&sent=1" : `&error=${result.error}`));
}

export async function sendWhatsAppCrmLocationAction(formData: FormData) {
  const parsed = conversationActionSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    conversationId: formData.get("conversationId"),
  });

  if (!parsed.success) {
    redirect("/admin?error=invalid-whatsapp-conversation");
  }

  await requireRestaurantCrmAccess(parsed.data.restaurantId, parsed.data.conversationId);
  const restaurant = await restaurantService.getWorkspaceById(parsed.data.restaurantId);
  if (!restaurant) {
    redirect(crmPath(parsed.data.restaurantId, parsed.data.conversationId, "&error=restaurant-not-found"));
  }

  const locationText = [
    `Estamos en ${restaurant.address || restaurant.city || restaurant.name}.`,
    restaurant.addressReference ? `Referencia: ${restaurant.addressReference}.` : "",
    restaurant.mapsUrl ? `Mapa: ${restaurant.mapsUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await whatsappCrmService.sendTextMessage({
    restaurantId: parsed.data.restaurantId,
    conversationId: parsed.data.conversationId,
    body: locationText,
    source: "crm_location",
  });

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/whatsapp`);
  redirect(crmPath(parsed.data.restaurantId, parsed.data.conversationId, result.ok ? "&sent=1" : `&error=${result.error}`));
}

export async function takeWhatsAppCrmConversationAction(formData: FormData) {
  const parsed = conversationActionSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    conversationId: formData.get("conversationId"),
  });

  if (!parsed.success) {
    redirect("/admin?error=invalid-whatsapp-conversation");
  }

  await requireRestaurantCrmAccess(parsed.data.restaurantId, parsed.data.conversationId);
  const result = await whatsappCrmService.setHandoffState({
    restaurantId: parsed.data.restaurantId,
    conversationId: parsed.data.conversationId,
    handoff: true,
  });

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/whatsapp`);
  redirect(crmPath(parsed.data.restaurantId, parsed.data.conversationId, result.ok ? "&handoff=1" : `&error=${result.error}`));
}

export async function releaseWhatsAppCrmConversationAction(formData: FormData) {
  const parsed = conversationActionSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    conversationId: formData.get("conversationId"),
  });

  if (!parsed.success) {
    redirect("/admin?error=invalid-whatsapp-conversation");
  }

  await requireRestaurantCrmAccess(parsed.data.restaurantId, parsed.data.conversationId);
  const result = await whatsappCrmService.setHandoffState({
    restaurantId: parsed.data.restaurantId,
    conversationId: parsed.data.conversationId,
    handoff: false,
  });

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/whatsapp`);
  redirect(crmPath(parsed.data.restaurantId, parsed.data.conversationId, result.ok ? "&released=1" : `&error=${result.error}`));
}

export async function saveWhatsAppBotSettingsAction(formData: FormData) {
  const parsed = botSettingsSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    conversationId: formData.get("conversationId") || "",
    botEnabled: formData.get("botEnabled") === "on",
    responseTone: formData.get("responseTone"),
    greetingMessage: formData.get("greetingMessage") ?? "",
    menuIntroMessage: formData.get("menuIntroMessage") ?? "",
    checkoutMessage: formData.get("checkoutMessage") ?? "",
    locationRequestMessage: formData.get("locationRequestMessage") ?? "",
    qrPaymentMessage: formData.get("qrPaymentMessage") ?? "",
    receiptRequestMessage: formData.get("receiptRequestMessage") ?? "",
    fallbackMessage: formData.get("fallbackMessage") ?? "",
    humanHandoffMessage: formData.get("humanHandoffMessage") ?? "",
  });

  if (!parsed.success) {
    redirect("/admin?error=invalid-whatsapp-bot-settings");
  }

  const conversationId = parsed.data.conversationId || undefined;
  await requireRestaurantCrmAccess(parsed.data.restaurantId, conversationId);
  const result = await whatsappCrmService.saveBotSettings({
    restaurantId: parsed.data.restaurantId,
    botEnabled: parsed.data.botEnabled,
    responseTone: parsed.data.responseTone,
    greetingMessage: parsed.data.greetingMessage,
    menuIntroMessage: parsed.data.menuIntroMessage,
    checkoutMessage: parsed.data.checkoutMessage,
    locationRequestMessage: parsed.data.locationRequestMessage,
    qrPaymentMessage: parsed.data.qrPaymentMessage,
    receiptRequestMessage: parsed.data.receiptRequestMessage,
    fallbackMessage: parsed.data.fallbackMessage,
    humanHandoffMessage: parsed.data.humanHandoffMessage,
    userId: await currentUserId(),
  });

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/whatsapp`);
  redirect(crmPath(parsed.data.restaurantId, conversationId, result.ok ? "&botSaved=1" : `&error=${result.error}`));
}

export async function saveWhatsAppQuickReplyAction(formData: FormData) {
  const parsed = quickReplySchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    conversationId: formData.get("conversationId") || "",
    title: formData.get("title"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    redirect("/admin?error=invalid-whatsapp-quick-reply");
  }

  const conversationId = parsed.data.conversationId || undefined;
  await requireRestaurantCrmAccess(parsed.data.restaurantId, conversationId);
  const result = await whatsappCrmService.saveQuickReply({
    restaurantId: parsed.data.restaurantId,
    title: parsed.data.title,
    body: parsed.data.body,
    userId: await currentUserId(),
  });

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/whatsapp`);
  redirect(crmPath(parsed.data.restaurantId, conversationId, result.ok ? "&replySaved=1" : `&error=${result.error}`));
}

export async function deactivateWhatsAppQuickReplyAction(formData: FormData) {
  const parsed = quickReplyIdSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    conversationId: formData.get("conversationId") || "",
    quickReplyId: formData.get("quickReplyId"),
  });

  if (!parsed.success) {
    redirect("/admin?error=invalid-whatsapp-quick-reply");
  }

  const conversationId = parsed.data.conversationId || undefined;
  await requireRestaurantCrmAccess(parsed.data.restaurantId, conversationId);
  const result = await whatsappCrmService.deactivateQuickReply({
    restaurantId: parsed.data.restaurantId,
    quickReplyId: parsed.data.quickReplyId,
    userId: await currentUserId(),
  });

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/whatsapp`);
  redirect(crmPath(parsed.data.restaurantId, conversationId, result.ok ? "&replyDeleted=1" : `&error=${result.error}`));
}
