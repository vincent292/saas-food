import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { PlatformWhatsAppSettingsClient } from "@/components/admin/PlatformWhatsAppSettingsClient";
import { authService } from "@/lib/services/auth.service";
import { platformWhatsAppService } from "@/lib/services/platform-whatsapp.service";

export default async function PlatformWhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [profile, query, settings] = await Promise.all([
    authService.getCurrentProfile(),
    searchParams,
    platformWhatsAppService.getSettings(),
  ]);

  if (!profile) {
    redirect("/admin/login?error=session");
  }

  if (profile.globalRole !== "superadmin") {
    redirect("/admin?error=superadmin-required");
  }

  const whatsappConfigured = Boolean(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim());

  return (
    <AdminLayout active="/admin/whatsapp" title="WhatsApp global">
      <PlatformWhatsAppSettingsClient
        feedback={query.error}
        saved={query.saved === "1"}
        settings={settings}
        whatsappConfigured={whatsappConfigured}
      />
    </AdminLayout>
  );
}
