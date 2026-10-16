import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("public table checkout has only a recoverable bank QR, while staff table orders are authenticated and attributed", async () => {
  const [table, action, pos, bankEndpoint] = await Promise.all([
    readFile(new URL('src/components/tables/TableOrderClient.tsx', root), 'utf8'),
    readFile(new URL('src/app/r/actions.ts', root), 'utf8'),
    readFile(new URL('src/app/api/mobile/pos/route.ts', root), 'utf8'),
    readFile(new URL('src/app/api/mobile/pos/bank-qr/route.ts', root), 'utf8'),
  ]);
  assert.match(table, /name="paymentMethod" type="hidden" value="qr"/);
  assert.match(table, /prepareOrderRecovery/);assert.match(table, /name="recoveryKey"/);
  assert.doesNotMatch(table, /CompressedImageInput|QrPaymentViewer|setPaymentMethod|Caja \/ efectivo/);
  assert.match(action, /parsed.data.paymentMethod !== "qr"\) redirect\(`\$\{failPath\}\?error=table-qr-required/);
  assert.match(pos, /order_type: "table", order_origin: "pos_counter"/);
  assert.match(pos, /getWaiterShift/);assert.match(pos, /waiter_table_assignments/);
  assert.match(bankEndpoint, /authorize_baneco_staff_order/);
});

test("table approval sends the order to preparation without charging it", async () => {
  const [actions, liveOrders, reviewCard] = await Promise.all([
    readFile(new URL("src/app/admin/actions.ts", root), "utf8"),
    readFile(new URL("src/lib/client/use-live-orders.ts", root), "utf8"),
    readFile(new URL("src/components/orders/PendingOrderReviewCard.tsx", root), "utf8"),
  ]);

  assert.match(actions, /const isTableOrder = previousOrder\.order_type === "table"/);
  assert.match(actions, /if \(isTableOrder\) \{[\s\S]*approve_table_order_for_preparation[\s\S]*\} else \{[\s\S]*charge_order_with_cash_movement/);
  assert.match(actions, /paymentStatus = "paid"/);
  assert.match(liveOrders, /if \(order\.orderType === "table"\) \{[\s\S]*patchOrderStatus\(order, "accepted", changedAt\)/);
  assert.match(liveOrders, /paymentStatus: result\.paymentStatus/);
  assert.match(reviewCard, /No se cobrará todavía/);
  assert.match(reviewCard, /Aprobar pedido/);
});

test("table closing waits for bank verification and preserves real-time cash change", async () => {
  const [actions, cash, migration] = await Promise.all([
    readFile(new URL("src/app/admin/actions.ts", root), "utf8"),
    readFile(new URL("src/components/cash/CashWorkspaceClient.tsx", root), "utf8"),
    readFile(new URL("supabase/migrations/0103_fix_table_settlement_and_payment_flow.sql", root), "utf8"),
  ]);

  assert.match(actions, /export async function verifyTableQrPaymentAction/);
  assert.match(actions, /order\.order_type !== "table" \|\| order\.payment_method !== "qr"/);
  assert.doesNotMatch(cash, /Aceptar pago QR/);
  assert.match(cash, /BankOrderPaymentCard/);
  assert.match(cash, /paymentMethod === "qr" && pendingOrders.length > 0/);
  assert.doesNotMatch(cash, /name="paymentReceiptFile"/);
  assert.match(cash, /ReceiptViewerButton/);
  assert.match(cash, /const changeDue =/);
  assert.match(cash, /Cambio a devolver/);
  assert.match(cash, /cashReceived/);
  assert.doesNotMatch(cash, /QrPaymentViewer/);
  assert.match(migration, /restaurant_order\.table_id = p_table_id/);
  assert.doesNotMatch(migration, /\nand table_id = p_table_id/);
  assert.match(migration, /approve_table_order_for_preparation/);
  assert.match(migration, /v_order\.order_type <> 'table' and v_order\.status = 'pending'/);
  assert.match(migration, /if v_order\.payment_status <> 'paid'/);
});
