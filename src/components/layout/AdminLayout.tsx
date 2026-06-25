import Link from "next/link";
import { BarChart3, Boxes, ChefHat, ClipboardList, CreditCard, Home, LayoutDashboard, LogIn, LogOut, Settings, Store, Table2, Utensils } from "lucide-react";
import { signOutAction } from "@/app/admin/actions";
import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";

const nav = [
  { label: "Dashboard", href: "dashboard", icon: LayoutDashboard },
  { label: "Productos", href: "productos", icon: Utensils },
  { label: "Categorías", href: "categorias", icon: ClipboardList },
  { label: "Mesas", href: "mesas", icon: Table2 },
  { label: "Pedidos", href: "pedidos", icon: ChefHat },
  { label: "Caja", href: "caja", icon: CreditCard },
  { label: "Inventario", href: "inventario", icon: Boxes },
  { label: "Configuración", href: "configuracion", icon: Settings },
];

export function AdminLayout({
  children,
  restaurantId = "",
  title,
  active = "dashboard",
}: {
  children: ReactNode;
  restaurantId?: string;
  title: string;
  active?: string;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-slate-200 bg-white p-5 lg:block">
        <Link className="flex items-center gap-3 rounded-3xl bg-[#1d8844] p-4 text-white" href="/admin">
          <Store className="h-6 w-6" />
          <span className="font-bold">Restaurant SaaS</span>
        </Link>
        <nav className="mt-6 space-y-1">
          {nav.map((item) => (
            <Link
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-emerald-50 hover:text-emerald-800",
                active === item.href && "bg-emerald-50 text-emerald-800",
              )}
              href={restaurantId ? `/admin/restaurantes/${restaurantId}/${item.href}` : "/admin/restaurantes"}
              key={item.href}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Panel administrativo</p>
              <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Link className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 sm:inline-flex" href="/">
                <Home className="h-4 w-4" />
                Inicio
              </Link>
              <Link className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 sm:inline-flex" href="/admin/login">
                <LogIn className="h-4 w-4" />
                Login
              </Link>
              <Link className="hidden items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white sm:inline-flex" href="/admin/restaurantes">
                <BarChart3 className="h-4 w-4" />
                Restaurantes
              </Link>
              <form action={signOutAction}>
                <button className="hidden items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 sm:inline-flex" type="submit">
                  <LogOut className="h-4 w-4" />
                  Salir
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
