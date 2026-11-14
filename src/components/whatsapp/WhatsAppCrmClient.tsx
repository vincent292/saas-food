"use client";

import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  BarChart3,
  Bot,
  Check,
  ExternalLink,
  Info,
  LoaderCircle,
  MapPin,
  MenuSquare,
  MessageCircle,
  MessageSquareReply,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  ShoppingBag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  deactivateWhatsAppQuickReplyAction,
  releaseWhatsAppCrmConversationAction,
  sendWhatsAppCrmLocationAction,
  sendWhatsAppCrmMenuAction,
  sendWhatsAppCrmMessageInlineAction,
  saveWhatsAppBotSettingsAction,
  saveWhatsAppQuickReplyAction,
  takeWhatsAppCrmConversationAction,
} from "@/app/admin/restaurantes/[restaurantId]/whatsapp/actions";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { whatsappUsageNotice } from "@/lib/whatsapp-usage-alert";
import type { Restaurant } from "@/types/restaurant.types";
import type { WhatsAppCrmBotSettings, WhatsAppCrmConversation, WhatsAppCrmMessage, WhatsAppCrmWorkspace } from "@/types/whatsapp-crm.types";

type ConversationTab = "all" | "needsReply" | "orders" | "handoff" | "previous";

const tabLabels: Record<ConversationTab, string> = {
  all: "Todas",
  needsReply: "Sin responder",
  orders: "Con pedido",
  handoff: "Humano",
  previous: "Canal central anterior",
};

const feedbackMessages: Record<string, string> = {
  "whatsapp-not-configured": "Falta configurar WhatsApp Cloud API para responder desde el CRM.",
  "whatsapp-window-closed": "Pasaron 24 horas desde el ultimo mensaje del cliente. Espera un nuevo mensaje o responde desde WhatsApp Business; el CRM no envia plantillas todavia.",
  "whatsapp-send-failed": "WhatsApp no acepto el envio. Revisa la ventana de 24 horas o usa plantilla aprobada.",
  "conversation-not-found": "No encontre esa conversacion para este restaurante.",
  "restaurant-not-found": "No encontre los datos del restaurante.",
  sent: "Mensaje enviado.",
  handoff: "Conversacion tomada por el equipo.",
  released: "Bot reactivado para esta conversacion.",
  replySaved: "Respuesta rapida guardada.",
  replyDeleted: "Respuesta rapida eliminada.",
  botSaved: "Configuracion del bot guardada.",
};

const toneLabels = {
  friendly: "Cercano",
  direct: "Directo",
  formal: "Formal",
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-BO", {
    currency: "BOB",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  })
    .format(value)
    .replace("BOB", "Bs");
}

function formatTime(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/La_Paz",
  }).format(new Date(value));
}

function formatShortDate(value?: string) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
  }).format(new Date(value));
}

function initials(value: string) {
  const clean = value.trim() || "Cliente";
  return clean
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function stateLabel(value: string) {
  const labels: Record<string, string> = {
    browsing_menu: "Viendo menu",
    choosing_restaurant: "Eligiendo local",
    drafting_order: "Armando pedido",
    handoff: "Atencion humana",
    idle: "Disponible",
  };
  return labels[value] ?? value;
}

function conversationHref(restaurantId: string, conversationId: string) {
  return `/admin/restaurantes/${restaurantId}/whatsapp?conversation=${conversationId}`;
}

function MessageBubble({ message }: { message: WhatsAppCrmMessage }) {
  const outbound = message.direction === "outbound";

  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[78%] lg:max-w-[38rem]",
          outbound
            ? "rounded-tr-sm bg-[#d9fdd3] text-[#1f3b25]"
            : "rounded-tl-sm border border-black/5 bg-white text-[var(--color-heading)]",
        )}
      >
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">{message.text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => /^https?:\/\//.test(part) ? <a className="underline decoration-current/40 underline-offset-2 hover:decoration-current" href={part} key={index} rel="noopener noreferrer" target="_blank">{part}</a> : part)}</p>
        <div className={cn("mt-1 flex items-center gap-1 text-[0.65rem] font-bold", outbound ? "justify-end text-[#4c6f58]" : "text-[var(--color-secondary-text)]")}>
          <span>{formatTime(message.timestamp)}</span>
          {outbound ? <><span>{message.source === "bot" ? "Bot" : message.source === "business_app" ? "WhatsApp Business" : "Equipo"}</span><Check aria-label="Enviado a WhatsApp" className="h-3 w-3" /></> : null}
        </div>
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  restaurantId,
  selected,
}: {
  conversation: WhatsAppCrmConversation;
  restaurantId: string;
  selected: boolean;
}) {
  return (
    <Link
      className={cn(
        "flex min-h-[4.5rem] gap-3 border-b border-[var(--border)] px-3 py-2.5 transition hover:bg-[#f0f2f5]",
        selected && "border-l-4 border-l-[#25d366] bg-[#f0f2f5] pl-2",
      )}
      href={conversationHref(restaurantId, conversation.id)}
      prefetch={false}
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-neutral-100)] text-sm font-black text-[var(--primary)]">
        {initials(conversation.displayName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-black text-[var(--color-heading)]">{conversation.displayName}</p>
          <span className="shrink-0 text-[0.68rem] font-bold text-[var(--color-secondary-text)]">{formatTime(conversation.lastMessageAt)}</span>
        </div>
        <p className="mt-1 truncate text-xs font-semibold text-[var(--color-secondary-text)]">
          {conversation.lastMessage?.text ?? stateLabel(conversation.state)}
        </p>
        <div className="mt-1.5 flex items-center gap-2 text-[0.68rem] text-[var(--color-secondary-text)]">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", conversation.needsReply ? "bg-[var(--color-warning)]" : "bg-[var(--color-success-strong)]")} />
          <span className="truncate">{conversation.channel === "platform" ? "Canal central anterior" : stateLabel(conversation.state)}</span>
          {conversation.needsReply ? <span className="ml-auto font-bold text-[var(--color-warning-strong)]">Pendiente</span> : null}
        </div>
      </div>
    </Link>
  );
}

function UsagePanel({ usage }: { usage: WhatsAppCrmWorkspace["usage"] }) {
  const number = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("es-BO").format(value);
  const notice = whatsappUsageNotice(usage);
  const money = usage.metaCost !== null && usage.metaCurrency
    ? new Intl.NumberFormat("es-BO", { style: "currency", currency: usage.metaCurrency }).format(usage.metaCost)
    : null;
  const estimatedServiceCost = usage.estimatedServiceCostUsd === null ? "Sin estimación disponible"
    : new Intl.NumberFormat("es-BO", { style: "currency", currency: "USD" }).format(usage.estimatedServiceCostUsd);
  return <section className="space-y-4">
    <div>
      <h3 className="text-sm font-bold">Consumo de WhatsApp · {new Intl.DateTimeFormat("es-BO", { month: "long", year: "numeric", timeZone: "America/La_Paz" }).format(new Date(usage.periodStart))}</h3>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">Bolsa mensual del número conectado, según las entregas que informa Meta.</p>
    </div>
    <div className={cn("space-y-3 rounded-xl border p-4", notice ? "border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)]" : "border-[var(--border)] bg-[var(--color-surface)]")}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-[var(--muted)]">Mensajes de servicio gratuitos usados</p><p className="mt-1 text-xl font-bold">{number(usage.freeServiceMessagesUsed)} <span className="text-sm font-normal text-[var(--muted)]">/ {number(usage.freeServiceMessagesLimit)}</span></p></div><div className="text-right"><p className="text-xs text-[var(--muted)]">Disponibles</p><p className="mt-1 text-xl font-bold">{number(usage.freeServiceMessagesRemaining)}</p></div></div>
      {usage.freeServiceMessagesUsed !== null ? <progress aria-label="Uso de la bolsa gratuita de WhatsApp" className="h-2 w-full overflow-hidden rounded-full accent-[#15803d]" max={usage.freeServiceMessagesLimit} value={usage.freeServiceMessagesUsed} /> : null}
      <p className="text-xs leading-relaxed text-[var(--muted)]">Se renueva cada mes por número. Te avisamos cuando queden 100 y al agotarse. Los mensajes que envía el cliente no consumen esta bolsa.</p>
      {usage.pricingStatus !== "synced" ? <p className="text-xs font-semibold text-[var(--color-warning-strong)]">No pudimos sincronizar la bolsa con Meta. Los mensajes enviados por Yopido no confirman entregas ni cargos.</p> : null}
      {notice ? <p className="text-xs font-semibold leading-relaxed text-[var(--color-warning-strong)]">{notice.title}. {notice.detail}</p> : null}
    </div>
    <div className="grid grid-cols-2 gap-3">
      <UsageMetric label="Enviados por Yopido" value={number(usage.apiMessagesThisMonth)} />
      <UsageMetric label="Recibidos de clientes" value={number(usage.receivedMessagesThisMonth)} />
      <UsageMetric label="Entregados según Meta" value={number(usage.metaDeliveredMessages)} />
      <UsageMetric label="Servicio con cargo" value={number(usage.billableServiceMessages)} />
      <UsageMetric label="Todos con cargo" value={number(usage.billableMessages)} />
      <UsageMetric label="Entrada gratuita de Meta" value={number(usage.adProtectedMessages)} />
    </div>
    <div className="space-y-2 rounded-xl border border-[var(--border)] p-4">
      <p className="text-xs text-[var(--muted)]">Servicio con cargo · estimación del mes</p><p className="text-lg font-bold">{estimatedServiceCost}</p>
      <p className="text-xs leading-relaxed text-[var(--muted)]">Solo servicio a números de Bolivia: USD 0,0113 por mensaje con cargo, tarifa de Meta vigente desde el 1 de octubre de 2026. Excluye plantillas, impuestos y cargos del proveedor.</p>
      {money ? <p className="text-xs leading-relaxed"><span className="font-semibold">Total informado por Meta: {money}.</span> Puede ajustarse en la factura.</p> : <p className="text-xs leading-relaxed text-[var(--muted)]">{usage.costStatus === "partner_billing" ? "El importe facturado lo informa tu proveedor de WhatsApp; Meta solo permite consultar el volumen con cargo de esta cuenta." : "Meta todavía no informa un importe facturado para esta cuenta."}</p>}
      <a className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-[var(--primary)] underline" href="https://business.facebook.com/wa/manage/" rel="noopener noreferrer" target="_blank">Abrir WhatsApp Manager<ExternalLink className="h-3 w-3" /></a>
    </div>
    <p className="text-xs leading-relaxed text-[var(--muted)]">La bolsa cubre mensajes de servicio; otras categorías, como plantillas, pueden tener cargos antes de agotarla. Los mensajes enviados desde la app WhatsApp Business no se cuentan como envíos API de Yopido.</p>
    <p className="text-[0.65rem] leading-relaxed text-[var(--muted)]">{usage.lastSyncedAt ? `Consulta a Meta: ${formatTime(usage.lastSyncedAt)}. ` : ""}Las estadísticas de Meta pueden actualizarse con retraso. El importe definitivo está en la factura.</p>
  </section>;
}

function UsageMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[var(--color-surface)] p-3"><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>;
}

function InboxDrawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog aria-labelledby="whatsapp-drawer-title" className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-[var(--text)] backdrop:bg-black/35 backdrop:backdrop-blur-sm" onCancel={onClose} ref={ref}>
    <button aria-label="Cerrar panel" className="absolute inset-0" onClick={onClose} tabIndex={-1} type="button" />
    <section className="relative ml-auto flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-base font-bold" id="whatsapp-drawer-title">{title}</h2>
        <button aria-label="Cerrar" autoFocus className="grid h-10 w-10 place-items-center rounded-full hover:bg-[var(--color-surface)]" onClick={onClose} type="button"><X className="h-5 w-5" /></button>
      </div>
      <div className="admin-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto p-5">{children}</div>
    </section>
  </dialog>;
}

export function WhatsAppCrmClient({ canViewUsage, restaurant, workspace, feedback }: {
  canViewUsage: boolean; restaurant: Restaurant; workspace: WhatsAppCrmWorkspace; feedback?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<ConversationTab>(workspace.selectedConversation?.channel === "platform" && workspace.branchConnectionStatus ? "previous" : "all");
  const [drawer, setDrawer] = useState<"contact" | "overview" | null>(null);
  const [botSettingsOpen, setBotSettingsOpen] = useState(false);
  const [hiddenFeedback, setHiddenFeedback] = useState("");
  const [quickReplyTitle, setQuickReplyTitle] = useState("");
  const [quickReplyBody, setQuickReplyBody] = useState("");
  const messageArea = useRef<HTMLDivElement>(null);
  const followMessages = useRef(true);
  const lastConversation = useRef<string | undefined>(undefined);
  const selected = workspace.selectedConversation;
  const mobileChatOpen = searchParams.has("conversation");
  const hasBranch = Boolean(workspace.branchConnectionStatus);
  const hasPrevious = workspace.conversations.some((c) => c.channel === "platform");
  const usageNotice = canViewUsage ? whatsappUsageNotice(workspace.usage) : null;
  const connectionLabel = workspace.branchConnectionStatus
    ? { connected: "Conectado", pending: "Enlace incompleto", disconnected: "Desconectado", needs_reconnect: "Reconectar" }[workspace.branchConnectionStatus]
    : workspace.whatsappConfigured ? "Canal central sin verificar" : "Sin conectar";

  const filteredConversations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workspace.conversations.filter((conversation) => {
      if (tab === "previous" ? conversation.channel !== "platform" : hasBranch && conversation.channel === "platform") return false;
      const matchesTab = tab === "all" || tab === "previous" || (tab === "needsReply" && conversation.needsReply) ||
        (tab === "orders" && Boolean(conversation.activeDraft || conversation.orderCount > 0)) || (tab === "handoff" && conversation.state === "handoff");
      return matchesTab && (!needle || conversation.displayName.toLowerCase().includes(needle) || conversation.phone.includes(needle) || conversation.lastMessage?.text.toLowerCase().includes(needle));
    });
  }, [query, tab, hasBranch, workspace.conversations]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [router]);

  const latestMessage = workspace.messages.at(-1)?.id;
  useEffect(() => {
    const area = messageArea.current;
    const changed = lastConversation.current !== selected?.id;
    if (area && (changed || followMessages.current)) {
      area.scrollTo({ top: area.scrollHeight, behavior: changed ? "auto" : "smooth" });
      followMessages.current = true;
    }
    lastConversation.current = selected?.id;
  }, [selected?.id, latestMessage, mobileChatOpen]);

  const feedbackText = feedback ? feedbackMessages[feedback] ?? "No se pudo completar la acción. Intenta de nuevo." : "";
  const isPositiveFeedback = ["sent", "handoff", "released", "replySaved", "replyDeleted", "botSaved"].includes(feedback ?? "");
  useEffect(() => {
    if (!feedbackText) return;
    const timer = window.setTimeout(() => setHiddenFeedback(feedbackText), 6000);
    return () => window.clearTimeout(timer);
  }, [feedbackText]);

  return <div className="flex h-[calc(100dvh-7rem)] min-h-0 flex-col gap-3 sm:h-[calc(100dvh-7.5rem)]" data-testid="whatsapp-inbox">
    <div className="flex shrink-0 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e7f7ed] text-[#15803d]"><MessageCircle className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">WhatsApp <span className="hidden font-normal text-[var(--muted)] sm:inline">· {restaurant.name}</span></p>
          <Link className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:underline" href={`/admin/restaurantes/${restaurant.id}/configuracion?tab=whatsapp`}>
            <span className={cn("h-1.5 w-1.5 rounded-full", workspace.branchConnectionStatus === "connected" ? "bg-[#22c55e]" : "bg-[var(--color-warning)]")} />{connectionLabel}
          </Link>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button aria-label="Actualizar conversaciones" className="grid h-10 w-10 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--primary-light)]" onClick={() => router.refresh()} title="Actualizar" type="button"><RefreshCw className="h-4 w-4" /></button>
        {canViewUsage ? <>
          <button aria-label="Ver resumen de WhatsApp" className="inline-flex h-10 items-center gap-2 rounded-xl px-2.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--primary-light)]" onClick={() => setDrawer("overview")} type="button"><BarChart3 className="h-4 w-4" /><span className="hidden sm:inline">Resumen</span></button>
          <button aria-label="Configurar bot de WhatsApp" className="inline-flex h-10 items-center gap-2 rounded-xl px-2.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--primary-light)]" onClick={() => setBotSettingsOpen(true)} type="button"><Settings2 className="h-4 w-4" /><span className="hidden sm:inline">Bot</span></button>
        </> : null}
      </div>
    </div>

    {feedbackText && hiddenFeedback !== feedbackText ? <div className={cn("shrink-0 rounded-xl px-3 py-2 text-xs", isPositiveFeedback ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]")} role="status">{feedbackText}</div> : null}

    {usageNotice ? <div className="flex shrink-0 items-start gap-2 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-3 py-2 text-[var(--color-warning-strong)]" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0 flex-1"><p className="text-xs font-bold">{usageNotice.title}</p><p className="mt-0.5 text-xs leading-relaxed">{usageNotice.detail}</p></div><button className="min-h-9 shrink-0 text-xs font-bold underline" onClick={() => setDrawer("overview")} type="button">Ver consumo</button></div> : null}

    <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm lg:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)]">
      <section aria-label="Conversaciones de WhatsApp" className={cn("min-h-0 min-w-0 flex-col border-r border-[var(--border)]", mobileChatOpen && selected ? "hidden lg:flex" : "flex")}>
        <div className="shrink-0 space-y-3 border-b border-[var(--border)] p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="whitespace-nowrap text-sm font-bold">Chats <span className="ml-1 font-normal text-[var(--muted)]">{filteredConversations.length}</span></h2>
            <select aria-label="Filtrar conversaciones" className="min-h-9 w-36 shrink-0 rounded-lg border-0 bg-[var(--color-surface)] px-2 text-xs text-[var(--muted)] outline-none focus:ring-2 focus:ring-[var(--primary-light)]" onChange={(event) => setTab(event.target.value as ConversationTab)} value={tab}>
              {(Object.keys(tabLabels) as ConversationTab[]).filter((key) => key !== "previous" || hasBranch && hasPrevious).map((key) => <option key={key} value={key}>{tabLabels[key]}</option>)}
            </select>
          </div>
          <label className="flex h-10 items-center gap-2 rounded-xl bg-[var(--color-surface)] px-3">
            <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            <input aria-label="Buscar conversación" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-placeholder)]" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre o teléfono" value={query} />
          </label>
        </div>
        <div className="admin-scrollbar min-h-0 flex-1 overflow-y-auto">
          {filteredConversations.length ? filteredConversations.map((conversation) => <ConversationRow conversation={conversation} key={conversation.id} restaurantId={restaurant.id} selected={selected?.id === conversation.id} />) : <div className="grid min-h-52 place-items-center p-5 text-center"><div><MessageCircle className="mx-auto mb-3 h-8 w-8 text-[var(--color-placeholder)]" /><p className="text-sm text-[var(--muted)]">{query ? "No encontramos esa conversación." : "Todavía no hay chats en este filtro."}</p>{hasBranch && hasPrevious && tab !== "previous" ? <button className="mt-3 text-xs font-semibold text-[var(--primary)] underline" onClick={() => setTab("previous")} type="button">Ver canal central anterior</button> : null}</div></div>}
        </div>
        <p className="shrink-0 border-t border-[var(--border)] px-4 py-2 text-[0.65rem] text-[var(--muted)]">Actualización automática cada 15 segundos</p>
      </section>

      <section aria-label="Chat de WhatsApp" className={cn("min-h-0 min-w-0 flex-col", mobileChatOpen && selected ? "flex" : "hidden lg:flex")}>
        {selected ? <>
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Link aria-label="Volver a conversaciones" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-[var(--color-surface)] lg:hidden" href={`/admin/restaurantes/${restaurant.id}/whatsapp`} prefetch={false}><ArrowLeft className="h-5 w-5" /></Link>
              <div className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--primary-light)] text-sm font-bold text-[var(--primary)] sm:grid">{initials(selected.displayName)}</div>
              <button className="min-w-0 text-left" onClick={() => setDrawer("contact")} type="button">
                <h2 className="truncate text-sm font-bold sm:text-base">{selected.displayName}</h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted)]">{selected.state === "handoff" ? <UserRound className="h-3 w-3 shrink-0" /> : <Bot className="h-3 w-3 shrink-0" />}<span className="truncate">{selected.state === "handoff" ? "Bot en pausa" : workspace.botSettings.botEnabled ? "Bot activo" : "Bot desactivado"}{selected.channel === "platform" ? " · Canal anterior" : ""}</span></p>
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <form action={selected.state === "handoff" ? releaseWhatsAppCrmConversationAction : takeWhatsAppCrmConversationAction}>
                <input name="restaurantId" type="hidden" value={restaurant.id} /><input name="conversationId" type="hidden" value={selected.id} />
                <button className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border)] px-2.5 text-xs font-semibold hover:bg-[var(--color-surface)] sm:px-3" type="submit">{selected.state === "handoff" ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}{selected.state === "handoff" ? "Reactivar bot" : "Atender yo"}</button>
              </form>
              <button aria-label="Ver contacto y respuestas rápidas" className="grid h-10 w-10 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--color-surface)]" onClick={() => setDrawer("contact")} title="Contacto" type="button"><Info className="h-4 w-4" /></button>
            </div>
          </header>
          <div aria-label="Mensajes de la conversación" className="admin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f3f6f4] p-4 sm:p-6" onScroll={(event) => { const area = event.currentTarget; followMessages.current = area.scrollHeight - area.scrollTop - area.clientHeight < 96; }} ref={messageArea}>
            {workspace.messages.length ? workspace.messages.map((message, index) => <div key={message.id}>
              {index === 0 || formatShortDate(workspace.messages[index - 1].timestamp) !== formatShortDate(message.timestamp) ? <div className="mb-4 mt-1 text-center"><span className="rounded-full border border-black/5 bg-white/80 px-3 py-1 text-[0.65rem] text-[var(--muted)]">{formatShortDate(message.timestamp)}</span></div> : null}
              <MessageBubble message={message} />
            </div>) : <div className="grid h-full place-items-center text-center text-sm text-[var(--muted)]">Todavía no hay mensajes en esta conversación.</div>}
          </div>
          <MessageComposer key={selected.id} onQuickReplies={() => setDrawer("contact")} restaurant={restaurant} selected={selected} whatsappConfigured={workspace.whatsappConfigured} />
        </> : <div className="grid min-h-0 flex-1 place-items-center bg-[#f3f6f4] p-8 text-center"><div><MessageCircle className="mx-auto mb-4 h-12 w-12 text-[#94b5a2]" /><h2 className="text-lg font-semibold">Tu atención, en un solo lugar</h2><p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--muted)]">Elige una conversación para responder o espera el primer mensaje de un cliente.</p></div></div>}
      </section>
    </div>

    {drawer ? <InboxDrawer onClose={() => setDrawer(null)} title={drawer === "overview" ? "Resumen de WhatsApp" : "Contacto y respuestas"}>
      {drawer === "overview" ? <>
        <div className="grid grid-cols-2 gap-3"><UsageMetric label="Chats" value={String(workspace.stats.activeConversations)} /><UsageMetric label="Por responder" value={String(workspace.stats.needsReply)} /><UsageMetric label="Pedidos hoy" value={String(workspace.stats.whatsappOrders)} /><UsageMetric label="Ventas hoy" value={formatMoney(workspace.stats.todayRevenue)} /></div>
        <UsagePanel usage={workspace.usage} />
        <Link className={buttonClasses("secondary", "w-full text-sm")} href={`/admin/restaurantes/${restaurant.id}/configuracion?tab=whatsapp`}>Administrar conexión</Link>
      </> : <>
        {selected ? <section className="space-y-4">
          <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--primary-light)] font-bold text-[var(--primary)]">{initials(selected.displayName)}</span><div className="min-w-0"><p className="truncate font-bold">{selected.displayName}</p><p className="mt-1 text-sm text-[var(--muted)]">+{selected.phone}</p></div></div>
          {selected.tags.length ? <div className="flex flex-wrap gap-2">{selected.tags.map((tag) => <Badge className="text-xs" key={tag}>{tag}</Badge>)}</div> : null}
          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-[var(--color-surface)] p-4 text-sm"><div><dt className="text-xs text-[var(--muted)]">Pedidos</dt><dd className="mt-1 font-bold">{selected.orderCount}</dd></div><div><dt className="text-xs text-[var(--muted)]">Total comprado</dt><dd className="mt-1 font-bold">{formatMoney(selected.totalSpent)}</dd></div></dl>
          <p className="text-xs leading-relaxed text-[var(--muted)]">{selected.acquisitionDetail}. {selected.canReply ? "Puedes responder a este chat desde Yopido." : "Espera un nuevo mensaje del cliente para responder desde Yopido."}</p>
          <div className="rounded-xl bg-[var(--color-surface)] p-4"><p className="text-xs font-semibold">{selected.freeWindowExpiresAt ? "Bot en modo guiado" : "Bot en modo ahorro"}</p><p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{selected.freeWindowExpiresAt ? `Ventana gratuita confirmada por Meta hasta ${formatShortDate(selected.freeWindowExpiresAt)}, ${formatTime(selected.freeWindowExpiresAt)}. Permite fotos y más orientación.` : "Respuestas compactas y sin fotos automáticas de productos para reducir envíos. El QR de pago sí se envía."}</p></div>
          {selected.activeDraft ? <div className="rounded-xl border border-[var(--border)] p-4"><h3 className="text-sm font-bold">Pedido en curso</h3><p className="mt-2 text-sm text-[var(--muted)]">{selected.activeDraft.totalItems} productos · Delivery {formatMoney(selected.activeDraft.deliveryFee)}</p></div> : null}
          {selected.lastOrder ? <Link className="flex items-center justify-between rounded-xl border border-[var(--border)] p-4 text-sm hover:bg-[var(--color-surface)]" href={`/admin/restaurantes/${restaurant.id}/pedidos`}><div><p className="font-semibold">Último pedido · {selected.lastOrder.orderNumber}</p><p className="mt-1 text-xs text-[var(--muted)]">{formatShortDate(selected.lastOrder.createdAt)} · {formatMoney(selected.lastOrder.total)}</p></div><ExternalLink className="h-4 w-4" /></Link> : null}
        </section> : null}
        <section className="space-y-3 border-t border-[var(--border)] pt-5"><h3 className="text-sm font-bold">Respuestas rápidas</h3>
          <p className="text-xs leading-relaxed text-[var(--muted)]">Selecciona una respuesta para editarla antes de enviar.</p>
          {workspace.quickReplies.map((reply) => <div className="rounded-xl border border-[var(--border)] p-3" key={reply.id}>
            <button className="w-full text-left" disabled={!selected} onClick={() => { window.dispatchEvent(new CustomEvent("yopido-whatsapp-reply", { detail: reply.body })); setDrawer(null); }} type="button"><span className="text-sm font-semibold">{reply.title}</span><span className="mt-1 line-clamp-3 block text-xs leading-relaxed text-[var(--muted)]">{reply.body}</span></button>
            <form action={deactivateWhatsAppQuickReplyAction} className="mt-2 flex justify-end"><input name="restaurantId" type="hidden" value={restaurant.id} /><input name="conversationId" type="hidden" value={selected?.id ?? ""} /><input name="quickReplyId" type="hidden" value={reply.id} /><button aria-label={`Eliminar respuesta ${reply.title}`} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger-strong)]" type="submit"><Trash2 className="h-3.5 w-3.5" /></button></form>
          </div>)}
          {!workspace.quickReplies.length ? <p className="rounded-xl bg-[var(--color-surface)] p-4 text-xs text-[var(--muted)]">Guarda aquí los mensajes que usas con más frecuencia.</p> : null}
          <details className="rounded-xl border border-[var(--border)] p-3"><summary className="cursor-pointer text-sm font-semibold">Crear respuesta rápida</summary>
            <form action={saveWhatsAppQuickReplyAction} className="mt-3 space-y-3"><input name="restaurantId" type="hidden" value={restaurant.id} /><input name="conversationId" type="hidden" value={selected?.id ?? ""} />
              <Input aria-label="Título de respuesta rápida" maxLength={80} name="title" onChange={(event) => setQuickReplyTitle(event.target.value)} placeholder="Título, por ejemplo: Horarios" value={quickReplyTitle} />
              <Textarea aria-label="Mensaje de respuesta rápida" className="min-h-24" maxLength={1200} name="body" onChange={(event) => setQuickReplyBody(event.target.value)} placeholder="Escribe la respuesta" value={quickReplyBody} />
              <button className={buttonClasses("primary", "w-full")} disabled={quickReplyTitle.trim().length < 2 || quickReplyBody.trim().length < 2} type="submit"><Plus className="h-4 w-4" />Guardar respuesta</button>
            </form>
          </details>
        </section>
      </>}
    </InboxDrawer> : null}
    {botSettingsOpen ? <BotSettingsModal conversationId={selected?.id} onClose={() => setBotSettingsOpen(false)} restaurantId={restaurant.id} settings={workspace.botSettings} /> : null}
  </div>;
}

function MessageComposer({ restaurant, selected, whatsappConfigured, onQuickReplies }: {
  restaurant: Restaurant; selected: WhatsAppCrmConversation; whatsappConfigured: boolean; onQuickReplies: () => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const canReply = whatsappConfigured && selected.canReply;
  useEffect(() => {
    const useReply = (event: Event) => {
      const value = (event as CustomEvent).detail;
      if (typeof value !== "string") return;
      setBody(value); window.requestAnimationFrame(() => {
        const area = input.current;
        if (!area) return;
        area.style.height = "auto"; area.style.height = `${Math.min(area.scrollHeight, 128)}px`; area.focus();
      });
    };
    window.addEventListener("yopido-whatsapp-reply", useReply);
    return () => window.removeEventListener("yopido-whatsapp-reply", useReply);
  }, []);
  async function submit(form: FormData) {
    if (!canReply || sending || !body.trim()) return;
    setSending(true); setError("");
    try {
      const result = await sendWhatsAppCrmMessageInlineAction(form);
      if (result.ok) { setBody(""); if (input.current) { input.current.style.height = "auto"; input.current.focus(); } }
      else setError(feedbackMessages[result.error ?? ""] ?? "No pudimos enviar el mensaje. Tu texto se conserva; vuelve a intentarlo.");
    } catch { setError("No pudimos enviar el mensaje. Tu texto se conserva; vuelve a intentarlo."); }
    finally { setSending(false); }
  }
  return <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-3 pb-3 pt-2 sm:px-4">
    {canReply ? <div className="mb-2 flex items-center gap-1 overflow-x-auto text-[0.7rem] text-[var(--muted)]">
      <form action={sendWhatsAppCrmMenuAction}><input name="restaurantId" type="hidden" value={restaurant.id} /><input name="conversationId" type="hidden" value={selected.id} /><QuickSendButton><MenuSquare className="h-3.5 w-3.5" />Menú</QuickSendButton></form>
      <form action={sendWhatsAppCrmLocationAction}><input name="restaurantId" type="hidden" value={restaurant.id} /><input name="conversationId" type="hidden" value={selected.id} /><QuickSendButton><MapPin className="h-3.5 w-3.5" />Ubicación</QuickSendButton></form>
      <button className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 hover:bg-[var(--color-surface)]" onClick={onQuickReplies} type="button"><MessageSquareReply className="h-3.5 w-3.5" />Respuestas</button>
      <Link aria-label="Crear pedido en POS" className="ml-auto inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 hover:bg-[var(--color-surface)]" href={`/admin/restaurantes/${restaurant.id}/pedidos?pos=1`} prefetch={false}><ShoppingBag className="h-3.5 w-3.5" /><span className="hidden sm:inline">Pedido</span></Link>
    </div> : <p className="mb-2 rounded-lg bg-[var(--color-warning-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--color-warning-strong)]">{whatsappConfigured ? "Pasaron 24 horas desde el último mensaje. Espera que el cliente vuelva a escribir para responder desde Yopido." : "Conecta el número de WhatsApp para responder desde Yopido."}</p>}
    {error ? <p className="mb-2 text-xs text-[var(--color-danger-strong)]" role="alert">{error}</p> : null}
    <form action={submit} className="flex items-end gap-2">
      <input name="restaurantId" type="hidden" value={restaurant.id} /><input name="conversationId" type="hidden" value={selected.id} />
      <textarea aria-label="Escribe un mensaje de WhatsApp" className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--color-input)] px-3.5 py-3 text-sm outline-none placeholder:text-[var(--color-placeholder)] focus:border-[#84b89a] focus:ring-2 focus:ring-[#e7f7ed] disabled:opacity-60" disabled={!canReply || sending} maxLength={4096} name="body" onChange={(event) => { setBody(event.target.value); const area = event.currentTarget; area.style.height = "auto"; area.style.height = `${Math.min(area.scrollHeight, 128)}px`; }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (body.trim() && !sending) event.currentTarget.form?.requestSubmit(); } }} placeholder={canReply ? "Escribe un mensaje…" : "Esperando un nuevo mensaje del cliente"} ref={input} rows={1} value={body} />
      <button aria-label="Enviar mensaje de WhatsApp" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#128c55] text-white transition hover:bg-[#0f7849] disabled:bg-[var(--color-neutral-200)] disabled:text-[var(--color-placeholder)]" disabled={!body.trim() || !canReply || sending} type="submit">{sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
    </form>
    <p className="mt-1.5 hidden text-[0.6rem] text-[var(--color-placeholder)] sm:block">Enter para enviar · Mayús + Enter para saltar de línea. Al responder, el bot se pausa en este chat.</p>
  </div>;
}

function QuickSendButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button aria-busy={pending} className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 hover:bg-[var(--color-surface)] disabled:opacity-50" disabled={pending} type="submit">{pending ? <><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Enviando…</> : children}</button>;
}

function BotSettingsModal({
  conversationId,
  onClose,
  restaurantId,
  settings,
}: {
  conversationId?: string;
  onClose: () => void;
  restaurantId: string;
  settings: WhatsAppCrmBotSettings;
}) {
  return (
    <div aria-label="Configuracion del bot de WhatsApp" aria-modal="true" className="fixed inset-0 z-[95] grid place-items-end bg-[var(--color-overlay)] p-0 text-[var(--text)] backdrop-blur-sm sm:place-items-center sm:p-4" role="dialog">
      <button aria-label="Cerrar configuracion" className="absolute inset-0" onClick={onClose} type="button" />
      <form action={saveWhatsAppBotSettingsAction} className="relative z-10 flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:rounded-[var(--radius-card)]">
        <input name="restaurantId" type="hidden" value={restaurantId} />
        <input name="conversationId" type="hidden" value={conversationId ?? ""} />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-black">Bot de WhatsApp</h3>
            <p className="mt-0.5 text-[0.68rem] font-black uppercase text-[var(--color-secondary-text)]">
              {settings.botEnabled ? "Automatico" : "Solo humano"} - {toneLabels[settings.responseTone]}
            </p>
          </div>
          <button aria-label="Cerrar" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-neutral-100)] text-[var(--color-body)] hover:bg-[var(--color-neutral-200)]" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="admin-scrollbar flex-1 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <div className="space-y-3">
              <label className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--color-input)] px-3 text-sm font-black text-[var(--color-heading)]">
                <input className="h-4 w-4 accent-[var(--primary)]" defaultChecked={settings.botEnabled} name="botEnabled" type="checkbox" />
                Activo
              </label>
              <label className="grid gap-1 text-xs font-black text-[var(--color-secondary-text)]">
                Tono
                <Select className="min-h-10 px-3 text-sm" defaultValue={settings.responseTone} name="responseTone">
                  <option value="friendly">Cercano</option>
                  <option value="direct">Directo</option>
                  <option value="formal">Formal</option>
                </Select>
              </label>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <BotTextField
                  defaultValue={settings.greetingMessage}
                  label="Saludo"
                  maxLength={600}
                  name="greetingMessage"
                  placeholder="Dejalo vacio para usar el saludo automatico con el nombre del local."
                />
                <BotTextField
                  defaultValue={settings.menuIntroMessage}
                  label="Menu"
                  maxLength={600}
                  name="menuIntroMessage"
                  placeholder="Dejalo vacio para mostrar favoritos y el menu visual automaticamente."
                />
              </div>
              <BotTextField
                defaultValue={settings.checkoutMessage}
                label="Checkout"
                maxLength={240}
                name="checkoutMessage"
                placeholder="Completemos tu pedido."
                small
              />
              <BotTextField
                defaultValue={settings.locationRequestMessage}
                label="Ubicacion"
                maxLength={400}
                name="locationRequestMessage"
                placeholder="Comparte tu ubicacion exacta desde WhatsApp para calcular el delivery."
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <BotTextField
                  defaultValue={settings.qrPaymentMessage}
                  label="QR"
                  maxLength={400}
                  name="qrPaymentMessage"
                  placeholder="Dejalo vacio para enviar el QR del local con el total del pedido."
                />
                <BotTextField
                  defaultValue={settings.receiptRequestMessage}
                  label="Comprobante"
                  maxLength={300}
                  name="receiptRequestMessage"
                  placeholder="Envia una foto, captura o PDF del comprobante."
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <BotTextField
                  defaultValue={settings.fallbackMessage}
                  label="No entiende"
                  maxLength={600}
                  name="fallbackMessage"
                  placeholder="Puedo ayudarte a pedir, ver el menu o revisar tus ultimos pedidos."
                />
                <BotTextField
                  defaultValue={settings.humanHandoffMessage}
                  label="Solo humano"
                  maxLength={600}
                  name="humanHandoffMessage"
                  placeholder="Te atiende una persona del equipo en un momento."
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:justify-end">
          <button className={buttonClasses("ghost", "min-h-10 px-4")} onClick={onClose} type="button">
            <X className="h-4 w-4" />
            Cancelar
          </button>
          <button className={buttonClasses("primary", "min-h-10 px-4")} type="submit">
            <Save className="h-4 w-4" />
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}

function BotTextField({
  defaultValue,
  label,
  maxLength,
  name,
  placeholder,
  small = false,
}: {
  defaultValue: string;
  label: string;
  maxLength: number;
  name: string;
  placeholder: string;
  small?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs font-black text-[var(--color-secondary-text)]">
      {label}
      <Textarea
        className={cn("px-3 py-2 text-xs", small ? "min-h-12" : "min-h-16")}
        defaultValue={defaultValue}
        maxLength={maxLength}
        name={name}
        placeholder={placeholder}
      />
    </label>
  );
}
