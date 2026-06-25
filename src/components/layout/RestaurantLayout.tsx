import type { ReactNode } from "react";
import { Header } from "./Header";
import { MobileBottomNav } from "./MobileBottomNav";
import { RestaurantThemeProvider } from "@/components/restaurant/RestaurantThemeProvider";
import type { Restaurant } from "@/types/restaurant.types";

export function RestaurantLayout({ restaurant, children }: { restaurant: Restaurant; children: ReactNode }) {
  return (
    <RestaurantThemeProvider theme={restaurant.theme}>
      <Header restaurant={restaurant} cartCount={2} />
      {children}
      <MobileBottomNav restaurantSlug={restaurant.slug} />
    </RestaurantThemeProvider>
  );
}
