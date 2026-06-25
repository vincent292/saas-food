import { ImageOff, Layers3, PackageCheck, Sparkles, ToggleLeft, ToggleRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Category, Product } from "@/types/product.types";

export function ProductStats({ products, categories }: { products: Product[]; categories: Category[] }) {
  const activeProducts = products.filter((product) => product.isAvailable).length;
  const featuredProducts = products.filter((product) => product.isFeatured).length;
  const productsWithoutImage = products.filter((product) => !product.imageUrl).length;
  const metrics = [
    { label: "Productos", value: products.length, icon: PackageCheck },
    { label: "Activos", value: activeProducts, icon: ToggleRight },
    { label: "Inactivos", value: products.length - activeProducts, icon: ToggleLeft },
    { label: "Destacados", value: featuredProducts, icon: Sparkles },
    { label: "Categorias", value: categories.length, detail: `${productsWithoutImage} sin imagen`, icon: productsWithoutImage ? ImageOff : Layers3 },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {metrics.map((metric, index) => (
        <div
          className={cn(
            "flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 shadow-sm",
            index === 0 && "border-[var(--primary)]/25 bg-[var(--primary-light)]/45",
          )}
          key={metric.label}
        >
          <div className="min-w-0">
            <p className="truncate text-xs font-black uppercase tracking-wide text-[var(--muted)]">{metric.label}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="text-2xl font-black leading-none text-[var(--text)]">{metric.value}</p>
              {metric.detail ? <p className="truncate text-xs font-semibold text-[var(--muted)]">{metric.detail}</p> : null}
            </div>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
            <metric.icon className="h-4 w-4" />
          </span>
        </div>
      ))}
    </div>
  );
}
