export type BankOrderPaymentState = {
  available: boolean; status: string; amount?: number; image?: string | null;
  applicationState?: string; collectionRoute?: string; realtimeToken?: string;
  checkoutHeld?: boolean; scheduleHeld?: boolean; paymentStatus?: string; orderStatus?: string;
  verificationPending?: boolean;
};

export function bankOrderIsSettled(payment: BankOrderPaymentState | null) {
  return payment?.status === "paid" && payment.paymentStatus === "paid"
    && payment.applicationState !== "review" && !payment.checkoutHeld && !payment.scheduleHeld
    && ["accepted", "preparing", "ready", "delivered"].includes(payment.orderStatus ?? "");
}

export function bankCheckoutIsSubmitted(payment: BankOrderPaymentState | null) {
  return payment?.status === "paid" && payment.paymentStatus === "paid" && payment.applicationState !== "review"
    && !payment.checkoutHeld && Boolean(payment.orderStatus) && payment.orderStatus !== "cancelled"
    && (payment.scheduleHeld || payment.orderStatus !== "pending");
}

/** Late pending responses must never erase a confirmed payment or its activation. */
export function mergeBankPayment(current: BankOrderPaymentState | null, next: BankOrderPaymentState) {
  if (next.orderStatus === "cancelled") return next;
  if (current?.status === "paid" && next.status !== "paid") return current;
  if ((bankOrderIsSettled(current) || bankCheckoutIsSubmitted(current)) && !bankCheckoutIsSubmitted(next) && !bankOrderIsSettled(next)) return current;
  return next;
}

/** A visible checkout checks the bank itself; the minute worker remains recovery. */
export function shouldAutoVerifyBankPayment(payment: BankOrderPaymentState | null, lastCheckAt: number, now = Date.now()) {
  if (!payment?.available || payment.orderStatus === "cancelled" || payment.scheduleHeld || now-lastCheckAt<8000) return false;
  return ["pending", "unknown"].includes(payment.status)
    || (payment.status === "paid" && payment.applicationState !== "review" && (payment.checkoutHeld || payment.orderStatus === "pending"));
}
