export function ProductSkeleton() {
  return (
    <div aria-busy="true" className="catalog-product-grid" role="status">
      <span className="sr-only">Cargando productos…</span>
      {Array.from({ length: 6 }).map((_, index) => <div aria-hidden="true" className="catalog-product-card catalog-skeleton" key={index}>
        <div className="catalog-product-media animate-pulse bg-[var(--color-neutral-100)]" />
        <div className="space-y-4 p-4"><div className="h-3 w-20 rounded bg-[var(--color-neutral-100)]" /><div className="h-5 w-3/4 rounded bg-[var(--color-neutral-100)]" /><div className="h-10 rounded bg-[var(--color-neutral-100)]" /><div className="h-10 w-1/2 rounded bg-[var(--color-neutral-100)]" /></div>
      </div>)}
    </div>
  );
}
