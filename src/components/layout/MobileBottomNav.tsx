import Link from "next/link";
import { Home, ReceiptText, Search, ShoppingCart } from "lucide-react";

export function MobileBottomNav({ restaurantSlug }: { restaurantSlug: string }) {
  const items = [
    { label: "Inicio", href: `/r/${restaurantSlug}`, icon: Home },
    { label: "Buscar", href: `/r/${restaurantSlug}#menu`, icon: Search },
    { label: "Pedido", href: `/r/${restaurantSlug}/pedido/ord_1001`, icon: ReceiptText },
    { label: "Carrito", href: `/r/${restaurantSlug}/checkout`, icon: ShoppingCart },
  ];

  return (
    <nav className="fixed inset-x-4 bottom-4 z-40 grid grid-cols-4 rounded-full border border-[var(--border)] bg-white p-2 shadow-lg md:hidden">
      {items.map((item) => (
        <Link className="flex flex-col items-center gap-1 rounded-full px-2 py-2 text-[11px] font-semibold text-[var(--muted)]" href={item.href} key={item.label}>
          <item.icon className="h-4 w-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
