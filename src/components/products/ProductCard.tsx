import { Pencil, Package, SlidersHorizontal, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatMoney } from "@/lib/utils/money";
import type { Category, Product } from "@/types/product.types";

export function ProductCard({
  product,
  category,
  variantCount = 0,
  optionGroupCount = 0,
  onEdit,
}: {
  product: Product;
  category?: Category;
  variantCount?: number;
  optionGroupCount?: number;
  onEdit?: () => void;
}) {
  return (
    <Card className="group overflow-hidden p-0 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[16/10] overflow-hidden bg-[var(--primary-light)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={product.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" src={product.imageUrl || "/imagendefault.jpeg"} />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <Badge className={product.isAvailable ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}>
            {product.isAvailable ? "Disponible" : "Inactivo"}
          </Badge>
          {product.isFeatured ? (
            <Badge className="bg-amber-50 text-amber-700">
              <Sparkles className="mr-1 h-3 w-3" />
              Destacado
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-black text-[var(--text)]">{product.name}</p>
            <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[var(--muted)]">
              <Package className="h-4 w-4" />
              {category?.name ?? "Sin categoria"}
            </p>
          </div>
          <p className="shrink-0 rounded-full bg-[var(--primary-light)] px-3 py-1 text-sm font-black text-[var(--primary)]">{formatMoney(product.price)}</p>
        </div>

        <p className="min-h-9 overflow-hidden text-sm leading-5 text-[var(--muted)] [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
          {product.description || "Sin descripcion cargada."}
        </p>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3 text-xs font-bold text-[var(--muted)]">
          <span className="rounded-full bg-slate-50 px-3 py-1">Orden {product.sortOrder}</span>
          <span className="rounded-full bg-slate-50 px-3 py-1">{product.trackStock ? "Controla stock" : "Sin control stock"}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-3 py-1">
            <SlidersHorizontal className="h-3 w-3" />
            {variantCount} variantes
          </span>
          <span className="rounded-full bg-slate-50 px-3 py-1">{optionGroupCount} grupos</span>
        </div>
        {onEdit ? (
          <Button className="min-h-9 w-full" onClick={onEdit} type="button" variant="secondary">
            <Pencil className="h-4 w-4" />
            Editar producto
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
