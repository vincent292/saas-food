import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { endReadOnlySupportSessionAction, startReadOnlySupportSessionAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { createAdminClient } from "@/lib/supabase/admin";
import { authService } from "@/lib/services/auth.service";
import { getActiveSupportSession } from "@/lib/services/support-impersonation.service";

const messages: Record<string, string> = {
  "invalid-support-session": "Elige un usuario, una sucursal y explica el motivo (mínimo 10 caracteres).",
  "invalid-support-target": "Ese usuario no tiene un rol operativo activo en la sucursal elegida.",
  "service-role-required": "Falta la configuración segura del servidor para abrir sesiones de soporte.",
};

export default async function SupportAccessPage({ searchParams }: { searchParams: Promise<{ usuario?: string; error?: string; ended?: string }> }) {
  const [{ usuario, error, ended }, profile] = await Promise.all([searchParams, authService.getCurrentProfile()]);
  if (!profile) redirect("/admin/login?error=session");
  if (profile.globalRole !== "superadmin") redirect("/admin?error=superadmin-required");

  const activeSession = await getActiveSupportSession(profile.id);
  const target = usuario && /^[0-9a-f-]{36}$/i.test(usuario) ? await loadTarget(usuario) : null;

  return (
    <AdminLayout active="/admin/soporte" title="Acceso de soporte">
      <div className="space-y-6">
        <SectionTitle
          title="Ver como usuario"
          description="Abre una sesión temporal de solo lectura para reproducir un caso sin pedir la contraseña del cliente. Toda sesión queda auditada y vence en 15 minutos."
        />

        {error ? <Notice tone="danger">{messages[error] ?? "No se pudo abrir la sesión de soporte."}</Notice> : null}
        {ended ? <Notice tone="success">La sesión de soporte fue cerrada y quedó registrada en auditoría.</Notice> : null}

        {activeSession ? (
          <Card className="space-y-4 border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)]">
            <div>
              <p className="font-black">Sesión de solo lectura activa</p>
              <p className="mt-1 text-sm">Viendo a {activeSession.targetName} ({activeSession.targetRole}) en {activeSession.restaurantName}. Vence: {new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(new Date(activeSession.expiresAt))}.</p>
            </div>
            <form action={endReadOnlySupportSessionAction}>
              <button className={buttonClasses("secondary")} type="submit">Terminar sesión de soporte</button>
            </form>
          </Card>
        ) : null}

        {!usuario ? (
          <Card className="space-y-3">
            <p className="font-black">Elige primero un usuario operativo</p>
            <p className="text-sm text-[var(--color-secondary-text)]">Desde Usuarios, busca al dueño o responsable y pulsa “Ver como”.</p>
            <Link className={buttonClasses("primary")} href="/admin/usuarios">Ir a usuarios</Link>
          </Card>
        ) : !target ? (
          <Card className="space-y-3">
            <p className="font-black">No encontramos un usuario operativo con acceso activo.</p>
            <Link className={buttonClasses("secondary")} href="/admin/usuarios">Volver a usuarios</Link>
          </Card>
        ) : (
          <Card>
            <SectionTitle title={`Abrir soporte para ${target.name}`} description={target.email} />
            {target.memberships.length ? (
              <form action={startReadOnlySupportSessionAction} className="mt-4 grid max-w-2xl gap-4">
                <input name="targetUserId" type="hidden" value={target.id} />
                <label className="grid gap-1.5 text-sm font-bold">
                  Sucursal y rol
                  <select className="min-h-11 rounded-2xl border border-[var(--border)] bg-white px-3 text-sm" name="restaurantId" required>
                    {target.memberships.map((membership) => <option key={membership.restaurantId} value={membership.restaurantId}>{membership.restaurantName} · {roleLabel(membership.role)}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-bold">
                  Motivo del acceso
                  <Textarea name="purpose" placeholder="Ej.: Reproducir el error al abrir Caja informado en ticket #123." required />
                </label>
                <p className="text-xs font-semibold text-[var(--color-secondary-text)]">No se podrán guardar cambios, cobrar, borrar ni editar mientras esta sesión esté activa.</p>
                <div className="flex flex-wrap gap-2">
                  <button className={buttonClasses("primary")} disabled={Boolean(activeSession)} type="submit">Abrir vista de solo lectura</button>
                  <Link className={buttonClasses("secondary")} href="/admin/usuarios">Cancelar</Link>
                </div>
              </form>
            ) : <p className="mt-4 text-sm">Este usuario no tiene una membresía operativa activa.</p>}
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

async function loadTarget(userId: string) {
  const admin = createAdminClient();
  if (!admin) return null;
  const [{ data: target }, { data: memberships }] = await Promise.all([
    admin.from("profiles").select("id,full_name,email,global_role").eq("id", userId).maybeSingle(),
    admin.from("restaurant_memberships").select("restaurant_id,role").eq("user_id", userId).eq("is_active", true),
  ]);
  if (!target || target.global_role === "superadmin") return null;
  const roleMemberships = (memberships ?? []).filter((membership) => ["restaurant_admin", "cashier", "kitchen", "waiter"].includes(membership.role));
  const { data: restaurants } = roleMemberships.length
    ? await admin.from("restaurants").select("id,name").in("id", roleMemberships.map((membership) => membership.restaurant_id)).is("deleted_at", null)
    : { data: [] as Array<{ id: string; name: string }> };
  const names = new Map((restaurants ?? []).map((restaurant) => [restaurant.id, restaurant.name]));
  return {
    id: target.id,
    name: target.full_name ?? target.email ?? "Usuario",
    email: target.email ?? "",
    memberships: roleMemberships.filter((membership) => names.has(membership.restaurant_id)).map((membership) => ({ restaurantId: membership.restaurant_id, restaurantName: names.get(membership.restaurant_id) ?? "Restaurante", role: membership.role })),
  };
}

function roleLabel(role: string) {
  return ({ restaurant_admin: "Dueño / administrador", cashier: "Caja", kitchen: "Cocina", waiter: "Mesero" } as Record<string, string>)[role] ?? role;
}

function Notice({ children, tone }: { children: ReactNode; tone: "success" | "danger" }) {
  return <div className={`rounded-2xl p-4 text-sm font-bold ${tone === "success" ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"}`}>{children}</div>;
}
