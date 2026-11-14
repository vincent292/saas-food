import { ProductSkeleton } from "@/components/products/ProductSkeleton";

export default function ProductsLoading() {
  return (
    <div className="product-workspace space-y-6">
      <section className="catalog-header"><h2 className="catalog-title">Tu catálogo</h2><p className="catalog-description">Preparando tus productos y categorías…</p></section>
      <div aria-hidden="true" className="catalog-metrics">{Array.from({ length: 5 }).map((_, i) => <div className="catalog-metric" key={i}><div className="h-3 w-16 rounded bg-[var(--color-neutral-200)]" /><div className="mt-3 h-6 w-10 rounded bg-[var(--color-neutral-200)]" /></div>)}</div>
      <div className="catalog-layout"><div aria-hidden="true" className="catalog-categories hidden space-y-5 xl:block">{Array.from({ length: 5 }).map((_, i) => <div className="h-10 rounded-lg bg-[var(--color-neutral-100)]" key={i} />)}</div><div className="catalog-main"><div aria-hidden="true" className="mb-5 h-12 rounded-xl bg-[var(--color-neutral-100)]" /><ProductSkeleton /></div></div>
    </div>
  );
}
