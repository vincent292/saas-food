"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { readCart, writeCart } from "@/lib/utils/cart";

export function AddToCartButton({
  product,
}: {
  product: {
    productId: string;
    name: string;
    price: number;
    imageUrl?: string;
  };
}) {
  function addToCart() {
    const cart = readCart();
    const existing = cart.find((item) => item.productId === product.productId);

    if (existing) {
      writeCart(cart.map((item) => (item.productId === product.productId ? { ...item, quantity: item.quantity + 1 } : item)));
      return;
    }

    writeCart([...cart, { ...product, quantity: 1 }]);
  }

  return (
    <Button className="h-10 px-3" onClick={addToCart} title="Agregar producto" type="button">
      <Plus className="h-4 w-4" />
      Agregar
    </Button>
  );
}
