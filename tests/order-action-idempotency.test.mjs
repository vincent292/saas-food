import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("order action buttons isolate pending forms and optimistic status changes", async () => {
  const [button, reception, cash, liveOrders, pendingOrder, delivery, pos] = await Promise.all([
    readFile(new URL("src/components/ui/PendingSubmitButton.tsx", root), "utf8"),
    readFile(new URL("src/components/orders/OrdersReceptionClient.tsx", root), "utf8"),
    readFile(new URL("src/components/cash/CashWorkspaceClient.tsx", root), "utf8"),
    readFile(new URL("src/lib/client/use-live-orders.ts", root), "utf8"),
    readFile(new URL("src/components/orders/PendingOrderReviewCard.tsx", root), "utf8"),
    readFile(new URL("src/app/delivery/[token]/page.tsx", root), "utf8"),
    readFile(new URL("src/components/cash/POSProductGrid.tsx", root), "utf8"),
  ]);

  assert.match(button, /useFormStatus/);
  assert.match(button, /disabled=\{disabled \|\| pending\}/);
  assert.match(button, /LoaderCircle/);
  assert.match(reception, /PendingSubmitButton/);
  assert.match(reception, /pendingOrderIds\.has/);
  assert.match(cash, /pendingOrderIds\.has/);
  assert.match(cash, /Guardando\.\.\./);
  assert.match(liveOrders, /updateOperationalOrderStatusAction/);
  assert.match(liveOrders, /approvePendingOrderAction/);
  assert.match(liveOrders, /patchApprovedOrder/);
  assert.match(liveOrders, /pendingChangesRef\.current\.has/);
  assert.match(pendingOrder, /Aprobando y cobrando\.\.\./);
  assert.match(pendingOrder, /onApprove\(order\.id, formData\)/);
  assert.match(delivery, /Confirmando entrega\.\.\./);
  assert.doesNotMatch(pos, /BrandLoadingOverlay/);
});

test("charging and status transitions are idempotent under duplicate submissions", async () => {
  const [migration, statusMigration, actions] = await Promise.all([
    readFile(new URL("supabase/migrations/0090_idempotent_order_charging.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/0092_fast_operational_order_status.sql", root), "utf8"),
    readFile(new URL("src/app/admin/actions.ts", root), "utf8"),
  ]);

  assert.match(migration, /if v_order\.payment_status = 'paid' then[\s\S]*return v_order\.id/);
  assert.match(migration, /status = case when v_order\.status = 'pending' then 'accepted' else v_order\.status end/);
  assert.match(migration, /for update/);
  assert.match(actions, /\.eq\("status", order\.status\)/);
  assert.match(actions, /currentOrder\?\.status === nextStatus/);
  assert.match(actions, /statusChanged = false/);
  assert.match(statusMigration, /update orders as target/);
  assert.match(statusMigration, /target\.status = p_expected_status/);
  assert.match(statusMigration, /current_order\.status = p_next_status/);
  assert.match(statusMigration, /security invoker/);
  assert.match(actions, /update_operational_order_status/);
  assert.match(actions, /scheduleOrderStatusSideEffects/);
  assert.match(actions, /export async function approvePendingOrderAction/);
  assert.match(actions, /after\(async \(\) => \{[\s\S]*revalidateOrderDecisionPaths/);
});

test("WhatsApp order status messages do not block operational actions", async () => {
  const [actions, notifications, riderOrderRoute, riderOfferRoute] = await Promise.all([
    readFile(new URL("src/app/admin/actions.ts", root), "utf8"),
    readFile(new URL("src/lib/services/order-whatsapp-notification.service.ts", root), "utf8"),
    readFile(new URL("src/app/api/mobile/riders/orders/[orderId]/accept/route.ts", root), "utf8"),
    readFile(new URL("src/app/api/mobile/riders/offers/[offerId]/accept/route.ts", root), "utf8"),
  ]);

  assert.match(actions, /sendOrderWhatsAppNotification\(\{ event: status, orderId \}\)/);
  assert.match(notifications, /order\.order_origin !== "phone_whatsapp"/);
  assert.match(notifications, /get_public_order_queue_state/);
  assert.match(notifications, /Tiempo estimado:/);
  assert.match(notifications, /Ya puedes pasar a recogerlo/);
  assert.match(notifications, /delivery_dispatched/);
  assert.match(notifications, /Siguelo aqui/);
  assert.match(riderOrderRoute, /after\(async/);
  assert.match(riderOfferRoute, /delivery_dispatched/);
});
