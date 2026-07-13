import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createPublicServerClient } from "@/lib/supabase/public-server";
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

type AnnouncementRow = {
  restaurant_id: string;
  type: "announcement" | "closure";
  title: string;
  body: string | null;
  image_url: string | null;
  starts_at: string;
  ends_at: string | null;
};

type DirectoryCacheEntry = {
  expiresAt: number;
  value: PublicDirectory;
};

export type PublicRestaurantCard = {
  restaurant: Restaurant;
  primaryCategory: string;
  primaryCategoryLabel: string;
  categories: string[];
  orders30d: number;
  visits7d: number;
  popularProducts: string[];
  currentAnnouncement?: {
    type: "announcement" | "closure";
    title: string;
    body: string;
    imageUrl: string;
    startsAt: string;
    endsAt?: string;
  };
  isTemporarilyClosed: boolean;
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

export type PublicCategoryCard = {
  value: string;
  label: string;
  imageUrl: string;
  count: number;
};

export type PublicDirectory = {
  restaurants: PublicRestaurantCard[];
  categories: string[];
  locations: string[];
  categoryCards: PublicCategoryCard[];
  mostVisited: PublicRestaurantCard[];
  mostOrderedRestaurants: PublicRestaurantCard[];
  mostOrderedDishes: PublicDishCard[];
  dishSuggestions: PublicDishCard[];
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

const directoryCache = new Map<string, DirectoryCacheEntry>();
const DIRECTORY_CACHE_TTL_MS = 15_000;

function directoryCacheKey({ search = "", category = "", city = "" }: { search?: string; category?: string; city?: string }) {
  return JSON.stringify({
    search: normalize(search),
    category: normalize(category),
    city: normalize(city),
  });
}

function emptyDirectory(): PublicDirectory {
  return { restaurants: [], categories: [], locations: [], categoryCards: [], mostVisited: [], mostOrderedRestaurants: [], mostOrderedDishes: [], dishSuggestions: [] };
}

function countByRestaurant<T extends { restaurant_id: string }>(rows: T[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.restaurant_id, (counts.get(row.restaurant_id) ?? 0) + 1);
  }
  return counts;
}

export const publicDirectoryService = {
  async recordVisit(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return;
    }

    const supabase = createPublicServerClient();
    if (!supabase) {
      return;
    }
    await supabase.from("restaurant_public_visits").insert({ restaurant_id: restaurantId });
  },

  async getDirectory({ search = "", category = "", city = "" }: { search?: string; category?: string; city?: string } = {}): Promise<PublicDirectory> {
    const cacheKey = directoryCacheKey({ search, category, city });
    const cached = directoryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    if (!hasSupabaseEnv()) {
      return emptyDirectory();
    }

    const supabase = createPublicServerClient();
    if (!supabase) {
      return emptyDirectory();
    }
    const restaurants = activePublicRestaurants(await restaurantService.listPublicDirectoryRestaurants());
    const restaurantIds = restaurants.map((restaurant) => restaurant.id);

    if (!restaurantIds.length) {
      return emptyDirectory();
    }

    const since7d = daysAgoIso(7);
    const since30d = daysAgoIso(30);
    const now = new Date().toISOString();
    const [{ data: categoryRows }, { data: productRows }, { data: orderRows }, { data: visitRows }, { data: announcementRows }] = await Promise.all([
      supabase.from("categories").select("id,restaurant_id,name,is_active").in("restaurant_id", restaurantIds).eq("is_active", true),
      supabase.from("products").select("id,restaurant_id,category_id,name,description,price,image_url,is_available,order_count").in("restaurant_id", restaurantIds).eq("is_available", true),
      supabase.from("orders").select("restaurant_id,created_at").in("restaurant_id", restaurantIds).gte("created_at", since30d),
      supabase.from("restaurant_public_visits").select("restaurant_id,visited_at").in("restaurant_id", restaurantIds).gte("visited_at", since7d),
      supabase
        .from("restaurant_announcements")
        .select("restaurant_id,type,title,body,image_url,starts_at,ends_at")
        .in("restaurant_id", restaurantIds)
        .eq("is_active", true)
        .lte("starts_at", now)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order("type", { ascending: false })
        .order("starts_at", { ascending: false }),
    ]);

    const categories = (categoryRows ?? []) as CategoryRow[];
    const products = (productRows ?? []) as ProductRow[];
    const orders = (orderRows ?? []) as OrderRow[];
    const visits = (visitRows ?? []) as VisitRow[];
    const announcements = (announcementRows ?? []) as AnnouncementRow[];
    const restaurantById = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));
    const categoryById = new Map(categories.map((item) => [item.id, item.name]));
    const ordersCountByRestaurant = countByRestaurant(orders);
    const visitsCountByRestaurant = countByRestaurant(visits);
    const productsByRestaurant = new Map<string, ProductRow[]>();
    const announcementByRestaurant = new Map<string, AnnouncementRow>();

    for (const announcement of announcements) {
      if (!announcementByRestaurant.has(announcement.restaurant_id) || announcement.type === "closure") {
        announcementByRestaurant.set(announcement.restaurant_id, announcement);
      }
    }

    for (const product of products) {
      const current = productsByRestaurant.get(product.restaurant_id) ?? [];
      current.push(product);
      productsByRestaurant.set(product.restaurant_id, current);
    }

    const cards = restaurants.map<PublicRestaurantCard>((restaurant) => {
      const restaurantProducts = productsByRestaurant.get(restaurant.id) ?? [];
      const restaurantCategories = Array.from(
        new Set(
          restaurantProducts
            .filter((product) => product.category_id)
            .map((product) => categoryById.get(product.category_id ?? ""))
            .filter((name): name is string => Boolean(name)),
        ),
      );
      const popularProducts = [...restaurantProducts]
        .sort((left, right) => Number(right.order_count ?? 0) - Number(left.order_count ?? 0))
        .slice(0, 3)
        .map((product) => product.name);
      const primaryCategory = restaurant.publicCategory || "";
      const currentAnnouncement = announcementByRestaurant.get(restaurant.id);

      return {
        restaurant,
        primaryCategory,
        primaryCategoryLabel: restaurantCategoryLabel(primaryCategory) || restaurantCategories[0] || "Restaurante",
        categories: restaurantCategories,
        orders30d: ordersCountByRestaurant.get(restaurant.id) ?? 0,
        visits7d: visitsCountByRestaurant.get(restaurant.id) ?? 0,
        popularProducts,
        currentAnnouncement: currentAnnouncement
          ? {
              type: currentAnnouncement.type,
              title: currentAnnouncement.title,
              body: currentAnnouncement.body ?? "",
              imageUrl: currentAnnouncement.image_url ?? "",
              startsAt: currentAnnouncement.starts_at,
              endsAt: currentAnnouncement.ends_at ?? undefined,
            }
          : undefined,
        isTemporarilyClosed: currentAnnouncement?.type === "closure",
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

    const firstRestaurantByCategory = new Map<string, Restaurant>();
    const restaurantIdsByCategory = new Map<string, Set<string>>();
    for (const card of cards) {
      if (!firstRestaurantByCategory.has(card.primaryCategory)) {
        firstRestaurantByCategory.set(card.primaryCategory, card.restaurant);
      }
      const current = restaurantIdsByCategory.get(card.primaryCategory) ?? new Set<string>();
      current.add(card.restaurant.id);
      restaurantIdsByCategory.set(card.primaryCategory, current);
    }

    const firstProductImageByCategory = new Map<string, string>();
    for (const product of products) {
      if (!product.image_url) {
        continue;
      }

      const restaurant = restaurantById.get(product.restaurant_id);
      const publicCategory = restaurant?.publicCategory ?? "";
      if (publicCategory && !firstProductImageByCategory.has(publicCategory)) {
        firstProductImageByCategory.set(publicCategory, product.image_url);
      }
    }

    const categoryCards = restaurantCategoryOptions.map((option) => {
      const firstRestaurant = firstRestaurantByCategory.get(option.value);
      const categoryRestaurantIds = restaurantIdsByCategory.get(option.value);

      return {
        value: option.value,
        label: option.label,
        imageUrl: imageUrl(firstRestaurant?.bannerUrl) || imageUrl(firstProductImageByCategory.get(option.value)) || imageUrl(firstRestaurant?.logoUrl),
        count: categoryRestaurantIds?.size ?? 0,
      };
    });

    const dishSuggestions = [...products]
      .sort((left, right) => Number(right.order_count ?? 0) - Number(left.order_count ?? 0))
      .slice(0, 48)
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
    const mostOrderedDishes = dishSuggestions.filter((product) => product.orderCount > 0).slice(0, 12);

    const directory = {
      restaurants: filteredRestaurants,
      categories: restaurantCategoryOptions.map((option) => option.label),
      locations: Array.from(new Set(restaurants.map((restaurant) => restaurant.city).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
      categoryCards,
      mostVisited: [...cards].sort((left, right) => right.visits7d - left.visits7d).slice(0, 6),
      mostOrderedRestaurants: [...cards].sort((left, right) => right.orders30d - left.orders30d).slice(0, 6),
      mostOrderedDishes,
      dishSuggestions,
    };

    directoryCache.set(cacheKey, {
      expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS,
      value: directory,
    });

    return directory;
  },
};
