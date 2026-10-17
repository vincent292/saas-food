import { activityIsVisible } from "./pending-activity-policy";
// Only a recovery capability is stored here, never bank credentials, QR images,
// customer details or a client-authored payment status. DB remains authoritative.
export type RecoverableOrder = {
  restaurantId: string; restaurantSlug: string; requestId: string; recoveryKey: string; createdAt: number; submitted?: boolean; hiddenAt?: number;
};
const storageKey = "yopido:order-recovery:v1";
export const orderRecoveryChanged = "yopido:order-recovery-changed";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readRecoverableOrders(): RecoverableOrder[] {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is RecoverableOrder => Boolean(row && typeof row === "object"
      && uuid.test(row.restaurantId) && uuid.test(row.requestId) && /^[a-f0-9]{64}$/.test(row.recoveryKey)
      && typeof row.restaurantSlug === "string" && /^[a-z0-9-]{1,150}$/.test(row.restaurantSlug)
      && Number.isFinite(row.createdAt) && Date.now() - row.createdAt < 30 * 86400_000)).slice(-20);
  } catch { return []; }
}
function write(rows: RecoverableOrder[]) {
  // Fail explicitly before submitting if durable storage is unavailable. A new
  // browser/private tab must never claim it can recover after being destroyed.
  localStorage.setItem(storageKey, JSON.stringify(rows.slice(-20)));
  window.dispatchEvent(new Event(orderRecoveryChanged));
}
export function prepareOrderRecovery(restaurantId: string, restaurantSlug: string): RecoverableOrder {
  const rows = readRecoverableOrders();
  const existing = rows.find(row => row.restaurantId === restaurantId && !row.submitted);
  if (existing) return existing; // Never silently replace a submission after a crash.
  const row = { restaurantId, restaurantSlug, requestId: crypto.randomUUID(),
    recoveryKey: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""), createdAt: Date.now() };
  write([...rows, row]);
  return row;
}
export function forgetOrderRecovery(requestId: string) {
  write(readRecoverableOrders().filter(row => row.requestId !== requestId));
}
export function visibleRecoverableOrders(restaurantId?: string, now = Date.now()) {
  return readRecoverableOrders().filter(row => (!restaurantId || row.restaurantId === restaurantId) && !row.hiddenAt && activityIsVisible(row.createdAt, now));
}
// Hiding a shortcut must not delete the capability or release an unpaid intent.
export function hideOrderRecovery(requestId: string) {
  write(readRecoverableOrders().map(row => row.requestId === requestId ? { ...row, hiddenAt: Date.now() } : row));
}
export function markOrderRecovered(requestId: string, terminal: boolean) {
  const rows = readRecoverableOrders();
  if (!rows.some(row => row.requestId === requestId)) return;
  write(terminal ? rows.filter(row => row.requestId !== requestId) : rows.map(row => row.requestId === requestId ? { ...row, submitted: true } : row));
}
export type RecoveredOrder = { path: string; terminal: boolean; stage?: "payment" | "tracking"; paymentStatus?: string; restaurantName?: string; logoUrl?: string; amount?: number };
export async function recoverOrder(row: RecoverableOrder): Promise<RecoveredOrder | null> {
  const response = await fetch("/api/payments/baneco/recover", { method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId: row.restaurantId, requestId: row.requestId, recoveryKey: row.recoveryKey }) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("recovery-unavailable");
  const data = await response.json() as RecoveredOrder;
  if (!data.path.startsWith(`/${row.restaurantSlug}/pedido/`) && !data.path.startsWith(`/${row.restaurantSlug}/pago/`)) throw new Error("recovery-unavailable");
  return data;
}
