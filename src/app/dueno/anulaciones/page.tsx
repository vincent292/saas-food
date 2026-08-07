import { CheckCircle2, Clock, ReceiptText, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { approveOrderCancellationReviewAction, observeOrderCancellationReviewAction } from "@/app/admin/actions";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { ownerOrderAuditService, type OwnerCancellationReview } from "@/lib/services/owner-order-audit.service";
import { formatShortDate, formatShortTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";

type PageSearchParams = {
  date?: string;
  restaurantId?: string;
  approved?: string;
  error?: string;
};

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Aceptado",
  preparing: "En preparacion",
  ready: "Listo",
  delivered: "Entregado",
  cancelled: "Cancelado",
  paid: "Pagado",
  refunded: "Reembolsado",
};

export default async function OwnerCancellationsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const [{ date, restaurantId, approved, error }, { ownerMemberships }] = await Promise.all([
    searchParams,
    getOwnerLayoutContext({ active: "/dueno/anulaciones" }),
  ]);
  const { date: selectedDate, reviews } = await ownerOrderAuditService.listCancellationReviews(ownerMemberships, { date, restaurantId });
  const pendingCount = reviews.filter((review) => review.ownerReviewStatus === "pending").length;
  const returnTo = `/dueno/anulaciones?date=${encodeURIComponent(selectedDate)}${restaurantId ? `&restaurantId=${encodeURIComponent(restaurantId)}` : ""}`;

  return (
    <OwnerLayout active="/dueno/anulaciones" memberships={ownerMemberships} title="Anulaciones">
      <div className="space-y-5">
        {approved ? (
          <div className="rounded-2xl bg-[var(--color-success-soft)] p-3 text-sm font-bold text-[var(--color-success-strong)]">Revision aprobada correctamente.</div>
        ) : null}
        {error ? (
          <div className="rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm font-bold text-[var(--color-danger-strong)]">No se pudo completar la accion: {error}.</div>
        ) : null}

        <Card>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <SectionTitle
              description="Pedidos rechazados o cancelados por sucursal. La sucursal no borra definitivamente; el dueño valida el caso."
              title="Control de pedidos anulados"
            />
            <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" method="get">
              <Select defaultValue={restaurantId ?? ""} name="restaurantId">
                <option value="">Todas las sucursales</option>
                {ownerMemberships.map((membership) => (
                  <option key={membership.restaurant.id} value={membership.restaurant.id}>
                    {membership.restaurant.name}
                  </option>
                ))}
              </Select>
              <Input defaultValue={selectedDate} name="date" type="date" />
              <Button type="submit">Buscar</Button>
            </form>
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-3">
          <AuditMetric icon={<ShieldAlert className="h-5 w-5" />} label="Pendientes" value={String(pendingCount)} />
          <AuditMetric icon={<ReceiptText className="h-5 w-5" />} label="Con caja" value={String(reviews.filter((review) => review.cashMovementId).length)} />
          <AuditMetric icon={<Clock className="h-5 w-5" />} label="Registros del dia" value={String(reviews.length)} />
        </div>

        {reviews.length ? (
          <div className="grid gap-4">
            {reviews.map((review) => (
              <CancellationReviewCard key={review.id} returnTo={returnTo} review={review} />
            ))}
          </div>
        ) : (
          <EmptyState
            description="Cuando una sucursal rechace o cancele un pedido, aparecera aqui para revisar el motivo y el detalle."
            title="Sin anulaciones en esta fecha"
          />
        )}
      </div>
    </OwnerLayout>
  );
}

function CancellationReviewCard({ review, returnTo }: { review: OwnerCancellationReview; returnTo: string }) {
  const needsCashApproval = review.paymentStatusAtCancellation === "paid" || Boolean(review.cashMovementId);

  return (
    <Card>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-[var(--primary-light)] text-[var(--primary)]">{review.restaurantName}</Badge>
            <Badge className={review.ownerReviewStatus === "approved" ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : review.ownerReviewStatus === "observed" ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"}>
              {review.ownerReviewStatus === "approved" ? "Aprobado" : review.ownerReviewStatus === "observed" ? "Observado" : "Pendiente"}
            </Badge>
            {needsCashApproval ? <Badge className="bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]">Afecta caja</Badge> : null}
          </div>

          <h2 className="mt-3 text-2xl font-black text-[var(--color-heading)]">Pedido {review.orderNumber}</h2>
          <p className="mt-1 text-sm font-bold text-[var(--color-secondary-text)]">
            Anulado el {formatShortDate(review.cancelledAt)} a las {formatShortTime(review.cancelledAt)} por {review.cancelledByName ?? review.cancelledByEmail ?? "usuario de sucursal"}.
          </p>

          <div className="mt-4 rounded-2xl bg-[var(--color-surface)] p-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">Motivo registrado</p>
            <p className="mt-1 text-sm font-semibold text-[var(--color-body)]">{review.reason}</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DetailPill label="Estado previo" value={statusLabels[review.orderStatusAtCancellation] ?? review.orderStatusAtCancellation} />
            <DetailPill label="Pago previo" value={statusLabels[review.paymentStatusAtCancellation] ?? review.paymentStatusAtCancellation} />
            <DetailPill label="Tipo" value={review.orderType} />
            <DetailPill label="Total" value={formatMoney(review.total)} />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border)] p-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">Cliente</p>
              <p className="mt-1 text-sm font-bold text-[var(--color-heading)]">{review.customerName || "Sin nombre"}</p>
              <p className="text-sm font-semibold text-[var(--color-secondary-text)]">{review.customerPhone || "Sin telefono"}</p>
              {review.customerAddress ? <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">{review.customerAddress}</p> : null}
            </div>
            <div className="rounded-2xl border border-[var(--border)] p-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">Tiempos</p>
              <TimelineLine label="Aceptado" value={review.acceptedAt} />
              <TimelineLine label="Listo" value={review.readyAt} />
              <TimelineLine label="Despachado" value={review.dispatchedAt} />
              <TimelineLine label="Entregado" value={review.deliveredAt} />
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)]">
            {review.items.map((item, index) => (
              <div className="grid grid-cols-[1fr_auto] gap-3 border-t border-[var(--border)] px-3 py-2 first:border-t-0" key={`${item.name}-${index}`}>
                <div>
                  <p className="text-sm font-black text-[var(--color-heading)]">{item.name}</p>
                  {item.notes ? <p className="text-xs font-semibold text-[var(--color-secondary-text)]">{item.notes}</p> : null}
                </div>
                <p className="text-sm font-black text-[var(--color-heading)]">
                  {item.quantity} x {formatMoney(item.unitPrice)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full shrink-0 space-y-3 xl:w-80">
          {review.paymentReceiptUrl || review.paymentReceiptReference ? (
            <div className="rounded-2xl border border-[var(--border)] p-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">Comprobante</p>
              {review.paymentReceiptReference ? <p className="mt-1 text-sm font-bold text-[var(--color-heading)]">{review.paymentReceiptReference}</p> : null}
              {review.paymentReceiptUrl ? (
                <a className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--primary)] px-4 text-sm font-black text-[var(--color-on-primary)]" href={review.paymentReceiptUrl} rel="noreferrer" target="_blank">
                  Ver comprobante
                </a>
              ) : null}
            </div>
          ) : null}

          {review.ownerReviewStatus === "pending" ? (
            <div className="space-y-3 rounded-2xl border border-[var(--border)] p-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">Decision del dueno</p>
              <form action={approveOrderCancellationReviewAction} className="space-y-3">
                <input name="reviewId" type="hidden" value={review.id} />
                <input name="returnTo" type="hidden" value={returnTo} />
                <Textarea name="notes" placeholder="Nota del dueño (opcional)" />
                <Button className="w-full" type="submit">
                  <CheckCircle2 className="h-4 w-4" />
                  Aprobar anulacion
                </Button>
              </form>
              <form action={observeOrderCancellationReviewAction} className="space-y-3">
              <input name="reviewId" type="hidden" value={review.id} />
              <input name="returnTo" type="hidden" value={returnTo} />
                <Textarea name="notes" placeholder="Motivo de observacion" required />
              <Button className="w-full" type="submit" variant="danger">
                Observar / negar
              </Button>
              </form>
            </div>
          ) : (
            <div className={review.ownerReviewStatus === "approved" ? "rounded-2xl bg-[var(--color-success-soft)] p-3 text-sm font-bold text-[var(--color-success-strong)]" : "rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm font-bold text-[var(--color-danger-strong)]"}>
              {review.ownerReviewStatus === "approved" ? "Aprobado" : "Observado"} {review.ownerReviewedAt ? `el ${formatShortDate(review.ownerReviewedAt)} a las ${formatShortTime(review.ownerReviewedAt)}` : ""}.
              {review.ownerReviewNotes ? <span className="mt-1 block">{review.ownerReviewNotes}</span> : null}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function AuditMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[var(--color-secondary-text)]">{label}</p>
          <p className="mt-1 text-2xl font-black text-[var(--color-heading)]">{value}</p>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">{icon}</span>
      </div>
    </Card>
  );
}

function DetailPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--color-surface)] p-3">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-[var(--color-heading)]">{value}</p>
    </div>
  );
}

function TimelineLine({ label, value }: { label: string; value?: string }) {
  return (
    <p className="mt-1 flex justify-between gap-3 text-sm font-semibold text-[var(--color-secondary-text)]">
      <span>{label}</span>
      <span className="text-[var(--color-heading)]">{value ? formatShortTime(value) : "-"}</span>
    </p>
  );
}
