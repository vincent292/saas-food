import { z } from "zod";
import { whatsappCrmService } from "@/lib/services/whatsapp-crm.service";
import { cors, failure, json, PosError, restaurantAccess, session } from "../pos/_shared";

export const runtime = "nodejs";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

const querySchema = z.object({
  restaurantId: z.string().uuid(),
  conversation: z.string().uuid().optional(),
});

const sendSchema = z.object({
  action: z.literal("send"),
  restaurantId: z.string().uuid(),
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(4096),
});

function cashierAccess(auth: Awaited<ReturnType<typeof session>>, restaurantId: string) {
  const restaurant = restaurantAccess(auth, restaurantId);
  if (restaurant.role !== "cashier") {
    throw new PosError("La bandeja de WhatsApp está disponible solo para el rol de caja.", 403);
  }
  return restaurant;
}

function sendErrorMessage(error: string) {
  const messages: Record<string, string> = {
    "conversation-not-found": "La conversación ya no existe para este restaurante.",
    "whatsapp-not-configured": "WhatsApp aún no está conectado para este restaurante.",
    "whatsapp-send-failed": "WhatsApp no aceptó el envío. Intenta actualizar el chat.",
    "whatsapp-window-closed": "Pasaron más de 24 horas desde el último mensaje del cliente. Espera su respuesta o usa una plantilla aprobada.",
  };
  return messages[error] ?? "No se pudo enviar el mensaje de WhatsApp.";
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse({
      restaurantId: params.get("restaurantId"),
      conversation: params.get("conversation") ?? undefined,
    });
    if (!parsed.success) throw new PosError("Restaurante o conversación inválidos.");

    const auth = await session(request);
    cashierAccess(auth, parsed.data.restaurantId);
    const workspace = await whatsappCrmService.getWorkspace(parsed.data.restaurantId, parsed.data.conversation);

    // The cashier needs only the operational inbox. Billing, bot setup and
    // owner-only metrics remain in the restaurant CRM.
    return json({
      conversations: workspace.conversations,
      selectedConversation: workspace.selectedConversation,
      messages: workspace.messages,
      quickReplies: workspace.quickReplies.map((reply) => ({
        id: reply.id,
        title: reply.title,
        body: reply.body,
      })),
      whatsappConfigured: workspace.whatsappConfigured,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new PosError("Solicitud inválida.");
    }
    const parsed = sendSchema.safeParse(raw);
    if (!parsed.success) throw new PosError("Revisa el mensaje antes de enviarlo.");

    const auth = await session(request);
    cashierAccess(auth, parsed.data.restaurantId);
    const result = await whatsappCrmService.sendTextMessage({
      restaurantId: parsed.data.restaurantId,
      conversationId: parsed.data.conversationId,
      body: parsed.data.body,
      source: "pos_cashier",
    });
    if (!result.ok) throw new PosError(sendErrorMessage(result.error ?? "whatsapp-send-failed"), 409);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
