"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, ReceiptText, Search, UserRound } from "lucide-react";
import { PublicCustomerAccountButton } from "@/components/customer/PublicCustomerAccountButton";
import { cn } from "@/lib/utils/cn";

const publicSearchOpenEvent = "yopido:open-public-search";
const hiddenPrefixes = ["/admin", "/dueno", "/cocina", "/caja", "/delivery", "/api", "/r"];
const hiddenPublicRoutePatterns = [/^\/[^/]+\/grupo(?:\/|$)/];

function shouldHide(pathname: string) {
  return hiddenPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) || hiddenPublicRoutePatterns.some((pattern) => pattern.test(pathname));
}

const itemClassName =
  "flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1rem] px-2 text-[11px] font-black text-[var(--color-secondary-text)] transition active:scale-95";

export function PublicBottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  if (shouldHide(pathname)) {
    return null;
  }

  function openSearch() {
    if (pathname === "/") {
      window.dispatchEvent(new Event(publicSearchOpenEvent));
      return;
    }

    router.push("/?buscar=1");
  }

  return (
    <>
      <div className="public-bottom-navigation-spacer h-[calc(4.75rem+env(safe-area-inset-bottom))] shrink-0 sm:hidden" aria-hidden="true" />
      <nav
        className="public-bottom-navigation public-brand-theme fixed inset-x-0 bottom-0 z-[70] border-t border-[var(--border)] bg-[var(--surface)] px-2 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_44px_rgb(8_36_65_/_0.16)] sm:hidden"
        aria-label="Navegacion publica"
      >
        <div className="mx-auto flex max-w-md items-center gap-1">
          <Link className={cn(itemClassName, pathname === "/" && "bg-[var(--primary-light)] text-[var(--primary)]")} href="/">
            <Home className="h-5 w-5" />
            Inicio
          </Link>
          <button className={itemClassName} onClick={openSearch} type="button">
            <Search className="h-5 w-5" />
            Buscar
          </button>
          <PublicCustomerAccountButton
            buttonClassName={itemClassName}
            buttonContent={
              <>
                <ReceiptText className="h-5 w-5" />
                Pedidos
              </>
            }
            initialPanel="orders"
            tone="surface"
          />
          <PublicCustomerAccountButton
            buttonClassName={itemClassName}
            buttonContent={
              <>
                <UserRound className="h-5 w-5" />
                Perfil
              </>
            }
            initialPanel="profile"
            tone="surface"
          />
        </div>
      </nav>
    </>
  );
}
