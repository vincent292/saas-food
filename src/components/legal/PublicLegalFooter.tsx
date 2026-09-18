"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const internalPrefixes = ["/admin", "/dueno", "/cocina", "/caja", "/delivery", "/api", "/riders"];

function isInternalPath(pathname: string) {
  return internalPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function PublicLegalFooter() {
  const pathname = usePathname();

  if (isInternalPath(pathname)) return null;

  return (
    <footer className="border-t border-white/10 bg-[#12355B] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-7 text-white/75 sm:px-6 lg:pb-8">
      <div className="mx-auto grid max-w-7xl gap-6 text-center text-sm sm:grid-cols-[1fr_auto] sm:text-left">
        <address className="not-italic leading-6">
          <p className="font-black text-white">Yopido</p>
          <p>Proveedor de servicios tecnológicos</p>
          <p>Avenida América, Cochabamba, Cochabamba 2500, Bolivia</p>
          <p>NIT: 8039368352</p>
        </address>
        <nav aria-label="Información legal" className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-semibold sm:justify-end sm:self-end">
          <Link className="transition hover:text-white" href="/informacion-legal">
            Información legal
          </Link>
          <Link className="transition hover:text-white" href="/privacidad">
            Política de privacidad
          </Link>
          <Link className="transition hover:text-white" href="/terminos">
            Términos y condiciones
          </Link>
        </nav>
      </div>
      <p className="mx-auto mt-5 max-w-7xl text-center text-xs font-semibold text-white/55 sm:text-left">
        © {new Date().getFullYear()} Yopido.
      </p>
    </footer>
  );
}
