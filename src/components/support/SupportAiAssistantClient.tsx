"use client";

import { Bot, LifeBuoy, Loader2, Sparkles, TicketCheck } from "lucide-react";
import { useState } from "react";
import { askSupportAiAction } from "@/app/admin/actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import type { SupportAiResult } from "@/types/support-ai.types";

const errorMessages: Record<string, string> = {
  invalid: "Describe el problema con un poco mas de detalle.",
  "daily-limit": "Se alcanzo el limite diario de IA para soporte. Abre un ticket manual.",
  "usage-check": "No se pudo comprobar el limite diario. Abre un ticket manual.",
  "gemini-not-configured": "La IA de soporte no esta configurada.",
  "gemini-empty-response": "La IA no devolvio una respuesta util.",
  "support-ai-failed": "No se pudo consultar la IA.",
  "ticket-create": "La IA recomendo abrir ticket, pero no se pudo crear. Usa el formulario manual.",
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
  const [category, setCategory] = useState<(typeof categories)[number]["value"]>("orders");
  const [orderNumber, setOrderNumber] = useState("");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<SupportAiResult | null>(null);
  const [pending, setPending] = useState(false);

  async function submitQuestion() {
    setPending(true);
    setResult(null);

    const selectedCategory = categories.find((item) => item.value === category);
    const formData = new FormData();
    formData.append("restaurantId", restaurantId);
    formData.append("category", selectedCategory && "mapsTo" in selectedCategory ? selectedCategory.mapsTo : category);
    formData.append("orderNumber", orderNumber);
    formData.append("question", question);

    const response = await askSupportAiAction(formData);
    setResult(response);
    setPending(false);
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] bg-[var(--primary-light)] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--surface)] text-[var(--primary)] shadow-sm">
                <Bot className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Soporte IA</p>
                <h2 className="text-xl font-black text-[var(--text)]">Pregunta operativa</h2>
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-sm font-semibold text-[var(--muted)]">
              Responde casos del sistema con limite diario. Si no puede resolverlo, abre ticket para soporte.
            </p>
          </div>
          <Badge className="w-fit bg-[var(--surface)] text-[var(--primary)]">Texto solamente</Badge>
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[180px_180px_1fr]">
          <label className="space-y-2 text-sm font-black text-[var(--text)]">
            Tema
            <Select disabled={pending} onChange={(event) => setCategory(event.target.value as typeof category)} value={category}>
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-2 text-sm font-black text-[var(--text)]">
            Pedido
            <Input disabled={pending} onChange={(event) => setOrderNumber(event.target.value)} placeholder="P6381" value={orderNumber} />
          </label>
          <label className="space-y-2 text-sm font-black text-[var(--text)]">
            Problema
            <Textarea
              disabled={pending}
              maxLength={700}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ej. El pedido aparece listo en cocina pero no desaparece de caja."
              value={question}
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-[var(--muted)]">{question.length}/700 caracteres</p>
          <Button disabled={pending || question.trim().length < 8} onClick={submitQuestion} type="button">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {pending ? "Consultando..." : "Preguntar a IA"}
          </Button>
        </div>

        {pending ? <AiThinkingPanel /> : null}
        {result ? <SupportAiResultPanel result={result} /> : null}
      </div>
    </Card>
  );
}

function AiThinkingPanel() {
  return (
    <div aria-live="polite" className="rounded-[var(--radius-card)] border border-[var(--primary-light)] bg-[var(--primary-light)] p-4">
      <div className="flex items-center gap-3">
        <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-[var(--surface)] text-[var(--primary)]">
          <Sparkles className="h-5 w-5 animate-pulse" />
        </span>
        <div>
          <p className="font-black text-[var(--text)]">Revisando con IA</p>
          <p className="text-sm font-semibold text-[var(--muted)]">Usando solo contexto operativo y limites de soporte.</p>
        </div>
      </div>
    </div>
  );
}

function SupportAiResultPanel({ result }: { result: SupportAiResult }) {
  if (!result.ok) {
    return (
      <div className="rounded-[var(--radius-card)] bg-[var(--color-danger-soft)] p-4 text-sm font-bold text-[var(--color-danger-strong)]">
        {errorMessages[result.error] ?? `No se pudo consultar soporte IA: ${result.error}.`}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {result.resolved ? <LifeBuoy className="h-5 w-5 text-[var(--primary)]" /> : <TicketCheck className="h-5 w-5 text-[var(--primary)]" />}
          <p className="font-black text-[var(--text)]">{result.resolved ? "Respuesta sugerida" : "Ticket creado"}</p>
        </div>
        <Badge className="bg-[var(--color-neutral-100)] text-[var(--color-body)]">{result.remainingToday} usos IA restantes hoy</Badge>
      </div>
      <p className="whitespace-pre-line text-sm font-semibold leading-6 text-[var(--color-body)]">{result.answer}</p>
      {result.ticketId ? (
        <div className="rounded-2xl bg-[var(--color-success-soft)] p-3 text-sm font-bold text-[var(--color-success-strong)]">
          Se abrio ticket para soporte: {result.ticketTitle ?? result.ticketId}
        </div>
      ) : null}
    </div>
  );
}
