import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("order action buttons disable only themselves while a form is pending", async () => {
  const [button, reception, cash, pendingOrder, delivery, pos] = await Promise.all([
    readFile(new URL("src/components/ui/PendingSubmitButton.tsx", root), "utf8"),
    readFile(new URL("src/components/orders/OrdersReceptionClient.tsx", root), "utf8"),
    readFile(new URL("src/components/cash/CashWorkspaceClient.tsx", root), "utf8"),
    readFile(new URL("src/components/orders/PendingOrderReviewCard.tsx", root), "utf8"),
    readFile(new URL("src/app/delivery/[token]/page.tsx", root), "utf8"),
    readFile(new URL("src/components/cash/POSProductGrid.tsx", root), "utf8"),
  ]);

  assert.match(button, /useFormStatus/);
  assert.match(button, /disabled=\{disabled \|\| pending\}/);
  assert.match(button, /LoaderCircle/);
  assert.match(reception, /PendingSubmitButton/);
  assert.match(cash, /PendingSubmitButton/);
  assert.match(pendingOrder, /Aprobando y cobrando\.\.\./);
  assert.match(delivery, /Confirmando entrega\.\.\./);
  assert.doesNotMatch(pos, /BrandLoadingOverlay/);
});

test("charging and status transitions are idempotent under duplicate submissions", async () => {
  const [migration, actions] = await Promise.all([
    readFile(new URL("supabase/migrations/0090_idempotent_order_charging.sql", root), "utf8"),
    readFile(new URL("src/app/admin/actions.ts", root), "utf8"),
  ]);

  assert.match(migration, /if v_order\.payment_status = 'paid' then[\s\S]*return v_order\.id/);
  assert.match(migration, /status = case when v_order\.status = 'pending' then 'accepted' else v_order\.status end/);
  assert.match(migration, /for update/);
  assert.match(actions, /\.eq\("status", order\.status\)/);
  assert.match(actions, /currentOrder\?\.status === nextStatus/);
  assert.match(actions, /statusChanged = false/);
});
