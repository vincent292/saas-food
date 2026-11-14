import { ImageOff, Layers3, PackageCheck, Sparkles, ToggleLeft, ToggleRight } from "lucide-react";
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
    { label: "Categorías", value: categories.length, detail: `${productsWithoutImage} sin imagen`, icon: productsWithoutImage ? ImageOff : Layers3 },
  ];

  return (
    <dl className="catalog-metrics" aria-label="Resumen del catálogo">
      {metrics.map(metric => <div className="catalog-metric" key={metric.label}>
        <dt><metric.icon aria-hidden="true" className="h-4 w-4" />{metric.label}</dt>
        <dd>{metric.value}{metric.detail ? <span>{metric.detail}</span> : null}</dd>
      </div>)}
    </dl>
  );
}
