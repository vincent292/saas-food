"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { readCart, writeCart } from "@/lib/utils/cart";

export function AddToCartButton({
  product,
  restaurantSlug,
  restaurantName,
}: {
  product: {
    productId: string;
    name: string;
    price: number;
    imageUrl?: string;
  };
  restaurantSlug?: string;
  restaurantName?: string;
}) {
  function addToCart() {
    const cart = readCart(restaurantSlug);
    const existing = cart.find((item) => item.productId === product.productId);

    if (existing) {
      writeCart(cart.map((item) => (item.productId === product.productId ? { ...item, quantity: item.quantity + 1 } : item)), { restaurantSlug, restaurantName });
      return;
    }

    writeCart([...cart, { ...product, quantity: 1 }], { restaurantSlug, restaurantName });
  }

  return (
    <Button className="h-10 px-3" onClick={addToCart} title="Agregar producto" type="button">
      <Plus className="h-4 w-4" />
      Agregar
    </Button>
  );
}
