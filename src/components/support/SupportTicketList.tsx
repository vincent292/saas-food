import { ImageIcon, Paperclip } from "lucide-react";
import { updateSupportTicketAction } from "@/app/admin/actions";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatShortDate, formatShortTime } from "@/lib/utils/dates";
import type { SupportTicket } from "@/types/superadmin.types";

const statuses: SupportTicket["status"][] = ["open", "in_progress", "waiting_customer", "resolved", "closed"];
const priorities: SupportTicket["priority"][] = ["low", "medium", "high", "urgent"];

const statusLabels: Record<SupportTicket["status"], string> = {
  open: "Abierto",
  in_progress: "En progreso",
  waiting_customer: "Esperando cliente",
  resolved: "Resuelto",
  closed: "Cerrado",
};

const priorityLabels: Record<SupportTicket["priority"], string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

const categoryLabels: Record<SupportTicket["category"], string> = {
  access: "Acceso",
  billing: "Facturación",
  orders: "Pedidos",
  cash: "Caja",
  inventory: "Inventario",
  incident: "Incidencia",
  other: "Otro",
};

export function SupportTicketList({
  tickets,
  emptyMessage,
  showRestaurant = false,
  allowUpdate = false,
  returnTo,
}: {
  tickets: SupportTicket[];
  emptyMessage: string;
  showRestaurant?: boolean;
  allowUpdate?: boolean;
  returnTo?: string;
}) {
  if (!tickets.length) {
    return (
      <Card>
        <p className="text-sm font-semibold text-[var(--color-secondary-text)]">{emptyMessage}</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {tickets.map((ticket) => (
        <Card className="space-y-4" key={ticket.id}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-black text-[var(--color-heading)]">{ticket.title}</p>
                <PriorityBadge priority={ticket.priority} />
                <StatusBadge status={ticket.status} />
                <Badge className="bg-[var(--color-neutral-100)] text-[var(--color-body)]">{categoryLabels[ticket.category]}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-[var(--color-secondary-text)]">
                {showRestaurant ? <span>{ticket.restaurantName}</span> : null}
                <span>{formatShortDate(ticket.createdAt)} {formatShortTime(ticket.createdAt)}</span>
                <span>{ticket.createdByName ?? ticket.createdByEmail ?? "Sin remitente"}</span>
              </div>
            </div>

            {allowUpdate ? (
              <form action={updateSupportTicketAction} className="flex flex-wrap gap-2">
                <input name="ticketId" type="hidden" value={ticket.id} />
                {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
                <select className="min-h-10 rounded-2xl border border-[var(--border)] px-3 text-sm font-semibold" defaultValue={ticket.status} name="status">
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
                <select className="min-h-10 rounded-2xl border border-[var(--border)] px-3 text-sm font-semibold" defaultValue={ticket.priority} name="priority">
                  {priorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priorityLabels[priority]}
                    </option>
                  ))}
                </select>
                <button className={buttonClasses("secondary")} type="submit">
                  Guardar
                </button>
              </form>
            ) : null}
          </div>

          <p className="text-sm text-[var(--color-body)]">{ticket.description || "Sin detalle adicional."}</p>

          {ticket.attachments.length ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-black text-[var(--color-body)]">
                <Paperclip className="h-4 w-4" />
                Screenshots adjuntos ({ticket.attachments.length})
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {ticket.attachments.map((attachment) => (
                  <a className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] transition hover:border-[var(--color-success)]" href={attachment.fileUrl} key={attachment.id} rel="noreferrer" target="_blank">
                    <div className="aspect-[16/10] bg-[var(--color-neutral-100)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt={attachment.fileName} className="h-full w-full object-cover" src={attachment.fileUrl} />
                    </div>
                    <div className="space-y-1 p-3">
                      <p className="truncate text-sm font-black text-[var(--color-heading)]">{attachment.fileName}</p>
                      <p className="text-xs font-semibold text-[var(--color-secondary-text)]">{formatBytes(attachment.fileSize)}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-2xl bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-secondary-text)]">
              <ImageIcon className="h-4 w-4" />
              Sin screenshots adjuntos.
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: SupportTicket["priority"] }) {
  const className =
    priority === "urgent"
      ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
      : priority === "high"
        ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"
        : priority === "medium"
          ? "bg-[var(--color-neutral-100)] text-[var(--color-body)]"
          : "bg-[var(--color-surface)] text-[var(--color-secondary-text)]";

  return <Badge className={className}>{priorityLabels[priority]}</Badge>;
}

function StatusBadge({ status }: { status: SupportTicket["status"] }) {
  const className =
    status === "resolved" || status === "closed"
      ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
      : status === "waiting_customer"
        ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"
        : status === "in_progress"
          ? "bg-[var(--color-info-soft)] text-[var(--color-info-strong)]"
          : "bg-[var(--color-neutral-100)] text-[var(--color-body)]";

  return <Badge className={className}>{statusLabels[status]}</Badge>;
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${value} B`;
}
