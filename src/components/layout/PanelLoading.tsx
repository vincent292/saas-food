import { BrandLoadingCard } from "@/components/ui/BrandLoadingOverlay";

export function PanelLoading({ label = "Cargando panel" }: { label?: string }) {
  return (
    <main aria-busy="true" role="status" className="grid min-h-screen place-items-center bg-[var(--color-surface)] px-4">
      <BrandLoadingCard title={label} />
    </main>
  );
}
