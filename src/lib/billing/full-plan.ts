import { moduleCatalog } from "@/lib/modules";
import type { ModuleKey, PlanKey } from "@/types/restaurant.types";

export const fullPlanKey: PlanKey = "premium";
export const fullPlanName = "Full";
export const primaryLocationPriceMonthly = 450;
export const additionalLocationPriceMonthly = 299;
export const fullPlanModules: ModuleKey[] = moduleCatalog.map((module) => module.key);
