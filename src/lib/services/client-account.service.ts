import { additionalLocationPriceMonthly, fullPlanName, primaryLocationPriceMonthly } from "@/lib/billing/full-plan";
import { getOwnerBranchLimit } from "@/lib/services/owner-dashboard.service";
import { ownerBillingService, type OwnerBillingSnapshot } from "@/lib/services/owner-billing.service";
import { planService } from "@/lib/services/plan.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { Restaurant } from "@/types/restaurant.types";

export type ClientAccountBranch = {
  restaurant: Restaurant;
};

export type ClientAccount = {
  owner: {
    userId?: string;
    name: string;
    email: string;
  };
  baseRestaurant: Restaurant;
  branches: ClientAccountBranch[];
  capacity: {
    used: number;
    limit: number;
    available: number;
  };
  pricing: {
    planName: string;
    primaryPriceMonthly: number;
    additionalPriceMonthly: number;
    monthlyTotal: number;
  };
  billing: OwnerBillingSnapshot | null;
};

export const clientAccountService = {
  async getByRestaurantId(restaurantId: string): Promise<ClientAccount | null> {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const baseRestaurant = await restaurantService.getById(restaurantId);

    if (!baseRestaurant) {
      return null;
    }

    const [allRestaurants, plans] = await Promise.all([restaurantService.listRestaurants(), planService.listPlans()]);
    const ownerUserId = baseRestaurant.ownerUserId;
    const ownerEmail = baseRestaurant.ownerEmail?.trim().toLowerCase() ?? "";
    const branches = allRestaurants.filter((restaurant) => {
      if (ownerUserId) {
        return restaurant.ownerUserId === ownerUserId;
      }

      return ownerEmail && restaurant.ownerEmail?.trim().toLowerCase() === ownerEmail;
    });
    const normalizedBranches = branches.some((restaurant) => restaurant.id === baseRestaurant.id) ? branches : [baseRestaurant, ...branches];
    const orderedBranches = [...normalizedBranches].sort((left, right) => left.name.localeCompare(right.name));
    const branchLimit = await getOwnerBranchLimit(ownerUserId);
    const billing = ownerUserId ? await ownerBillingService.getSnapshot(ownerUserId, { enforce: true }) : null;
    const fullPlan = plans.find((plan) => plan.key === "premium");
    const primaryPrice = fullPlan?.priceMonthly ?? primaryLocationPriceMonthly;
    const additionalPrice = fullPlan?.additionalRestaurantPriceMonthly ?? additionalLocationPriceMonthly;
    const branchSnapshots = orderedBranches.map((restaurant) => ({ restaurant }));

    return {
      owner: {
        userId: ownerUserId,
        name: baseRestaurant.ownerName || baseRestaurant.ownerEmail || "Sin dueno",
        email: baseRestaurant.ownerEmail || "Sin correo",
      },
      baseRestaurant,
      branches: branchSnapshots,
      capacity: {
        used: orderedBranches.length,
        limit: branchLimit,
        available: Math.max(0, branchLimit - orderedBranches.length),
      },
      pricing: {
        planName: fullPlan?.name ?? fullPlanName,
        primaryPriceMonthly: primaryPrice,
        additionalPriceMonthly: additionalPrice,
        monthlyTotal: orderedBranches.length ? primaryPrice + Math.max(0, orderedBranches.length - 1) * additionalPrice : 0,
      },
      billing,
    };
  },
};
