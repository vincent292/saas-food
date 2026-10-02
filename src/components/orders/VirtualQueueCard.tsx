import { Activity, ChefHat, Clock3, Flame, Sparkles, Timer, UserRound, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { formatShortTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { businessPreparationAreaLabel, businessPreparationAreaTitle, businessTypeSupportsKitchen } from "@/lib/restaurant-directory-options";
import type { Order, OrderQueueState, OrderStatus } from "@/types/order.types";
import type { BusinessType } from "@/types/restaurant.types";

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

function headline(order: Order, queue: OrderQueueState, businessType: BusinessType) {
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
    if (order.orderType === "delivery") {
      return "Tu pedido esta listo para envio";
    }

    if (order.orderType === "pickup") {
      return "Tu pedido esta listo para recoger";
    }

    return "Tu pedido esta listo";
  }

  if (order.status === "delivered") {
    return "Pedido completado";
  }

  return businessTypeSupportsKitchen(businessType) ? "Seguimiento de cocina" : "Seguimiento del pedido";
}

function supportingText(order: Order, queue: OrderQueueState, businessType: BusinessType) {
  const preparationArea = businessPreparationAreaLabel(businessType);

  if (order.status === "pending") {
    const ahead = queue.ordersAhead ?? 0;
    if (ahead === 0) {
      return businessTypeSupportsKitchen(businessType)
        ? "Tu pedido ya esta en la fila. El restaurante lo confirmara para mandarlo a cocina."
        : `Tu pedido ya esta en la fila. El negocio lo confirmara para enviarlo a ${preparationArea}.`;
    }
    return ahead === 1
      ? businessTypeSupportsKitchen(businessType)
        ? "Hay 1 pedido antes que el tuyo. El restaurante confirmara el tuyo para mandarlo a cocina."
        : `Hay 1 pedido antes que el tuyo. El negocio confirmara el tuyo para enviarlo a ${preparationArea}.`
      : businessTypeSupportsKitchen(businessType)
        ? `Hay ${ahead} pedidos antes que el tuyo. El restaurante confirmara el tuyo para mandarlo a cocina.`
        : `Hay ${ahead} pedidos antes que el tuyo. El negocio confirmara el tuyo para enviarlo a ${preparationArea}.`;
  }

  if (order.status === "accepted") {
    const ahead = queue.ordersAhead ?? 0;
    if (ahead === 0) {
      return "Eres el siguiente para entrar a preparacion.";
    }
    return ahead === 1 ? "Hay 1 pedido antes que el tuyo." : `Hay ${ahead} pedidos antes que el tuyo.`;
  }

  if (order.status === "preparing") {
    return businessTypeSupportsKitchen(businessType) ? "Cocina ya esta trabajando en tu pedido." : "El equipo esta alistando tu pedido.";
  }

  if (order.status === "ready") {
    if (order.orderType === "delivery") {
      return "El equipo lo tiene listo para despacho.";
    }

    if (order.orderType === "pickup") {
      return "Puedes pasar por el local y pedirlo con tu numero de pedido.";
    }

    return "El pedido esta listo para continuar.";
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
    <div className="relative overflow-hidden rounded-[1.5rem] bg-[linear-gradient(125deg,#082441_0%,#12355B_54%,#0B2D4E_100%)] px-4 py-4 text-[var(--color-on-primary)] shadow-[inset_0_1px_rgb(255_255_255_/_0.14)] sm:px-5 sm:py-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/25" />
      <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-[var(--accent)]/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 virtual-queue-sheen opacity-60" />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--accent)]">Fila virtual</p>
          <p className="mt-1 text-sm font-bold text-white/78">{ahead ? `${ahead} ${ahead === 1 ? "pedido antes" : "pedidos antes"} que el tuyo` : "Eres el siguiente para cocina"}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/85 ring-1 ring-white/10">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" /></span>
          En vivo
        </span>
      </div>

      <div className="relative mt-5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="relative flex min-w-[285px] items-start justify-between gap-2 px-0.5">
          <span aria-hidden="true" className="absolute left-5 right-5 top-5 h-1 rounded-full bg-white/12" />
          <span aria-hidden="true" className="absolute left-5 top-5 h-1 rounded-full bg-[var(--accent)] transition-all duration-700" style={{ width: `${Math.max(18, Math.min(82, ((visibleAhead + 1) / Math.max(visibleAhead + 3, 5)) * 100))}%` }} />
          {dots.map((_, index) => {
            const isMine = index === dots.length - 1;
            return (
              <div className="relative z-10 grid justify-items-center gap-1.5" key={index}>
                <span
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-full border shadow-lg transition sm:h-11 sm:w-11",
                    isMine
                      ? "virtual-queue-breathe border-[var(--accent)] bg-[var(--accent)] text-[var(--primary-dark)] shadow-[var(--shadow-glow)]"
                      : "border-white/12 bg-white/10 text-white/75",
                  )}
                >
                  {isMine ? <UserRound className="h-5 w-5" /> : <UsersRound className="h-4 w-4" />}
                </span>
                <span className={cn("text-[10px] font-black", isMine ? "text-[var(--accent)]" : "text-white/55")}>{isMine ? "Tú" : `#${index + 1}`}</span>
              </div>
            );
          })}
          {hiddenAhead ? <span className="relative z-10 mt-2 rounded-full bg-white/10 px-2 py-1 text-[10px] font-black text-white/70">+{hiddenAhead}</span> : null}
          <div className="relative z-10 grid justify-items-center gap-1.5">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-[var(--primary-dark)] shadow-lg sm:h-11 sm:w-11"><ChefHat className="h-5 w-5" /></span>
            <span className="text-[10px] font-black text-white/80">Cocina</span>
          </div>
        </div>
      </div>

      <div className="relative mt-4 flex items-center justify-between gap-3 rounded-2xl bg-black/10 px-3 py-2.5 text-xs font-bold text-white/72 ring-1 ring-white/8">
        <span className="inline-flex items-center gap-2"><UsersRound className="h-4 w-4 text-[var(--accent)]" />Tu turno se actualiza al avanzar la fila.</span>
        <span className="hidden shrink-0 text-white/52 sm:inline">Destino: cocina</span>
      </div>
    </div>
  );
}

function QueueProgress({ status, businessType }: { status: OrderStatus; businessType: BusinessType }) {
  const preparationTitle = businessPreparationAreaTitle(businessType);
  const currentStep = queueStep[status];
  const steps = [
    { label: "Confirmado", icon: Sparkles },
    { label: "En fila", icon: UsersRound },
    { label: preparationTitle, icon: ChefHat },
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

export function VirtualQueueCard({ order, queue, businessType = "food" }: { order: Order; queue: OrderQueueState | null; businessType?: BusinessType }) {
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
              <h2 className="mt-4 text-2xl font-black leading-tight text-[var(--text)] sm:text-3xl">{headline(order, queue, businessType)}</h2>
              <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-[var(--muted)]">{supportingText(order, queue, businessType)}</p>
            </div>

            <div className="rounded-2xl bg-[var(--primary-light)] px-4 py-3 text-[var(--primary-dark)] sm:text-right">
              <p className="text-xs font-black uppercase tracking-[0.14em]">Estimado</p>
              <p className="mt-1 text-3xl font-black">{estimateLabel(queue)}</p>
              {windowLabel ? <p className="mt-1 text-xs font-bold opacity-80">{windowLabel}</p> : null}
            </div>
          </div>

          <QueueLane queue={queue} />
          <QueueProgress businessType={businessType} status={order.status} />
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
              {businessPreparationAreaTitle(businessType)}
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
