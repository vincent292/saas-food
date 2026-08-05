import type { RestaurantSettings } from "@/types/restaurant.types";

export function normalizeQrPaymentUrl(value?: string | null) {
  return value?.trim() ?? "";
}

export function hasQrPaymentConfigured(settings?: Pick<RestaurantSettings, "qrPaymentUrl"> | null) {
  return Boolean(normalizeQrPaymentUrl(settings?.qrPaymentUrl));
}
