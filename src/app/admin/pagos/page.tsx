import { redirect } from "next/navigation";
import { authService } from "@/lib/services/auth.service";
import { BillingNotices } from "@/components/billing/BillingNotice";
import Link from "next/link";

const errors: Record<string, string> = { "billing-invalid-date": "Elige una fecha válida, de hoy en adelante.", "billing-cycle-closed": "Este ciclo ya no admite solicitudes. Actualiza la página.", "billing-forbidden": "No tienes acceso a la mensualidad de esa cuenta.", "billing-unavailable": "La mensualidad no está disponible. Contacta al administrador.", "billing-promise-not-pending": "La solicitud ya fue resuelta." };
export const dynamic = "force-dynamic";
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ requested?: string; error?: string }> }) {
  const profile = await authService.getCurrentProfile();
  if (!profile || profile.isCustomerAccount) redirect("/admin/login?error=session");
  if (profile.mustChangePassword) redirect("/admin/cambiar-contrasena");
  if (profile.globalRole === "superadmin") redirect("/admin");
  const params = await searchParams;
  return <main className="min-h-screen bg-[var(--color-surface)] px-4 py-6"><div className="mx-auto max-w-4xl">
    <Link href="/admin" className="text-sm font-bold underline">Volver al panel</Link>
    <h1 className="mt-5 text-2xl font-black">Mensualidad del negocio</h1>
    {params.requested ? <p role="status" className="mt-4 rounded-xl bg-[var(--color-success-soft)] p-3">Fecha enviada. El corte no cambia hasta que el superadmin apruebe una prórroga.</p> : null}
    {params.error ? <p role="alert" className="mt-4 rounded-xl bg-[var(--color-warning-soft)] p-3">{errors[params.error] ?? "No se pudo guardar la solicitud. Actualiza o contacta al administrador."}</p> : null}
    <BillingNotices full />
  </div></main>;
}
