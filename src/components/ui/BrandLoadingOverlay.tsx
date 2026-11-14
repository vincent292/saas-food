import Image from "next/image";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function BrandLoadingCard({ title, description, className }: { title: string; description?: string; className?: string }) {
  return (
    <div className={cn("ui-loading-card w-full max-w-sm rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-[var(--text)] shadow-[var(--shadow-panel)]", className)}>
      <Image alt="yopido.shop" className="mx-auto h-8 w-auto object-contain" height={44} priority src="/brand/yopido-logo-monochrome-blue.png" width={190} />
      <LoaderCircle aria-hidden="true" className="mx-auto mt-6 h-6 w-6 animate-spin text-[var(--primary)]" />
      <p className="mt-4 text-lg font-semibold tracking-tight">{title}</p>
      <p className="mx-auto mt-2 max-w-[26ch] text-sm leading-6 text-[var(--muted)]">{description ?? "Estamos procesando tu solicitud. Espera a que termine para continuar."}</p>
    </div>
  );
}

export function BrandLoadingOverlay({ title, description, zIndexClassName = "z-[140]" }: { title: string; description?: string; zIndexClassName?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className={cn("fixed inset-0 grid cursor-wait place-items-center bg-[rgb(8_36_65_/_0.3)] px-4 backdrop-blur-[2px]", zIndexClassName)} role="status">
      <BrandLoadingCard title={title} description={description} />
    </div>
  );
}
