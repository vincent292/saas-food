export type OrderStatus = "pending" | "accepted" | "preparing" | "ready" | "delivered" | "cancelled";
export type OrderType = "table" | "delivery" | "pickup" | "pos";
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

export type Order = {
  id: string;
  restaurantId: string;
  tableId?: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  orderType: OrderType;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethodType;
  subtotal: number;
  deliveryFee: number;
  discountTotal: number;
  total: number;
  notes?: string;
  createdAt: string;
  items: OrderItem[];
};
