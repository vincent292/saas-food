import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Boxes, Building2, ClipboardList, Plus, Store, TrendingUp, WalletCards } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { SuperAdminDashboard } from "@/components/admin/SuperAdminDashboard";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { authService } from "@/lib/services/auth.service";
import { membershipService, type UserRestaurantMembership } from "@/lib/services/membership.service";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils/money";
import { publicRestaurantPath } from "@/lib/utils/public-routes";

type OwnerBranchSummary = {
  membership: UserRestaurantMembership;
  orders30d: number;
  ordersToday: number;
  activeOrders: number;
  revenue30d: number;
  openCashSession: boolean;
  lastClosedCashAt?: string;
  lowStockItems: number;
  expiringLots: number;
};

export default async function AdminPage() {
  const profile = await authService.getCurrentProfile();

  if (!profile) {
    redirect("/admin/login?error=session");
  }

  if (profile.globalRole !== "superadmin") {
    const memberships = await membershipService.listActiveRestaurantsForUser(profile.id);

    if (!memberships.length) {
      redirect("/admin/login?error=no-access");
    }

    const isOwner = memberships.some((membership) => membership.role === "restaurant_admin");

    if (!isOwner && memberships.length === 1) {
      redirect(`/admin/restaurantes/${memberships[0].restaurant.id}/dashboard`);
    }

    if (isOwner) {
      const summaries = await getOwnerBranchSummaries(memberships);
      return <OwnerDashboard email={profile.email} summaries={summaries} />;
    }

    return (
      <BranchSelector email={profile.email} memberships={memberships} />
    );
  }

  return (
    <AdminLayout active="/admin" title="Superadmin">
      <SuperAdminDashboard />
    </AdminLayout>
  );
}

async function getOwnerBranchSummaries(memberships: UserRestaurantMembership[]): Promise<OwnerBranchSummary[]> {
  const restaurantIds = memberships.map((membership) => membership.restaurant.id);
  const supabase = await createClient();
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const next14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const since30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [{ data: orders }, { data: cashSessions }, { data: inventoryItems }, { data: inventoryLots }] = await Promise.all([
    supabase.from("orders").select("restaurant_id,status,total,created_at").in("restaurant_id", restaurantIds).gte("created_at", since30Days.toISOString()),
    supabase.from("cash_sessions").select("restaurant_id,status,closed_at,opened_at").in("restaurant_id", restaurantIds).order("opened_at", { ascending: false }),
    supabase.from("inventory_items").select("restaurant_id,current_stock,min_stock,is_active").in("restaurant_id", restaurantIds).eq("is_active", true),
    supabase
      .from("inventory_lots")
      .select("restaurant_id,expires_on,remaining_quantity,is_active")
      .in("restaurant_id", restaurantIds)
      .eq("is_active", true)
      .gt("remaining_quantity", 0),
  ]);

  return memberships.map((membership) => {
    const branchOrders = (orders ?? []).filter((order) => order.restaurant_id === membership.restaurant.id);
    const validOrders = branchOrders.filter((order) => order.status !== "cancelled");
    const branchCashSessions = (cashSessions ?? []).filter((session) => session.restaurant_id === membership.restaurant.id);
    const latestClosedCash = branchCashSessions.find((session) => session.status === "closed" && session.closed_at);
    const branchInventory = (inventoryItems ?? []).filter((item) => item.restaurant_id === membership.restaurant.id);
    const branchLots = (inventoryLots ?? []).filter((lot) => lot.restaurant_id === membership.restaurant.id);

    return {
      membership,
      orders30d: validOrders.length,
      ordersToday: validOrders.filter((order) => new Date(order.created_at) >= todayStart).length,
      activeOrders: branchOrders.filter((order) => ["pending", "accepted", "preparing", "ready"].includes(order.status)).length,
      revenue30d: validOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0),
      openCashSession: branchCashSessions.some((session) => session.status === "open"),
      lastClosedCashAt: latestClosedCash?.closed_at ?? undefined,
      lowStockItems: branchInventory.filter((item) => Number(item.min_stock ?? 0) > 0 && Number(item.current_stock ?? 0) <= Number(item.min_stock ?? 0)).length,
      expiringLots: branchLots.filter((lot) => lot.expires_on && new Date(`${lot.expires_on}T00:00:00`) <= next14Days).length,
    };
  });
}

function OwnerDashboard({ email, summaries }: { email: string; summaries: OwnerBranchSummary[] }) {
  const totalOrders30d = summaries.reduce((sum, summary) => sum + summary.orders30d, 0);
  const totalRevenue30d = summaries.reduce((sum, summary) => sum + summary.revenue30d, 0);
  const totalActiveOrders = summaries.reduce((sum, summary) => sum + summary.activeOrders, 0);
  const totalInventoryAlerts = summaries.reduce((sum, summary) => sum + summary.lowStockItems + summary.expiringLots, 0);
  const firstBranch = summaries[0]?.membership.restaurant;

  return (
    <main className="min-h-screen bg-[var(--color-surface)] px-4 py-6 text-[var(--color-heading)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--color-secondary-text)]">Panel de dueño</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">Tus sucursales</h1>
            <p className="mt-2 text-sm font-semibold text-[var(--color-secondary-text)]">{email}</p>
          </div>
          {firstBranch ? (
            <Link className={buttonClasses("primary")} href={`/admin/restaurantes/${firstBranch.id}/soporte`}>
              <Plus className="h-4 w-4" />
              Solicitar sucursal
            </Link>
          ) : null}
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OwnerMetric icon={<Store className="h-5 w-5" />} label="Sucursales" value={String(summaries.length)} />
          <OwnerMetric icon={<ClipboardList className="h-5 w-5" />} label="Pedidos 30d" value={String(totalOrders30d)} />
          <OwnerMetric icon={<WalletCards className="h-5 w-5" />} label="Ventas 30d" value={formatMoney(totalRevenue30d)} />
          <OwnerMetric icon={<Boxes className="h-5 w-5" />} label="Alertas inventario" value={String(totalInventoryAlerts)} />
        </div>

        <SectionTitle description="Cada sucursal mantiene su caja, pedidos, inventario y configuracion por separado." title="Operacion por sucursal" />

        <div className="grid gap-4 lg:grid-cols-2">
          {summaries.map((summary) => (
            <BranchSummaryCard key={summary.membership.restaurant.id} summary={summary} />
          ))}
        </div>

        {totalActiveOrders ? (
          <Card className="border-[var(--accent)] bg-[var(--accent-soft)]">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--accent)] text-[var(--primary)]">
                <TrendingUp className="h-5 w-5" />
              </span>
              <div>
                <p className="text-lg font-black text-[var(--color-heading)]">{totalActiveOrders} pedidos activos ahora</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">Entra a la sucursal correspondiente para operar pedidos, cocina o caja.</p>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

function BranchSummaryCard({ summary }: { summary: OwnerBranchSummary }) {
  const { restaurant } = summary.membership;

  return (
    <Card className="flex h-full flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xl font-black">{restaurant.name}</p>
          <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
            {publicRestaurantPath(restaurant.slug)}
            {restaurant.city ? ` - ${restaurant.city}` : ""}
          </p>
          <Badge className="mt-3 bg-[var(--primary-light)] text-[var(--primary)]">{summary.membership.role}</Badge>
        </div>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--primary)] text-[var(--color-on-primary)]">
          <Building2 className="h-5 w-5" />
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <MiniMetric label="Ventas 30d" value={formatMoney(summary.revenue30d)} />
        <MiniMetric label="Pedidos hoy" value={String(summary.ordersToday)} />
        <MiniMetric label="Pedidos activos" value={String(summary.activeOrders)} />
        <MiniMetric label="Caja" value={summary.openCashSession ? "Abierta" : summary.lastClosedCashAt ? "Cerrada" : "Sin cierre"} />
        <MiniMetric label="Bajo stock" value={String(summary.lowStockItems)} tone={summary.lowStockItems ? "warning" : "default"} />
        <MiniMetric label="Vence pronto" value={String(summary.expiringLots)} tone={summary.expiringLots ? "warning" : "default"} />
      </div>

      <div className="mt-auto flex flex-col gap-2 sm:flex-row">
        <Link className={buttonClasses("primary", "flex-1")} href={`/admin/restaurantes/${restaurant.id}/dashboard`}>
          Entrar
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link className={buttonClasses("secondary", "flex-1")} href={`/admin/restaurantes/${restaurant.id}/inventario`}>
          Inventario
        </Link>
      </div>
    </Card>
  );
}

function OwnerMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[var(--color-secondary-text)]">{label}</p>
          <p className="mt-1 text-2xl font-black text-[var(--color-heading)]">{value}</p>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">{icon}</span>
      </div>
    </Card>
  );
}

function MiniMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3">
      <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">{label}</p>
      <p className={tone === "warning" ? "mt-1 text-lg font-black text-[var(--color-warning-strong)]" : "mt-1 text-lg font-black text-[var(--color-heading)]"}>{value}</p>
    </div>
  );
}

function BranchSelector({ email, memberships }: { email: string; memberships: UserRestaurantMembership[] }) {
  return (
    <main className="min-h-screen bg-[var(--color-surface)] px-4 py-6 text-[var(--color-heading)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--color-secondary-text)]">Sesion de sucursal</p>
            <p className="mt-1 text-xl font-black">{email}</p>
          </div>
          <Badge className="bg-[var(--color-success-soft)] text-[var(--color-success-strong)]">Equipo</Badge>
        </Card>

        <SectionTitle description="Elige la sucursal que quieres operar. Cada una mantiene pedidos, caja, inventario y reportes separados." title="Tus sucursales" />

        <div className="grid gap-4 md:grid-cols-2">
          {memberships.map(({ restaurant, role }) => (
            <Card className="flex flex-col gap-4" key={restaurant.id}>
              <div>
                <p className="text-lg font-black">{restaurant.name}</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
                  {publicRestaurantPath(restaurant.slug)}
                  {restaurant.city ? ` - ${restaurant.city}` : ""}
                </p>
                <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">{role}</p>
              </div>
              <Link className={buttonClasses("primary", "w-full")} href={`/admin/restaurantes/${restaurant.id}/dashboard`}>
                Entrar
              </Link>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
