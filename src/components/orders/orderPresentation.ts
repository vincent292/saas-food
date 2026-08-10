import type { Order, OrderOrigin, OrderStatus, OrderType, PaymentMethodType } from "@/types/order.types";
import { businessOrderStatusLabel } from "@/lib/restaurant-directory-options";
import type { BusinessType } from "@/types/restaurant.types";

export const DEFAULT_PRODUCT_PREP_MINUTES = 15;
export const READY_PICKUP_WARNING_MINUTES = 10;

export const orderStatusLabels: Record<OrderStatus, string> = {
  pending: "Pendiente",
  accepted: "Aprobado",
  preparing: "Preparando",
  ready: "Preparado",
  delivered: "Entregado",
  cancelled: "Rechazado",
};

export const orderTypeLabels: Record<OrderType, string> = {
  table: "Mesa",
  delivery: "Envio a domicilio",
  pickup: "Recojo",
  pos: "Venta POS",
};

export const paymentMethodLabels: Record<PaymentMethodType, string> = {
  cash: "Efectivo",
  qr: "QR",
  bank_transfer: "Transferencia",
  card: "Tarjeta",
  other: "Otro",
};

export function orderStatusLabel(status: OrderStatus, businessType?: BusinessType | null) {
  return businessOrderStatusLabel(status, businessType ?? "food");
}

export const orderOriginLabels: Record<OrderOrigin, string> = {
  pos_counter: "POS en caja",
  table_qr: "Mesa QR",
  web_checkout: "Pedido web",
  phone_whatsapp: "Celular / WhatsApp",
  external_platform: "Plataforma externa",
};

export function orderSourceLabel(order: Order) {
  if (order.notes?.startsWith("Yopido Grupal") || order.notes?.startsWith("Pedido grupal")) {
    return "Yopido Grupal";
  }

  if (order.orderOrigin === "table_qr") {
    return "Pedido de mesa";
  }

  if (order.orderOrigin === "web_checkout") {
    return order.orderType === "pickup" ? "Pedido web para recojo" : "Pedido web";
  }

  if (order.orderOrigin === "phone_whatsapp") {
    return "Pedido por celular";
  }

  if (order.orderOrigin === "external_platform") {
    return "Plataforma externa";
  }

  return order.orderType === "pickup" ? "Recojo en mostrador" : "Venta POS";
}

export function groupReceiptLinksFromNotes(notes?: string) {
  if (!notes || (!notes.startsWith("Yopido Grupal") && !notes.startsWith("Pedido grupal"))) {
    return [];
  }

  return notes
    .split("\n")
    .map((line) => {
      const match = line.match(/^(.+?):.*comprobante:\s*(\S+)/i);
      return match ? { label: match[1].trim(), url: match[2].trim() } : null;
    })
    .filter((item): item is { label: string; url: string } => Boolean(item));
}

export function kitchenStartDate(order: Order) {
  return order.acceptedAt ?? order.createdAt;
}

export function prepMinutesForItem(item: Order["items"][number]) {
  const minutes = item.prepMinutes ?? DEFAULT_PRODUCT_PREP_MINUTES;
  if (!Number.isFinite(minutes)) {
    return DEFAULT_PRODUCT_PREP_MINUTES;
  }

  return Math.min(Math.max(Math.round(minutes), 1), 240);
}

export function orderPrepMinutes(order: Order) {
  if (!order.items.length) {
    return DEFAULT_PRODUCT_PREP_MINUTES;
  }

  const longestLine = Math.max(
    ...order.items.map((item) => {
      const base = prepMinutesForItem(item);
      const extraUnits = Math.max(item.quantity - 1, 0);
      return base + extraUnits * Math.max(1, Math.round(base * 0.35));
    }),
  );
  const multiItemBuffer = Math.max(order.items.length - 1, 0) * 2;

  return Math.min(longestLine + multiItemBuffer, 240);
}

export function kitchenDueDate(order: Order) {
  return new Date(new Date(kitchenStartDate(order)).getTime() + orderPrepMinutes(order) * 60000);
}

export function minutesSince(date: string, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / 60000));
}

export function minutesUntil(date: Date, now: Date) {
  return Math.ceil((date.getTime() - now.getTime()) / 60000);
}

export function timerTone(minutes: number) {
  if (minutes >= 30) {
    return {
      label: "Critico",
      className: "border-[var(--color-danger-strong)] bg-[var(--color-danger-strong)] text-[var(--color-on-primary)]",
    };
  }

  if (minutes >= 15) {
    return {
      label: "Demorado",
      className: "border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]",
    };
  }

  return {
    label: "A tiempo",
    className: "border-[var(--color-success-soft)] bg-[var(--color-success-soft)] text-[var(--color-success-strong)]",
  };
}

export function elapsedLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours <= 0) {
    return `${rest} min`;
  }

  return `${hours} h ${rest} min`;
}
