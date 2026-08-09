import { categoryService } from "@/lib/services/category.service";
import { productService } from "@/lib/services/product.service";
import { publicDirectoryService, type PublicRestaurantCard } from "@/lib/services/public-directory.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { settingsService } from "@/lib/services/settings.service";
import type { Restaurant } from "@/types/restaurant.types";

function mobileRestaurant(restaurant: Restaurant, metrics: Pick<PublicRestaurantCard, "orders30d" | "popularProducts" | "visits7d"> = { orders30d: 0, popularProducts: [], visits7d: 0 }) {
  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    description: restaurant.description || "Pide tus favoritos en minutos.",
    city: restaurant.city,
    address: restaurant.address,
    businessType: restaurant.businessType,
    logoUrl: restaurant.logoUrl,
    bannerUrl: restaurant.bannerUrl,
    latitude: restaurant.latitude,
    longitude: restaurant.longitude,
    visits7d: metrics.visits7d,
    orders30d: metrics.orders30d,
    popularProducts: metrics.popularProducts,
  };
}

function mobileProduct(product: Awaited<ReturnType<typeof productService.listPublicAvailableByRestaurant>>[number], configuration: Awaited<ReturnType<typeof productService.listPublicConfigurationsByRestaurant>>) {
  return {
    id: product.id,
    categoryId: product.categoryId,
    name: product.name,
    description: product.description,
    price: product.price,
    imageUrl: product.imageUrl,
    isFeatured: product.isFeatured || Boolean(product.isAutoFeatured),
    orderCount: product.orderCount,
    variants: configuration.variants
      .filter((variant) => variant.productId === product.id)
      .map((variant) => ({
        id: variant.id,
        name: variant.name,
        description: variant.description,
        priceDelta: variant.priceDelta,
      })),
    optionGroups: configuration.optionGroups
      .filter((group) => group.productId === product.id)
      .map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        minChoices: group.minChoices,
        maxChoices: group.maxChoices,
        isRequired: group.isRequired,
        options: group.options.map((option) => ({
          id: option.id,
          name: option.name,
          description: option.description,
          priceDelta: option.priceDelta,
        })),
      })),
  };
}

export const mobileDirectoryService = {
  async getDirectory() {
    const directory = await publicDirectoryService.getDirectory();
    const restaurants = directory.restaurants.map((card) => mobileRestaurant(card.restaurant, card));
    const restaurantIds = new Set(restaurants.map((restaurant) => restaurant.id));
    const products = directory.dishSuggestions
      .filter((product) => restaurantIds.has(product.restaurantId))
      .map((product) => ({
        id: product.id,
        restaurantId: product.restaurantId,
        restaurantName: product.restaurantName,
        restaurantSlug: product.restaurantSlug,
        name: product.name,
        description: product.description,
        price: product.price,
        imageUrl: product.imageUrl,
        orderCount: product.orderCount,
      }));

    return {
      activeCity: "",
      restaurants,
      mostVisited: directory.mostVisited.map((card) => mobileRestaurant(card.restaurant, card)),
      mostOrderedRestaurants: directory.mostOrderedRestaurants.map((card) => mobileRestaurant(card.restaurant, card)),
      mostOrderedProducts: products.filter((product) => product.orderCount > 0).slice(0, 12),
      productSuggestions: products,
    };
  },

  async getRestaurant(restaurantSlug: string) {
    const restaurant = await restaurantService.getPublicBySlug(restaurantSlug);
    if (!restaurant) return null;

    const [businessHours, categories, products, configuration] = await Promise.all([
      settingsService.listPublicBusinessHours(restaurant.id),
      categoryService.listPublicByRestaurant(restaurant.id),
      productService.listPublicAvailableByRestaurant(restaurant.id),
      productService.listPublicConfigurationsByRestaurant(restaurant.id),
    ]);

    return {
      restaurant: mobileRestaurant(restaurant),
      businessHours,
      catalog: {
        categories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          description: category.description,
        })),
        products: products.map((product) => mobileProduct(product, configuration)),
      },
    };
  },
};
