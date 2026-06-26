import type { ReactNode } from "react";
import { Header } from "./Header";
import { MobileBottomNav } from "./MobileBottomNav";
import { RestaurantThemeProvider } from "@/components/restaurant/RestaurantThemeProvider";
import type { Restaurant } from "@/types/restaurant.types";

export function RestaurantLayout({
  restaurant,
  children,
  showCart = true,
  showMobileNav = true,
}: {
  restaurant: Restaurant;
  children: ReactNode;
  showCart?: boolean;
  showMobileNav?: boolean;
}) {
  return (
    <RestaurantThemeProvider theme={restaurant.theme}>
      <Header restaurant={restaurant} cartCount={0} showCart={showCart} />
      {children}
      {showMobileNav ? <MobileBottomNav restaurantSlug={restaurant.slug} /> : null}
    </RestaurantThemeProvider>
  );
}
