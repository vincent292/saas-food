import type { PaymentMethodType } from "./order.types";

export type CashSessionStatus = "open" | "closed";
export type CashMovementType = "sale" | "expense" | "income" | "adjustment" | "opening" | "closing";

export type CashSession = {
  id: string;
  restaurantId: string;
  openedBy: string;
  closedBy?: string;
  status: CashSessionStatus;
  openingAmount: number;
  expectedAmount: number;
  countedAmount?: number;
  differenceAmount?: number;
  openedAt: string;
  closedAt?: string;
  notes?: string;
};

export type CashMovement = {
  id: string;
  restaurantId: string;
  cashSessionId: string;
  orderId?: string;
  type: CashMovementType;
  paymentMethod: PaymentMethodType;
  amount: number;
  description: string;
  createdBy: string;
  createdAt: string;
};
