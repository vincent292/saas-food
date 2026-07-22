import Image from "next/image";

export function PanelLoading({ label = "Cargando panel" }: { label?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-surface)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-[var(--shadow-card)]">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-[var(--primary-light)]">
          <Image alt="yopido.shop" className="h-14 w-14 animate-pulse object-contain" height={80} priority src="/brand/yopido-icon-dark-1024.png" width={80} />
        </span>
        <p className="mt-4 text-lg font-black text-[var(--color-heading)]">{label}</p>
        <div className="mx-auto mt-4 h-2 w-44 overflow-hidden rounded-full bg-[var(--color-neutral-100)]">
          <span className="block h-full w-1/2 animate-pulse rounded-full bg-[var(--accent)]" />
        </div>
      </div>
    </main>
  );
}
