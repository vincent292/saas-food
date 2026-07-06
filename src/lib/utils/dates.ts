export function formatShortTime(date: string | Date) {
  return new Intl.DateTimeFormat("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatShortDate(date: string | Date) {
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export const businessTimeZone = "America/La_Paz";

export function businessDayKey(date: string | Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: businessTimeZone,
    year: "numeric",
  }).formatToParts(new Date(date));

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

export function isSameBusinessDay(date: string | Date, compare: string | Date = new Date()) {
  return businessDayKey(date) === businessDayKey(compare);
}
