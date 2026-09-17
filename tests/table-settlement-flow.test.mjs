import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

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

test("table closing supports QR review and real-time cash change", async () => {
  const [actions, cash, migration] = await Promise.all([
    readFile(new URL("src/app/admin/actions.ts", root), "utf8"),
    readFile(new URL("src/components/cash/CashWorkspaceClient.tsx", root), "utf8"),
    readFile(new URL("supabase/migrations/0103_fix_table_settlement_and_payment_flow.sql", root), "utf8"),
  ]);

  assert.match(actions, /export async function verifyTableQrPaymentAction/);
  assert.match(actions, /order\.order_type !== "table" \|\| order\.payment_method !== "qr"/);
  assert.match(cash, /Aceptar pago QR/);
  assert.match(cash, /ReceiptViewerButton/);
  assert.match(cash, /const changeDue =/);
  assert.match(cash, /Cambio a devolver/);
  assert.match(cash, /cashReceived/);
  assert.match(cash, /QrPaymentViewer/);
  assert.match(migration, /restaurant_order\.table_id = p_table_id/);
  assert.doesNotMatch(migration, /\nand table_id = p_table_id/);
  assert.match(migration, /approve_table_order_for_preparation/);
  assert.match(migration, /v_order\.order_type <> 'table' and v_order\.status = 'pending'/);
  assert.match(migration, /if v_order\.payment_status <> 'paid'/);
});
