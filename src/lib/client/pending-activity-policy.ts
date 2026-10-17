// This is the lifetime of a home shortcut, NOT a bank payment or order.
export const pendingActivityMaxAgeMs = 30 * 60_000;

export function activityIsVisible(createdAt: number, now = Date.now()) {
  const age = now - createdAt;
  return Number.isFinite(createdAt) && age >= 0 && age < pendingActivityMaxAgeMs;
}

export function activityMinutesRemaining(createdAt: number, now = Date.now()) {
  return Math.max(0, Math.ceil((createdAt + pendingActivityMaxAgeMs - now) / 60_000));
}

export function readableRestaurantName(slug: string) {
  return slug.split("-").filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
