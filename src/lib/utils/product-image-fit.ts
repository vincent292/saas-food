import type { CSSProperties } from "react";

export type ProductImageFit = {
  imagePositionX?: number;
  imagePositionY?: number;
  imageZoom?: number;
};

export const defaultProductImageFit = {
  imagePositionX: 50,
  imagePositionY: 50,
  imageZoom: 1,
} satisfies Required<ProductImageFit>;

export function clampProductImagePosition(value: unknown, fallback = 50) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, numberValue));
}

export function clampProductImageZoom(value: unknown, fallback = 1) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(2, Math.max(1, numberValue));
}

export function productImageFitStyle(fit?: ProductImageFit): CSSProperties {
  const imagePositionX = clampProductImagePosition(fit?.imagePositionX, defaultProductImageFit.imagePositionX);
  const imagePositionY = clampProductImagePosition(fit?.imagePositionY, defaultProductImageFit.imagePositionY);
  const imageZoom = clampProductImageZoom(fit?.imageZoom, defaultProductImageFit.imageZoom);

  return {
    objectPosition: `${imagePositionX}% ${imagePositionY}%`,
    transform: imageZoom > 1 ? `scale(${imageZoom})` : undefined,
    transformOrigin: `${imagePositionX}% ${imagePositionY}%`,
  };
}
