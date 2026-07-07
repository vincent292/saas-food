import { Activity, ChefHat, Clock3, Flame, Sparkles, Timer, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { formatShortTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import type { Order, OrderQueueState, OrderStatus } from "@/types/order.types";

const queueStep: Record<OrderStatus, number> = {
  pending: 0,
  accepted: 1,
  preparing: 2,
  ready: 3,
  delivered: 4,
  cancelled: -1,
};

const demandStyles: Record<OrderQueueState["demandLevel"], string> = {
  calm: "bg-[var(--color-success-soft)] text-[var(--color-success-strong)] ring-[var(--color-success-soft)]",
  normal: "bg-[var(--color-neutral-100)] text-[var(--color-body)] ring-[var(--border)]",
  busy: "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)] ring-[var(--color-warning-soft)]",
  event: "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)] ring-[var(--color-warning-soft)]",
};

const confidenceLabel: Record<OrderQueueState["confidence"], string> = {
  low: "Aprendiendo",
  medium: "Buena lectura",
  high: "Muy preciso",
};

function estimateLabel(queue: OrderQueueState) {
  if (queue.status === "ready") {
    return "Listo ahora";
  }

  if (queue.status === "delivered") {
    return "Completado";
  }

  if (queue.status === "cancelled") {
    return "Sin estimado";
  }

  if (queue.estimatedMinMinutes <= 0 && queue.estimatedMaxMinutes <= 0) {
    return "Calculando";
  }

  if (queue.estimatedMinMinutes === queue.estimatedMaxMinutes) {
    return `${queue.estimatedMinMinutes} min`;
  }

  return `${queue.estimatedMinMinutes}-${queue.estimatedMaxMinutes} min`;
}

function headline(order: Order, queue: OrderQueueState) {
  if (order.status === "pending" && queue.queuePosition) {
    return `Estas #${queue.queuePosition} en la fila virtual`;
  }

  if (order.status === "accepted" && queue.queuePosition) {
    return `Estas #${queue.queuePosition} en la fila virtual`;
  }

  if (order.status === "preparing") {
    return "Tu pedido esta en preparacion";
  }

  if (order.status === "ready") {
    return order.orderType === "delivery" ? "Tu pedido esta listo para envio" : "Tu pedido esta listo";
  }

  if (order.status === "delivered") {
    return "Pedido completado";
  }

  return "Seguimiento de cocina";
}

function supportingText(order: Order, queue: OrderQueueState) {
  if (order.status === "pending") {
    const ahead = queue.ordersAhead ?? 0;
    if (ahead === 0) {
      return "Tu pedido ya esta en la fila. El restaurante lo confirmara para mandarlo a cocina.";
    }
    return ahead === 1
      ? "Hay 1 pedido antes que el tuyo. El restaurante confirmara el tuyo para mandarlo a cocina."
      : `Hay ${ahead} pedidos antes que el tuyo. El restaurante confirmara el tuyo para mandarlo a cocina.`;
  }

  if (order.status === "accepted") {
    const ahead = queue.ordersAhead ?? 0;
    if (ahead === 0) {
      return "Eres el siguiente para entrar a preparacion.";
    }
    return ahead === 1 ? "Hay 1 pedido antes que el tuyo." : `Hay ${ahead} pedidos antes que el tuyo.`;
  }

  if (order.status === "preparing") {
    return "Cocina ya esta trabajando en tu pedido.";
  }

  if (order.status === "ready") {
    return order.orderType === "delivery" ? "El equipo lo tiene listo para despacho." : "Puedes pasar por el cuando el restaurante te lo indique.";
  }

  if (order.status === "delivered") {
    return "Gracias por pedir con nosotros.";
  }

  return "El estado se actualiza automaticamente.";
}

function readyWindow(queue: OrderQueueState) {
  if (!queue.estimatedReadyAtMin || !queue.estimatedReadyAtMax || queue.estimatedMinMinutes <= 0) {
    return null;
  }

  return `${formatShortTime(queue.estimatedReadyAtMin)} - ${formatShortTime(queue.estimatedReadyAtMax)}`;
}

function QueueLane({ queue }: { queue: OrderQueueState }) {
  const ahead = Math.max(queue.ordersAhead ?? 0, 0);
  const visibleAhead = Math.min(ahead, 4);
  const hiddenAhead = Math.max(ahead - visibleAhead, 0);
  const dots = Array.from({ length: visibleAhead + 1 });

  return (
    <div className="relative min-h-20 overflow-hidden rounded-[1.25rem] bg-[var(--color-neutral-900)] px-4 py-5 text-[var(--color-on-primary)]">
      <div className="absolute inset-x-0 top-0 h-px bg-[var(--surface)]/25" />
      <div className="absolute inset-0 virtual-queue-sheen opacity-70" />
      <div className="relative flex items-center gap-3">
        <div className="h-1 flex-1 rounded-full bg-[var(--color-on-primary-soft)]">
          <div
            className="h-1 rounded-full bg-[var(--primary)] transition-all duration-700"
            style={{ width: `${Math.max(22, Math.min(100, ((visibleAhead + 1) / 5) * 100))}%` }}
          />
        </div>
        <span className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-primary-muted)]">En vivo</span>
      </div>

      <div className="relative mt-5 flex items-center gap-2">
        {dots.map((_, index) => {
          const isMine = index === dots.length - 1;
          return (
            <span
              aria-hidden="true"
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-full border text-xs font-black shadow-lg transition",
                isMine
                  ? "virtual-queue-breathe border-[var(--primary)] bg-[var(--primary)] text-[var(--color-on-primary)] shadow-[var(--shadow-glow)]"
                  : "border-[var(--surface)]/10 bg-[var(--color-on-primary-soft)] text-[var(--color-on-primary-muted)]",
              )}
              key={index}
            >
              {isMine ? "Tu" : index + 1}
            </span>
          );
        })}
        {hiddenAhead ? <span className="rounded-full bg-[var(--surface)]/10 px-3 py-2 text-xs font-black text-[var(--color-on-primary-muted)]">+{hiddenAhead}</span> : null}
        <span className="ml-auto grid h-10 w-10 place-items-center rounded-full bg-[var(--surface)] text-[var(--color-heading)] shadow-lg">
          <ChefHat className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function QueueProgress({ status }: { status: OrderStatus }) {
  const currentStep = queueStep[status];
  const steps = [
    { label: "Confirmado", icon: Sparkles },
    { label: "En fila", icon: UsersRound },
    { label: "Preparacion", icon: ChefHat },
    { label: "Listo", icon: Flame },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {steps.map((step, index) => {
        const active = currentStep === index + 1 || (status === "pending" && index === 0);
        const done = currentStep > index + 1 || status === "ready" || status === "delivered";
        return (
          <div
            className={cn(
              "min-h-20 rounded-2xl border p-2 text-center transition sm:p-3",
              done && "border-[var(--primary)] bg-[var(--primary)] text-[var(--color-on-primary)]",
              active && "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary-dark)] ring-2 ring-[var(--primary)]/15",
              !done && !active && "border-[var(--color-neutral-100)] bg-[var(--color-surface)] text-[var(--color-placeholder)]",
            )}
            key={step.label}
          >
            <step.icon className={cn("mx-auto h-5 w-5", done ? "text-[var(--color-on-primary)]" : active ? "text-[var(--primary)]" : "text-[var(--color-placeholder)]")} />
            <p className="mt-2 text-[0.68rem] font-black leading-tight sm:text-xs">{step.label}</p>
          </div>
        );
      })}
    </div>
  );
}

export function VirtualQueueCard({ order, queue }: { order: Order; queue: OrderQueueState | null }) {
  if (!queue?.queueEnabled || order.status === "cancelled") {
    return null;
  }

  const windowLabel = readyWindow(queue);

  return (
    <Card className="mt-6 overflow-hidden p-0">
      <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Badge className={cn("ring-1", demandStyles[queue.demandLevel])}>
                <Activity className="mr-1.5 h-3.5 w-3.5" />
                {queue.demandLabel}
              </Badge>
              <h2 className="mt-4 text-2xl font-black leading-tight text-[var(--text)] sm:text-3xl">{headline(order, queue)}</h2>
              <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-[var(--muted)]">{supportingText(order, queue)}</p>
            </div>

            <div className="rounded-2xl bg-[var(--primary-light)] px-4 py-3 text-[var(--primary-dark)] sm:text-right">
              <p className="text-xs font-black uppercase tracking-[0.14em]">Estimado</p>
              <p className="mt-1 text-3xl font-black">{estimateLabel(queue)}</p>
              {windowLabel ? <p className="mt-1 text-xs font-bold opacity-80">{windowLabel}</p> : null}
            </div>
          </div>

          <QueueLane queue={queue} />
          <QueueProgress status={order.status} />
        </section>

        <aside className="grid gap-3 border-t border-[var(--border)] bg-[var(--color-surface)] p-5 sm:grid-cols-3 lg:grid-cols-1 lg:border-l lg:border-t-0">
          <div className="rounded-2xl bg-[var(--surface)] p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black text-[var(--text)]">
              <UsersRound className="h-4 w-4 text-[var(--primary)]" />
              Fila actual
            </div>
            <p className="mt-3 text-3xl font-black text-[var(--text)]">{queue.activeOrders}</p>
            <p className="text-xs font-semibold text-[var(--muted)]">pedidos activos</p>
          </div>

          <div className="rounded-2xl bg-[var(--surface)] p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black text-[var(--text)]">
              <ChefHat className="h-4 w-4 text-[var(--primary)]" />
              En cocina
            </div>
            <p className="mt-3 text-3xl font-black text-[var(--text)]">{queue.preparingOrders}</p>
            <p className="text-xs font-semibold text-[var(--muted)]">en preparacion</p>
          </div>

          <div className="rounded-2xl bg-[var(--surface)] p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black text-[var(--text)]">
              <Timer className="h-4 w-4 text-[var(--primary)]" />
              Precision
            </div>
            <p className="mt-3 text-lg font-black text-[var(--text)]">{confidenceLabel[queue.confidence]}</p>
            <p className="text-xs font-semibold text-[var(--muted)]">
              {queue.historySampleSize ? `${queue.historySampleSize} pedidos medidos` : "con datos iniciales"}
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-card-soft)] p-3 text-xs font-black text-[var(--muted)] sm:col-span-3 lg:col-span-1">
            <Clock3 className="h-4 w-4" />
            Actualiza en tiempo real
          </div>
        </aside>
      </div>
    </Card>
  );
}
