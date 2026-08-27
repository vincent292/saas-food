"use client";

import { Bot, Clock3, MessageSquareText, Save, ShieldCheck } from "lucide-react";
import { savePlatformWhatsAppSettingsAction } from "@/app/admin/whatsapp/actions";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import type { PlatformWhatsAppSettings } from "@/types/platform-whatsapp.types";

const feedbackMessages: Record<string, string> = {
  "invalid-settings": "Revisa los campos de WhatsApp.",
  "platform-whatsapp-save-failed": "No pude guardar la configuracion.",
  "supabase-not-configured": "Falta configurar Supabase en el servidor.",
};

const toneLabels = {
  friendly: "Cercano",
  direct: "Directo",
  formal: "Formal",
};

export function PlatformWhatsAppSettingsClient({
  feedback,
  saved,
  settings,
  whatsappConfigured,
}: {
  feedback?: string;
  saved?: boolean;
  settings: PlatformWhatsAppSettings;
  whatsappConfigured: boolean;
}) {
  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-2 px-3 py-2">
        <Badge className={whatsappConfigured ? "border-[var(--color-success-soft)] bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"}>
          {whatsappConfigured ? "WhatsApp conectado" : "WhatsApp sin token"}
        </Badge>
        <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[var(--color-surface)] px-3 text-xs font-black text-[var(--color-heading)]">
          <Bot className="h-3.5 w-3.5 text-[var(--primary)]" />
          {settings.botEnabled ? "Bot global activo" : "Bot global pausado"}
        </span>
        <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[var(--color-surface)] px-3 text-xs font-black text-[var(--color-heading)]">
          <Clock3 className="h-3.5 w-3.5 text-[var(--primary)]" />
          {settings.draftTimeoutMinutes} min para reiniciar pedidos
        </span>
        {saved ? <span className="inline-flex min-h-9 items-center rounded-full bg-[var(--color-success-soft)] px-3 text-xs font-black text-[var(--color-success-strong)]">Guardado</span> : null}
        {feedback ? <span className="inline-flex min-h-9 items-center rounded-full bg-[var(--color-danger-soft)] px-3 text-xs font-black text-[var(--color-danger-strong)]">{feedbackMessages[feedback] ?? feedback}</span> : null}
      </Card>

      <form action={savePlatformWhatsAppSettingsAction} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--primary-light)] text-[var(--primary)]">
              <MessageSquareText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-black">Mensajes globales</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">Se usan antes de que el cliente elija restaurante. Los nombres de locales salen automaticamente desde cada ficha.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              defaultValue={settings.welcomeMessage}
              label="Bienvenida"
              maxLength={600}
              name="welcomeMessage"
              placeholder="Hola, soy YoPido.shop. Te ayudo a elegir un restaurante y hacer tu pedido."
            />
            <Field
              defaultValue={settings.restaurantPickerMessage}
              label="Selector de restaurantes"
              maxLength={600}
              name="restaurantPickerMessage"
              placeholder="Elige el restaurante donde quieres pedir."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              defaultValue={settings.fallbackMessage}
              label="No entiende"
              maxLength={600}
              name="fallbackMessage"
              placeholder="Puedo ayudarte a elegir restaurante, pedir o revisar tus ultimos pedidos."
            />
            <Field
              defaultValue={settings.humanHandoffMessage}
              label="Atencion humana"
              maxLength={600}
              name="humanHandoffMessage"
              placeholder="Te atiende una persona del equipo en un momento."
            />
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--color-success-soft)] text-[var(--color-success-strong)]">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-black">Reglas</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">Control base del bot de YoPido.</p>
            </div>
          </div>

          <label className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--color-input)] px-3 text-sm font-black text-[var(--color-heading)]">
            <input className="h-4 w-4 accent-[var(--primary)]" defaultChecked={settings.botEnabled} name="botEnabled" type="checkbox" />
            Bot automatico activo
          </label>

          <label className="grid gap-1 text-sm font-black text-[var(--color-secondary-text)]">
            Tono
            <Select defaultValue={settings.responseTone} name="responseTone">
              {Object.entries(toneLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>

          <label className="grid gap-1 text-sm font-black text-[var(--color-secondary-text)]">
            Reiniciar pedido pausado
            <Input defaultValue={String(settings.draftTimeoutMinutes)} max={120} min={5} name="draftTimeoutMinutes" type="number" />
          </label>

          <button className={buttonClasses("primary", "w-full")} type="submit">
            <Save className="h-4 w-4" />
            Guardar configuracion
          </button>
        </Card>
      </form>
    </div>
  );
}

function Field({
  defaultValue,
  label,
  maxLength,
  name,
  placeholder,
}: {
  defaultValue: string;
  label: string;
  maxLength: number;
  name: string;
  placeholder: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-black text-[var(--color-secondary-text)]">
      {label}
      <Textarea className="min-h-28 px-3 py-2 text-sm" defaultValue={defaultValue} maxLength={maxLength} name={name} placeholder={placeholder} />
    </label>
  );
}
