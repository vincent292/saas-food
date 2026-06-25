import { notFound } from "next/navigation";
import { chargeOrderAction, closeCashSessionAction, openCashSessionAction, registerCashExpenseAction } from "@/app/admin/actions";
import { CashMovementRow } from "@/components/cash/CashMovementRow";
import { CashSummaryCard } from "@/components/cash/CashSummaryCard";
import { POSProductGrid } from "@/components/cash/POSProductGrid";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Tabs } from "@/components/ui/Tabs";
import { cashService } from "@/lib/services/cash.service";
import { orderService } from "@/lib/services/order.service";
import { productService } from "@/lib/services/product.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { formatMoney } from "@/lib/utils/money";

const tabs = [
  { key: "resumen", label: "Resumen" },
  { key: "venta", label: "Venta rapida" },
  { key: "pedidos", label: "Pedidos" },
  { key: "egresos", label: "Egresos" },
  { key: "movimientos", label: "Movimientos" },
  { key: "cierre", label: "Cierre" },
] as const;

type CashTab = (typeof tabs)[number]["key"];

function isCashTab(value: string | undefined): value is CashTab {
  return tabs.some((tab) => tab.key === value);
}

function paymentMethodSelect(defaultValue = "cash") {
  return (
    <Select name="paymentMethod" defaultValue={defaultValue}>
      <option value="cash">Efectivo</option>
      <option value="qr">QR</option>
      <option value="bank_transfer">Transferencia</option>
      <option value="card">Tarjeta</option>
      <option value="other">Otro</option>
    </Select>
  );
}

export default async function CashPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ tab?: string; error?: string; opened?: string; closed?: string; charged?: string; expense?: string; pos?: string }>;
}) {
  const [{ restaurantId }, status] = await Promise.all([params, searchParams]);
  const activeTab = isCashTab(status.tab) ? status.tab : "resumen";
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  const [summary, products, movements, orders] = await Promise.all([
    cashService.getSummary(restaurant.id),
    productService.listAvailableByRestaurant(restaurant.id),
    cashService.listMovements(restaurant.id),
    orderService.listByRestaurant(restaurant.id),
  ]);
  const pendingPaymentOrders = orders.filter((order) => order.paymentStatus === "pending" && order.status !== "cancelled");
  const baseHref = `/admin/restaurantes/${restaurant.id}/caja`;
  const tabItems = tabs.map((tab) => ({ label: tab.label, href: `${baseHref}?tab=${tab.key}` }));

  return (
    <AdminLayout active="caja" restaurantId={restaurant.id} title="Caja / POS">
      <div className="space-y-6">
        <Tabs active={tabs.find((tab) => tab.key === activeTab)?.label} tabs={tabItems} />

        {status.error ? <div className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">No se pudo completar la accion: {status.error}.</div> : null}
        {status.opened ? <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Caja abierta correctamente.</div> : null}
        {status.closed ? <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Caja cerrada correctamente.</div> : null}
        {status.charged ? <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Pedido cobrado correctamente.</div> : null}
        {status.expense ? <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Egreso registrado correctamente.</div> : null}
        {status.pos ? <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Venta POS registrada correctamente.</div> : null}

        {activeTab === "resumen" ? (
          <section className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <CashSummaryCard amount={summary.salesTotal} detail={`${summary.orderCount} pedidos cobrados`} label="Ventas del dia" />
              <CashSummaryCard amount={summary.cashTotal} label="Efectivo" />
              <CashSummaryCard amount={summary.qrTotal + summary.transferTotal} label="QR / transferencia" />
              <CashSummaryCard amount={summary.netTotal} detail="Ventas menos egresos" label="Neto" />
            </div>
            <Card>
              <SectionTitle
                title={summary.session ? "Caja abierta" : "Caja cerrada"}
                description={summary.session ? `Apertura: ${formatMoney(summary.session.openingAmount)}` : "Abre una caja para cobrar pedidos, ventas POS y egresos."}
              />
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-500">Ventas</p>
                  <p className="mt-1 text-2xl font-black text-slate-950">{formatMoney(summary.salesTotal)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-500">Egresos</p>
                  <p className="mt-1 text-2xl font-black text-red-600">{formatMoney(summary.expenses)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-500">Ticket promedio</p>
                  <p className="mt-1 text-2xl font-black text-slate-950">{formatMoney(summary.averageTicket)}</p>
                </div>
              </div>
            </Card>
          </section>
        ) : null}

        {activeTab === "venta" ? (
          <section>
            <SectionTitle title="Venta rapida POS" description="Cobra productos disponibles y registra el pedido POS en Supabase." />
            <div className="mt-4">
              <POSProductGrid products={products} restaurantId={restaurant.id} />
            </div>
          </section>
        ) : null}

        {activeTab === "pedidos" ? (
          <Card>
            <SectionTitle title="Pedidos por cobrar" description="Pedidos reales con pago pendiente." />
            <div className="mt-4 space-y-3">
              {pendingPaymentOrders.length ? (
                pendingPaymentOrders.map((order) => (
                  <form action={chargeOrderAction} className="grid gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-[1fr_160px_auto] sm:items-center" key={order.id}>
                    <input name="restaurantId" type="hidden" value={restaurant.id} />
                    <input name="orderId" type="hidden" value={order.id} />
                    <div>
                      <p className="font-bold text-slate-950">{order.orderNumber}</p>
                      <p className="text-sm text-slate-500">{formatMoney(order.total)}</p>
                    </div>
                    {paymentMethodSelect(order.paymentMethod)}
                    <Button type="submit">Cobrar</Button>
                  </form>
                ))
              ) : (
                <EmptyState title="Sin pedidos pendientes" description="Cuando exista un pedido con pago pendiente aparecera aqui para cobrarlo." />
              )}
            </div>
          </Card>
        ) : null}

        {activeTab === "egresos" ? (
          <Card className="max-w-2xl">
            <SectionTitle title="Registrar egreso" description="Gastos pagados durante la sesion abierta." />
            <form action={registerCashExpenseAction} className="mt-4 space-y-3">
              <input name="restaurantId" type="hidden" value={restaurant.id} />
              <Input min={0.01} name="amount" placeholder="Monto" step="0.01" type="number" />
              {paymentMethodSelect()}
              <Input name="description" placeholder="Descripcion" />
              <Button className="w-full" type="submit" variant="secondary">
                Guardar egreso
              </Button>
            </form>
          </Card>
        ) : null}

        {activeTab === "movimientos" ? (
          <Card>
            <SectionTitle title="Movimientos" description="Entradas, salidas, ventas, apertura y cierre." />
            <div className="mt-4">
              {movements.length ? (
                movements.map((movement) => <CashMovementRow key={movement.id} movement={movement} />)
              ) : (
                <EmptyState title="Sin movimientos" description="Los cobros, egresos, aperturas y cierres apareceran aqui." />
              )}
            </div>
          </Card>
        ) : null}

        {activeTab === "cierre" ? (
          <Card className="max-w-2xl">
            <SectionTitle
              title={summary.session ? "Cerrar caja" : "Abrir caja"}
              description={summary.session ? `Apertura: ${formatMoney(summary.session.openingAmount)}` : "Necesaria para cobrar ventas, pedidos y egresos."}
            />
            {summary.session ? (
              <form action={closeCashSessionAction} className="mt-4 space-y-3">
                <input name="restaurantId" type="hidden" value={restaurant.id} />
                <Input min={0} name="countedAmount" placeholder="Monto contado" step="0.01" type="number" />
                <Textarea name="notes" placeholder="Notas del cierre" />
                <Button className="w-full" type="submit" variant="danger">
                  Cerrar caja
                </Button>
              </form>
            ) : (
              <form action={openCashSessionAction} className="mt-4 space-y-3">
                <input name="restaurantId" type="hidden" value={restaurant.id} />
                <Input min={0} name="openingAmount" placeholder="Monto inicial" step="0.01" type="number" />
                <Textarea name="notes" placeholder="Notas de apertura" />
                <Button className="w-full" type="submit">
                  Abrir caja
                </Button>
              </form>
            )}
          </Card>
        ) : null}
      </div>
    </AdminLayout>
  );
}
