import { Mail, Phone, UserRound } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { listCustomerAccounts } from "@/lib/services/customer-account.service";
import { formatShortDate } from "@/lib/utils/dates";

export default async function AdminCustomersPage() {
  const customers = await listCustomerAccounts();

  return (
    <AdminLayout active="/admin/clientes" title="Clientes app">
      <SectionTitle
        description="Usuarios compradores registrados desde la app movil. No son duenos ni administradores de restaurantes."
        title="Clientes de Yopido"
      />

      <div className="mt-6">
        <DataTable
          emptyMessage="Todavia no hay clientes registrados desde la app."
          headers={["Cliente", "Contacto", "Carnet", "Proveedor", "Estado", "Registro"]}
          rows={customers.map((customer) => [
            <div className="flex items-center gap-3" key={`${customer.id}-name`}>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary-dark)]">
                <UserRound className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-black">{customer.fullName}</p>
                <p className="truncate text-xs font-semibold text-[var(--color-secondary-text)]">{customer.id}</p>
              </div>
            </div>,
            <div className="grid gap-1" key={`${customer.id}-contact`}>
              <p className="inline-flex items-center gap-2 font-bold">
                <Mail className="h-4 w-4 text-[var(--primary)]" />
                {customer.email}
              </p>
              <p className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-secondary-text)]">
                <Phone className="h-4 w-4" />
                {customer.phone}
              </p>
            </div>,
            customer.documentNumber,
            customer.provider === "google" ? "Google" : "Correo",
            <Badge className={customer.status === "active" ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"} key={`${customer.id}-status`}>
              {customer.status === "active" ? "Activo" : "Bloqueado"}
            </Badge>,
            <div className="text-xs font-semibold text-[var(--color-secondary-text)]" key={`${customer.id}-dates`}>
              <p>{formatShortDate(customer.createdAt)}</p>
              <p>Ultimo acceso: {customer.lastSignInAt ? formatShortDate(customer.lastSignInAt) : "sin registro"}</p>
            </div>,
          ])}
        />
      </div>
    </AdminLayout>
  );
}
