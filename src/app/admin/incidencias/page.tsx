import { createIncidentAction, updateIncidentAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { restaurantService } from "@/lib/services/restaurant.service";
import { superadminService } from "@/lib/services/superadmin.service";
import { formatShortDate, formatShortTime } from "@/lib/utils/dates";
import type { PlatformIncident } from "@/types/superadmin.types";

const statuses: PlatformIncident["status"][] = ["investigating", "identified", "monitoring", "resolved"];
const severities: PlatformIncident["severity"][] = ["minor", "major", "critical"];

export default async function IncidentsPage() {
  const [incidents, restaurants] = await Promise.all([superadminService.listIncidents(), restaurantService.listRestaurants()]);

  return (
    <AdminLayout active="/admin/incidencias" title="Incidencias">
      <div className="space-y-6">
        <SectionTitle description="Registro de caídas, errores de flujo y problemas por restaurante o plataforma." title="Incidencias" />

        <Card>
          <h2 className="text-lg font-black">Nueva incidencia</h2>
          <form action={createIncidentAction} className="mt-4 grid gap-3 lg:grid-cols-5">
            <select className="min-h-11 rounded-2xl border border-slate-200 px-3 text-sm font-semibold outline-none" name="restaurantId">
              <option value="">Plataforma</option>
              {restaurants.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
            <input className="min-h-11 rounded-2xl border border-slate-200 px-3 text-sm outline-none lg:col-span-2" name="title" placeholder="Qué está fallando" required />
            <select className="min-h-11 rounded-2xl border border-slate-200 px-3 text-sm font-semibold outline-none" name="impactArea">
              <option value="platform">Plataforma</option>
              <option value="public_menu">Menú público</option>
              <option value="orders">Pedidos</option>
              <option value="cash">Caja</option>
              <option value="kitchen">Cocina</option>
              <option value="inventory">Inventario</option>
              <option value="storage">Storage</option>
              <option value="supabase">Supabase</option>
              <option value="other">Otro</option>
            </select>
            <select className="min-h-11 rounded-2xl border border-slate-200 px-3 text-sm font-semibold outline-none" name="severity" defaultValue="minor">
              {severities.map((severity) => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </select>
            <textarea className="min-h-20 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none lg:col-span-4" name="description" placeholder="Impacto, síntomas y alcance" />
            <button className={buttonClasses("primary", "lg:self-start")} type="submit">
              Registrar
            </button>
          </form>
        </Card>

        <section className="space-y-3">
          <SectionTitle title="Historial de incidencias" />
          <DataTable
            emptyMessage="No hay incidencias registradas."
            headers={["Incidencia", "Afectado", "Área", "Severidad", "Estado", "Inicio", "Actualizar"]}
            rows={incidents.map((incident) => [
              <div key={`${incident.id}-title`}>
                <p className="font-black">{incident.title}</p>
                <p className="max-w-md text-xs text-slate-500">{incident.description || "Sin detalle"}</p>
              </div>,
              incident.affectedRestaurantName,
              incident.impactArea,
              incident.severity,
              incident.status,
              `${formatShortDate(incident.startedAt)} ${formatShortTime(incident.startedAt)}`,
              <form action={updateIncidentAction} className="grid min-w-64 gap-2" key={incident.id}>
                <input name="incidentId" type="hidden" value={incident.id} />
                <div className="flex flex-wrap gap-2">
                  <select className="min-h-10 rounded-2xl border border-slate-200 px-2 text-xs font-bold" name="status" defaultValue={incident.status}>
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <select className="min-h-10 rounded-2xl border border-slate-200 px-2 text-xs font-bold" name="severity" defaultValue={incident.severity}>
                    {severities.map((severity) => (
                      <option key={severity} value={severity}>
                        {severity}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea className="min-h-16 rounded-2xl border border-slate-200 px-3 py-2 text-xs outline-none" name="postmortem" placeholder="Postmortem" defaultValue={incident.postmortem} />
                <button className={buttonClasses("secondary")} type="submit">
                  Guardar
                </button>
              </form>,
            ])}
          />
        </section>
      </div>
    </AdminLayout>
  );
}
