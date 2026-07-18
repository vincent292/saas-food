import type { Order, OrderOrigin, OrderStatus, OrderType, PaymentMethodType } from "@/types/order.types";
import { businessOrderStatusLabel } from "@/lib/restaurant-directory-options";
import type { BusinessType } from "@/types/restaurant.types";

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

export function kitchenStartDate(order: Order) {
  return order.acceptedAt ?? order.createdAt;
}

export function minutesSince(date: string, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / 60000));
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
