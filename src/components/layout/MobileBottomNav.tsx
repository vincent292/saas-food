import Link from "next/link";
import { Home, Search, ShoppingCart } from "lucide-react";
import { publicRestaurantOrderPath, publicRestaurantPath } from "@/lib/utils/public-routes";

export function MobileBottomNav({ restaurantSlug }: { restaurantSlug: string }) {
  const items = [
    { label: "Inicio", href: publicRestaurantPath(restaurantSlug), icon: Home },
    { label: "Buscar", href: `${publicRestaurantPath(restaurantSlug)}#menu`, icon: Search },
    { label: "Carrito", href: publicRestaurantOrderPath(restaurantSlug), icon: ShoppingCart },
  ];

  return (
    <nav className="fixed inset-x-4 bottom-4 z-40 grid grid-cols-3 rounded-full border border-[var(--border)] bg-[var(--color-card-elevated)] p-2 shadow-[var(--shadow-panel)] backdrop-blur-xl md:hidden">
      {items.map((item) => (
        <Link className="flex flex-col items-center gap-1 rounded-full px-2 py-2 text-[11px] font-black text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--primary)]" href={item.href} key={item.label}>
          <item.icon className="h-4 w-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
