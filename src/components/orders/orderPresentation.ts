import type { Order, OrderStatus, OrderType, PaymentMethodType } from "@/types/order.types";

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

export function orderSourceLabel(order: Order) {
  if (order.orderType === "table") {
    return "Pedido de mesa";
  }

  if (order.orderType === "delivery") {
    return "Pedido de afuera";
  }

  if (order.orderType === "pickup") {
    return "Recojo en tienda";
  }

  return "Venta POS";
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

  if (minutes >= 20) {
    return {
      label: "Urgente",
      className: "border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]",
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
