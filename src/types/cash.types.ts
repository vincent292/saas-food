import type { PaymentMethodType } from "./order.types";

export type CashSessionStatus = "open" | "closed";
export type CashMovementType = "sale" | "expense" | "income" | "adjustment" | "opening" | "closing";

export type CashSession = {
  id: string;
  restaurantId: string;
  openedBy: string;
  openedByName?: string;
  openedByEmail?: string;
  closedBy?: string;
  closedByName?: string;
  closedByEmail?: string;
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

export type CashSummary = {
  session: CashSession | null;
  salesTotal: number;
  cashTotal: number;
  qrTotal: number;
  transferTotal: number;
  cardTotal: number;
  otherTotal: number;
  digitalTotal: number;
  orderCount: number;
  averageTicket: number;
  expenses: number;
  cashExpenses: number;
  nonCashExpenses: number;
  incomeTotal: number;
  adjustmentTotal: number;
  expectedCash: number;
  netTotal: number;
};

export type CashSessionReport = {
  session: CashSession;
  movements: CashMovement[];
  salesTotal: number;
  cashTotal: number;
  qrTotal: number;
  transferTotal: number;
  cardTotal: number;
  otherTotal: number;
  digitalTotal: number;
  expenses: number;
  cashExpenses: number;
  nonCashExpenses: number;
  incomeTotal: number;
  adjustmentTotal: number;
  expectedCash: number;
  netTotal: number;
  orderCount: number;
  averageTicket: number;
};
