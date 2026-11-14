import type { WhatsAppCrmUsage } from "@/types/whatsapp-crm.types";

export function whatsappUsageNotice(usage: WhatsAppCrmUsage) {
  if (usage.pricingStatus !== "synced" || usage.freeServiceMessagesRemaining === null) return null;
  if ((usage.billableServiceMessages ?? 0) > 0) return {
    level: "charged" as const,
    title: "Meta ya registra mensajes de servicio con cargo",
    detail: `${usage.billableServiceMessages} mensajes con cargo este mes. La bolsa gratuita de este número está agotada.`,
  };
  if (usage.freeServiceMessagesRemaining === 0) return {
    level: "exhausted" as const,
    title: "Agotaste los 1.000 mensajes gratuitos de este mes",
    detail: "Los próximos mensajes de servicio entregados fuera de una ventana gratuita pueden generar cargos de Meta.",
  };
  if (usage.freeServiceMessagesRemaining <= 100) return {
    level: "warning" as const,
    title: `Te quedan ${usage.freeServiceMessagesRemaining} mensajes de servicio gratuitos`,
    detail: "Al agotar los 1.000 del mes, los siguientes mensajes de servicio entregados pueden generar cargos de Meta.",
  };
  return null;
}
