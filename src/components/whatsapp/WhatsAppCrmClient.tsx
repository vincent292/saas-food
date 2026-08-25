"use client";

import Link from "next/link";
import {
  Archive,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MapPin,
  MenuSquare,
  MessageCircle,
  MessageSquareReply,
  Phone,
  Plus,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  deactivateWhatsAppQuickReplyAction,
  releaseWhatsAppCrmConversationAction,
  sendWhatsAppCrmLocationAction,
  sendWhatsAppCrmMenuAction,
  sendWhatsAppCrmMessageAction,
  saveWhatsAppQuickReplyAction,
  takeWhatsAppCrmConversationAction,
} from "@/app/admin/restaurantes/[restaurantId]/whatsapp/actions";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import type { Restaurant } from "@/types/restaurant.types";
import type { WhatsAppCrmConversation, WhatsAppCrmMessage, WhatsAppCrmWorkspace } from "@/types/whatsapp-crm.types";

type ConversationTab = "all" | "needsReply" | "orders" | "handoff";

const tabLabels: Record<ConversationTab, string> = {
  all: "Todas",
  needsReply: "Sin responder",
  orders: "Con pedido",
  handoff: "Humano",
};

const feedbackMessages: Record<string, string> = {
  "whatsapp-not-configured": "Falta configurar WhatsApp Cloud API para responder desde el CRM.",
  "whatsapp-send-failed": "WhatsApp no acepto el envio. Revisa la ventana de 24 horas o usa plantilla aprobada.",
  "conversation-not-found": "No encontre esa conversacion para este restaurante.",
  "restaurant-not-found": "No encontre los datos del restaurante.",
  sent: "Mensaje enviado.",
  handoff: "Conversacion tomada por el equipo.",
  released: "Bot reactivado para esta conversacion.",
  replySaved: "Respuesta rapida guardada.",
  replyDeleted: "Respuesta rapida eliminada.",
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
          "max-w-[88%] rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold shadow-sm sm:max-w-[74%]",
          outbound
            ? "bg-[var(--primary-light)] text-[var(--primary-dark)]"
            : "border border-[var(--border)] bg-[var(--surface)] text-[var(--color-heading)]",
        )}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
        <div className={cn("mt-1.5 flex items-center gap-1 text-[0.68rem] font-black", outbound ? "justify-end text-[var(--primary)]" : "text-[var(--color-secondary-text)]")}>
          <span>{formatTime(message.timestamp)}</span>
          {outbound ? <CheckCircle2 className="h-3 w-3" /> : null}
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
        "flex min-h-[4.5rem] gap-3 border-b border-[var(--border)] px-3 py-2.5 transition hover:bg-[var(--primary-light)]",
        selected && "bg-[var(--primary-light)]",
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
        <div className="mt-1.5 flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", conversation.needsReply ? "bg-[var(--danger)]" : "bg-[var(--color-success-strong)]")} />
          <span className="truncate text-[0.68rem] font-black uppercase text-[var(--color-secondary-text)]">{stateLabel(conversation.state)}</span>
        </div>
      </div>
    </Link>
  );
}

export function WhatsAppCrmClient({
  restaurant,
  workspace,
  feedback,
}: {
  restaurant: Restaurant;
  workspace: WhatsAppCrmWorkspace;
  feedback?: string;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<ConversationTab>("all");
  const [replyBody, setReplyBody] = useState("");
  const [quickReplyTitle, setQuickReplyTitle] = useState("");
  const [quickReplyBody, setQuickReplyBody] = useState("");
  const selected = workspace.selectedConversation;

  const filteredConversations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workspace.conversations.filter((conversation) => {
      const matchesTab =
        tab === "all" ||
        (tab === "needsReply" && conversation.needsReply) ||
        (tab === "orders" && Boolean(conversation.activeDraft || conversation.orderCount > 0)) ||
        (tab === "handoff" && conversation.state === "handoff");
      const matchesQuery =
        !needle ||
        conversation.displayName.toLowerCase().includes(needle) ||
        conversation.phone.includes(needle) ||
        conversation.lastMessage?.text.toLowerCase().includes(needle);

      return matchesTab && matchesQuery;
    });
  }, [query, tab, workspace.conversations]);

  const metrics = [
    { label: "Chats", value: workspace.stats.activeConversations, icon: MessageCircle },
    { label: "Pendientes", value: workspace.stats.needsReply, icon: MessageSquareReply },
    { label: "Pedidos", value: workspace.stats.whatsappOrders, icon: ShoppingBag },
    { label: "Hoy", value: formatMoney(workspace.stats.todayRevenue), icon: Sparkles },
  ];

  const feedbackText = feedback ? feedbackMessages[feedback] ?? `No se pudo completar la accion: ${feedback}.` : "";
  const isPositiveFeedback = feedback === "sent" || feedback === "handoff" || feedback === "released" || feedback === "replySaved" || feedback === "replyDeleted";

  return (
    <div className="flex h-auto min-h-[calc(100dvh-9rem)] flex-col gap-3 lg:h-[calc(100dvh-8.25rem)] lg:min-h-0">
      <Card className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-2">
        <Badge className={cn(workspace.whatsappConfigured ? "border-[var(--color-success-soft)] bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]")}>
          {workspace.whatsappConfigured ? "Conectado" : "Sin configurar"}
        </Badge>
        {metrics.map((metric) => (
          <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[var(--color-surface)] px-3 text-xs font-black text-[var(--color-heading)]" key={metric.label}>
            <metric.icon className="h-3.5 w-3.5 text-[var(--primary)]" />
            <span className="text-[var(--color-secondary-text)]">{metric.label}</span>
            <span>{metric.value}</span>
          </span>
        ))}
        {feedbackText ? (
          <span className={cn("inline-flex min-h-9 items-center rounded-full px-3 text-xs font-black", isPositiveFeedback ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]")}>
            {feedbackText}
          </span>
        ) : null}
        <Link className={buttonClasses("secondary", "ml-auto min-h-9 px-3 text-xs")} href={`/admin/restaurantes/${restaurant.id}/pedidos?pos=1`} prefetch={false}>
          <ShoppingBag className="h-4 w-4" />
          POS
        </Link>
      </Card>

      <div className="grid flex-1 gap-3 overflow-hidden lg:min-h-0 xl:grid-cols-[20.5rem_minmax(0,1fr)_19.5rem] 2xl:grid-cols-[22rem_minmax(0,1fr)_21rem]">
        <Card className="flex min-h-[28rem] flex-col overflow-hidden p-0 lg:min-h-0">
          <div className="shrink-0 border-b border-[var(--border)] p-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-black">Conversaciones</h3>
              <Archive className="h-4 w-4 text-[var(--color-secondary-text)]" />
            </div>
            <label className="mt-2 flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--color-input)] px-3">
              <Search className="h-4 w-4 shrink-0 text-[var(--color-secondary-text)]" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-[var(--color-placeholder)]"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar"
                value={query}
              />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(Object.keys(tabLabels) as ConversationTab[]).map((key) => (
                <button
                  className={cn(
                    "min-h-8 rounded-full px-2 text-[0.68rem] font-black transition",
                    tab === key ? "bg-[var(--primary)] text-[var(--color-on-primary)]" : "bg-[var(--color-surface)] text-[var(--color-secondary-text)] hover:bg-[var(--primary-light)]",
                  )}
                  key={key}
                  onClick={() => setTab(key)}
                  type="button"
                >
                  {tabLabels[key]}
                </button>
              ))}
            </div>
          </div>
          <div className="admin-scrollbar flex-1 overflow-y-auto">
            {filteredConversations.length ? (
              filteredConversations.map((conversation) => (
                <ConversationRow conversation={conversation} key={conversation.id} restaurantId={restaurant.id} selected={selected?.id === conversation.id} />
              ))
            ) : (
              <div className="grid min-h-52 place-items-center p-5 text-center">
                <p className="text-sm font-bold text-[var(--color-secondary-text)]">No hay conversaciones en este filtro.</p>
              </div>
            )}
          </div>
        </Card>

        <Card className="flex min-h-[35rem] flex-col overflow-hidden p-0 lg:min-h-0">
          {selected ? (
            <>
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--primary-light)] text-sm font-black text-[var(--primary)]">
                    {initials(selected.displayName)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-black">{selected.displayName}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs font-bold text-[var(--color-secondary-text)]">
                      <Phone className="h-3.5 w-3.5" />
                      +{selected.phone}
                    </p>
                  </div>
                </div>
                <form action={selected.state === "handoff" ? releaseWhatsAppCrmConversationAction : takeWhatsAppCrmConversationAction}>
                  <input name="restaurantId" type="hidden" value={restaurant.id} />
                  <input name="conversationId" type="hidden" value={selected.id} />
                  <button className={buttonClasses(selected.state === "handoff" ? "secondary" : "primary", "min-h-9 px-3 text-xs")} type="submit">
                    {selected.state === "handoff" ? <Bot className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                    {selected.state === "handoff" ? "Liberar" : "Tomar"}
                  </button>
                </form>
              </div>

              <div className="admin-scrollbar flex-1 space-y-2 overflow-y-auto bg-[var(--color-surface)] p-3">
                {workspace.messages.length ? (
                  workspace.messages.map((message) => <MessageBubble key={message.id} message={message} />)
                ) : (
                  <div className="grid h-full min-h-64 place-items-center text-center">
                    <p className="max-w-sm text-sm font-bold text-[var(--color-secondary-text)]">Todavia no hay mensajes guardados para esta conversacion.</p>
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="mb-2 grid gap-2 sm:grid-cols-3">
                  <form action={sendWhatsAppCrmMenuAction}>
                    <input name="restaurantId" type="hidden" value={restaurant.id} />
                    <input name="conversationId" type="hidden" value={selected.id} />
                    <button className={buttonClasses("secondary", "w-full min-h-8 px-2 text-xs")} type="submit">
                      <MenuSquare className="h-4 w-4" />
                      Menu
                    </button>
                  </form>
                  <form action={sendWhatsAppCrmLocationAction}>
                    <input name="restaurantId" type="hidden" value={restaurant.id} />
                    <input name="conversationId" type="hidden" value={selected.id} />
                    <button className={buttonClasses("secondary", "w-full min-h-8 px-2 text-xs")} type="submit">
                      <MapPin className="h-4 w-4" />
                      Ubicacion
                    </button>
                  </form>
                  <Link className={buttonClasses("secondary", "w-full min-h-8 px-2 text-xs")} href={`/admin/restaurantes/${restaurant.id}/pedidos?pos=1`} prefetch={false}>
                    <ShoppingBag className="h-4 w-4" />
                    Pedido
                  </Link>
                </div>
                <form action={sendWhatsAppCrmMessageAction} className="grid gap-2">
                  <input name="restaurantId" type="hidden" value={restaurant.id} />
                  <input name="conversationId" type="hidden" value={selected.id} />
                  <Textarea
                    className="min-h-16 resize-none py-2"
                    maxLength={4096}
                    name="body"
                    onChange={(event) => setReplyBody(event.target.value)}
                    placeholder="Escribe un mensaje"
                    value={replyBody}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-bold text-[var(--color-secondary-text)]">{selected.state === "handoff" ? "Atencion humana activa" : "Enviar tomara la conversacion"}</p>
                    <button className={buttonClasses("primary", "w-full min-h-9 sm:w-auto")} disabled={!replyBody.trim() || !workspace.whatsappConfigured} type="submit">
                      <Send className="h-4 w-4" />
                      Enviar
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <p className="max-w-sm text-sm font-bold text-[var(--color-secondary-text)]">Cuando entren mensajes por WhatsApp apareceran aqui.</p>
            </div>
          )}
        </Card>

        <Card className="admin-scrollbar flex min-h-[30rem] flex-col gap-3 overflow-y-auto p-3 lg:min-h-0">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-black">Contacto</h3>
              <UserRound className="h-4 w-4 text-[var(--color-secondary-text)]" />
            </div>
            {selected ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--primary-light)] text-base font-black text-[var(--primary)]">
                    {initials(selected.displayName)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-black">{selected.displayName}</p>
                    <p className="text-xs font-bold text-[var(--color-secondary-text)]">+{selected.phone}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.tags.length ? (
                    selected.tags.map((tag) => (
                      <Badge className="gap-1 bg-[var(--color-surface)] px-2 py-0.5 text-[0.68rem] text-[var(--color-heading)]" key={tag}>
                        <Tag className="h-3 w-3" />
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <Badge className="bg-[var(--color-surface)] text-[var(--color-secondary-text)]">Sin etiquetas</Badge>
                  )}
                </div>
                <div className="grid gap-1.5 rounded-[var(--radius-control)] bg-[var(--color-surface)] p-3 text-sm font-bold">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--color-secondary-text)]">Pedidos</span>
                    <span>{selected.orderCount}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--color-secondary-text)]">Gastado</span>
                    <span>{formatMoney(selected.totalSpent)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--color-secondary-text)]">Ultimo</span>
                    <span>{selected.lastOrder ? formatShortDate(selected.lastOrder.createdAt) : "Sin pedidos"}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm font-bold text-[var(--color-secondary-text)]">Selecciona una conversacion.</p>
            )}
          </section>

          {selected?.activeDraft ? (
            <section className="space-y-2 rounded-[var(--radius-control)] border border-[var(--border)] p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-black">Pedido en curso</h3>
                <Clock3 className="h-4 w-4 text-[var(--color-secondary-text)]" />
              </div>
              <div className="grid gap-1.5 text-sm font-bold">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--color-secondary-text)]">Paso</span>
                  <span>{selected.activeDraft.checkoutStep}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--color-secondary-text)]">Items</span>
                  <span>{selected.activeDraft.totalItems}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--color-secondary-text)]">Delivery</span>
                  <span>{formatMoney(selected.activeDraft.deliveryFee)}</span>
                </div>
              </div>
            </section>
          ) : null}

          <section className="space-y-3 rounded-[var(--radius-control)] border border-[var(--border)] p-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-black">Respuestas rapidas</h3>
              <MessageSquareReply className="h-4 w-4 text-[var(--color-secondary-text)]" />
            </div>
            <form action={saveWhatsAppQuickReplyAction} className="grid gap-2">
              <input name="restaurantId" type="hidden" value={restaurant.id} />
              <input name="conversationId" type="hidden" value={selected?.id ?? ""} />
              <Input
                className="min-h-9 px-3 text-xs"
                maxLength={80}
                name="title"
                onChange={(event) => setQuickReplyTitle(event.target.value)}
                placeholder="Titulo"
                value={quickReplyTitle}
              />
              <Textarea
                className="min-h-16 px-3 py-2 text-xs"
                maxLength={1200}
                name="body"
                onChange={(event) => setQuickReplyBody(event.target.value)}
                placeholder="Mensaje"
                value={quickReplyBody}
              />
              <button className={buttonClasses("secondary", "min-h-9 w-full px-3 text-xs")} disabled={quickReplyTitle.trim().length < 2 || quickReplyBody.trim().length < 2} type="submit">
                <Plus className="h-4 w-4" />
                Guardar
              </button>
            </form>
            {workspace.quickReplies.length ? (
              <div className="space-y-2">
                {workspace.quickReplies.map((reply) => (
                  <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--color-surface)] p-2" key={reply.id}>
                    <button className="w-full text-left" onClick={() => setReplyBody(reply.body)} type="button">
                      <span className="block text-sm font-black text-[var(--color-heading)]">{reply.title}</span>
                      <span className="mt-1 line-clamp-2 block text-xs font-semibold text-[var(--color-secondary-text)]">{reply.body}</span>
                    </button>
                    <form action={deactivateWhatsAppQuickReplyAction} className="mt-2 flex justify-end">
                      <input name="restaurantId" type="hidden" value={restaurant.id} />
                      <input name="conversationId" type="hidden" value={selected?.id ?? ""} />
                      <input name="quickReplyId" type="hidden" value={reply.id} />
                      <button className={buttonClasses("ghost", "min-h-8 px-2 text-xs text-[var(--color-danger-strong)]")} type="submit">
                        <Trash2 className="h-3.5 w-3.5" />
                        Quitar
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs font-bold text-[var(--color-secondary-text)]">Este restaurante todavia no guardo respuestas.</p>
            )}
          </section>

          {selected?.lastOrder ? (
            <section className="space-y-2 rounded-[var(--radius-control)] border border-[var(--border)] p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-black">Ultimo pedido</h3>
                <ExternalLink className="h-4 w-4 text-[var(--color-secondary-text)]" />
              </div>
              <div className="rounded-[var(--radius-control)] bg-[var(--color-surface)] p-3 text-sm font-bold">
                <p className="text-[var(--color-heading)]">{selected.lastOrder.orderNumber}</p>
                <p className="mt-1 text-[var(--color-secondary-text)]">
                  {selected.lastOrder.status} - {formatMoney(selected.lastOrder.total)}
                </p>
              </div>
            </section>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
