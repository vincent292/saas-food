/** Delivery is operational; the visit determines whether a table bill is open. */
export function belongsToOpenTableAccount(order: { orderType: string; status: string; paymentStatus: string; tableAccountOpen?: boolean }) {
  if (order.orderType !== "table" || order.status === "cancelled" || !["pending", "paid"].includes(order.paymentStatus)) return false;
  return order.tableAccountOpen ?? !["delivered", "cancelled"].includes(order.status);
}

export function tableOrderSource(order: { takenBy?: string; orderOrigin?: string; customerName?: string | null; notes?: string | null }) {
  if (order.orderOrigin === "table_qr") return `Cliente por QR · ${order.customerName || "Cliente de la mesa"}`;
  if (order.takenBy) return order.takenBy;
  const staff = order.notes?.match(/(?:^|\|)\s*(Mesero|Caja|Administrador):\s*([^|]+)/i);
  if (staff) return `${staff[1]} · ${staff[2].trim()}`;
  return "Personal del restaurante";
}
