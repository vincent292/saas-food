import { redirect } from "next/navigation";
import { sendPlatformBroadcastAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card } from "@/components/ui/Card";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import { Input, Textarea } from "@/components/ui/Input";
import { authService } from "@/lib/services/auth.service";

export default async function PlatformBroadcastPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const [profile, params] = await Promise.all([authService.getCurrentProfile(), searchParams]);
  if (profile?.globalRole !== "superadmin") redirect("/admin?error=access-denied");
  return <AdminLayout active="/admin/avisos" title="Avisos de plataforma"><Card className="max-w-2xl space-y-5"><div><h1 className="text-2xl font-black">Enviar aviso</h1><p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">Notificación push para mantenimiento, pagos o novedades.</p></div>{params.sent ? <p className="rounded-xl bg-[var(--color-success-soft)] p-3 text-sm font-bold">Enviado a {params.sent} dispositivos.</p> : null}{params.error ? <p className="rounded-xl bg-[var(--color-danger-soft)] p-3 text-sm font-bold">No se pudo completar todo el envío.</p> : null}<form action={sendPlatformBroadcastAction} className="space-y-4"><label className="grid gap-1 text-sm font-bold">Destino<select className="rounded-xl border p-3" name="audience" defaultValue="all"><option value="all">Todos</option><option value="staff">Dueños y personal POS</option><option value="riders">Riders</option><option value="customers">Clientes</option></select></label><Input name="title" placeholder="Título del aviso" required maxLength={80} /><Textarea name="body" placeholder="Mensaje del aviso" required maxLength={500} /><FormSubmitButton label="Enviar notificación" pendingLabel="Enviando..." /></form></Card></AdminLayout>;
}
