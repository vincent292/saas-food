import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { AppRole } from "@/types/restaurant.types";

export type CurrentProfile = {
  id: string;
  email: string;
  fullName: string;
  globalRole: AppRole | null;
};

export const authService = {
  async getCurrentProfile(): Promise<CurrentProfile | null> {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      return null;
    }

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userData.user.id).maybeSingle();

    return {
      id: userData.user.id,
      email: profile?.email ?? userData.user.email ?? "",
      fullName: profile?.full_name ?? userData.user.email ?? "Usuario",
      globalRole: profile?.global_role ?? null,
    };
  },

  async isSuperAdmin() {
    const profile = await this.getCurrentProfile();
    return profile?.globalRole === "superadmin";
  },
};
