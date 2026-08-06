import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { defaultProductImage } from "@/lib/utils/default-images";
import { formatMoney } from "@/lib/utils/money";
import { productImageFitStyle } from "@/lib/utils/product-image-fit";
import type { Product } from "@/types/product.types";
import { AddToCartButton } from "./AddToCartButton";

export function ProductCard({ product, currency = "BOB" }: { product: Product; currency?: string }) {
  const imageUrl = product.imageUrl || defaultProductImage;

  return (
    <Card className="overflow-hidden p-0">
      <div className="aspect-[4/3] overflow-hidden bg-[var(--primary-light)]">
        <Image alt={product.name} className="h-full w-full object-cover" height={420} sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw" src={imageUrl} style={productImageFitStyle(product)} width={560} />
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[var(--text)]">{product.name}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{product.description}</p>
          </div>
          {product.isPromotion ? <Badge>Promo</Badge> : null}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-lg font-black text-[var(--text)]">
            {formatMoney(product.price, currency)}
            {product.compareAtPrice ? <span className="ml-2 text-xs font-bold text-[var(--muted)] line-through">{formatMoney(product.compareAtPrice, currency)}</span> : null}
          </p>
          <AddToCartButton product={{ productId: product.id, name: product.name, price: product.price, imageUrl }} />
        </div>
      </div>
    </Card>
  );
}
