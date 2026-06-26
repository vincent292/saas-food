import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, Store } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import type { Restaurant } from "@/types/restaurant.types";

export function Header({ restaurant, cartCount = 0, showCart = true }: { restaurant: Restaurant; cartCount?: number; showCart?: boolean }) {
  const hasLogoImage = restaurant.logoUrl.startsWith("http");

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link className="flex items-center gap-3" href={`/r/${restaurant.slug}`}>
          <span className="relative grid h-11 w-11 overflow-hidden rounded-2xl bg-[var(--primary)] text-sm font-black text-white">
            {hasLogoImage ? <Image alt={restaurant.name} className="object-cover" fill sizes="44px" src={restaurant.logoUrl} /> : <span className="grid place-items-center">{restaurant.logoUrl}</span>}
          </span>
          <span>
            <span className="block text-sm font-bold text-[var(--text)]">{restaurant.name}</span>
            <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
              <Store className="h-3 w-3" />
              {restaurant.city}
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Badge className="hidden sm:inline-flex">Abierto hoy</Badge>
          {showCart ? (
            <Link className={buttonClasses("secondary", "relative h-11 w-11 px-0")} href={`/r/${restaurant.slug}/checkout`} title="Carrito">
              <ShoppingCart className="h-5 w-5" />
              {cartCount ? (
                <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--primary)] text-[10px] text-white">
                  {cartCount}
                </span>
              ) : null}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
