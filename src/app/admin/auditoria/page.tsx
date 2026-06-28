import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { superadminService } from "@/lib/services/superadmin.service";
import { formatShortDate, formatShortTime } from "@/lib/utils/dates";
import type { AdminAuditLog } from "@/types/superadmin.types";

export default async function AuditPage() {
  const logs = await superadminService.listAuditLogs(120);

  return (
    <AdminLayout active="/admin/auditoria" title="Auditoría">
      <SectionTitle description="Historial de acciones sensibles realizadas en la plataforma." title="Auditoría" />
      <div className="mt-6">
        <DataTable
          emptyMessage="No hay eventos de auditoría."
          headers={["Fecha", "Actor", "Acción", "Restaurante", "Entidad", "Severidad", "IP"]}
          rows={logs.map((log) => [
            `${formatShortDate(log.createdAt)} ${formatShortTime(log.createdAt)}`,
            log.actorEmail,
            log.action,
            log.restaurantName,
            log.entityType,
            <SeverityBadge key={log.id} severity={log.severity} />,
            log.ipAddress || "Sin IP",
          ])}
        />
      </div>
    </AdminLayout>
  );
}

function SeverityBadge({ severity }: { severity: AdminAuditLog["severity"] }) {
  const className = severity === "critical" ? "bg-red-50 text-red-700" : severity === "warning" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700";

  return <Badge className={className}>{severity}</Badge>;
}
