import { createHash, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export const supportSessionCookieName = "yopido_support_read_only";
const supportSessionDurationMinutes = 15;

type SupportSessionRow = {
  id: string;
  actor_user_id: string;
  target_user_id: string;
  restaurant_id: string;
  target_role: "restaurant_admin" | "cashier" | "kitchen" | "waiter";
  purpose: string;
  status: "active" | "ended" | "expired" | "revoked";
  expires_at: string;
};

export type ActiveSupportSession = {
  id: string;
  targetUserId: string;
  targetName: string;
  targetEmail: string;
  restaurantId: string;
  restaurantName: string;
  targetRole: SupportSessionRow["target_role"];
  purpose: string;
  expiresAt: string;
};

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createReadOnlySupportSession({
  actorUserId,
  targetUserId,
  restaurantId,
  targetRole,
  purpose,
}: {
  actorUserId: string;
  targetUserId: string;
  restaurantId: string;
  targetRole: SupportSessionRow["target_role"];
  purpose: string;
}) {
  const admin = createAdminClient();
  if (!admin) throw new Error("service-role-required");

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + supportSessionDurationMinutes * 60_000).toISOString();
  const { data, error } = await admin
    .from("support_impersonation_sessions")
    .insert({
      actor_user_id: actorUserId,
      target_user_id: targetUserId,
      restaurant_id: restaurantId,
      target_role: targetRole,
      purpose,
      token_hash: tokenHash(token),
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.code ?? "support-session-create");

  const cookieStore = await cookies();
  cookieStore.set(supportSessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });

  return { id: data.id, expiresAt };
}

export async function getActiveSupportSession(actorUserId: string): Promise<ActiveSupportSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(supportSessionCookieName)?.value;
  const admin = createAdminClient();
  if (!token || !admin) return null;

  const { data: raw } = await admin
    .from("support_impersonation_sessions")
    .select("id,actor_user_id,target_user_id,restaurant_id,target_role,purpose,status,expires_at")
    .eq("token_hash", tokenHash(token))
    .eq("actor_user_id", actorUserId)
    .maybeSingle();
  const session = raw as SupportSessionRow | null;

  if (!session || session.status !== "active" || new Date(session.expires_at).getTime() <= Date.now()) {
    if (session?.status === "active") {
      await admin.from("support_impersonation_sessions").update({ status: "expired", ended_at: new Date().toISOString(), ended_reason: "Tiempo de soporte agotado" }).eq("id", session.id);
    }
    cookieStore.delete(supportSessionCookieName);
    return null;
  }

  const [{ data: profile }, { data: restaurant }] = await Promise.all([
    admin.from("profiles").select("full_name,email").eq("id", session.target_user_id).maybeSingle(),
    admin.from("restaurants").select("name").eq("id", session.restaurant_id).maybeSingle(),
  ]);

  return {
    id: session.id,
    targetUserId: session.target_user_id,
    targetName: profile?.full_name ?? profile?.email ?? "Usuario",
    targetEmail: profile?.email ?? "",
    restaurantId: session.restaurant_id,
    restaurantName: restaurant?.name ?? "Restaurante",
    targetRole: session.target_role,
    purpose: session.purpose,
    expiresAt: session.expires_at,
  };
}

export async function endActiveSupportSession(actorUserId: string, reason = "Finalizada por superadmin") {
  const active = await getActiveSupportSession(actorUserId);
  const cookieStore = await cookies();
  cookieStore.delete(supportSessionCookieName);
  if (!active) return null;

  const admin = createAdminClient();
  if (!admin) return null;
  await admin
    .from("support_impersonation_sessions")
    .update({ status: "ended", ended_at: new Date().toISOString(), ended_reason: reason })
    .eq("id", active.id)
    .eq("actor_user_id", actorUserId)
    .eq("status", "active");
  return active;
}
