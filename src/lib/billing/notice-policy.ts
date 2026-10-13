type Cycle = { dueDate: string; isBillable: boolean; paidAt?: string; status: string; paymentExtensionUntil?: string };
export function billingNoticePolicy(cycle: Cycle, reminderDays: number, graceDays: number, today: string) {
  const day = (value: string) => Date.parse(`${value}T00:00:00Z`);
  const daysUntilDue = Math.round((day(cycle.dueDate) - day(today)) / 86400000);
  const normalDeadline = new Date(day(cycle.dueDate) + Math.max(0, graceDays) * 86400000).toISOString().slice(0, 10);
  const deadline = cycle.paymentExtensionUntil && cycle.paymentExtensionUntil > normalDeadline ? cycle.paymentExtensionUntil : normalDeadline;
  const unpaid = cycle.isBillable && !cycle.paidAt && cycle.status !== "cancelled";
  return { deadline, daysUntilDue, daysUntilCut: Math.round((day(deadline) - day(today)) / 86400000),
    isOverdue: unpaid && today > deadline, showNotice: unpaid && daysUntilDue <= reminderDays };
}
