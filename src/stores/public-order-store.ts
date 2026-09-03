"use client";

import { create } from "zustand";
import type { CartProduct } from "@/lib/utils/cart";
import { readCart, writeCart } from "@/lib/utils/cart";

export type PublicOrderType = "delivery" | "pickup";
export type FulfillmentMode = "now" | "scheduled";
export type PaymentMethod = "cash" | "qr";

export type PublicCartItem = CartProduct & {
  cartId: string;
  imageUrl: string;
};

type CartMetadata = {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
};

export type CheckoutPreferences = {
  fulfillmentMode: FulfillmentMode;
  orderType: PublicOrderType;
  paymentMethod: PaymentMethod;
  requiresInvoice: boolean;
};

type PublicOrderStore = {
  carts: Record<string, PublicCartItem[]>;
  checkoutPreferences: Record<string, CheckoutPreferences>;
  addCartItem: (metadata: CartMetadata, item: PublicCartItem) => void;
  changeCartItemQuantity: (metadata: CartMetadata, cartId: string, delta: number) => void;
  hydrateCart: (restaurantSlug: string) => void;
  initializeCheckout: (restaurantSlug: string, preferences: CheckoutPreferences) => void;
  setCheckoutPreferences: (restaurantSlug: string, preferences: Partial<CheckoutPreferences>) => void;
};

function persistCart(metadata: CartMetadata, items: PublicCartItem[]) {
  writeCart(items, metadata);
}

export const usePublicOrderStore = create<PublicOrderStore>((set, get) => ({
  carts: {},
  checkoutPreferences: {},

  hydrateCart: (restaurantSlug) => {
    set((state) => ({
      carts: { ...state.carts, [restaurantSlug]: readCart(restaurantSlug) as PublicCartItem[] },
    }));
  },

  addCartItem: (metadata, item) => {
    const current = get().carts[metadata.restaurantSlug] ?? [];
    const existing = current.find((cartItem) => cartItem.cartId === item.cartId);
    const next = existing
      ? current.map((cartItem) => (cartItem.cartId === item.cartId ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem))
      : [...current, item];

    persistCart(metadata, next);
    set((state) => ({ carts: { ...state.carts, [metadata.restaurantSlug]: next } }));
  },

  changeCartItemQuantity: (metadata, cartId, delta) => {
    const next = (get().carts[metadata.restaurantSlug] ?? [])
      .map((item) => (item.cartId === cartId ? { ...item, quantity: item.quantity + delta } : item))
      .filter((item) => item.quantity > 0);

    persistCart(metadata, next);
    set((state) => ({ carts: { ...state.carts, [metadata.restaurantSlug]: next } }));
  },

  initializeCheckout: (restaurantSlug, preferences) => {
    if (get().checkoutPreferences[restaurantSlug]) return;
    set((state) => ({
      checkoutPreferences: { ...state.checkoutPreferences, [restaurantSlug]: preferences },
    }));
  },

  setCheckoutPreferences: (restaurantSlug, preferences) => {
    set((state) => ({
      checkoutPreferences: {
        ...state.checkoutPreferences,
        [restaurantSlug]: { ...state.checkoutPreferences[restaurantSlug], ...preferences } as CheckoutPreferences,
      },
    }));
  },
}));
