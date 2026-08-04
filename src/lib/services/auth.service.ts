import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { AppRole } from "@/types/restaurant.types";

export type CurrentProfile = {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  documentNumber: string;
  birthDate: string;
  globalRole: AppRole | null;
  mustChangePassword: boolean;
  isCustomerAccount: boolean;
  ownerProfileCompletedAt?: string;
  ownerProfileComplete: boolean;
};

function isFilled(value?: string | null) {
  return Boolean(value?.trim());
}

export function isOwnerProfileComplete(profile: Pick<CurrentProfile, "birthDate" | "documentNumber" | "email" | "fullName" | "phone">) {
  return isFilled(profile.fullName) && isFilled(profile.email) && isFilled(profile.phone) && isFilled(profile.documentNumber) && isFilled(profile.birthDate);
}

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

    const [{ data: profile }, { data: customerProfile }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userData.user.id).maybeSingle(),
      supabase.from("customer_profiles").select("id").eq("id", userData.user.id).maybeSingle(),
    ]);

    const currentProfile = {
      id: userData.user.id,
      email: profile?.email ?? userData.user.email ?? "",
      fullName: profile?.full_name ?? userData.user.email ?? "Usuario",
      phone: profile?.phone ?? "",
      documentNumber: profile?.document_number ?? "",
      birthDate: profile?.birth_date ?? "",
      globalRole: profile?.global_role ?? null,
      mustChangePassword: userData.user.user_metadata?.must_change_password === true,
      isCustomerAccount: Boolean(!profile && customerProfile),
      ownerProfileCompletedAt: profile?.owner_profile_completed_at ?? undefined,
      ownerProfileComplete: false,
    };

    return {
      ...currentProfile,
      ownerProfileComplete: isOwnerProfileComplete(currentProfile),
    };
  },

  async isSuperAdmin() {
    const profile = await this.getCurrentProfile();
    return profile?.globalRole === "superadmin";
  },
};
