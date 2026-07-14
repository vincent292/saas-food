export type OrderStatus = "pending" | "accepted" | "preparing" | "ready" | "delivered" | "cancelled";
export type OrderType = "table" | "delivery" | "pickup" | "pos";
export type OrderOrigin = "pos_counter" | "table_qr" | "web_checkout" | "phone_whatsapp" | "external_platform";
export type PaymentStatus = "pending" | "paid" | "cancelled" | "refunded";
export type PaymentMethodType = "cash" | "qr" | "bank_transfer" | "card" | "other";
export type TableStatus = "available" | "occupied" | "waiting_order" | "served" | "checkout_requested";

export type RestaurantTable = {
  id: string;
  restaurantId: string;
  name: string;
  code: string;
  status: TableStatus;
  capacity: number;
  isActive: boolean;
};

export type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  notes?: string;
};

export type OrderDeliveryDispatchStatus = "active" | "arrived" | "delivered" | "cancelled" | "expired";

export type OrderDeliveryDispatch = {
  status: OrderDeliveryDispatchStatus;
  deliveryPhone?: string;
  deliveryName?: string;
  openedAt?: string;
  arrivedAt?: string;
  deliveredAt?: string;
};

export type Order = {
  id: string;
  restaurantId: string;
  tableId?: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerAddress?: string;
  deliveryAddressDetail?: string;
  deliveryMapsUrl?: string;
  requestedFulfillmentAt?: string;
  orderType: OrderType;
  orderOrigin: OrderOrigin;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethodType;
  paymentReceiptUrl?: string;
  paymentReceiptUploadedAt?: string;
  paymentReceiptReference?: string;
  paymentVerifiedAt?: string;
  subtotal: number;
  deliveryFee: number;
  discountTotal: number;
  total: number;
  notes?: string;
  createdAt: string;
  acceptedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  printedAt?: string;
  deliveryDispatch?: OrderDeliveryDispatch;
  items: OrderItem[];
};

export type OrderQueueState = {
  queueEnabled: boolean;
  status: OrderStatus;
  queuePosition?: number;
  ordersAhead?: number;
  activeOrders: number;
  preparingOrders: number;
  readyOrders: number;
  recentOrders: number;
  estimatedMinMinutes: number;
  estimatedMaxMinutes: number;
  estimatedReadyAtMin?: string;
  estimatedReadyAtMax?: string;
  demandLabel: string;
  demandLevel: "calm" | "normal" | "busy" | "event";
  confidence: "low" | "medium" | "high";
  kitchenCapacity: number;
  basePrepMinutes: number;
  historySampleSize: number;
  updatedAt: string;
};

export type OrderTrackingStatus = {
  id: string;
  restaurantId: string;
  orderType: OrderType;
  status: OrderStatus;
  acceptedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  updatedAt: string;
  deliveryDispatch?: Pick<OrderDeliveryDispatch, "status" | "openedAt" | "arrivedAt" | "deliveredAt">;
};
