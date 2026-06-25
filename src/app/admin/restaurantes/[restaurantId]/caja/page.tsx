import { notFound } from "next/navigation";
import { chargeOrderAction, closeCashSessionAction, openCashSessionAction, registerCashExpenseAction } from "@/app/admin/actions";
import { CashMovementRow } from "@/components/cash/CashMovementRow";
import { CashSummaryCard } from "@/components/cash/CashSummaryCard";
import { POSProductGrid } from "@/components/cash/POSProductGrid";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Tabs } from "@/components/ui/Tabs";
import { cashService } from "@/lib/services/cash.service";
import { orderService } from "@/lib/services/order.service";
import { productService } from "@/lib/services/product.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { formatMoney } from "@/lib/utils/money";

export default async function CashPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
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

  return (
    <AdminLayout active="caja" restaurantId={restaurant.id} title="Caja / POS">
      <div className="space-y-6">
        <Tabs active="Resumen" tabs={[{ label: "Resumen" }, { label: "Venta rápida" }, { label: "Pedidos" }, { label: "Egresos" }, { label: "Movimientos" }, { label: "Cierre" }]} />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CashSummaryCard amount={summary.salesTotal} detail={`${summary.orderCount} pedidos cobrados`} label="Ventas del día" />
          <CashSummaryCard amount={summary.cashTotal} label="Efectivo" />
          <CashSummaryCard amount={summary.qrTotal + summary.transferTotal} label="QR / transferencia" />
          <CashSummaryCard amount={summary.netTotal} detail="Ventas menos egresos" label="Neto" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section>
            <SectionTitle title="Venta rápida" description="Cobra productos disponibles y registra el pedido POS en Supabase." />
            <div className="mt-4">
              <POSProductGrid products={products} restaurantId={restaurant.id} />
            </div>
          </section>

          <div className="space-y-6">
            <Card>
              <SectionTitle
                title={summary.session ? "Caja abierta" : "Abrir caja"}
                description={summary.session ? `Apertura: ${formatMoney(summary.session.openingAmount)}` : "Necesaria para cobrar ventas y egresos."}
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

            <Card>
              <SectionTitle title="Registrar egreso" description="Gastos pagados durante la sesión abierta." />
              <form action={registerCashExpenseAction} className="mt-4 space-y-3">
                <input name="restaurantId" type="hidden" value={restaurant.id} />
                <Input min={0.01} name="amount" placeholder="Monto" step="0.01" type="number" />
                <Select name="paymentMethod" defaultValue="cash">
                  <option value="cash">Efectivo</option>
                  <option value="qr">QR</option>
                  <option value="bank_transfer">Transferencia</option>
                  <option value="card">Tarjeta</option>
                  <option value="other">Otro</option>
                </Select>
                <Input name="description" placeholder="Descripción" />
                <Button className="w-full" type="submit" variant="secondary">
                  Guardar egreso
                </Button>
              </form>
            </Card>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
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
                    <Select name="paymentMethod" defaultValue={order.paymentMethod}>
                      <option value="cash">Efectivo</option>
                      <option value="qr">QR</option>
                      <option value="bank_transfer">Transferencia</option>
                      <option value="card">Tarjeta</option>
                      <option value="other">Otro</option>
                    </Select>
                    <Button type="submit">Cobrar</Button>
                  </form>
                ))
              ) : (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No hay pedidos pendientes de cobro.</p>
              )}
            </div>
          </Card>

          <Card>
            <SectionTitle title="Movimientos" description="Entradas, salidas, ventas, apertura y cierre." />
            <div className="mt-4">
              {movements.length ? (
                movements.map((movement) => <CashMovementRow key={movement.id} movement={movement} />)
              ) : (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Aún no hay movimientos de caja.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
