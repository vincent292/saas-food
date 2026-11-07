export type BankOrderPaymentState = {
  available: boolean; status: string; amount?: number; image?: string | null;
  applicationState?: string; collectionRoute?: string; realtimeToken?: string;
  checkoutHeld?: boolean; scheduleHeld?: boolean; paymentStatus?: string; orderStatus?: string;
};

export function bankOrderIsSettled(payment: BankOrderPaymentState | null) {
  return payment?.status === "paid" && payment.paymentStatus === "paid"
    && payment.applicationState !== "review" && !payment.checkoutHeld && !payment.scheduleHeld
    && ["accepted", "preparing", "ready", "delivered"].includes(payment.orderStatus ?? "");
}
