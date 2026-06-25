import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { ModuleKey, PlanKey, SubscriptionPlan } from "@/types/restaurant.types";

export const planService = {
  async listPlans(): Promise<SubscriptionPlan[]> {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const [{ data: plans, error: planError }, { data: modules, error: moduleError }] = await Promise.all([
      supabase.from("subscription_plans").select("*").eq("is_active", true).order("price_monthly"),
      supabase.from("plan_modules").select("*").eq("is_enabled", true),
    ]);

    if (planError || moduleError || !plans?.length) {
      return [];
    }

    return plans.map((plan) => ({
      id: plan.id,
      key: plan.key as PlanKey,
      name: plan.name,
      description: plan.description ?? "",
      priceMonthly: Number(plan.price_monthly),
      maxRestaurants: plan.max_restaurants,
      maxUsersPerRestaurant: plan.max_users_per_restaurant,
      isActive: plan.is_active,
      modules: (modules ?? [])
        .filter((module) => module.plan_id === plan.id)
        .map((module) => module.module_key as ModuleKey),
    }));
  },
};
