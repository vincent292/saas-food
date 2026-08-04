import Image from "next/image";
import { cn } from "@/lib/utils/cn";

export function BrandLoadingCard({ title, description, className }: { title: string; description?: string; className?: string }) {
  return (
    <div className={cn("w-full max-w-sm rounded-[1.1rem] border border-white/12 bg-[var(--primary)] p-6 text-center text-white shadow-[var(--shadow-panel)]", className)}>
      <Image alt="yopido.shop" className="mx-auto h-16 w-auto animate-pulse object-contain" height={84} priority src="/brand/yopido-logo-dark.png" width={240} />
      <p className="mt-5 text-lg font-black">{title}</p>
      <p className="mx-auto mt-2 max-w-[18rem] text-sm font-semibold leading-6 text-white/74">
        {description ?? "Estamos procesando. Puedes esperar aqui, el sistema evita envios duplicados."}
      </p>
    </div>
  );
}

export function BrandLoadingOverlay({ title, description, zIndexClassName = "z-[140]" }: { title: string; description?: string; zIndexClassName?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className={cn("fixed inset-0 grid cursor-wait place-items-center bg-[rgb(8_36_65_/_0.48)] px-4 backdrop-blur-sm", zIndexClassName)} role="status">
      <BrandLoadingCard title={title} description={description} />
    </div>
  );
}
