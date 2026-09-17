import Link from "next/link";
import { Clock3, Fingerprint, Mail, Store, UserPlus, Users, UtensilsCrossed } from "lucide-react";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { CreateWaiterClient } from "@/components/owner/CreateWaiterClient";
import { ResponsibleAccessActionsClient } from "@/components/owner/ResponsibleAccessActionsClient";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { listOwnerResponsibles, type OwnerResponsible } from "@/lib/services/owner-dashboard.service";

function dateTime(value?: string) {
  if (!value) return "Sin registro";
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/La_Paz",
  }).format(new Date(value));
}

function StaffCard({ member }: { member: OwnerResponsible }) {
  const waiter = member.role === "waiter";
  return (
    <Card className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-lg font-black">{member.fullName}</p>
          <Badge className={member.isActive ? "justify-center bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "justify-center bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"}>
            {member.isActive ? "Activo" : "Desactivado"}
          </Badge>
          {waiter && member.currentShiftOpenedAt ? <Badge>Turno abierto</Badge> : null}
        </div>
        <p className="mt-1 flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--color-secondary-text)]">
          <Mail className="h-4 w-4 shrink-0" />
          <span className="truncate">{member.email}</span>
        </p>
        <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-[var(--color-secondary-text)]">
          <Store className="h-4 w-4" />
          {member.restaurantName}
        </p>
        <p className="mt-1 flex items-center gap-2 text-xs font-bold text-[var(--color-secondary-text)]">
          <Fingerprint className="h-4 w-4" />
          Usuario: {member.userId.slice(0, 8)}
        </p>
        {waiter ? (
          <div className="mt-4 grid gap-2 border-t border-[var(--border)] pt-4 text-sm sm:grid-cols-3">
            <div>
              <p className="font-black">{member.ordersToday}</p>
              <p className="text-xs font-semibold text-[var(--color-secondary-text)]">Pedidos hoy</p>
            </div>
            <div>
              <p className="font-black">{dateTime(member.lastShiftOpenedAt)}</p>
              <p className="text-xs font-semibold text-[var(--color-secondary-text)]">Ultima entrada</p>
            </div>
            <div>
              <p className="font-black">{dateTime(member.lastShiftClosedAt)}</p>
              <p className="text-xs font-semibold text-[var(--color-secondary-text)]">Ultima salida</p>
            </div>
          </div>
        ) : null}
      </div>
      <ResponsibleAccessActionsClient
        email={member.email}
        fullName={member.fullName}
        isActive={member.isActive}
        restaurantId={member.restaurantId}
        role={member.role}
        targetUserId={member.userId}
      />
    </Card>
  );
}

export default async function OwnerResponsiblesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ tab }, { ownerMemberships, profile }] = await Promise.all([
    searchParams,
    getOwnerLayoutContext({ active: "/dueno/responsables" }),
  ]);
  const selectedTab = tab === "meseros" ? "meseros" : "responsables";
  const staff = (await listOwnerResponsibles(ownerMemberships, ["restaurant_admin", "waiter"]))
    .filter((member) => member.userId !== profile.id);
  const responsibles = staff.filter((member) => member.role === "restaurant_admin");
  const waiters = staff.filter((member) => member.role === "waiter");
  const activeWaiters = new Map<string, number>();
  for (const waiter of waiters) {
    if (waiter.isActive) activeWaiters.set(waiter.restaurantId, (activeWaiters.get(waiter.restaurantId) ?? 0) + 1);
  }
  const restaurants = ownerMemberships.map((membership) => ({
    id: membership.restaurant.id,
    name: membership.restaurant.name,
    activeWaiters: activeWaiters.get(membership.restaurant.id) ?? 0,
    waiterLimit: membership.restaurant.waiterLimit ?? 2,
  }));
  const visible = selectedTab === "meseros" ? waiters : responsibles;

  return (
    <OwnerLayout active="/dueno/responsables" memberships={ownerMemberships} title="Equipo">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
          <Link className={buttonClasses(selectedTab === "responsables" ? "primary" : "secondary")} href="/dueno/responsables">
            <Users className="h-4 w-4" />
            Responsables
          </Link>
          <Link className={buttonClasses(selectedTab === "meseros" ? "primary" : "secondary")} href="/dueno/responsables?tab=meseros">
            <UtensilsCrossed className="h-4 w-4" />
            Meseros
          </Link>
        </div>

        {selectedTab === "meseros" ? (
          <>
            <Card className="space-y-5">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--primary-light)] text-[var(--primary)]">
                  <UserPlus className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-black">Crear mesero</h2>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">Cada sucursal muestra el cupo de meseros que configuró la plataforma. Por ahora no se cobra; el nuevo usuario deberá cambiar su clave temporal al ingresar.</p>
                </div>
              </div>
              <CreateWaiterClient restaurants={restaurants} />
            </Card>
            <SectionTitle description="Entradas, salidas y pedidos registrados desde Yopido POS." title="Actividad de meseros" />
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 border-b border-[var(--border)] pb-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--primary-light)] text-[var(--primary)]">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-black">Responsables por sucursal</h2>
                <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">Cada responsable entra a su panel operativo y el dueno conserva acceso a todas las sucursales.</p>
              </div>
            </div>
            <SectionTitle description="Accesos administrativos agrupados por sucursal." title="Responsables" />
          </>
        )}

        <div className="grid gap-3">
          {visible.map((member) => <StaffCard key={`${member.restaurantId}-${member.userId}-${member.role}`} member={member} />)}
          {!visible.length ? (
            <Card className="border-dashed text-sm font-semibold text-[var(--color-secondary-text)]">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4" />
                {selectedTab === "meseros" ? "Todavia no hay meseros registrados." : "Todavia no hay responsables visibles."}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </OwnerLayout>
  );
}
