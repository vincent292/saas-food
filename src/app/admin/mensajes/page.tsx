import { redirect } from "next/navigation";
import { AdminMessageSenderClient, type AdminMessageTemplate } from "@/components/admin/AdminMessageSenderClient";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { authService } from "@/lib/services/auth.service";
import { createClient } from "@/lib/supabase/server";

const feedbackMessages: Record<string, string> = {
  "invalid-template": "Revisa el nombre y el mensaje de la plantilla.",
  saved: "Plantilla guardada correctamente.",
  deleted: "Plantilla desactivada.",
};

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}) {
  const [params, profile] = await Promise.all([searchParams, authService.getCurrentProfile()]);

  if (!profile) {
    redirect("/admin/login?error=session");
  }

  if (profile.globalRole !== "superadmin") {
    redirect("/admin?error=superadmin-required");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_message_templates")
    .select("id,title,body,updated_at")
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  const templates: AdminMessageTemplate[] = (data ?? []).map((template) => ({
    id: template.id,
    title: template.title,
    body: template.body,
    updatedAt: template.updated_at,
  }));

  const feedback = params.error
    ? feedbackMessages[params.error] ?? `No se pudo completar la accion: ${params.error}.`
    : params.saved
      ? feedbackMessages.saved
      : params.deleted
        ? feedbackMessages.deleted
        : error
          ? "No se pudieron cargar las plantillas. Verifica que la migracion este aplicada."
          : "";

  return (
    <AdminLayout active="/admin/mensajes" title="Mensajes">
      <div className="space-y-6">
        <SectionTitle
          description="Plantillas rapidas para contactar leads, duenos, soporte o clientes desde WhatsApp."
          title="Mensajes predeterminados"
        />

        {feedback ? (
          <Card className={params.error || error ? "border-[var(--color-danger-strong)] bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]" : "border-[var(--color-success-soft)] bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"}>
            <p className="text-sm font-black">{feedback}</p>
          </Card>
        ) : null}

        <AdminMessageSenderClient templates={templates} />
      </div>
    </AdminLayout>
  );
}
