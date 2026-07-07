import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { restaurantCategoryLabel, restaurantCategoryOptions } from "@/lib/restaurant-directory-options";
import { restaurantService } from "@/lib/services/restaurant.service";
import type { Restaurant } from "@/types/restaurant.types";

type CategoryRow = {
  id: string;
  restaurant_id: string;
  name: string;
  is_active: boolean;
};

type ProductRow = {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  order_count: number | null;
};

type OrderRow = {
  restaurant_id: string;
  created_at: string;
};

type VisitRow = {
  restaurant_id: string;
  visited_at: string;
};

export type PublicRestaurantCard = {
  restaurant: Restaurant;
  primaryCategory: string;
  primaryCategoryLabel: string;
  categories: string[];
  orders30d: number;
  visits7d: number;
  popularProducts: string[];
};

export type PublicDishCard = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  orderCount: number;
};

export type PublicDirectory = {
  restaurants: PublicRestaurantCard[];
  categories: string[];
  locations: string[];
  categoryCards: {
    value: string;
    label: string;
    imageUrl: string;
    count: number;
  }[];
  mostVisited: PublicRestaurantCard[];
  mostOrderedRestaurants: PublicRestaurantCard[];
  mostOrderedDishes: PublicDishCard[];
};

function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function activePublicRestaurants(restaurants: Restaurant[]) {
  return restaurants.filter((restaurant) => restaurant.status === "active" && restaurant.activeModules?.includes("public_menu"));
}

function imageUrl(value?: string | null) {
  return value && (value.startsWith("http") || value.startsWith("/")) ? value : "";
}

export const publicDirectoryService = {
  async recordVisit(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return;
    }

    const supabase = await createClient();
    await supabase.from("restaurant_public_visits").insert({ restaurant_id: restaurantId });
  },

  async getDirectory({ search = "", category = "", city = "" }: { search?: string; category?: string; city?: string } = {}): Promise<PublicDirectory> {
    if (!hasSupabaseEnv()) {
      return { restaurants: [], categories: [], locations: [], categoryCards: [], mostVisited: [], mostOrderedRestaurants: [], mostOrderedDishes: [] };
    }

    const supabase = await createClient();
    const restaurants = activePublicRestaurants(await restaurantService.listRestaurants());
    const restaurantIds = restaurants.map((restaurant) => restaurant.id);

    if (!restaurantIds.length) {
      return { restaurants: [], categories: [], locations: [], categoryCards: [], mostVisited: [], mostOrderedRestaurants: [], mostOrderedDishes: [] };
    }

    const since7d = daysAgoIso(7);
    const since30d = daysAgoIso(30);
    const [{ data: categoryRows }, { data: productRows }, { data: orderRows }, { data: visitRows }] = await Promise.all([
      supabase.from("categories").select("id,restaurant_id,name,is_active").in("restaurant_id", restaurantIds).eq("is_active", true),
      supabase.from("products").select("id,restaurant_id,category_id,name,description,price,image_url,is_available,order_count").in("restaurant_id", restaurantIds).eq("is_available", true),
      supabase.from("orders").select("restaurant_id,created_at").in("restaurant_id", restaurantIds).gte("created_at", since30d),
      supabase.from("restaurant_public_visits").select("restaurant_id,visited_at").in("restaurant_id", restaurantIds).gte("visited_at", since7d),
    ]);

    const categories = (categoryRows ?? []) as CategoryRow[];
    const products = (productRows ?? []) as ProductRow[];
    const orders = (orderRows ?? []) as OrderRow[];
    const visits = (visitRows ?? []) as VisitRow[];
    const restaurantById = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));
    const categoryById = new Map(categories.map((item) => [item.id, item.name]));

    const cards = restaurants.map<PublicRestaurantCard>((restaurant) => {
      const restaurantCategories = Array.from(
        new Set(
          products
            .filter((product) => product.restaurant_id === restaurant.id && product.category_id)
            .map((product) => categoryById.get(product.category_id ?? ""))
            .filter((name): name is string => Boolean(name)),
        ),
      );
      const popularProducts = products
        .filter((product) => product.restaurant_id === restaurant.id)
        .sort((left, right) => Number(right.order_count ?? 0) - Number(left.order_count ?? 0))
        .slice(0, 3)
        .map((product) => product.name);
      const primaryCategory = restaurant.publicCategory || "";

      return {
        restaurant,
        primaryCategory,
        primaryCategoryLabel: restaurantCategoryLabel(primaryCategory) || restaurantCategories[0] || "Restaurante",
        categories: restaurantCategories,
        orders30d: orders.filter((order) => order.restaurant_id === restaurant.id).length,
        visits7d: visits.filter((visit) => visit.restaurant_id === restaurant.id).length,
        popularProducts,
      };
    });

    const searchNeedle = normalize(search);
    const categoryNeedle = normalize(category);
    const cityNeedle = normalize(city);
    const filteredRestaurants = cards.filter((card) => {
      const matchesSearch =
        !searchNeedle ||
        normalize(card.restaurant.name).includes(searchNeedle) ||
        normalize(card.restaurant.city).includes(searchNeedle) ||
        normalize(card.primaryCategoryLabel).includes(searchNeedle) ||
        card.categories.some((item) => normalize(item).includes(searchNeedle));
      const matchesCategory =
        !categoryNeedle ||
        normalize(card.primaryCategory) === categoryNeedle ||
        normalize(card.primaryCategoryLabel) === categoryNeedle ||
        card.categories.some((item) => normalize(item) === categoryNeedle);
      const matchesCity = !cityNeedle || normalize(card.restaurant.city) === cityNeedle;
      return matchesSearch && matchesCategory && matchesCity;
    });

    const categoryCards = restaurantCategoryOptions.map((option) => {
      const categoryRestaurants = cards.filter((card) => card.primaryCategory === option.value);
      const firstRestaurant = categoryRestaurants[0]?.restaurant;
      const firstProduct = products.find((product) => categoryRestaurants.some((card) => card.restaurant.id === product.restaurant_id) && product.image_url);

      return {
        value: option.value,
        label: option.label,
        imageUrl: imageUrl(firstRestaurant?.bannerUrl) || imageUrl(firstProduct?.image_url) || imageUrl(firstRestaurant?.logoUrl),
        count: categoryRestaurants.length,
      };
    });

    const mostOrderedDishes = products
      .filter((product) => Number(product.order_count ?? 0) > 0)
      .sort((left, right) => Number(right.order_count ?? 0) - Number(left.order_count ?? 0))
      .slice(0, 12)
      .map((product) => {
        const restaurant = restaurantById.get(product.restaurant_id);
        return restaurant
          ? {
              id: product.id,
              restaurantId: restaurant.id,
              restaurantName: restaurant.name,
              restaurantSlug: restaurant.slug,
              name: product.name,
              description: product.description ?? "",
              imageUrl: product.image_url ?? "",
              price: Number(product.price),
              orderCount: Number(product.order_count ?? 0),
            }
          : null;
      })
      .filter((product): product is PublicDishCard => Boolean(product));

    return {
      restaurants: filteredRestaurants,
      categories: restaurantCategoryOptions.map((option) => option.label),
      locations: Array.from(new Set(restaurants.map((restaurant) => restaurant.city).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
      categoryCards,
      mostVisited: [...cards].sort((left, right) => right.visits7d - left.visits7d).slice(0, 6),
      mostOrderedRestaurants: [...cards].sort((left, right) => right.orders30d - left.orders30d).slice(0, 6),
      mostOrderedDishes,
    };
  },
};
