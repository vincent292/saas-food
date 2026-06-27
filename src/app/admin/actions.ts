"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadPublicImage } from "@/lib/supabase/storage";
import { moduleCatalog } from "@/lib/modules";
import { toSlug } from "@/lib/utils/slug";
import type { Json } from "@/types/database.types";
import type { ModuleKey, PlanKey } from "@/types/restaurant.types";
import type { OrderStatus } from "@/types/order.types";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const createRestaurantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  description: z.string().optional(),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  primaryColor: z.string().default("#1d8844"),
  secondaryColor: z.string().default("#f59e0b"),
  planKey: z.enum(["basic", "pro", "premium"]).default("basic"),
  ownerName: z.string().optional(),
  ownerEmail: z.string().email().optional().or(z.literal("")),
  ownerPassword: z.string().min(8).optional().or(z.literal("")),
});

const updateRestaurantConfigurationSchema = z.object({
  restaurantId: z.string().uuid(),
  currentSlug: z.string().min(1),
  currentQrPaymentUrl: z.string().optional(),
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().optional(),
  status: z.enum(["active", "inactive", "suspended"]).default("active"),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  addressReference: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  mapsUrl: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#f7faf7"),
  surfaceColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#142018"),
  mutedColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#68766c"),
  borderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#dfe8e2"),
  navBackgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
  navTextColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#142018"),
  currentMenuBackgroundImageUrl: z.string().optional(),
  publicBannerSize: z.enum(["compact", "standard", "large"]).default("compact"),
  deliveryEnabled: z.boolean(),
  pickupEnabled: z.boolean(),
  tableOrdersEnabled: z.boolean(),
  inventoryEnabled: z.boolean(),
  cashEnabled: z.boolean(),
  kitchenEnabled: z.boolean(),
  deliveryFee: z.coerce.number().nonnegative().default(0),
  freeDeliveryFrom: z.coerce.number().nonnegative().optional(),
  minOrderAmount: z.coerce.number().nonnegative().default(0),
  currency: z.string().min(3).max(3).default("BOB"),
  qrPaymentUrl: z.string().optional(),
  qrAccountName: z.string().optional(),
  qrAccountDocument: z.string().optional(),
  qrBankName: z.string().optional(),
  qrAccountType: z.string().optional(),
  qrCurrency: z.string().min(3).max(3).default("BOB"),
  printFormat: z.enum(["thermal_58", "thermal_80", "large"]).default("thermal_80"),
  autoPrintKitchen: z.boolean().default(false),
  printLogo: z.boolean().default(true),
  planKey: z.enum(["basic", "pro", "premium"]).optional(),
});

const setRestaurantStatusSchema = z.object({
  restaurantId: z.string().uuid(),
  status: z.enum(["active", "inactive", "suspended"]),
});

const restaurantIdSchema = z.object({
  restaurantId: z.string().uuid(),
});

const updatePlanSchema = z.object({
  planId: z.string().uuid(),
  name: z.string().min(2),
  description: z.string().optional(),
  priceMonthly: z.coerce.number().nonnegative(),
  maxRestaurants: z.coerce.number().int().positive(),
  maxUsersPerRestaurant: z.coerce.number().int().positive(),
});

const createCategorySchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().min(2),
  description: z.string().optional(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

const productVariantInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceDelta: z.coerce.number().default(0),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

const productOptionInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceDelta: z.coerce.number().default(0),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

const productOptionGroupInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  minChoices: z.coerce.number().int().nonnegative().default(0),
  maxChoices: z.coerce.number().int().positive().default(1),
  isRequired: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
  options: z.array(productOptionInputSchema).default([]),
});

const createProductSchema = z.object({
  restaurantId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.coerce.number().nonnegative(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  isAvailable: z.coerce.boolean().default(true),
  isFeatured: z.coerce.boolean().default(false),
  trackStock: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
  variants: z.array(productVariantInputSchema).default([]),
  optionGroups: z.array(productOptionGroupInputSchema).default([]),
});

const updateProductSchema = createProductSchema.extend({
  productId: z.string().uuid(),
});

const createTableSchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  capacity: z.coerce.number().int().positive().default(2),
});

const updateTableSchema = createTableSchema.extend({
  tableId: z.string().uuid(),
  isActive: z.boolean().default(true),
});

const deleteTableSchema = z.object({
  restaurantId: z.string().uuid(),
  tableId: z.string().uuid(),
});

const updateOrderStatusSchema = z.object({
  restaurantId: z.string().min(1),
  restaurantSlug: z.string().optional(),
  orderId: z.string().uuid(),
  status: z.enum(["pending", "accepted", "preparing", "ready", "delivered", "cancelled"]),
  source: z.enum(["admin", "kitchen"]).default("admin"),
});

const paymentMethodSchema = z.enum(["cash", "qr", "bank_transfer", "card", "other"]);

const openCashSessionSchema = z.object({
  restaurantId: z.string().uuid(),
  openingAmount: z.coerce.number().nonnegative(),
  notes: z.string().optional(),
});

const closeCashSessionSchema = z.object({
  restaurantId: z.string().uuid(),
  countedAmount: z.coerce.number().nonnegative(),
  notes: z.string().optional(),
});

const registerCashExpenseSchema = z.object({
  restaurantId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  paymentMethod: paymentMethodSchema.default("cash"),
  description: z.string().min(2),
});

const registerCashMovementSchema = registerCashExpenseSchema.extend({
  type: z.enum(["expense", "income", "adjustment"]).default("expense"),
});

const chargeOrderSchema = z.object({
  restaurantId: z.string().uuid(),
  orderId: z.string().uuid(),
  restaurantSlug: z.string().min(1).optional(),
  paymentMethod: paymentMethodSchema.default("cash"),
  paymentReceiptReference: z.string().optional(),
  source: z.enum(["pedidos", "caja"]).default("caja"),
});

const rejectCashOrderSchema = z.object({
  restaurantId: z.string().uuid(),
  orderId: z.string().uuid(),
  restaurantSlug: z.string().min(1).optional(),
  source: z.enum(["pedidos", "caja"]).default("caja"),
  reason: z.string().min(3, "Ingresa un motivo"),
});

const posCartItemSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1),
  price: z.coerce.number().nonnegative(),
  quantity: z.coerce.number().int().positive(),
  notes: z.string().optional(),
});

const createPosSaleSchema = z.object({
  restaurantId: z.string().uuid(),
  restaurantSlug: z.string().min(1).optional(),
  paymentMethod: paymentMethodSchema.default("cash"),
  paymentReceiptReference: z.string().optional(),
  customerName: z.string().optional(),
  cart: z.array(posCartItemSchema).min(1),
});

const createInventoryItemSchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().min(2),
  unit: z.enum(["unidad", "kg", "g", "lb", "oz", "litro", "ml", "caja", "paquete"]),
  currentStock: z.coerce.number().nonnegative().default(0),
  minStock: z.coerce.number().nonnegative().default(0),
  unitCost: z.coerce.number().nonnegative().default(0),
  sku: z.string().optional(),
  category: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  purchaseUnit: z.string().optional(),
  purchaseToStockFactor: z.coerce.number().positive().default(1),
  supplierId: z.string().uuid().optional(),
});

const createInventorySupplierSchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().min(2),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

const createInventoryCategorySchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().min(2),
  description: z.string().optional(),
});

const createInventoryZoneSchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().min(2),
  description: z.string().optional(),
});

const linkProductIngredientSchema = z.object({
  restaurantId: z.string().uuid(),
  productId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  wasteFactor: z.coerce.number().nonnegative().default(0),
  notes: z.string().optional(),
});

const linkProductSupplierSchema = z.object({
  restaurantId: z.string().uuid(),
  productId: z.string().uuid(),
  supplierId: z.string().uuid(),
  notes: z.string().optional(),
});

const registerInventoryMovementSchema = z.object({
  restaurantId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  type: z.enum(["in", "out", "adjustment", "waste", "sale_usage"]),
  quantity: z.coerce.number().nonnegative(),
  reason: z.string().min(2),
  fromZoneId: z.string().uuid().optional(),
  toZoneId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
});

const transferInventoryZoneSchema = z.object({
  restaurantId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  fromZoneId: z.string().uuid(),
  toZoneId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  reason: z.string().min(2),
});

const inventoryCountRestaurantSchema = z.object({
  restaurantId: z.string().uuid(),
  notes: z.string().optional(),
});

const recordInventoryCountLineSchema = z.object({
  restaurantId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  countedStock: z.coerce.number().nonnegative(),
  notes: z.string().optional(),
});

async function modulesForPlan(planKey: PlanKey): Promise<ModuleKey[]> {
  const supabase = await createClient();
  const { data: plan } = await supabase.from("subscription_plans").select("id").eq("key", planKey).maybeSingle();

  if (!plan) {
    return [];
  }

  const { data: modules } = await supabase.from("plan_modules").select("module_key").eq("plan_id", plan.id).eq("is_enabled", true);
  return (modules ?? []).map((module) => module.module_key as ModuleKey);
}

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=session");
  }

  return { supabase, user: data.user };
}

async function requireSuperadmin() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("global_role").eq("id", user.id).maybeSingle();

  if (profile?.global_role !== "superadmin") {
    redirect("/admin?error=superadmin-required");
  }

  return { supabase, user };
}

async function getPlanKeyForRestaurant(supabase: Awaited<ReturnType<typeof createClient>>, restaurantId: string): Promise<PlanKey> {
  const { data: subscription } = await supabase
    .from("restaurant_subscriptions")
    .select("plan_id")
    .eq("restaurant_id", restaurantId)
    .in("status", ["trialing", "active", "past_due"])
    .maybeSingle();

  if (!subscription?.plan_id) {
    return "basic";
  }

  const { data: plan } = await supabase.from("subscription_plans").select("key").eq("id", subscription.plan_id).maybeSingle();
  return (plan?.key as PlanKey | undefined) ?? "basic";
}

async function updateRestaurantPlan(supabase: Awaited<ReturnType<typeof createClient>>, restaurantId: string, planKey: PlanKey) {
  const { data: plan } = await supabase.from("subscription_plans").select("id").eq("key", planKey).maybeSingle();

  if (!plan) {
    return;
  }

  const { data: currentSubscription } = await supabase
    .from("restaurant_subscriptions")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .in("status", ["trialing", "active", "past_due"])
    .maybeSingle();

  if (currentSubscription) {
    await supabase.from("restaurant_subscriptions").update({ plan_id: plan.id }).eq("id", currentSubscription.id);
    return;
  }

  await supabase.from("restaurant_subscriptions").insert({
    restaurant_id: restaurantId,
    plan_id: plan.id,
    status: "trialing",
  });
}

async function ensureRestaurantOwner({
  supabase,
  fallbackUserId,
  fallbackEmail,
  ownerName,
  ownerEmail,
  ownerPassword,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  fallbackUserId: string;
  fallbackEmail: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPassword?: string;
}) {
  const normalizedEmail = ownerEmail?.trim().toLowerCase();
  const normalizedName = ownerName?.trim() || normalizedEmail || fallbackEmail || "Responsable";

  if (!normalizedEmail) {
    return {
      id: fallbackUserId,
      email: fallbackEmail,
      name: normalizedName,
    };
  }

  const { data: existingProfile } = await supabase.from("profiles").select("id, email, full_name").eq("email", normalizedEmail).maybeSingle();

  if (existingProfile) {
    return {
      id: existingProfile.id,
      email: existingProfile.email ?? normalizedEmail,
      name: existingProfile.full_name ?? normalizedName,
    };
  }

  if (!ownerPassword) {
    throw new Error("owner-password-required");
  }

  const admin = createAdminClient();

  if (!admin) {
    throw new Error("service-role-required");
  }

  const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: ownerPassword,
    email_confirm: true,
    user_metadata: {
      full_name: normalizedName,
    },
  });

  let ownerId = createdUser.user?.id;

  if (createError) {
    if (!createError.message.toLowerCase().includes("already")) {
      throw createError;
    }

    const { data: userPage, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) {
      throw listError;
    }

    ownerId = userPage.users.find((user) => user.email?.toLowerCase() === normalizedEmail)?.id;
  }

  if (!ownerId) {
    throw new Error("owner-not-found");
  }

  await supabase.from("profiles").upsert(
    {
      id: ownerId,
      email: normalizedEmail,
      full_name: normalizedName,
      global_role: null,
    },
    { onConflict: "id" },
  );

  return {
    id: ownerId,
    email: normalizedEmail,
    name: normalizedName,
  };
}

async function getOpenCashSession(restaurantId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

function cashErrorKey(error: { message?: string; code?: string } | null | undefined, fallback: string) {
  const raw = error?.message || error?.code || fallback;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function orderDecisionRedirectPath(restaurantId: string, source: "pedidos" | "caja") {
  return source === "pedidos" ? `/admin/restaurantes/${restaurantId}/pedidos` : `/admin/restaurantes/${restaurantId}/caja?tab=pedidos`;
}

async function revalidateOrderDecisionPaths(restaurantId: string, restaurantSlug?: string) {
  revalidatePath(`/admin/restaurantes/${restaurantId}/caja`);
  revalidatePath(`/admin/restaurantes/${restaurantId}/pedidos`);
  revalidatePath(`/admin/restaurantes/${restaurantId}/dashboard`);

  if (restaurantSlug) {
    revalidatePath(`/cocina/${restaurantSlug}`);
    revalidatePath(`/r/${restaurantSlug}`);
    revalidatePath(`/r/${restaurantSlug}/seguimiento`);
  }
}

function booleanFromForm(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function parseJsonArray(value: FormDataEntryValue | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function signInAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/admin/login?error=invalid");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    redirect("/admin/login?error=auth");
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    redirect("/admin/login?error=session");
  }

  const { data: profile } = await supabase.from("profiles").select("global_role").eq("id", user.id).maybeSingle();

  revalidatePath("/admin", "layout");

  if (profile?.global_role === "superadmin") {
    redirect("/admin");
  }

  const { data: memberships } = await supabase
    .from("restaurant_memberships")
    .select("restaurant_id")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const restaurantIds = [...new Set((memberships ?? []).map((membership) => membership.restaurant_id))];

  if (restaurantIds.length) {
    const { data: restaurants } = await supabase
      .from("restaurants")
      .select("id")
      .in("id", restaurantIds)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1);

    if (restaurants?.[0]) {
      redirect(`/admin/restaurantes/${restaurants[0].id}/dashboard`);
    }
  }

  await supabase.auth.signOut();
  redirect("/admin/login?error=no-access");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/admin", "layout");
  redirect("/admin/login");
}

export async function setRestaurantStatusAction(formData: FormData) {
  const parsed = setRestaurantStatusSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    redirect("/admin/restaurantes?error=invalid-status");
  }

  const { supabase } = await requireSuperadmin();
  const { error } = await supabase.rpc("set_restaurant_status", {
    p_restaurant_id: parsed.data.restaurantId,
    p_status: parsed.data.status,
  });

  if (error) {
    redirect(`/admin/restaurantes?error=${error.code}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/restaurantes");
  redirect("/admin/restaurantes?status=1");
}

export async function archiveRestaurantAction(formData: FormData) {
  const parsed = restaurantIdSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
  });

  if (!parsed.success) {
    redirect("/admin/restaurantes?error=invalid-restaurant");
  }

  const { supabase } = await requireSuperadmin();
  const { error } = await supabase.rpc("archive_restaurant", {
    p_restaurant_id: parsed.data.restaurantId,
  });

  if (error) {
    redirect(`/admin/restaurantes?error=${error.code}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/restaurantes");
  redirect("/admin/restaurantes?archived=1");
}

export async function restoreRestaurantAction(formData: FormData) {
  const parsed = restaurantIdSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
  });

  if (!parsed.success) {
    redirect("/admin/restaurantes?error=invalid-restaurant");
  }

  const { supabase } = await requireSuperadmin();
  const { error } = await supabase.rpc("restore_restaurant", {
    p_restaurant_id: parsed.data.restaurantId,
  });

  if (error) {
    redirect(`/admin/restaurantes?error=${error.code}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/restaurantes");
  redirect("/admin/restaurantes?restored=1");
}

export async function updatePlanAction(formData: FormData) {
  const parsed = updatePlanSchema.safeParse({
    planId: formData.get("planId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    priceMonthly: formData.get("priceMonthly") || 0,
    maxRestaurants: formData.get("maxRestaurants") || 1,
    maxUsersPerRestaurant: formData.get("maxUsersPerRestaurant") || 1,
  });

  if (!parsed.success) {
    redirect("/admin?error=invalid-plan");
  }

  const { supabase } = await requireSuperadmin();
  const { error: planError } = await supabase
    .from("subscription_plans")
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      price_monthly: parsed.data.priceMonthly,
      max_restaurants: parsed.data.maxRestaurants,
      max_users_per_restaurant: parsed.data.maxUsersPerRestaurant,
      is_active: true,
    })
    .eq("id", parsed.data.planId);

  if (planError) {
    redirect(`/admin?error=${planError.code}`);
  }

  const moduleRows = moduleCatalog.map((module) => ({
    plan_id: parsed.data.planId,
    module_key: module.key,
    is_enabled: booleanFromForm(formData, `module_${module.key}`),
  }));
  const { error: moduleError } = await supabase.from("plan_modules").upsert(moduleRows, { onConflict: "plan_id,module_key" });

  if (moduleError) {
    redirect(`/admin?error=${moduleError.code}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/restaurantes", "layout");
  redirect("/admin?plans=1");
}

export async function createRestaurantAction(formData: FormData) {
  const parsed = createRestaurantSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
    description: formData.get("description") || undefined,
    whatsapp: formData.get("whatsapp") || undefined,
    address: formData.get("address") || undefined,
    city: formData.get("city") || undefined,
    primaryColor: formData.get("primaryColor") || "#1d8844",
    secondaryColor: formData.get("secondaryColor") || "#f59e0b",
    planKey: formData.get("planKey") || "basic",
    ownerName: formData.get("ownerName") || undefined,
    ownerEmail: formData.get("ownerEmail") || undefined,
    ownerPassword: formData.get("ownerPassword") || undefined,
  });

  if (!parsed.success) {
    redirect("/admin/restaurantes/nuevo?error=invalid");
  }

  const { supabase, user } = await requireSuperadmin();
  const owner = await ensureRestaurantOwner({
    supabase,
    fallbackUserId: user.id,
    fallbackEmail: user.email ?? "",
    ownerName: parsed.data.ownerName,
    ownerEmail: parsed.data.ownerEmail || undefined,
    ownerPassword: parsed.data.ownerPassword || undefined,
  }).catch((error: Error) => {
    redirect(`/admin/restaurantes/nuevo?error=${error.message}`);
  });

  const slug = toSlug(parsed.data.slug || parsed.data.name);
  const logoUrl = await uploadPublicImage(formData.get("logoFile") as File | null, `restaurants/${slug}/identity`);
  const bannerUrl = await uploadPublicImage(formData.get("bannerFile") as File | null, `restaurants/${slug}/identity`);
  const enabledPlanModules = await modulesForPlan(parsed.data.planKey);
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .insert({
      name: parsed.data.name,
      slug,
      description: parsed.data.description,
      status: "active",
      primary_color: parsed.data.primaryColor,
      secondary_color: parsed.data.secondaryColor,
      logo_url: logoUrl,
      banner_url: bannerUrl,
      whatsapp: parsed.data.whatsapp,
      address: parsed.data.address,
      city: parsed.data.city,
      owner_user_id: owner.id,
      owner_name: owner.name,
      owner_email: owner.email,
    })
    .select("id")
    .single();

  if (restaurantError || !restaurant) {
    redirect(`/admin/restaurantes/nuevo?error=${restaurantError?.code ?? "create"}`);
  }

  await supabase.from("restaurant_settings").insert({
    restaurant_id: restaurant.id,
    delivery_enabled: true,
    pickup_enabled: true,
    table_orders_enabled: enabledPlanModules.includes("table_qr"),
    inventory_enabled: enabledPlanModules.includes("inventory"),
    cash_enabled: enabledPlanModules.includes("cash"),
    kitchen_enabled: enabledPlanModules.includes("kitchen"),
    delivery_fee: 0,
    min_order_amount: 0,
    currency: "BOB",
  });

  const { data: plan } = await supabase.from("subscription_plans").select("id").eq("key", parsed.data.planKey).maybeSingle();

  if (plan) {
    await supabase.from("restaurant_subscriptions").insert({
      restaurant_id: restaurant.id,
      plan_id: plan.id,
      status: "trialing",
    });
  }

  await supabase.from("restaurant_memberships").insert({
    restaurant_id: restaurant.id,
    user_id: owner.id,
    role: "restaurant_admin",
    is_active: true,
  });

  const moduleRows = enabledPlanModules.map((moduleKey) => ({
    restaurant_id: restaurant.id,
    module_key: moduleKey,
    is_enabled: true,
  }));

  if (moduleRows.length) {
    await supabase.from("module_settings").insert(moduleRows);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/restaurantes");
  redirect(`/admin/restaurantes/${restaurant.id}/dashboard`);
}

export async function updateRestaurantConfigurationAction(formData: FormData) {
  const returnTab = String(formData.get("tab") || "general");
  const parsed = updateRestaurantConfigurationSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    currentSlug: formData.get("currentSlug"),
    currentQrPaymentUrl: formData.get("currentQrPaymentUrl") || undefined,
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description") || undefined,
    status: formData.get("status") || "active",
    whatsapp: formData.get("whatsapp") || undefined,
    address: formData.get("address") || undefined,
    addressReference: formData.get("addressReference") || undefined,
    city: formData.get("city") || undefined,
    latitude: formData.get("latitude") || undefined,
    longitude: formData.get("longitude") || undefined,
    mapsUrl: formData.get("mapsUrl") || undefined,
    primaryColor: formData.get("primaryColor") || "#1d8844",
    secondaryColor: formData.get("secondaryColor") || "#f59e0b",
    backgroundColor: formData.get("backgroundColor") || "#f7faf7",
    surfaceColor: formData.get("surfaceColor") || "#ffffff",
    textColor: formData.get("textColor") || "#142018",
    mutedColor: formData.get("mutedColor") || "#68766c",
    borderColor: formData.get("borderColor") || "#dfe8e2",
    navBackgroundColor: formData.get("navBackgroundColor") || "#ffffff",
    navTextColor: formData.get("navTextColor") || "#142018",
    currentMenuBackgroundImageUrl: formData.get("currentMenuBackgroundImageUrl") || undefined,
    publicBannerSize: formData.get("publicBannerSize") || "compact",
    deliveryEnabled: booleanFromForm(formData, "deliveryEnabled"),
    pickupEnabled: booleanFromForm(formData, "pickupEnabled"),
    tableOrdersEnabled: booleanFromForm(formData, "tableOrdersEnabled"),
    inventoryEnabled: booleanFromForm(formData, "inventoryEnabled"),
    cashEnabled: booleanFromForm(formData, "cashEnabled"),
    kitchenEnabled: booleanFromForm(formData, "kitchenEnabled"),
    deliveryFee: formData.get("deliveryFee") || 0,
    freeDeliveryFrom: formData.get("freeDeliveryFrom") || undefined,
    minOrderAmount: formData.get("minOrderAmount") || 0,
    currency: String(formData.get("currency") || "BOB").toUpperCase(),
    qrPaymentUrl: formData.get("qrPaymentUrl") || undefined,
    qrAccountName: formData.get("qrAccountName") || undefined,
    qrAccountDocument: formData.get("qrAccountDocument") || undefined,
    qrBankName: formData.get("qrBankName") || undefined,
    qrAccountType: formData.get("qrAccountType") || undefined,
    qrCurrency: String(formData.get("qrCurrency") || formData.get("currency") || "BOB").toUpperCase(),
    printFormat: formData.get("printFormat") || "thermal_80",
    autoPrintKitchen: booleanFromForm(formData, "autoPrintKitchen"),
    printLogo: booleanFromForm(formData, "printLogo"),
    planKey: formData.get("planKey") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/configuracion?tab=${returnTab}&error=invalid`);
  }

  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("global_role").eq("id", user.id).maybeSingle();
  const canChangePlan = profile?.global_role === "superadmin";
  const planKey = canChangePlan && parsed.data.planKey ? parsed.data.planKey : await getPlanKeyForRestaurant(supabase, parsed.data.restaurantId);
  const allowedModules = await modulesForPlan(planKey);
  const isAllowedModule = (moduleKey: ModuleKey) => allowedModules.includes(moduleKey);

  if (canChangePlan && parsed.data.planKey) {
    await updateRestaurantPlan(supabase, parsed.data.restaurantId, parsed.data.planKey);
  }

  const slug = toSlug(parsed.data.slug);
  const logoUrl = await uploadPublicImage(formData.get("logoFile") as File | null, `restaurants/${parsed.data.restaurantId}/identity`);
  const bannerUrl = await uploadPublicImage(formData.get("bannerFile") as File | null, `restaurants/${parsed.data.restaurantId}/identity`);
  const menuBackgroundImageUrl =
    (await uploadPublicImage(formData.get("menuBackgroundImageFile") as File | null, `restaurants/${parsed.data.restaurantId}/identity`)) ??
    parsed.data.currentMenuBackgroundImageUrl ??
    null;
  const qrPaymentUrl =
    (await uploadPublicImage(formData.get("qrPaymentFile") as File | null, `restaurants/${parsed.data.restaurantId}/payments`)) ??
    parsed.data.qrPaymentUrl ??
    parsed.data.currentQrPaymentUrl ??
    null;

  const restaurantUpdate: {
    name: string;
    slug: string;
    description: string | null;
    status: "active" | "inactive" | "suspended";
    primary_color: string;
    secondary_color: string;
    background_color: string;
    surface_color: string;
    text_color: string;
    muted_color: string;
    border_color: string;
    nav_background_color: string;
    nav_text_color: string;
    menu_background_image_url: string | null;
    public_banner_size: "compact" | "standard" | "large";
    whatsapp: string | null;
    address: string | null;
    address_reference: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    maps_url: string | null;
    logo_url?: string;
    banner_url?: string;
  } = {
    name: parsed.data.name,
    slug,
    description: parsed.data.description ?? null,
    status: parsed.data.status,
    primary_color: parsed.data.primaryColor,
    secondary_color: parsed.data.secondaryColor,
    background_color: parsed.data.backgroundColor,
    surface_color: parsed.data.surfaceColor,
    text_color: parsed.data.textColor,
    muted_color: parsed.data.mutedColor,
    border_color: parsed.data.borderColor,
    nav_background_color: parsed.data.navBackgroundColor,
    nav_text_color: parsed.data.navTextColor,
    menu_background_image_url: menuBackgroundImageUrl,
    public_banner_size: parsed.data.publicBannerSize,
    whatsapp: parsed.data.whatsapp ?? null,
    address: parsed.data.address ?? null,
    address_reference: parsed.data.addressReference ?? null,
    city: parsed.data.city ?? null,
    latitude: parsed.data.latitude ?? null,
    longitude: parsed.data.longitude ?? null,
    maps_url: parsed.data.mapsUrl ?? null,
  };

  if (logoUrl) {
    restaurantUpdate.logo_url = logoUrl;
  }

  if (bannerUrl) {
    restaurantUpdate.banner_url = bannerUrl;
  }

  const { error: restaurantError } = await supabase.from("restaurants").update(restaurantUpdate).eq("id", parsed.data.restaurantId);

  if (restaurantError) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=${returnTab}&error=${restaurantError.code}`);
  }

  const { error: settingsError } = await supabase.from("restaurant_settings").upsert(
    {
      restaurant_id: parsed.data.restaurantId,
      delivery_enabled: parsed.data.deliveryEnabled,
      pickup_enabled: parsed.data.pickupEnabled,
      table_orders_enabled: parsed.data.tableOrdersEnabled && isAllowedModule("table_qr"),
      inventory_enabled: parsed.data.inventoryEnabled && isAllowedModule("inventory"),
      cash_enabled: parsed.data.cashEnabled && isAllowedModule("cash"),
      kitchen_enabled: parsed.data.kitchenEnabled && isAllowedModule("kitchen"),
      delivery_fee: parsed.data.deliveryFee,
      free_delivery_from: parsed.data.freeDeliveryFrom ?? null,
      min_order_amount: parsed.data.minOrderAmount,
      currency: parsed.data.currency,
      qr_payment_url: qrPaymentUrl,
      qr_account_name: parsed.data.qrAccountName ?? null,
      qr_account_document: parsed.data.qrAccountDocument ?? null,
      qr_bank_name: parsed.data.qrBankName ?? null,
      qr_account_type: parsed.data.qrAccountType ?? null,
      qr_currency: parsed.data.qrCurrency,
      print_format: parsed.data.printFormat,
      auto_print_kitchen: parsed.data.autoPrintKitchen,
      print_logo: parsed.data.printLogo,
    },
    { onConflict: "restaurant_id" },
  );

  if (settingsError) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=${returnTab}&error=${settingsError.code}`);
  }

  const businessHours = Array.from({ length: 7 }, (_, dayOfWeek) => {
    const isClosed = booleanFromForm(formData, `day_${dayOfWeek}_isClosed`);
    return {
      restaurant_id: parsed.data.restaurantId,
      day_of_week: dayOfWeek,
      opens_at: isClosed ? null : String(formData.get(`day_${dayOfWeek}_opensAt`) || "09:00"),
      closes_at: isClosed ? null : String(formData.get(`day_${dayOfWeek}_closesAt`) || "22:00"),
      is_closed: isClosed,
    };
  });

  const { error: hoursError } = await supabase.from("business_hours").upsert(businessHours, { onConflict: "restaurant_id,day_of_week" });

  if (hoursError) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=${returnTab}&error=${hoursError.code}`);
  }

  const moduleRows = [
    { module_key: "public_menu", is_enabled: true },
    { module_key: "orders", is_enabled: true },
    { module_key: "table_qr", is_enabled: parsed.data.tableOrdersEnabled },
    { module_key: "kitchen", is_enabled: parsed.data.kitchenEnabled },
    { module_key: "cash", is_enabled: parsed.data.cashEnabled },
    { module_key: "inventory", is_enabled: parsed.data.inventoryEnabled },
    { module_key: "reports", is_enabled: isAllowedModule("reports") },
    { module_key: "multi_user", is_enabled: isAllowedModule("multi_user") },
  ].map((module) => ({
    restaurant_id: parsed.data.restaurantId,
    module_key: module.module_key,
    is_enabled: isAllowedModule(module.module_key as ModuleKey) && module.is_enabled,
  }));

  const { error: modulesError } = await supabase.from("module_settings").upsert(moduleRows, { onConflict: "restaurant_id,module_key" });

  if (modulesError) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=${returnTab}&error=${modulesError.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  revalidatePath(`/r/${parsed.data.currentSlug}`);
  revalidatePath(`/r/${slug}`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=${returnTab}&saved=1`);
}

export async function createCategoryAction(formData: FormData) {
  const parsed = createCategorySchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    sortOrder: formData.get("sortOrder") || 0,
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/categorias?error=invalid`);
  }

  const supabase = await createClient();
  const imageUrl = await uploadPublicImage(formData.get("imageFile") as File | null, `restaurants/${parsed.data.restaurantId}/categories`);
  const { error } = await supabase.from("categories").insert({
    restaurant_id: parsed.data.restaurantId,
    name: parsed.data.name,
    description: parsed.data.description,
    image_url: imageUrl,
    sort_order: parsed.data.sortOrder,
    is_active: parsed.data.isActive,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/categorias?error=${error.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/categorias`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/productos`);
  revalidatePath(`/r`, "layout");
  if (formData.get("returnTo") === "products") {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?categoryCreated=1`);
  }
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/categorias?created=1`);
}

export async function createProductAction(formData: FormData) {
  const parsed = createProductSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    categoryId: formData.get("categoryId") || undefined,
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    price: formData.get("price"),
    imageUrl: "",
    isAvailable: formData.get("isAvailable") === "on",
    isFeatured: formData.get("isFeatured") === "on",
    trackStock: formData.get("trackStock") === "on",
    sortOrder: formData.get("sortOrder") || 0,
    variants: parseJsonArray(formData.get("variantsJson")),
    optionGroups: parseJsonArray(formData.get("optionGroupsJson")),
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/productos?error=invalid`);
  }

  const supabase = await createClient();
  const imageUrl = await uploadPublicImage(formData.get("imageFile") as File | null, `restaurants/${parsed.data.restaurantId}/products`);
  const { data: product, error } = await supabase
    .from("products")
    .insert({
      restaurant_id: parsed.data.restaurantId,
      category_id: parsed.data.categoryId,
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price,
      image_url: imageUrl,
      is_available: parsed.data.isAvailable,
      is_featured: parsed.data.isFeatured,
      track_stock: parsed.data.trackStock,
      sort_order: parsed.data.sortOrder,
    })
    .select("id")
    .single();

  if (error || !product) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=${error?.code ?? "product-create"}`);
  }

  const variants = parsed.data.variants.filter((variant) => variant.name.trim());
  if (variants.length) {
    const { error: variantsError } = await supabase.from("product_variants").insert(
      variants.map((variant) => ({
        restaurant_id: parsed.data.restaurantId,
        product_id: product.id,
        name: variant.name.trim(),
        description: variant.description || null,
        price_delta: variant.priceDelta,
        sort_order: variant.sortOrder,
        is_active: variant.isActive,
      })),
    );

    if (variantsError) {
      redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=${variantsError.code}`);
    }
  }

  const groups = parsed.data.optionGroups.filter((group) => group.name.trim());
  for (const group of groups) {
    const { data: insertedGroup, error: groupError } = await supabase
      .from("product_option_groups")
      .insert({
        restaurant_id: parsed.data.restaurantId,
        product_id: product.id,
        name: group.name.trim(),
        description: group.description || null,
        min_choices: group.minChoices,
        max_choices: group.maxChoices,
        is_required: group.isRequired,
        sort_order: group.sortOrder,
        is_active: group.isActive,
      })
      .select("id")
      .single();

    if (groupError || !insertedGroup) {
      redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=${groupError?.code ?? "option-group"}`);
    }

    const options = group.options.filter((option) => option.name.trim());
    if (options.length) {
      const { error: optionsError } = await supabase.from("product_options").insert(
        options.map((option) => ({
          restaurant_id: parsed.data.restaurantId,
          product_id: product.id,
          option_group_id: insertedGroup.id,
          name: option.name.trim(),
          description: option.description || null,
          price_delta: option.priceDelta,
          sort_order: option.sortOrder,
          is_active: option.isActive,
        })),
      );

      if (optionsError) {
        redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=${optionsError.code}`);
      }
    }
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/productos`);
  revalidatePath(`/r`, "layout");
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?created=1`);
}

export async function updateProductAction(formData: FormData) {
  const parsed = updateProductSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    productId: formData.get("productId"),
    categoryId: formData.get("categoryId") || undefined,
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    price: formData.get("price"),
    imageUrl: "",
    isAvailable: formData.get("isAvailable") === "on",
    isFeatured: formData.get("isFeatured") === "on",
    trackStock: formData.get("trackStock") === "on",
    sortOrder: formData.get("sortOrder") || 0,
    variants: parseJsonArray(formData.get("variantsJson")),
    optionGroups: parseJsonArray(formData.get("optionGroupsJson")),
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/productos?error=invalid-update`);
  }

  const supabase = await createClient();
  const imageUrl = await uploadPublicImage(formData.get("imageFile") as File | null, `restaurants/${parsed.data.restaurantId}/products`);
  const updatePayload: {
    category_id?: string | null;
    name: string;
    description: string | null;
    price: number;
    is_available: boolean;
    is_featured: boolean;
    track_stock: boolean;
    sort_order: number;
    image_url?: string | null;
  } = {
    category_id: parsed.data.categoryId ?? null,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    price: parsed.data.price,
    is_available: parsed.data.isAvailable,
    is_featured: parsed.data.isFeatured,
    track_stock: parsed.data.trackStock,
    sort_order: parsed.data.sortOrder,
  };

  if (imageUrl) {
    updatePayload.image_url = imageUrl;
  }

  const { error } = await supabase
    .from("products")
    .update(updatePayload)
    .eq("id", parsed.data.productId)
    .eq("restaurant_id", parsed.data.restaurantId);

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=${error.code}`);
  }

  await supabase.from("product_variants").delete().eq("restaurant_id", parsed.data.restaurantId).eq("product_id", parsed.data.productId);
  await supabase.from("product_option_groups").delete().eq("restaurant_id", parsed.data.restaurantId).eq("product_id", parsed.data.productId);

  const variants = parsed.data.variants.filter((variant) => variant.name.trim());
  if (variants.length) {
    const { error: variantsError } = await supabase.from("product_variants").insert(
      variants.map((variant) => ({
        restaurant_id: parsed.data.restaurantId,
        product_id: parsed.data.productId,
        name: variant.name.trim(),
        description: variant.description || null,
        price_delta: variant.priceDelta,
        sort_order: variant.sortOrder,
        is_active: variant.isActive,
      })),
    );

    if (variantsError) {
      redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=${variantsError.code}`);
    }
  }

  const groups = parsed.data.optionGroups.filter((group) => group.name.trim());
  for (const group of groups) {
    const { data: insertedGroup, error: groupError } = await supabase
      .from("product_option_groups")
      .insert({
        restaurant_id: parsed.data.restaurantId,
        product_id: parsed.data.productId,
        name: group.name.trim(),
        description: group.description || null,
        min_choices: group.minChoices,
        max_choices: group.maxChoices,
        is_required: group.isRequired,
        sort_order: group.sortOrder,
        is_active: group.isActive,
      })
      .select("id")
      .single();

    if (groupError || !insertedGroup) {
      redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=${groupError?.code ?? "option-group-update"}`);
    }

    const options = group.options.filter((option) => option.name.trim());
    if (options.length) {
      const { error: optionsError } = await supabase.from("product_options").insert(
        options.map((option) => ({
          restaurant_id: parsed.data.restaurantId,
          product_id: parsed.data.productId,
          option_group_id: insertedGroup.id,
          name: option.name.trim(),
          description: option.description || null,
          price_delta: option.priceDelta,
          sort_order: option.sortOrder,
          is_active: option.isActive,
        })),
      );

      if (optionsError) {
        redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=${optionsError.code}`);
      }
    }
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/productos`);
  revalidatePath(`/r`, "layout");
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?updated=1`);
}

export async function createTableAction(formData: FormData) {
  const parsed = createTableSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    name: formData.get("name"),
    code: formData.get("code"),
    capacity: formData.get("capacity") || 2,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/mesas?error=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tables").insert({
    restaurant_id: parsed.data.restaurantId,
    name: parsed.data.name,
    code: parsed.data.code.trim().toUpperCase(),
    status: "available",
    capacity: parsed.data.capacity,
    is_active: true,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/mesas?error=${error.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/mesas`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/mesas?created=1`);
}

export async function updateTableAction(formData: FormData) {
  const parsed = updateTableSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    tableId: formData.get("tableId"),
    name: formData.get("name"),
    code: formData.get("code"),
    capacity: formData.get("capacity") || 2,
    isActive: booleanFromForm(formData, "isActive"),
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/mesas?error=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tables")
    .update({
      name: parsed.data.name.trim(),
      code: parsed.data.code.trim().toUpperCase(),
      capacity: parsed.data.capacity,
      is_active: parsed.data.isActive,
    })
    .eq("id", parsed.data.tableId)
    .eq("restaurant_id", parsed.data.restaurantId);

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/mesas?error=${error.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/mesas`);
  revalidatePath(`/r`, "layout");
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/mesas?updated=1`);
}

export async function deleteTableAction(formData: FormData) {
  const parsed = deleteTableSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    tableId: formData.get("tableId"),
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/mesas?error=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tables")
    .update({ is_active: false, status: "available" })
    .eq("id", parsed.data.tableId)
    .eq("restaurant_id", parsed.data.restaurantId);

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/mesas?error=${error.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/mesas`);
  revalidatePath(`/r`, "layout");
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/mesas?deleted=1`);
}

export async function updateOrderStatusAction(formData: FormData) {
  const parsed = updateOrderStatusSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    restaurantSlug: formData.get("restaurantSlug") || undefined,
    orderId: formData.get("orderId"),
    status: formData.get("status"),
    source: formData.get("source") || "admin",
  });

  if (!parsed.success) {
    redirect("/admin?error=invalid-order-status");
  }

  const nextStatus = parsed.data.status as OrderStatus;
  const supabase = await createClient();
  const now = new Date().toISOString();

  if (nextStatus === "accepted") {
    const session = await getOpenCashSession(parsed.data.restaurantId);
    const { data: order } = await supabase
      .from("orders")
      .select("payment_status")
      .eq("restaurant_id", parsed.data.restaurantId)
      .eq("id", parsed.data.orderId)
      .maybeSingle();

    if (!session || order?.payment_status !== "paid") {
      redirect(`/admin/restaurantes/${parsed.data.restaurantId}/pedidos?error=cash-required`);
    }
  }

  const updatePayload: {
    status: OrderStatus;
    accepted_at?: string;
    preparing_at?: string;
    ready_at?: string;
    delivered_at?: string;
    cancelled_at?: string;
  } = { status: nextStatus };

  if (nextStatus === "accepted") {
    updatePayload.accepted_at = now;
  }

  if (nextStatus === "preparing") {
    updatePayload.preparing_at = now;
  }

  if (nextStatus === "ready") {
    updatePayload.ready_at = now;
  }

  if (nextStatus === "delivered") {
    updatePayload.delivered_at = now;
  }

  if (nextStatus === "cancelled") {
    updatePayload.cancelled_at = now;
  }

  await supabase.from("orders").update(updatePayload).eq("id", parsed.data.orderId).eq("restaurant_id", parsed.data.restaurantId);

  if (nextStatus === "cancelled") {
    await supabase.rpc("reverse_order_inventory_usage", {
      p_order_id: parsed.data.orderId,
      p_reason: "Reversión por cancelación de pedido",
    });
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/pedidos`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  if (parsed.data.restaurantSlug) {
    revalidatePath(`/cocina/${parsed.data.restaurantSlug}`);
    revalidatePath(`/r/${parsed.data.restaurantSlug}`);
    revalidatePath(`/r/${parsed.data.restaurantSlug}/seguimiento`);
  }

  if (parsed.data.source === "kitchen" && parsed.data.restaurantSlug) {
    redirect(`/cocina/${parsed.data.restaurantSlug}`);
  }

  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/pedidos?updated=1`);
}

export async function openCashSessionAction(formData: FormData) {
  const parsed = openCashSessionSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    openingAmount: formData.get("openingAmount") || 0,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/caja?tab=cierre&error=invalid`);
  }

  const { supabase, user } = await requireUser();
  void user;
  const { error } = await supabase.rpc("open_cash_session_atomic", {
    p_restaurant_id: parsed.data.restaurantId,
    p_opening_amount: parsed.data.openingAmount,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?tab=cierre&error=${cashErrorKey(error, "open-cash")}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/caja`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?tab=cierre&opened=1`);
}

export async function closeCashSessionAction(formData: FormData) {
  const parsed = closeCashSessionSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    countedAmount: formData.get("countedAmount") || 0,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/caja?tab=cierre&error=invalid`);
  }

  const { supabase, user } = await requireUser();
  void user;
  const { error } = await supabase.rpc("close_cash_session_atomic", {
    p_restaurant_id: parsed.data.restaurantId,
    p_counted_amount: parsed.data.countedAmount,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?tab=cierre&error=${cashErrorKey(error, "close-cash")}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/caja`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?tab=cierre&closed=1`);
}

export async function registerCashMovementAction(formData: FormData) {
  const parsed = registerCashMovementSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    type: formData.get("type") || "expense",
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod") || "cash",
    description: formData.get("description"),
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/caja?tab=egresos&error=invalid-expense`);
  }

  const { supabase, user } = await requireUser();
  void user;
  const { error } = await supabase.rpc("register_cash_movement_atomic", {
    p_restaurant_id: parsed.data.restaurantId,
    p_type: parsed.data.type,
    p_payment_method: parsed.data.paymentMethod,
    p_amount: parsed.data.amount,
    p_description: parsed.data.description,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?tab=egresos&error=${cashErrorKey(error, "cash-movement")}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/caja`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?tab=egresos&expense=1`);
}

export async function registerCashExpenseAction(formData: FormData) {
  return registerCashMovementAction(formData);
}

export async function chargeOrderAction(formData: FormData) {
  const parsed = chargeOrderSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    orderId: formData.get("orderId"),
    restaurantSlug: formData.get("restaurantSlug") || undefined,
    paymentMethod: formData.get("paymentMethod") || "cash",
    paymentReceiptReference: formData.get("paymentReceiptReference") || undefined,
    source: formData.get("source") || "caja",
  });

  if (!parsed.success) {
    const fallbackPath = orderDecisionRedirectPath(String(formData.get("restaurantId")), "caja");
    redirect(`${fallbackPath}${fallbackPath.includes("?") ? "&" : "?"}error=invalid-charge`);
  }

  const { supabase, user } = await requireUser();
  void user;
  const redirectPath = orderDecisionRedirectPath(parsed.data.restaurantId, parsed.data.source);

  const receiptFile = formData.get("paymentReceiptFile") as File | null;
  const uploadedReceiptUrl =
    receiptFile && receiptFile.size > 0
      ? await uploadPublicImage(receiptFile, `restaurants/${parsed.data.restaurantId}/payment-receipts`)
      : null;

  const { error } = await supabase.rpc("charge_order_with_cash_movement", {
    p_restaurant_id: parsed.data.restaurantId,
    p_order_id: parsed.data.orderId,
    p_payment_method: parsed.data.paymentMethod,
    p_receipt_url: uploadedReceiptUrl,
    p_receipt_reference: parsed.data.paymentReceiptReference ?? null,
  });

  if (error) {
    redirect(`${redirectPath}${redirectPath.includes("?") ? "&" : "?"}error=${cashErrorKey(error, "charge-order")}`);
  }

  await revalidateOrderDecisionPaths(parsed.data.restaurantId, parsed.data.restaurantSlug);
  redirect(`${redirectPath}${redirectPath.includes("?") ? "&" : "?"}charged=1`);
}

export async function rejectCashOrderAction(formData: FormData) {
  const parsed = rejectCashOrderSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    orderId: formData.get("orderId"),
    restaurantSlug: formData.get("restaurantSlug") || undefined,
    source: formData.get("source") || "caja",
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    const fallbackPath = orderDecisionRedirectPath(String(formData.get("restaurantId")), "caja");
    redirect(`${fallbackPath}${fallbackPath.includes("?") ? "&" : "?"}error=invalid-reject`);
  }

  const { supabase } = await requireUser();
  const redirectPath = orderDecisionRedirectPath(parsed.data.restaurantId, parsed.data.source);
  const { error } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      payment_status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: parsed.data.reason,
    })
    .eq("restaurant_id", parsed.data.restaurantId)
    .eq("id", parsed.data.orderId);

  if (error) {
    redirect(`${redirectPath}${redirectPath.includes("?") ? "&" : "?"}error=${error.code}`);
  }

  await revalidateOrderDecisionPaths(parsed.data.restaurantId, parsed.data.restaurantSlug);
  redirect(`${redirectPath}${redirectPath.includes("?") ? "&" : "?"}rejected=1`);
}

export async function createPosSaleAction(formData: FormData) {
  const rawCart = String(formData.get("cartJson") ?? "[]");
  let cart: unknown;
  try {
    cart = JSON.parse(rawCart);
  } catch {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/caja?tab=venta&error=invalid-pos-sale`);
  }

  const parsed = createPosSaleSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    restaurantSlug: formData.get("restaurantSlug") || undefined,
    paymentMethod: formData.get("paymentMethod") || "cash",
    paymentReceiptReference: formData.get("paymentReceiptReference") || undefined,
    customerName: formData.get("customerName") || undefined,
    cart,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/caja?tab=venta&error=invalid-pos-sale`);
  }

  const { supabase, user } = await requireUser();
  void user;

  const receiptFile = formData.get("paymentReceiptFile") as File | null;
  const paymentReceiptUrl =
    parsed.data.paymentMethod === "qr" && receiptFile && receiptFile.size > 0
      ? await uploadPublicImage(receiptFile, `restaurants/${parsed.data.restaurantId}/payment-receipts`)
      : null;

  if (parsed.data.paymentMethod === "qr" && !paymentReceiptUrl && !parsed.data.paymentReceiptReference) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?tab=venta&error=receipt-required`);
  }

  const orderNumber = `POS-${Date.now()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

  const { error } = await supabase.rpc("create_pos_sale_with_cash_movement", {
    p_restaurant_id: parsed.data.restaurantId,
    p_order_number: orderNumber,
    p_customer_name: parsed.data.customerName ?? null,
    p_payment_method: parsed.data.paymentMethod,
    p_receipt_url: paymentReceiptUrl,
    p_receipt_reference: parsed.data.paymentReceiptReference ?? null,
    p_items: parsed.data.cart as unknown as Json,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?tab=venta&error=${cashErrorKey(error, "pos-order")}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/caja`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/pedidos`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  if (parsed.data.restaurantSlug) {
    revalidatePath(`/cocina/${parsed.data.restaurantSlug}`);
  }
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?tab=venta&pos=1`);
}

export async function createInventoryItemAction(formData: FormData) {
  const parsed = createInventoryItemSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    name: formData.get("name"),
    unit: formData.get("unit") || "unidad",
    currentStock: formData.get("currentStock") || 0,
    minStock: formData.get("minStock") || 0,
    unitCost: formData.get("unitCost") || 0,
    sku: formData.get("sku") || undefined,
    category: formData.get("category") || undefined,
    categoryId: formData.get("categoryId") || undefined,
    purchaseUnit: formData.get("purchaseUnit") || undefined,
    purchaseToStockFactor: formData.get("purchaseToStockFactor") || 1,
    supplierId: formData.get("supplierId") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/inventario?error=invalid-item`);
  }

  const { supabase, user } = await requireUser();
  const { data: item, error } = await supabase
    .from("inventory_items")
    .insert({
      restaurant_id: parsed.data.restaurantId,
      name: parsed.data.name,
      unit: parsed.data.unit,
      current_stock: parsed.data.currentStock,
      min_stock: parsed.data.minStock,
      unit_cost: parsed.data.unitCost,
      sku: parsed.data.sku,
      category: parsed.data.category,
      category_id: parsed.data.categoryId,
      purchase_unit: parsed.data.purchaseUnit,
      purchase_to_stock_factor: parsed.data.purchaseToStockFactor,
      supplier_id: parsed.data.supplierId,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !item) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?error=${error?.code ?? "create-item"}`);
  }

  await supabase.from("inventory_movements").insert({
    restaurant_id: parsed.data.restaurantId,
    inventory_item_id: item.id,
    type: "adjustment",
    quantity: parsed.data.currentStock,
    previous_stock: 0,
    new_stock: parsed.data.currentStock,
    reason: "Stock inicial",
    created_by: user.id,
  });

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/inventario`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?created=1`);
}

export async function createInventorySupplierAction(formData: FormData) {
  const parsed = createInventorySupplierSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/inventario?tab=proveedores&error=invalid-supplier`);
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.from("inventory_suppliers").insert({
    restaurant_id: parsed.data.restaurantId,
    name: parsed.data.name,
    phone: parsed.data.phone,
    notes: parsed.data.notes,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=proveedores&error=${error.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/inventario`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=proveedores&supplier=1`);
}

export async function createInventoryCategoryAction(formData: FormData) {
  const parsed = createInventoryCategorySchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/inventario?tab=catalogo&error=invalid-category`);
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.from("inventory_categories").insert({
    restaurant_id: parsed.data.restaurantId,
    name: parsed.data.name,
    description: parsed.data.description,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=catalogo&error=${error.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/inventario`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=catalogo&category=1`);
}

export async function createInventoryZoneAction(formData: FormData) {
  const parsed = createInventoryZoneSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/inventario?tab=zonas&error=invalid-zone`);
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.from("inventory_zones").insert({
    restaurant_id: parsed.data.restaurantId,
    name: parsed.data.name,
    description: parsed.data.description,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=zonas&error=${error.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/inventario`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=zonas&zone=1`);
}

export async function linkProductIngredientAction(formData: FormData) {
  const parsed = linkProductIngredientSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    productId: formData.get("productId"),
    inventoryItemId: formData.get("inventoryItemId"),
    quantity: formData.get("quantity"),
    wasteFactor: formData.get("wasteFactor") || 0,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/inventario?tab=recetas&error=invalid-ingredient`);
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.from("product_ingredients").upsert(
    {
      restaurant_id: parsed.data.restaurantId,
      product_id: parsed.data.productId,
      inventory_item_id: parsed.data.inventoryItemId,
      quantity: parsed.data.quantity,
      waste_factor: parsed.data.wasteFactor,
      notes: parsed.data.notes,
    },
    { onConflict: "product_id,inventory_item_id" },
  );

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=recetas&error=${error.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/inventario`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=recetas&ingredient=1`);
}

export async function linkProductSupplierAction(formData: FormData) {
  const parsed = linkProductSupplierSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    productId: formData.get("productId"),
    supplierId: formData.get("supplierId"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/inventario?tab=proveedores&error=invalid-product-supplier`);
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.from("product_suppliers").upsert(
    {
      restaurant_id: parsed.data.restaurantId,
      product_id: parsed.data.productId,
      supplier_id: parsed.data.supplierId,
      notes: parsed.data.notes,
    },
    { onConflict: "product_id,supplier_id" },
  );

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=proveedores&error=${error.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/inventario`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=proveedores&productSupplier=1`);
}

export async function registerInventoryMovementAction(formData: FormData) {
  const parsed = registerInventoryMovementSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    inventoryItemId: formData.get("inventoryItemId"),
    type: formData.get("type"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason"),
    fromZoneId: formData.get("fromZoneId") || undefined,
    toZoneId: formData.get("toZoneId") || undefined,
    supplierId: formData.get("supplierId") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/inventario?error=invalid-movement`);
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("register_inventory_movement_atomic", {
    p_restaurant_id: parsed.data.restaurantId,
    p_inventory_item_id: parsed.data.inventoryItemId,
    p_type: parsed.data.type,
    p_quantity: parsed.data.quantity,
    p_reason: parsed.data.reason,
    p_from_zone_id: parsed.data.fromZoneId ?? null,
    p_to_zone_id: parsed.data.toZoneId ?? null,
    p_supplier_id: parsed.data.supplierId ?? null,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?error=${cashErrorKey(error, "inventory-movement")}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/inventario`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?movement=1`);
}

export async function transferInventoryZoneAction(formData: FormData) {
  const parsed = transferInventoryZoneSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    inventoryItemId: formData.get("inventoryItemId"),
    fromZoneId: formData.get("fromZoneId"),
    toZoneId: formData.get("toZoneId"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/inventario?tab=zonas&error=invalid-transfer`);
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("transfer_inventory_zone_atomic", {
    p_restaurant_id: parsed.data.restaurantId,
    p_inventory_item_id: parsed.data.inventoryItemId,
    p_from_zone_id: parsed.data.fromZoneId,
    p_to_zone_id: parsed.data.toZoneId,
    p_quantity: parsed.data.quantity,
    p_reason: parsed.data.reason,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=zonas&error=${cashErrorKey(error, "zone-transfer")}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/inventario`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=zonas&transfer=1`);
}

export async function openInventoryCountAction(formData: FormData) {
  const parsed = inventoryCountRestaurantSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/inventario?tab=conteo&error=invalid-count`);
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("open_inventory_count_atomic", {
    p_restaurant_id: parsed.data.restaurantId,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=conteo&error=${cashErrorKey(error, "open-count")}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/inventario`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=conteo&count=opened`);
}

export async function recordInventoryCountLineAction(formData: FormData) {
  const parsed = recordInventoryCountLineSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    inventoryItemId: formData.get("inventoryItemId"),
    countedStock: formData.get("countedStock"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/inventario?tab=conteo&error=invalid-count-line`);
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("record_inventory_count_line_atomic", {
    p_restaurant_id: parsed.data.restaurantId,
    p_inventory_item_id: parsed.data.inventoryItemId,
    p_counted_stock: parsed.data.countedStock,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=conteo&error=${cashErrorKey(error, "count-line")}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/inventario`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=conteo&line=1`);
}

export async function closeInventoryCountAction(formData: FormData) {
  const parsed = inventoryCountRestaurantSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/inventario?tab=conteo&error=invalid-close-count`);
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("close_inventory_count_atomic", {
    p_restaurant_id: parsed.data.restaurantId,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=conteo&error=${cashErrorKey(error, "close-count")}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/inventario`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=conteo&count=closed`);
}
