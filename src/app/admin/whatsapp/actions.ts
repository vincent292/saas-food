"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { platformWhatsAppService } from "@/lib/services/platform-whatsapp.service";
import { createClient } from "@/lib/supabase/server";

const settingsSchema = z.object({
  botEnabled: z.boolean(),
  responseTone: z.enum(["friendly", "direct", "formal"]),
  welcomeMessage: z.string().trim().max(600),
  restaurantPickerMessage: z.string().trim().max(600),
  fallbackMessage: z.string().trim().max(600),
  humanHandoffMessage: z.string().trim().max(600),
  draftTimeoutMinutes: z.coerce.number().int().min(5).max(120),
});

async function requireSuperadmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/admin/login?error=session");
  }

  const { data: profile } = await supabase.from("profiles").select("global_role").eq("id", data.user.id).maybeSingle();
  if (profile?.global_role !== "superadmin") {
    redirect("/admin?error=superadmin-required");
  }

  return data.user;
}

export async function savePlatformWhatsAppSettingsAction(formData: FormData) {
  const user = await requireSuperadmin();
  const parsed = settingsSchema.safeParse({
    botEnabled: formData.get("botEnabled") === "on",
    responseTone: formData.get("responseTone"),
    welcomeMessage: formData.get("welcomeMessage") ?? "",
    restaurantPickerMessage: formData.get("restaurantPickerMessage") ?? "",
    fallbackMessage: formData.get("fallbackMessage") ?? "",
    humanHandoffMessage: formData.get("humanHandoffMessage") ?? "",
    draftTimeoutMinutes: formData.get("draftTimeoutMinutes") ?? 20,
  });

  if (!parsed.success) {
    redirect("/admin/whatsapp?error=invalid-settings");
  }

  const result = await platformWhatsAppService.saveSettings({
    ...parsed.data,
    userId: user.id,
  });

  revalidatePath("/admin/whatsapp");
  redirect(result.ok ? "/admin/whatsapp?saved=1" : `/admin/whatsapp?error=${result.error}`);
}
