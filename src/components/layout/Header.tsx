import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, Store } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PublicThemeToggle } from "@/components/public-theme/PublicThemeToggle";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
import type { Restaurant } from "@/types/restaurant.types";

export function Header({ restaurant, cartCount = 0, showCart = true }: { restaurant: Restaurant; cartCount?: number; showCart?: boolean }) {
  const hasLogoImage = restaurant.logoUrl.startsWith("http");

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--color-card-elevated)] shadow-[var(--shadow-card)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link className="flex items-center gap-3" href={publicRestaurantPath(restaurant.slug)}>
          <span className="relative grid h-11 w-11 overflow-hidden rounded-2xl bg-[var(--primary)] text-sm font-black text-[var(--color-on-primary)] ring-1 ring-[var(--border)]">
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
          <Link aria-label="Volver a yopido.shop" className="hidden rounded-xl border border-[var(--border)] bg-white px-2.5 py-2 shadow-sm transition hover:-translate-y-0.5 lg:inline-flex" href="/">
            <BrandLogo className="h-5 w-auto" variant="light" />
          </Link>
          <PublicThemeToggle compact />
          <Badge className="hidden bg-[var(--accent)] text-[var(--primary)] sm:inline-flex">Abierto hoy</Badge>
          {showCart ? (
            <Link className={buttonClasses("secondary", "relative h-11 w-11 px-0")} href={publicRestaurantPath(restaurant.slug, "checkout")} title="Carrito">
              <ShoppingCart className="h-5 w-5" />
              {cartCount ? (
                <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--primary)] text-[10px] text-[var(--color-on-primary)]">
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
