export type CartProduct = {
  productId: string;
  name: string;
  price: number;
  imageUrl?: string;
  quantity: number;
  notes?: string;
};

export const cartStorageKey = "restaurant-saas-cart";

export function readCart(): CartProduct[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(cartStorageKey);
    return raw ? (JSON.parse(raw) as CartProduct[]) : [];
  } catch {
    return [];
  }
}

export function writeCart(items: CartProduct[]) {
  window.localStorage.setItem(cartStorageKey, JSON.stringify(items));
  window.dispatchEvent(new Event("restaurant-saas-cart-updated"));
}

export function clearCart() {
  window.localStorage.removeItem(cartStorageKey);
  window.dispatchEvent(new Event("restaurant-saas-cart-updated"));
}
