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
  WalletCards,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { signOutAction } from "@/app/admin/actions";
import { cn } from "@/lib/utils/cn";
import type { ModuleKey, RestaurantStatus } from "@/types/restaurant.types";

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
  enabledModules,
  title,
  active = "dashboard",
}: {
  children: ReactNode;
  restaurantId?: string;
  restaurantName?: string;
  restaurantStatus?: RestaurantStatus;
  enabledModules?: ModuleKey[];
  title: string;
  active?: string;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const moduleSet = useMemo(() => new Set(enabledModules ?? []), [enabledModules]);
  const nav = restaurantId ? restaurantNav.filter((item) => !item.moduleKey || moduleSet.has(item.moduleKey)) : superAdminNav;
  const statusLabel = restaurantStatus === "active" ? "Activo" : restaurantStatus === "suspended" ? "Suspendido" : restaurantStatus === "inactive" ? "Inactivo" : "";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className={cn("fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm lg:hidden", sidebarOpen ? "block" : "hidden")} onClick={() => setSidebarOpen(false)} />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(86vw,18rem)] flex-col border-r border-slate-200 bg-white p-4 shadow-2xl transition-transform duration-200 lg:translate-x-0 lg:shadow-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <Link className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-[#1d8844] p-3 text-white" href={restaurantId ? `/admin/restaurantes/${restaurantId}/dashboard` : "/admin"}>
            <Store className="h-5 w-5 shrink-0" />
            <span className="truncate text-sm font-black">{restaurantName || "Restaurant SaaS"}</span>
          </Link>
          <button className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-700 lg:hidden" onClick={() => setSidebarOpen(false)} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        {statusLabel ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
            Estado: <span className={restaurantStatus === "active" ? "text-emerald-700" : "text-amber-700"}>{statusLabel}</span>
          </div>
        ) : null}

        <nav className="mt-5 flex-1 space-y-1 overflow-y-auto pr-1">
          {nav.map((item) => {
            const href = restaurantId ? `/admin/restaurantes/${restaurantId}/${item.href}` : item.href;
            const selected = active === item.href;

            return (
              <Link
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-bold text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-800",
                  selected && "bg-emerald-50 text-emerald-800",
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
          <Link className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-100" href="/">
            <Home className="h-4 w-4" />
            Inicio
          </Link>
          <form action={signOutAction}>
            <button className="flex min-h-11 w-full items-center gap-3 rounded-2xl bg-red-50 px-3 text-sm font-bold text-red-700 hover:bg-red-100" type="submit">
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </form>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden" onClick={() => setSidebarOpen(true)} type="button">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase text-emerald-700">Panel administrativo</p>
              <h1 className="truncate text-xl font-black text-slate-950 sm:text-2xl">{title}</h1>
            </div>
            <Link className="hidden min-h-10 items-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-bold text-white sm:inline-flex" href="/admin/restaurantes">
              <BarChart3 className="h-4 w-4" />
              Restaurantes
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
