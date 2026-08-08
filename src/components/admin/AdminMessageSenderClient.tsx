"use client";

import { Clipboard, MessageCircle, PencilLine, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { deactivateAdminMessageTemplateAction, saveAdminMessageTemplateAction } from "@/app/admin/actions";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";

export type AdminMessageTemplate = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

function normalizeWhatsAppPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 8) {
    return `591${digits}`;
  }
  return digits;
}

export function AdminMessageSenderClient({ templates }: { templates: AdminMessageTemplate[] }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? "");
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(selectedTemplate?.body ?? "");
  const [editingTemplateId, setEditingTemplateId] = useState("");
  const editingTemplate = templates.find((template) => template.id === editingTemplateId);
  const normalizedPhone = useMemo(() => normalizeWhatsAppPhone(phone), [phone]);
  const canOpenWhatsApp = normalizedPhone.length >= 8 && message.trim().length >= 2;

  const whatsAppUrl = useMemo(() => {
    if (!canOpenWhatsApp) return "";
    return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message.trim())}`;
  }, [canOpenWhatsApp, message, normalizedPhone]);

  function selectTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const nextTemplate = templates.find((template) => template.id === templateId);
    setMessage(nextTemplate?.body ?? "");
  }

  function startEditing(templateId: string) {
    setEditingTemplateId(templateId);
  }

  function clearEditing() {
    setEditingTemplateId("");
  }

  async function copyMessage() {
    if (!message.trim()) return;
    await navigator.clipboard.writeText(message.trim());
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card className="space-y-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">Plantillas</p>
          <h2 className="mt-1 text-xl font-black">{editingTemplate ? "Editar mensaje" : "Nuevo mensaje"}</h2>
          <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
            Guarda textos frecuentes para soporte, ventas, cobros o avisos operativos.
          </p>
        </div>

        <form action={saveAdminMessageTemplateAction} className="grid gap-3" key={editingTemplate?.id ?? "new-template"}>
          <input name="templateId" type="hidden" value={editingTemplate?.id ?? ""} />
          <label className="grid gap-1 text-sm font-bold">
            Nombre interno
            <Input defaultValue={editingTemplate?.title ?? ""} maxLength={80} name="title" placeholder="Ej. Bienvenida demo" required />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Mensaje
            <Textarea defaultValue={editingTemplate?.body ?? ""} maxLength={1200} name="body" placeholder="Hola, te escribe yopido.shop..." required />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button className={buttonClasses("primary", "w-full sm:w-auto")} type="submit">
              <PencilLine className="h-4 w-4" />
              {editingTemplate ? "Guardar cambios" : "Guardar plantilla"}
            </button>
            {editingTemplate ? (
              <button className={buttonClasses("secondary", "w-full sm:w-auto")} onClick={clearEditing} type="button">
                Cancelar edicion
              </button>
            ) : null}
          </div>
        </form>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">Enviar</p>
            <h2 className="mt-1 text-xl font-black">Mensaje por WhatsApp</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
              Pega el numero, elige una plantilla y se abre WhatsApp listo para enviar.
            </p>
          </div>
          <Badge className="w-fit bg-[var(--color-success-soft)] text-[var(--color-success-strong)]">Superadmin</Badge>
        </div>

        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-bold">
            Numero WhatsApp
            <Input inputMode="tel" onChange={(event) => setPhone(event.target.value)} placeholder="Ej. 71234567 o +59171234567" value={phone} />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Plantilla
            <Select disabled={!templates.length} onChange={(event) => selectTemplate(event.target.value)} value={selectedTemplateId}>
              {templates.length ? (
                templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))
              ) : (
                <option value="">Crea tu primera plantilla</option>
              )}
            </Select>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Mensaje final
            <Textarea onChange={(event) => setMessage(event.target.value)} value={message} />
          </label>
          <div className="rounded-[var(--radius-control)] bg-[var(--color-surface)] p-3 text-xs font-bold text-[var(--color-secondary-text)]">
            Numero limpio: <span className="text-[var(--color-heading)]">{normalizedPhone || "sin numero"}</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              aria-disabled={!canOpenWhatsApp}
              className={cn(buttonClasses("primary", "w-full sm:w-auto"), !canOpenWhatsApp && "pointer-events-none opacity-50")}
              href={whatsAppUrl || "#"}
              rel="noreferrer"
              target="_blank"
            >
              <Send className="h-4 w-4" />
              Abrir WhatsApp
            </a>
            <button className={buttonClasses("secondary", "w-full sm:w-auto")} disabled={!message.trim()} onClick={copyMessage} type="button">
              <Clipboard className="h-4 w-4" />
              Copiar mensaje
            </button>
          </div>
        </div>
      </Card>

      <section className="space-y-3 xl:col-span-2">
        <h2 className="text-lg font-black">Mensajes guardados</h2>
        {templates.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map((template) => (
              <Card className="space-y-3" key={template.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-black">{template.title}</p>
                    <p className="mt-1 line-clamp-3 text-sm font-semibold text-[var(--color-secondary-text)]">{template.body}</p>
                  </div>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--primary-light)] text-[var(--primary)]">
                    <MessageCircle className="h-4 w-4" />
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button className={buttonClasses("secondary", "w-full sm:flex-1")} onClick={() => startEditing(template.id)} type="button">
                    <PencilLine className="h-4 w-4" />
                    Editar
                  </button>
                  <form action={deactivateAdminMessageTemplateAction} className="sm:flex-1">
                    <input name="templateId" type="hidden" value={template.id} />
                    <button className={buttonClasses("danger", "w-full")} type="submit">
                      <Trash2 className="h-4 w-4" />
                      Desactivar
                    </button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="flex min-h-40 items-center justify-center text-center">
            <p className="max-w-md text-sm font-bold text-[var(--color-secondary-text)]">
              Todavia no hay mensajes guardados. Crea una plantilla para empezar a enviar mas rapido.
            </p>
          </Card>
        )}
      </section>
    </div>
  );
}
