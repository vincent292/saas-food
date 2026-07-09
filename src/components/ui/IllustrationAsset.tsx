import Image from "next/image";
import { cn } from "@/lib/utils/cn";

const illustrationAssets = {
  deliveryScooter: {
    src: "/illustrations/delivery-scooter-3d.png",
    alt: "Ilustración 3D de moto de delivery",
  },
  deliveryRider: {
    src: "/illustrations/delivery-rider-3d.png",
    alt: "Ilustración 3D de repartidor con mochila de delivery",
  },
  orderSuccess: {
    src: "/illustrations/order-success-3d.png",
    alt: "Ilustración 3D de pedido confirmado",
  },
  emptyCart: {
    src: "/illustrations/empty-cart-3d.png",
    alt: "Ilustración 3D de carrito vacío",
  },
  promoCoupon: {
    src: "/illustrations/promo-coupon-3d.png",
    alt: "Ilustración 3D de cupón de promoción",
  },
  orderStatus: {
    src: "/illustrations/order-status-3d.png",
    alt: "Ilustración 3D de seguimiento de pedido por estados",
  },
} as const;

export type IllustrationName = keyof typeof illustrationAssets;

export function IllustrationAsset({
  name,
  alt,
  className,
  priority = false,
  sizes = "(min-width: 1024px) 320px, 70vw",
}: {
  name: IllustrationName;
  alt?: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const asset = illustrationAssets[name];

  return (
    <Image
      alt={alt ?? asset.alt}
      className={cn("h-auto w-full select-none object-contain", className)}
      draggable={false}
      height={1254}
      priority={priority}
      sizes={sizes}
      src={asset.src}
      width={1254}
    />
  );
}
