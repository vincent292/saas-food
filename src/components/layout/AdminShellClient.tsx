"use client";

import Link from "next/link";
import {
  BarChart3,
  Boxes,
  ChefHat,
  ClipboardList,
  CreditCard,
  FileBarChart,
  Home,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  RotateCcw,
  ScrollText,
  Settings,
  Shield,
  Siren,
  Store,
  Table2,
  Utensils,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { signOutAction } from "@/app/admin/actions";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { GlobalOrderSoundAlert } from "@/components/orders/GlobalOrderSoundAlert";
import { cn } from "@/lib/utils/cn";
import type { Order } from "@/types/order.types";
import type { ModuleKey, PlatformBillingAlert, RestaurantStatus } from "@/types/restaurant.types";

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  moduleKey?: ModuleKey;
};

const restaurantNav: NavItem[] = [
  { label: "Dashboard", href: "dashboard", icon: LayoutDashboard },
  { label: "Productos", href: "productos", icon: Utensils, moduleKey: "public_menu" },
  { label: "Categorías", href: "categorias", icon: ClipboardList, moduleKey: "public_menu" },
  { label: "Mesas", href: "mesas", icon: Table2, moduleKey: "table_qr" },
  { label: "Pedidos", href: "pedidos", icon: ChefHat, moduleKey: "orders" },
  { label: "Cocina", href: "cocina", icon: ChefHat, moduleKey: "kitchen" },
  { label: "Caja", href: "caja", icon: CreditCard, moduleKey: "cash" },
  { label: "Inventario", href: "inventario", icon: Boxes, moduleKey: "inventory" },
  { label: "Soporte", href: "soporte", icon: LifeBuoy },
  { label: "Configuración", href: "configuracion", icon: Settings },
];

const superAdminNav: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: Shield },
  { label: "Restaurantes", href: "/admin/restaurantes", icon: Store },
  { label: "Clientes app", href: "/admin/clientes", icon: Users },
  { label: "Planes", href: "/admin/planes", icon: WalletCards },
  { label: "Soporte", href: "/admin/soporte", icon: LifeBuoy },
  { label: "Reportes", href: "/admin/reportes", icon: FileBarChart },
  { label: "Incidencias", href: "/admin/incidencias", icon: Siren },
  { label: "Auditoría", href: "/admin/auditoria", icon: ScrollText },
  { label: "Restauración", href: "/admin/restauracion", icon: RotateCcw },
];

export function AdminShellClient({
  children,
  restaurantId = "",
  restaurantName,
  restaurantStatus,
  billingAlert,
  canAccessOwnerPanel = false,
  canAccessSuperadmin = false,
  canSwitchBranches = false,
  pendingOrderAlerts = [],
  title,
  active = "dashboard",
}: {
  children: ReactNode;
  restaurantId?: string;
  restaurantName?: string;
  restaurantStatus?: RestaurantStatus;
  billingAlert?: PlatformBillingAlert | null;
  canAccessOwnerPanel?: boolean;
  canAccessSuperadmin?: boolean;
  canSwitchBranches?: boolean;
  enabledModules?: ModuleKey[];
  pendingOrderAlerts?: Order[];
  title: string;
  active?: string;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [billingModalOpen, setBillingModalOpen] = useState(Boolean(billingAlert?.showModal));
  const nav = restaurantId ? restaurantNav : superAdminNav;
  const statusLabel = restaurantStatus === "active" ? "Activo" : restaurantStatus === "suspended" ? "Suspendido" : restaurantStatus === "inactive" ? "Inactivo" : "";

  return (
    <div className="admin-panel min-h-dvh bg-[var(--color-surface)] text-[var(--color-heading)]">
      {restaurantId ? <GlobalOrderSoundAlert orders={pendingOrderAlerts} restaurantId={restaurantId} /> : null}

      {billingAlert && billingModalOpen ? (
        <div className="fixed inset-0 z-[90] grid place-items-end bg-[var(--color-overlay)] p-0 backdrop-blur-sm sm:place-items-center sm:p-4">
          <div className="w-full max-w-xl rounded-t-[1.5rem] bg-[var(--surface)] shadow-2xl sm:rounded-[1.5rem]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] p-4">
              <div>
                <p className={cn("text-xs font-black uppercase tracking-[0.16em]", billingAlert.tone === "danger" ? "text-[var(--color-danger-strong)]" : "text-[var(--primary)]")}>Facturacion</p>
                <h2 className="mt-1 text-2xl font-black text-[var(--color-heading)]">{billingAlert.title}</h2>
                <p className="mt-2 text-sm font-semibold text-[var(--color-secondary-text)]">{billingAlert.body}</p>
              </div>
              <button className="grid h-11 w-11 place-items-center rounded-full bg-[var(--color-neutral-100)]" onClick={() => setBillingModalOpen(false)} type="button">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:justify-end">
              <button className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border)] px-4 text-sm font-black" onClick={() => setBillingModalOpen(false)} type="button">
                Cerrar
              </button>
              <Link
                className={cn(
                  "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-black",
                  billingAlert.tone === "danger" ? "bg-[var(--color-danger-strong)] text-[var(--color-on-primary)]" : "bg-[var(--primary)] text-[var(--color-on-primary)]",
                )}
                href={billingAlert.actionHref}
                onClick={() => setBillingModalOpen(false)}
              >
                {billingAlert.actionLabel}
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <div className={cn("fixed inset-0 z-40 bg-[var(--color-overlay)] backdrop-blur-sm lg:hidden", sidebarOpen ? "block" : "hidden")} onClick={() => setSidebarOpen(false)} />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(86vw,17.5rem)] flex-col border-r border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xl transition-transform duration-200 sm:p-4 lg:translate-x-0 lg:shadow-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <Link className="flex min-w-0 flex-1 flex-col items-start gap-2 rounded-[var(--radius-card)] bg-[var(--primary)] p-3 text-[var(--color-on-primary)]" href={restaurantId ? `/admin/restaurantes/${restaurantId}/dashboard` : "/admin"}>
            <BrandLogo className="h-6 w-auto max-w-[160px]" variant="dark" />
            <span className="max-w-full truncate text-xs font-black text-white/82">{restaurantName || "Panel administrativo"}</span>
          </Link>
          <button className="grid h-11 w-11 place-items-center rounded-full bg-[var(--color-neutral-100)] text-[var(--color-body)] lg:hidden" onClick={() => setSidebarOpen(false)} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        {statusLabel ? (
          <div className="mt-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-black text-[var(--color-secondary-text)]">
            Estado: <span className={restaurantStatus === "active" ? "text-[var(--color-success-strong)]" : "text-[var(--color-warning-strong)]"}>{statusLabel}</span>
          </div>
        ) : null}

        <nav className="admin-scrollbar mt-5 flex-1 space-y-1 overflow-y-auto pr-1">
          {nav.map((item) => {
            const href = restaurantId ? `/admin/restaurantes/${restaurantId}/${item.href}` : item.href;
            const selected = active === item.href;

            return (
              <Link
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm font-bold text-[var(--color-secondary-text)] transition hover:bg-[var(--primary-light)] hover:text-[var(--primary-dark)]",
                  selected && "bg-[var(--primary-light)] text-[var(--primary-dark)]",
                )}
                href={href}
                key={item.href}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 grid gap-2">
          {canAccessOwnerPanel ? (
            <Link className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-bold text-[var(--color-secondary-text)] hover:bg-[var(--color-neutral-100)]" href="/dueno">
              <Store className="h-4 w-4" />
              Panel de dueno
            </Link>
          ) : null}
          {canSwitchBranches ? (
            <Link className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-bold text-[var(--color-secondary-text)] hover:bg-[var(--color-neutral-100)]" href="/admin">
              <Store className="h-4 w-4" />
              Sucursales
            </Link>
          ) : null}
          <Link className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-bold text-[var(--color-secondary-text)] hover:bg-[var(--color-neutral-100)]" href="/">
            <Home className="h-4 w-4" />
            Inicio
          </Link>
          <form action={signOutAction}>
            <button className="flex min-h-11 w-full items-center gap-3 rounded-2xl bg-[var(--color-danger-soft)] px-3 text-sm font-bold text-[var(--color-danger-strong)] hover:bg-[var(--color-danger-soft)]" type="submit">
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </form>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--color-card-elevated)] px-4 py-3 shadow-sm backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--color-body)] shadow-sm lg:hidden" onClick={() => setSidebarOpen(true)} type="button">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase text-[var(--primary)]">Panel administrativo</p>
              <h1 className="truncate text-xl font-black text-[var(--color-heading)] sm:text-2xl">{title}</h1>
            </div>
            <Link
              className="hidden min-h-10 shrink-0 items-center gap-2 rounded-full bg-[var(--color-neutral-900)] px-4 text-sm font-bold text-[var(--color-on-primary)] sm:inline-flex"
              href={canAccessSuperadmin ? "/admin/restaurantes" : canAccessOwnerPanel ? "/dueno" : canSwitchBranches ? "/admin" : restaurantId ? `/admin/restaurantes/${restaurantId}/dashboard` : "/admin"}
            >
              <BarChart3 className="h-4 w-4" />
              {canAccessSuperadmin ? "Restaurantes" : canAccessOwnerPanel ? "Panel dueno" : canSwitchBranches ? "Sucursales" : "Mi sucursal"}
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-3 py-4 pb-8 sm:px-6 sm:py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
