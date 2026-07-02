import type { OrderStatus, PaymentMethodType, PaymentStatus } from "@/types/order.types";

export type DeliveryOrderItem = {
  id: string;
  productName: string;
  quantity: number;
  notes?: string;
};

export type DeliveryOrder = {
  linkId: string;
  deliveryToken: string;
  deliveryPhone?: string;
  deliveryName?: string;
  linkStatus: "active" | "delivered" | "cancelled" | "expired";
  openedAt?: string;
  linkDeliveredAt?: string;
  expiresAt: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  restaurantWhatsapp?: string;
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethodType;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  deliveryAddressDetail?: string;
  deliveryMapsUrl?: string;
  requestedFulfillmentAt?: string;
  notes?: string;
  total: number;
  createdAt: string;
  readyAt?: string;
  deliveredAt?: string;
  items: DeliveryOrderItem[];
};
