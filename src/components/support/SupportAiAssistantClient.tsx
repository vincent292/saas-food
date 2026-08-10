"use client";

import { Bot, Loader2, MessageCircle, Send, Sparkles, TicketCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { askSupportAiAction, createSupportAiTicketAction } from "@/app/admin/actions";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import type { SupportAiResult, SupportAiTranscriptMessage } from "@/types/support-ai.types";
import type { SupportTicketCategory } from "@/types/superadmin.types";

type ChatMessage = SupportAiTranscriptMessage & {
  id: string;
};

const errorMessages: Record<string, string> = {
  invalid: "Describe el problema con un poco mas de detalle.",
  "daily-limit": "Se alcanzo el limite diario de IA para soporte. Crea un ticket para continuar.",
  "usage-check": "No se pudo comprobar el limite diario. Crea un ticket manual.",
  "gemini-not-configured": "La IA de soporte no esta configurada.",
  "gemini-empty-response": "La IA no devolvio una respuesta util.",
  "support-ai-failed": "No se pudo consultar la IA.",
  "ticket-create": "No se pudo crear el ticket. Usa el formulario manual.",
};

const categories = [
  { value: "orders", label: "Pedidos" },
  { value: "cash", label: "Caja" },
  { value: "kitchen", label: "Cocina", mapsTo: "orders" },
  { value: "inventory", label: "Inventario" },
  { value: "access", label: "Acceso" },
  { value: "billing", label: "Pagos" },
  { value: "incident", label: "Incidencia" },
  { value: "other", label: "Otro" },
] as const;

export function SupportAiAssistantClient({ restaurantId }: { restaurantId: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<(typeof categories)[number]["value"]>("orders");
  const [orderNumber, setOrderNumber] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastResult, setLastResult] = useState<SupportAiResult | null>(null);
  const [pending, setPending] = useState(false);
  const [ticketPending, setTicketPending] = useState(false);
  const [ticketCreated, setTicketCreated] = useState<{ id: string; title: string } | null>(null);

  const selectedCategory = categories.find((item) => item.value === category);
  const supportCategory = (selectedCategory && "mapsTo" in selectedCategory ? selectedCategory.mapsTo : category) as SupportTicketCategory;
  const remainingToday = lastResult?.ok ? lastResult.remainingToday : lastResult?.remainingToday;
  const suggestedTicket = lastResult?.ok
    ? {
        title: lastResult.suggestedTicketTitle ?? "",
        description: lastResult.suggestedTicketDescription ?? "",
        priority: lastResult.suggestedTicketPriority ?? "medium",
        category: lastResult.suggestedTicketCategory ?? supportCategory,
      }
    : null;
  const transcript = useMemo(() => messages.map(({ role, content }) => ({ role, content })), [messages]);
  const canSend = draft.trim().length >= 8 && !pending && !ticketPending && !ticketCreated;
  const canCreateTicket = messages.length > 0 && !ticketPending && !ticketCreated;

  async function sendMessage() {
    if (!canSend) return;

    const question = draft.trim();
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: question };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setPending(true);
    setLastResult(null);

    const formData = new FormData();
    formData.append("restaurantId", restaurantId);
    formData.append("category", supportCategory);
    formData.append("orderNumber", orderNumber);
    formData.append("question", question);
    formData.append("transcriptJson", JSON.stringify(nextMessages.slice(-8).map(({ role, content }) => ({ role, content }))));

    const response = await askSupportAiAction(formData);
    setLastResult(response);
    if (response.ok) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: response.answer }]);
    }
    setPending(false);
  }

  async function createTicket() {
    if (!canCreateTicket) return;
    setTicketPending(true);

    const formData = new FormData();
    formData.append("restaurantId", restaurantId);
    formData.append("category", suggestedTicket?.category ?? supportCategory);
    formData.append("orderNumber", orderNumber);
    formData.append("transcriptJson", JSON.stringify(transcript.slice(-12)));
    formData.append("suggestedTitle", suggestedTicket?.title ?? "");
    formData.append("suggestedDescription", suggestedTicket?.description ?? "");
    formData.append("suggestedPriority", suggestedTicket?.priority ?? "medium");

    const response = await createSupportAiTicketAction(formData);
    if (response.ok) {
      setTicketCreated({ id: response.ticketId, title: response.ticketTitle });
    } else {
      setLastResult({ ok: false, error: response.error });
    }
    setTicketPending(false);
  }

  function resetConversation() {
    setMessages([]);
    setLastResult(null);
    setTicketCreated(null);
    setDraft("");
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] bg-[var(--primary-light)] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--surface)] text-[var(--primary)] shadow-sm">
                <MessageCircle className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Soporte IA</p>
                <h2 className="text-xl font-black text-[var(--text)]">Messenger operativo</h2>
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-sm font-semibold text-[var(--muted)]">Chat corto para resolver dudas del sistema. Si no se resuelve, crea ticket con la conversacion.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {typeof remainingToday === "number" ? <Badge className="w-fit bg-[var(--surface)] text-[var(--primary)]">{remainingToday} usos IA hoy</Badge> : null}
            <Badge className="w-fit bg-[var(--surface)] text-[var(--primary)]">Texto solamente</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:p-5">
        {!open ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="font-black text-[var(--text)]">Abre una conversacion con soporte IA</p>
              <p className="mt-1 text-sm font-semibold text-[var(--muted)]">No crea ticket automaticamente. Primero intenta resolver y luego decides si escalar.</p>
            </div>
            <Button onClick={() => setOpen(true)} type="button">
              <Sparkles className="h-4 w-4" />
              Abrir messenger
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-3 lg:grid-cols-[180px_180px_1fr_auto] lg:items-end">
              <label className="space-y-2 text-sm font-black text-[var(--text)]">
                Tema
                <Select disabled={pending || messages.length > 0} onChange={(event) => setCategory(event.target.value as typeof category)} value={category}>
                  {categories.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2 text-sm font-black text-[var(--text)]">
                Pedido
                <Input disabled={pending || messages.length > 0} onChange={(event) => setOrderNumber(event.target.value)} placeholder="P6381" value={orderNumber} />
              </label>
              <p className="rounded-[var(--radius-control)] bg-[var(--color-card-muted)] px-4 py-3 text-sm font-semibold text-[var(--muted)]">La conversacion usa el tema y pedido iniciales para ahorrar contexto.</p>
              <button className={buttonClasses("ghost", "min-h-11")} disabled={pending || ticketPending} onClick={() => setOpen(false)} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex h-[460px] flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--color-card-muted)] sm:h-[520px]">
              <div className="admin-scrollbar flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
                {messages.length ? (
                  messages.map((message) => <ChatBubble key={message.id} message={message} />)
                ) : (
                  <div className="grid h-full place-items-center text-center">
                    <div className="max-w-sm">
                      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--surface)] text-[var(--primary)]">
                        <Bot className="h-6 w-6" />
                      </span>
                      <p className="mt-3 font-black text-[var(--text)]">Cuéntame qué pasó</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--muted)]">Ej. “El pedido P6381 está listo pero sigue en cocina”.</p>
                    </div>
                  </div>
                )}
                {pending ? <TypingBubble /> : null}
              </div>

              <div className="border-t border-[var(--border)] bg-[var(--surface)] p-3">
                {lastResult && !lastResult.ok ? <ErrorPanel error={lastResult.error} /> : null}
                {ticketCreated ? (
                  <div className="mb-3 rounded-2xl bg-[var(--color-success-soft)] p-3 text-sm font-bold text-[var(--color-success-strong)]">
                    Ticket creado: {ticketCreated.title}
                  </div>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="space-y-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                    Responder
                    <Textarea
                      className="min-h-20"
                      disabled={pending || ticketPending || Boolean(ticketCreated)}
                      maxLength={700}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                          void sendMessage();
                        }
                      }}
                      placeholder="Escribe el siguiente detalle..."
                      value={draft}
                    />
                  </label>
                  <Button className="min-h-12" disabled={!canSend} onClick={sendMessage} type="button">
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Enviar
                  </Button>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-semibold text-[var(--muted)]">{draft.length}/700 caracteres</p>
                  <div className="flex flex-wrap gap-2">
                    <button className={buttonClasses("secondary", "min-h-10")} disabled={!canCreateTicket} onClick={createTicket} type="button">
                      {ticketPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TicketCheck className="h-4 w-4" />}
                      No se resolvio
                    </button>
                    <button className={buttonClasses("ghost", "min-h-10")} disabled={pending || ticketPending} onClick={resetConversation} type="button">
                      Nueva conversacion
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[86%] rounded-3xl rounded-br-md bg-[var(--primary)] px-4 py-3 text-sm font-semibold leading-6 text-[var(--color-on-primary)] shadow-sm"
            : "max-w-[86%] rounded-3xl rounded-bl-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold leading-6 text-[var(--color-body)] shadow-sm"
        }
      >
        <p className="whitespace-pre-line">{message.content}</p>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="inline-flex items-center gap-2 rounded-3xl rounded-bl-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--primary)] shadow-sm">
        <Sparkles className="h-4 w-4 animate-pulse" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--primary)]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--primary)] [animation-delay:120ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--primary)] [animation-delay:240ms]" />
      </div>
    </div>
  );
}

function ErrorPanel({ error }: { error: string }) {
  return (
    <div className="mb-3 rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm font-bold text-[var(--color-danger-strong)]">
      {errorMessages[error] ?? `No se pudo consultar soporte IA: ${error}.`}
    </div>
  );
}
