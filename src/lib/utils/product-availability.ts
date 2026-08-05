import type { Product } from "@/types/product.types";

const dayLabels = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatTime(value?: string) {
  return value?.slice(0, 5) ?? "";
}

export function productAvailabilityLabels(product: Pick<Product, "availableFrom" | "availableUntil" | "availableDays" | "availableStartTime" | "availableEndTime">) {
  const labels: string[] = [];
  const from = product.availableFrom ? formatDateTime(product.availableFrom) : "";
  const until = product.availableUntil ? formatDateTime(product.availableUntil) : "";

  if (from) {
    labels.push(`Desde ${from}`);
  }

  if (until) {
    labels.push(`Hasta ${until}`);
  }

  if (product.availableDays?.length) {
    labels.push(product.availableDays.map((day) => dayLabels[day]).filter(Boolean).join(", "));
  }

  const startTime = formatTime(product.availableStartTime);
  const endTime = formatTime(product.availableEndTime);
  if (startTime || endTime) {
    labels.push(`${startTime || "00:00"}-${endTime || "23:59"}`);
  }

  return labels;
}
