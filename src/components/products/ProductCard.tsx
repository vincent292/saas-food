"use client";

import { useState } from "react";
import { Clock3, ImageOff, Pencil, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/utils/money";
import { productImageFitStyle } from "@/lib/utils/product-image-fit";
import type { Category, Product } from "@/types/product.types";

export function ProductCard({ product, category, variantCount = 0, optionGroupCount = 0, onEdit }: {
  product: Product;
  category?: Category;
  variantCount?: number;
  optionGroupCount?: number;
  onEdit?: () => void;
}) {
  const [failedImage, setFailedImage] = useState("");
  const hasImage = Boolean(product.imageUrl && failedImage !== product.imageUrl);
  const kindLabel = product.productKind === "promotion" ? "Promo" : product.productKind === "lunch" ? "Almuerzo" : "";
  return (
    <article className="catalog-product-card">
      <div className="catalog-product-media">
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={product.name} className="h-full w-full object-cover" decoding="async" height={400} loading="lazy" onError={() => setFailedImage(product.imageUrl)} width={640} src={product.imageUrl} style={productImageFitStyle(product)} />
        ) : <div className="catalog-product-no-photo"><ImageOff aria-hidden="true" className="h-7 w-7" /><span>Sin foto</span></div>}
        <span className="catalog-product-status" data-available={product.isAvailable}>{product.isAvailable ? "Disponible" : "Inactivo"}</span>
        {product.isFeatured ? <span className="catalog-product-featured"><Sparkles aria-hidden="true" className="h-3.5 w-3.5" /><span className="sr-only">Destacado</span></span> : null}
        {kindLabel ? <span className="catalog-product-kind">{kindLabel}</span> : null}
      </div>
      <div className="catalog-product-body">
        <p className="catalog-product-category">{category?.name ?? "Sin categoría"}</p>
        <h4 className="catalog-product-name">{product.name}</h4>
        <p className="catalog-product-description">{product.description || "Todavía no tiene una descripción."}</p>
        <div className="catalog-product-details">
          <span><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />{product.prepMinutes} min</span>
          <span><SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />{variantCount} variantes</span>
          <span>{optionGroupCount} grupos</span>
        </div>
        <div className="catalog-product-inventory"><span>Orden {product.sortOrder}</span><span>{product.trackStock ? "Controla stock" : "Sin control de stock"}</span></div>
        <div className="catalog-product-footer">
          <div><p className="catalog-product-price">{formatMoney(product.price)}</p>{product.compareAtPrice ? <span className="text-xs text-[var(--muted)] line-through">{formatMoney(product.compareAtPrice)}</span> : null}</div>
          {onEdit ? <Button aria-label={`Editar ${product.name}`} onClick={onEdit} type="button" variant="secondary"><Pencil aria-hidden="true" className="h-4 w-4" />Editar</Button> : null}
        </div>
      </div>
    </article>
  );
}
