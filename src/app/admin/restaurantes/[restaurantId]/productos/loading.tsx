import { ProductSkeleton } from "@/components/products/ProductSkeleton";
import { Card } from "@/components/ui/Card";

export default function ProductsLoading() {
  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <div className="h-4 w-44 animate-pulse rounded-full bg-slate-100" />
        <div className="h-9 w-64 animate-pulse rounded-full bg-slate-100" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded-full bg-slate-100" />
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card className="space-y-3" key={index}>
            <div className="h-4 w-24 animate-pulse rounded-full bg-slate-100" />
            <div className="h-8 w-16 animate-pulse rounded-full bg-slate-100" />
          </Card>
        ))}
      </div>
      <ProductSkeleton />
    </div>
  );
}
