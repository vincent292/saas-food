export type MultisiteKitchenSnapshot = {
  queueEnabled: boolean;
  basePrepMinutes: number;
  kitchenCapacity: number;
  activeOrders: number;
  preparingOrders: number;
  recentOrders: number;
  rushMultiplier?: number;
  historySampleSize?: number;
};

export type MultisiteKitchenForecast = {
  queueDelayMinutes: number;
  estimatedReadyInMinutes: number;
  demandLevel: "calm" | "normal" | "busy";
  confidence: "low" | "medium" | "high";
};

function positive(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Math.max(Number(value), 0) : fallback;
}

/**
 * Estimates a newly received ticket. It intentionally uses only live queue
 * counts and published kitchen settings so it can run before an order exists.
 */
export function forecastMultisiteKitchenReadyIn(
  snapshot: MultisiteKitchenSnapshot,
  itemPrepMinutes: number,
): MultisiteKitchenForecast {
  const basePrepMinutes = Math.max(positive(itemPrepMinutes, 15), positive(snapshot.basePrepMinutes, 15));
  const kitchenCapacity = Math.max(Math.round(positive(snapshot.kitchenCapacity, 1)), 1);
  const activeOrders = Math.round(positive(snapshot.activeOrders, 0));
  const preparingOrders = Math.min(Math.round(positive(snapshot.preparingOrders, 0)), activeOrders);
  const recentOrders = Math.round(positive(snapshot.recentOrders, 0));
  const waitingOrders = Math.max(activeOrders - preparingOrders, 0);
  const rushMultiplier = Math.max(positive(snapshot.rushMultiplier, 1.25), 1);
  const busy = activeOrders >= kitchenCapacity * 2 || recentOrders >= kitchenCapacity * 3;
  const loadMultiplier = busy ? rushMultiplier : 1 + Math.min(activeOrders / kitchenCapacity, 2) * 0.08;
  const queueDelayMinutes = snapshot.queueEnabled
    ? Math.round((waitingOrders * basePrepMinutes * loadMultiplier) / kitchenCapacity)
    : 0;
  const estimatedReadyInMinutes = Math.max(1, Math.round(basePrepMinutes * loadMultiplier + queueDelayMinutes));
  const historySampleSize = Math.round(positive(snapshot.historySampleSize, 0));

  return {
    queueDelayMinutes,
    estimatedReadyInMinutes,
    demandLevel: busy ? "busy" : activeOrders <= 1 && recentOrders <= 2 ? "calm" : "normal",
    confidence: historySampleSize >= 20 ? "high" : historySampleSize >= 6 ? "medium" : "low",
  };
}
