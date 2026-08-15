"use client";

import Link from "next/link";
import {
  BarChart3,
  Bike,
  Boxes,
  Building2,
  ClipboardX,
  ClipboardList,
  Home,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Settings,
  Store,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { signOutAction } from "@/app/admin/actions";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PanelNotificationBell } from "@/components/notifications/PanelNotificationBell";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import type { PanelNotification } from "@/types/notification.types";

type OwnerNavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
};

const ownerNav: OwnerNavItem[] = [
  { label: "Resumen", href: "/dueno", icon: LayoutDashboard },
  { label: "Sucursales", href: "/dueno/sucursales", icon: Store },
  { label: "Ventas y pedidos", href: "/dueno/reportes", icon: BarChart3 },
  { label: "Anulaciones", href: "/dueno/anulaciones", icon: ClipboardX },
  { label: "Inventario general", href: "/dueno/inventario", icon: Boxes },
  { label: "Responsables", href: "/dueno/responsables", icon: Users },
  { label: "Riders", href: "/dueno/riders", icon: Bike },
  { label: "Tarifa", href: "/dueno/plan", icon: WalletCards },
  { label: "Soporte", href: "/dueno/soporte", icon: LifeBuoy },
  { label: "Cuenta", href: "/dueno/cuenta", icon: Settings },
];

const profileCompletionAllowedRoutes = new Set(["/dueno/cuenta", "/dueno/plan", "/dueno/soporte"]);

export function OwnerShellClient({
  active,
  branchCount,
  children,
  ownerEmail,
  ownerName,
  panelNotifications = [],
  ownerProfileComplete,
  firstRestaurantId,
  title,
}: {
  active: string;
  branchCount: number;
  children: ReactNode;
  ownerEmail: string;
  ownerName: string;
  panelNotifications?: PanelNotification[];
  ownerProfileComplete: boolean;
  firstRestaurantId?: string;
  title: string;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-heading)]">
      <div className={cn("fixed inset-0 z-40 bg-[var(--color-overlay)] backdrop-blur-sm lg:hidden", sidebarOpen ? "block" : "hidden")} onClick={() => setSidebarOpen(false)} />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(86vw,18rem)] flex-col border-r border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl transition-transform duration-200 lg:translate-x-0 lg:shadow-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <Link className="flex min-w-0 flex-1 flex-col items-start gap-2 rounded-2xl bg-[var(--primary)] p-3 text-[var(--color-on-primary)]" href="/dueno" prefetch={false}>
            <BrandLogo className="h-6 w-auto max-w-[160px]" variant="dark" />
            <span className="max-w-full truncate text-xs font-black text-white/82">{ownerName || ownerEmail}</span>
          </Link>
          <button className="grid h-11 w-11 place-items-center rounded-full bg-[var(--color-neutral-100)] text-[var(--color-body)] lg:hidden" onClick={() => setSidebarOpen(false)} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] px-3 py-2">
          <p className="text-xs font-black text-[var(--color-secondary-text)]">Cuenta dueno</p>
          <p className="mt-1 truncate text-xs font-bold text-[var(--primary)]">{ownerEmail}</p>
          {!ownerProfileComplete ? (
            <p className="mt-2 rounded-full bg-[var(--color-warning-soft)] px-2 py-1 text-[10px] font-black uppercase text-[var(--color-warning-strong)]">
              Datos pendientes
            </p>
          ) : null}
        </div>

        <nav className="mt-5 flex-1 space-y-1 overflow-y-auto pr-1">
          {ownerNav.map((item) => {
            const selected = active === item.href;
            const locked = !ownerProfileComplete && !profileCompletionAllowedRoutes.has(item.href);

            return (
              <Link
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-bold text-[var(--color-secondary-text)] transition hover:bg-[var(--primary-light)] hover:text-[var(--primary-dark)]",
                  selected && "bg-[var(--primary-light)] text-[var(--primary-dark)]",
                  locked && "opacity-55",
                )}
                href={locked ? "/dueno/cuenta?required=1" : item.href}
                key={item.href}
                onClick={() => setSidebarOpen(false)}
                prefetch={false}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 grid gap-2">
          {firstRestaurantId && ownerProfileComplete ? (
            <Link className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-bold text-[var(--color-secondary-text)] hover:bg-[var(--color-neutral-100)]" href={`/admin/restaurantes/${firstRestaurantId}/dashboard`} prefetch={false}>
              <Building2 className="h-4 w-4" />
              Entrar a sucursal
            </Link>
          ) : null}
          <Link className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-bold text-[var(--color-secondary-text)] hover:bg-[var(--color-neutral-100)]" href="/" prefetch={false}>
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
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--color-card-elevated)] px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--color-body)] shadow-sm lg:hidden" onClick={() => setSidebarOpen(true)} type="button">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase text-[var(--primary)]">Panel de dueno</p>
              <h1 className="truncate text-xl font-black text-[var(--color-heading)] sm:text-2xl">{title}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <PanelNotificationBell notifications={panelNotifications} scope="owner" />
              {!ownerProfileComplete ? (
                <Badge className="bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]">
                  Cuenta pendiente
                </Badge>
              ) : null}
              <Badge className="hidden bg-[var(--primary-light)] text-[var(--primary)] sm:inline-flex">
                {branchCount} sucursal{branchCount === 1 ? "" : "es"}
              </Badge>
              {firstRestaurantId && ownerProfileComplete ? (
                <Link className="hidden min-h-10 items-center gap-2 rounded-full bg-[var(--color-neutral-900)] px-4 text-sm font-bold text-[var(--color-on-primary)] sm:inline-flex" href={`/admin/restaurantes/${firstRestaurantId}/dashboard`} prefetch={false}>
                  <ClipboardList className="h-4 w-4" />
                  Operar
                </Link>
              ) : null}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
