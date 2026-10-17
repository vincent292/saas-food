import { pendingActivityMaxAgeMs } from "../client/pending-activity-policy";

export type CartProduct = {
  cartId?: string;
  productId: string;
  variantId?: string;
  optionIds?: string[];
  name: string;
  price: number;
  imageUrl?: string;
  quantity: number;
  notes?: string;
};

export type PendingCartSummary = {
  restaurantSlug: string;
  restaurantName: string;
  itemCount: number;
  total: number;
  updatedAt: string;
  expiresAt: string;
};

export type StoredRestaurantCart = {
  restaurantSlug: string;
  restaurantName: string;
  restaurantId?: string;
  items: CartProduct[];
  updatedAt: string;
  expiresAt: string;
};

type StoredCartMap = Record<string, StoredRestaurantCart>;

export const legacyCartStorageKey = "restaurant-saas-cart";
export const cartStorageKey = "restaurant-saas-cart-v2";
export const cartUpdatedEventName = "restaurant-saas-cart-updated";

function isExpired(cart: StoredRestaurantCart) {
  const updated = Date.parse(cart.updatedAt), expires = Date.parse(cart.expiresAt);
  return !Number.isFinite(updated) || !Number.isFinite(expires) || updated > Date.now()
    || Math.min(expires, updated + pendingActivityMaxAgeMs) <= Date.now();
}

function readCartMap(): StoredCartMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(cartStorageKey);
    const parsed = raw ? (JSON.parse(raw) as StoredCartMap) : {};
    const activeEntries = Object.entries(parsed).filter(([, cart]) => cart?.items?.length && !isExpired(cart)).map(([slug, cart]) => [slug, {
      ...cart, expiresAt: new Date(Math.min(Date.parse(cart.expiresAt), Date.parse(cart.updatedAt) + pendingActivityMaxAgeMs)).toISOString(),
    }] as const);
    const activeMap = Object.fromEntries(activeEntries) as StoredCartMap;

    if (activeEntries.length !== Object.entries(parsed).length || activeEntries.some(([slug, cart]) => parsed[slug].expiresAt !== cart.expiresAt)) {
      window.localStorage.setItem(cartStorageKey, JSON.stringify(activeMap));
    }

    return activeMap;
  } catch {
    return {};
  }
}

/**
 * Returns the complete, still-valid carts stored for the current browser.
 * Public checkout pages use this instead of trusting prices sent from the UI;
 * the server always recalculates them before an order is created.
 */
export function listActiveCarts(): StoredRestaurantCart[] {
  return Object.values(readCartMap())
    .filter((cart) => cart.items.length > 0)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function writeCartMap(carts: StoredCartMap) {
  window.localStorage.setItem(cartStorageKey, JSON.stringify(carts));
}

function dispatchCartUpdated() {
  window.dispatchEvent(new Event(cartUpdatedEventName));
}

export function readCart(restaurantSlug?: string): CartProduct[] {
  if (typeof window === "undefined") {
    return [];
  }

  if (restaurantSlug) {
    return readCartMap()[restaurantSlug]?.items ?? [];
  }

  try {
    const raw = window.localStorage.getItem(legacyCartStorageKey);
    return raw ? (JSON.parse(raw) as CartProduct[]) : [];
  } catch {
    return [];
  }
}

export function writeCart(
  items: CartProduct[],
  options?: {
    restaurantSlug?: string;
    restaurantName?: string;
    restaurantId?: string;
  },
) {
  if (options?.restaurantSlug) {
    const carts = readCartMap();
    if (items.length) {
      carts[options.restaurantSlug] = {
        restaurantSlug: options.restaurantSlug,
        restaurantName: options.restaurantName || options.restaurantSlug,
        restaurantId: options.restaurantId,
        items,
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + pendingActivityMaxAgeMs).toISOString(),
      };
    } else {
      delete carts[options.restaurantSlug];
    }
    writeCartMap(carts);
    dispatchCartUpdated();
    return;
  }

  window.localStorage.setItem(legacyCartStorageKey, JSON.stringify(items));
  dispatchCartUpdated();
}

export function clearCart(restaurantSlug?: string) {
  if (restaurantSlug) {
    const carts = readCartMap();
    delete carts[restaurantSlug];
    writeCartMap(carts);
    dispatchCartUpdated();
    return;
  }

  window.localStorage.removeItem(legacyCartStorageKey);
  dispatchCartUpdated();
}

export function listPendingCarts(): PendingCartSummary[] {
  if (typeof window === "undefined") {
    return [];
  }

  return listActiveCarts()
    .map((cart) => ({
      restaurantSlug: cart.restaurantSlug,
      restaurantName: cart.restaurantName,
      itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      total: cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      updatedAt: cart.updatedAt,
      expiresAt: new Date(Math.min(Date.parse(cart.expiresAt), Date.parse(cart.updatedAt) + pendingActivityMaxAgeMs)).toISOString(),
    }))
    .filter((cart) => cart.itemCount > 0)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
