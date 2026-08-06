"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteRestaurantAssets, uploadPrivateFile, uploadPublicImage } from "@/lib/supabase/storage";
import { fullPlanKey, fullPlanModules } from "@/lib/billing/full-plan";
import {
  normalizeRestaurantBusinessType,
  normalizeRestaurantCategory,
  restaurantBusinessTypeValues,
} from "@/lib/restaurant-directory-options";
import { platformBillingService } from "@/lib/services/platform-billing.service";
import { ownerBillingService } from "@/lib/services/owner-billing.service";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
import { membershipService } from "@/lib/services/membership.service";
import { sendOrderStatusPush } from "@/lib/services/mobile-push.service";
import { getBranchRequestPaymentSettings, getOwnerBranchLimit } from "@/lib/services/owner-dashboard.service";
import { moduleCatalog } from "@/lib/modules";
import { clearRateLimit, consumeRateLimit } from "@/lib/security/rate-limit";
import { defaultRestaurantPalette } from "@/lib/theme/design-tokens";
import { directionsToMapsUrl, hasValidCoordinates } from "@/lib/utils/google-maps";
import { clampProductImagePosition, clampProductImageZoom } from "@/lib/utils/product-image-fit";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
import { normalizeQrPaymentUrl } from "@/lib/utils/qr-payment";
import { toSlug } from "@/lib/utils/slug";
import type { Json } from "@/types/database.types";
import type { ModuleKey, PlanKey } from "@/types/restaurant.types";
import type { OrderOrigin, OrderStatus } from "@/types/order.types";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

function normalizeDocumentNumber(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function isAdultBirthDate(value: string) {
  const birthDate = new Date(`${value}T00:00:00`);
  if (!value || Number.isNaN(birthDate.getTime())) return false;

  const today = new Date();
  const age = today.getFullYear() - birthDate.getFullYear();
  const hadBirthdayThisYear =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  const adjustedAge = hadBirthdayThisYear ? age : age - 1;
  return adjustedAge >= 18 && adjustedAge <= 120;
}

const createOwnerClientSchema = z.object({
  ownerName: z.string().min(2),
  ownerEmail: z.string().email(),
  ownerPhone: z.string().min(6).max(40),
  ownerDocumentNumber: z.string().min(5).max(40).regex(/^[a-zA-Z0-9.\-]+$/),
  ownerBirthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isAdultBirthDate),
  branchLimit: z.coerce.number().int().positive().default(1),
});

const updateOwnerProfileSchema = z.object({
  fullName: z.string().min(2).max(120),
  phone: z.string().min(6).max(40),
  documentNumber: z.string().min(5).max(40).regex(/^[a-zA-Z0-9.\-]+$/),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isAdultBirthDate),
});

const changeInitialPasswordSchema = z
  .object({
    password: z
      .string()
      .min(12)
      .regex(/[a-z]/)
      .regex(/[A-Z]/)
      .regex(/[0-9]/),
    confirmPassword: z.string().min(12),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
  });

const createRestaurantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  description: z.string().optional(),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  addressReference: z.string().optional(),
  city: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  mapsUrl: z.string().optional(),
  businessType: z.enum(restaurantBusinessTypeValues).default("food"),
  publicCategory: z.string().optional(),
  primaryColor: z.string().default(defaultRestaurantPalette.primaryColor),
  secondaryColor: z.string().default(defaultRestaurantPalette.secondaryColor),
  planKey: z.enum(["basic", "pro", "premium"]).default(fullPlanKey),
  branchUserName: z.string().min(2),
  branchUserEmail: z.string().email(),
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
  businessType: z.enum(restaurantBusinessTypeValues).default("food"),
  publicCategory: z.string().optional(),
  addressReference: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  mapsUrl: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(defaultRestaurantPalette.backgroundColor),
  surfaceColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(defaultRestaurantPalette.surfaceColor),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(defaultRestaurantPalette.textColor),
  mutedColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(defaultRestaurantPalette.mutedColor),
  borderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(defaultRestaurantPalette.borderColor),
  navBackgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(defaultRestaurantPalette.navBackgroundColor),
  navTextColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(defaultRestaurantPalette.navTextColor),
  currentMenuBackgroundImageUrl: z.string().optional(),
  publicBannerSize: z.enum(["compact", "standard", "large"]).default("compact"),
  deliveryEnabled: z.boolean(),
  pickupEnabled: z.boolean(),
  tableOrdersEnabled: z.boolean(),
  inventoryEnabled: z.boolean(),
  cashEnabled: z.boolean(),
  kitchenEnabled: z.boolean(),
  deliveryFee: z.coerce.number().nonnegative().default(0),
  deliveryQrPrepaymentEnabled: z.boolean().default(true),
  farDeliveryDistanceKm: z.coerce.number().min(1).max(100).default(5),
  freeDeliveryFrom: z.coerce.number().nonnegative().optional(),
  minOrderAmount: z.coerce.number().nonnegative().default(0),
  currency: z.string().min(3).max(3).default("BOB"),
  invoiceEnabled: z.boolean().default(false),
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
  ownerName: z.string().optional(),
  ownerEmail: z.string().email().optional().or(z.literal("")),
  ownerPassword: z.string().min(8).optional().or(z.literal("")),
});

export type CreateRestaurantFormState = {
  error?: string;
  redirectTo?: string;
  success?: boolean;
  temporaryPassword?: string;
  values?: Record<string, string>;
};

export type CreateBranchFormState = {
  error?: string;
  redirectTo?: string;
  success?: boolean;
  temporaryPassword?: string;
  values?: Record<string, string>;
};

export type CreateOwnerFormState = {
  error?: string;
  success?: string;
  temporaryPassword?: string;
  values?: Record<string, string>;
};

export type ChangeInitialPasswordFormState = {
  error?: string;
};

export type ResponsibleAccessFormState = {
  error?: string;
  success?: "password-reset" | "deactivated" | "profile-updated" | "reactivated";
  temporaryPassword?: string;
};

type SupabaseAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const createBranchSchema = z.object({
  sourceRestaurantId: z.string().uuid(),
  name: z.string().min(2),
  slug: z.string().optional(),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  addressReference: z.string().optional(),
  city: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  mapsUrl: z.string().optional(),
  branchUserName: z.string().min(2),
  branchUserEmail: z.string().email(),
});

const createAnnouncementSchema = z.object({
  restaurantId: z.string().uuid(),
  restaurantSlug: z.string().min(1).optional(),
  type: z.enum(["announcement", "closure"]).default("announcement"),
  title: z.string().min(3),
  body: z.string().optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().optional(),
});

const closeTodaySchema = z.object({
  restaurantId: z.string().uuid(),
  restaurantSlug: z.string().min(1).optional(),
  title: z.string().min(3).default("Cerrado por hoy"),
  body: z.string().optional(),
});

const announcementIdSchema = z.object({
  restaurantId: z.string().uuid(),
  restaurantSlug: z.string().min(1).optional(),
  announcementId: z.string().uuid(),
});

const updateAnnouncementSchema = announcementIdSchema.extend({
  type: z.enum(["announcement", "closure"]).default("announcement"),
  title: z.string().min(3),
  body: z.string().optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().optional(),
  isActive: z.boolean().default(true),
});

const markInvoiceIssuedSchema = z.object({
  restaurantId: z.string().uuid(),
  orderId: z.string().uuid(),
  invoiceNumber: z.string().optional(),
  invoiceNotes: z.string().optional(),
});

const announcementDeactivateInputSchema = z.object({
  restaurantId: z.string().uuid().optional(),
  restaurantSlug: z.string().min(1).optional(),
  announcementId: z.string().uuid(),
});

const setRestaurantStatusSchema = z.object({
  restaurantId: z.string().uuid(),
  status: z.enum(["active", "inactive", "suspended"]),
});

const setOwnerAccountStatusSchema = z.object({
  ownerUserId: z.string().uuid(),
  restaurantId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
});

const restaurantIdSchema = z.object({
  restaurantId: z.string().uuid(),
});

const permanentDeleteRestaurantSchema = z.object({
  restaurantId: z.string().uuid(),
  confirmationSlug: z.string().min(1),
});

const updatePlanSchema = z.object({
  planId: z.string().uuid(),
  name: z.string().min(2),
  description: z.string().optional(),
  priceMonthly: z.coerce.number().nonnegative(),
  additionalRestaurantPriceMonthly: z.coerce.number().nonnegative(),
  maxRestaurants: z.coerce.number().int().positive(),
  maxUsersPerRestaurant: z.coerce.number().int().positive(),
});

const updateOwnerBranchEntitlementSchema = z.object({
  ownerUserId: z.string().uuid(),
  restaurantId: z.string().uuid(),
  branchLimit: z.coerce.number().int().positive(),
});

const requestOwnerBranchCapacitySchema = z.object({
  restaurantId: z.string().uuid(),
  requestedAdditional: z.coerce.number().int().min(1).max(20),
  reason: z.string().max(1000).optional(),
});

const updateBranchRequestPaymentSettingsSchema = z.object({
  amount: z.coerce.number().nonnegative().default(199),
  currency: z.string().min(3).max(3).default("BOB"),
  currentBranchRequestQrUrl: z.string().optional(),
  qrNote: z.string().max(1000).optional(),
});

const resolveOwnerBranchCapacitySchema = z.object({
  requestId: z.string().uuid(),
  restaurantId: z.string().uuid(),
  approvedLimit: z.coerce.number().int().positive().optional(),
  resolutionNotes: z.string().max(1000).optional(),
  decision: z.enum(["approve", "reject"]),
});

const manageResponsibleAccessSchema = z.object({
  fullName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  restaurantId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  intent: z.enum(["reset-password", "update-profile", "deactivate", "reactivate"]),
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
  inventoryItemId: z.string().uuid().optional().or(z.literal("")),
  inventoryQuantity: z.coerce.number().positive().optional(),
  inventoryWasteFactor: z.coerce.number().nonnegative().default(0),
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
  compareAtPrice: z.coerce.number().nonnegative().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  imagePositionX: z.coerce.number().min(0).max(100).default(50),
  imagePositionY: z.coerce.number().min(0).max(100).default(50),
  imageZoom: z.coerce.number().min(1).max(2).default(1),
  isAvailable: z.coerce.boolean().default(true),
  isFeatured: z.coerce.boolean().default(false),
  trackStock: z.coerce.boolean().default(false),
  productKind: z.enum(["standard", "promotion", "lunch"]).default("standard"),
  availableFrom: z.string().optional(),
  availableUntil: z.string().optional(),
  availableDays: z.array(z.coerce.number().int().min(0).max(6)).optional(),
  availableStartTime: z.string().optional(),
  availableEndTime: z.string().optional(),
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
  source: z.enum(["admin", "kitchen", "pedidos", "caja"]).default("admin"),
  tab: z.enum(["delivery", "recojo", "pedidos"]).optional(),
});

const createDeliveryLinkSchema = z.object({
  restaurantId: z.string().uuid(),
  restaurantSlug: z.string().min(1),
  orderId: z.string().uuid(),
  deliveryPhone: z.string().optional(),
  deliveryName: z.string().optional(),
});

const deliveryZoneSchema = z.object({
  restaurantId: z.string().uuid(),
  zoneId: z.string().uuid().optional(),
  name: z.string().min(2),
  city: z.string().optional(),
  centerLatitude: z.coerce.number().min(-90).max(90).optional(),
  centerLongitude: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(200).default(3),
  deliveryFee: z.coerce.number().nonnegative().default(0),
  minOrderAmount: z.coerce.number().nonnegative().default(0),
});

const deliveryZoneIdSchema = z.object({
  restaurantId: z.string().uuid(),
  zoneId: z.string().uuid(),
});

const paymentMethodSchema = z.enum(["cash", "qr", "bank_transfer", "card", "other"]);
const orderOriginSchema = z.enum(["pos_counter", "table_qr", "web_checkout", "phone_whatsapp", "external_platform"]);

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
  variantId: z.string().uuid().optional(),
  optionIds: z.array(z.string().uuid()).optional().default([]),
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
  customerPhone: z.string().optional(),
  orderOrigin: orderOriginSchema.default("pos_counter"),
  cart: z.array(posCartItemSchema).min(1),
});

const refundOrderSchema = z.object({
  restaurantId: z.string().uuid(),
  orderId: z.string().uuid(),
  restaurantSlug: z.string().min(1).optional(),
  reason: z.string().trim().min(5).max(500),
  source: z.enum(["caja", "pedidos"]).default("pedidos"),
});

const updatePlatformBillingSchema = z.object({
  restaurantId: z.string().uuid(),
  currentPlatformQrUrl: z.string().optional(),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reminderDays: z.coerce.number().int().min(0).max(15).default(4),
  platformQrNote: z.string().optional(),
});

const submitPlatformPaymentProofSchema = z.object({
  restaurantId: z.string().uuid(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});

const resolvePlatformPaymentCycleSchema = z.object({
  restaurantId: z.string().uuid(),
  cycleId: z.string().uuid(),
  notes: z.string().optional(),
});

const updateOwnerBillingSettingsSchema = z.object({
  ownerUserId: z.string().uuid(),
  restaurantId: z.string().uuid(),
  currentOwnerBillingQrUrl: z.string().optional(),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reminderDays: z.coerce.number().int().min(0).max(15).default(4),
  currency: z.string().min(3).max(3).default("BOB"),
  platformQrNote: z.string().optional(),
});

const submitOwnerBillingPaymentProofSchema = z.object({
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});

const resolveOwnerBillingPaymentSchema = z.object({
  ownerUserId: z.string().uuid(),
  restaurantId: z.string().uuid(),
  cycleId: z.string().uuid(),
  notes: z.string().optional(),
});

const createOwnerChangeRequestSchema = z.object({
  restaurantId: z.string().uuid(),
  requestedOwnerName: z.string().min(2),
  requestedOwnerEmail: z.string().email(),
  reason: z.string().optional(),
});

const resolveOwnerChangeRequestSchema = z.object({
  restaurantId: z.string().uuid(),
  requestId: z.string().uuid(),
  notes: z.string().optional(),
});

const createInventoryItemSchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().min(2),
  itemKind: z.enum(["finished", "ingredient", "supply"]).default("ingredient"),
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
  lotCode: z.string().optional(),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});

const transferInventoryZoneSchema = z.object({
  restaurantId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  fromZoneId: z.string().uuid(),
  toZoneId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  reason: z.string().min(2),
});

const transferInventoryBranchSchema = z.object({
  restaurantId: z.string().uuid(),
  targetRestaurantId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  targetInventoryItemId: z.string().uuid(),
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

const supportTicketSchema = z.object({
  restaurantId: z.string().uuid().optional(),
  title: z.string().min(3),
  description: z.string().optional(),
  category: z.enum(["access", "billing", "orders", "cash", "inventory", "incident", "other"]).default("other"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
});

const updateSupportTicketSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(["open", "in_progress", "waiting_customer", "resolved", "closed"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
});

const incidentSchema = z.object({
  restaurantId: z.string().uuid().optional(),
  title: z.string().min(3),
  description: z.string().optional(),
  impactArea: z.enum(["platform", "public_menu", "orders", "cash", "kitchen", "inventory", "storage", "supabase", "other"]).default("platform"),
  severity: z.enum(["minor", "major", "critical"]).default("minor"),
});

const updateIncidentSchema = z.object({
  incidentId: z.string().uuid(),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  severity: z.enum(["minor", "major", "critical"]),
  postmortem: z.string().optional(),
});

const releaseAccessSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

const MAX_SUPPORT_ATTACHMENTS = 5;
const MAX_SUPPORT_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_BRANCH_REQUEST_PAYMENT_PROOF_BYTES = 5 * 1024 * 1024;
const MAX_OWNER_BILLING_PAYMENT_PROOF_BYTES = 5 * 1024 * 1024;

async function modulesForPlan(planKey: PlanKey): Promise<ModuleKey[]> {
  void planKey;
  return fullPlanModules;
}

function restaurantFormValues(formData: FormData): Record<string, string> {
  return {
    name: String(formData.get("name") || ""),
    slug: String(formData.get("slug") || ""),
    description: String(formData.get("description") || ""),
    whatsapp: String(formData.get("whatsapp") || ""),
    address: String(formData.get("address") || ""),
    addressReference: String(formData.get("addressReference") || ""),
    city: String(formData.get("city") || "Cochabamba"),
    latitude: String(formData.get("latitude") || ""),
    longitude: String(formData.get("longitude") || ""),
    mapsUrl: String(formData.get("mapsUrl") || ""),
    businessType: String(formData.get("businessType") || "food"),
    publicCategory: String(formData.get("publicCategory") || ""),
    planKey: String(formData.get("planKey") || fullPlanKey),
    branchUserName: String(formData.get("branchUserName") || ""),
    branchUserEmail: String(formData.get("branchUserEmail") || ""),
    ownerName: String(formData.get("ownerName") || ""),
    ownerEmail: String(formData.get("ownerEmail") || ""),
    ownerPassword: String(formData.get("ownerPassword") || ""),
  };
}

function restaurantFormError(formData: FormData, error: string): CreateRestaurantFormState {
  return {
    error,
    values: restaurantFormValues(formData),
  };
}

function branchFormValues(formData: FormData): Record<string, string> {
  return {
    sourceRestaurantId: String(formData.get("sourceRestaurantId") || ""),
    name: String(formData.get("name") || ""),
    slug: String(formData.get("slug") || ""),
    whatsapp: String(formData.get("whatsapp") || ""),
    address: String(formData.get("address") || ""),
    addressReference: String(formData.get("addressReference") || ""),
    city: String(formData.get("city") || ""),
    latitude: String(formData.get("latitude") || ""),
    longitude: String(formData.get("longitude") || ""),
    mapsUrl: String(formData.get("mapsUrl") || ""),
    branchUserName: String(formData.get("branchUserName") || ""),
    branchUserEmail: String(formData.get("branchUserEmail") || ""),
  };
}

function branchFormError(formData: FormData, error: string): CreateBranchFormState {
  return {
    error,
    values: branchFormValues(formData),
  };
}

function actionErrorDetail(error: { code?: string; message?: string } | null | undefined, fallback: string) {
  if (!error) {
    return fallback;
  }

  return [error.code, error.message].filter(Boolean).join(":") || fallback;
}

function ownerFormValues(formData: FormData): Record<string, string> {
  return {
    ownerName: String(formData.get("ownerName") || ""),
    ownerEmail: String(formData.get("ownerEmail") || ""),
    ownerPhone: String(formData.get("ownerPhone") || ""),
    ownerDocumentNumber: String(formData.get("ownerDocumentNumber") || ""),
    ownerBirthDate: String(formData.get("ownerBirthDate") || ""),
    branchLimit: String(formData.get("branchLimit") || "1"),
  };
}

function ownerFormError(formData: FormData, error: string): CreateOwnerFormState {
  return {
    error,
    values: ownerFormValues(formData),
  };
}

async function ownerEmailAlreadyExists(supabase: Awaited<ReturnType<typeof createClient>>, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const [{ data: existingProfile, error: profileError }, { data: existingRestaurant, error: restaurantError }] = await Promise.all([
    supabase.from("profiles").select("id").eq("email", normalizedEmail).maybeSingle(),
    supabase.from("restaurants").select("id").eq("owner_email", normalizedEmail).is("deleted_at", null).limit(1).maybeSingle(),
  ]);

  if (profileError || restaurantError) {
    throw profileError ?? restaurantError;
  }

  return Boolean(existingProfile || existingRestaurant);
}

async function authUserHasBusinessReferences(admin: SupabaseAdminClient, userId: string) {
  const [{ data: profile, error: profileError }, { data: membership, error: membershipError }, { data: restaurant, error: restaurantError }] =
    await Promise.all([
      admin.from("profiles").select("id").eq("id", userId).maybeSingle(),
      admin.from("restaurant_memberships").select("id").eq("user_id", userId).limit(1).maybeSingle(),
      admin.from("restaurants").select("id").eq("owner_user_id", userId).limit(1).maybeSingle(),
    ]);

  const error = profileError ?? membershipError ?? restaurantError;
  if (error) {
    throw error;
  }

  return Boolean(profile || membership || restaurant);
}

async function findAuthUserIdsByEmail(admin: SupabaseAdminClient, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const userIds = new Set<string>();

  if (!normalizedEmail) {
    return [];
  }

  const { data: profile } = await admin.from("profiles").select("id").eq("email", normalizedEmail).maybeSingle();
  if (profile?.id) {
    userIds.add(profile.id);
  }

  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

    if (error) {
      break;
    }

    for (const authUser of data.users) {
      if (authUser.email?.toLowerCase() === normalizedEmail) {
        userIds.add(authUser.id);
      }
    }

    if (data.users.length < perPage) {
      break;
    }
  }

  return Array.from(userIds);
}

async function findAuthUserByEmail(admin: SupabaseAdminClient, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

    if (error) {
      return null;
    }

    const authUser = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (authUser) {
      return authUser;
    }

    if (data.users.length < perPage) {
      return null;
    }
  }

  return null;
}

async function upsertOwnerBranchEntitlementOrFallback({
  admin,
  ownerUserId,
  branchLimit,
  actorUserId,
  createdBy = false,
}: {
  admin: SupabaseAdminClient;
  ownerUserId: string;
  branchLimit: number;
  actorUserId: string;
  createdBy?: boolean;
}) {
  const { error } = await admin.from("owner_branch_entitlements").upsert(
    {
      owner_user_id: ownerUserId,
      branch_limit: branchLimit,
      ...(createdBy ? { created_by: actorUserId } : {}),
      updated_by: actorUserId,
    },
    { onConflict: "owner_user_id" },
  );

  return error ? (error.code ?? "owner-entitlement") : null;
}

async function collectRestaurantUserIdsForDeletion(admin: SupabaseAdminClient, restaurantId: string) {
  const userIds = new Set<string>();
  const [{ data: restaurant }, { data: memberships }] = await Promise.all([
    admin.from("restaurants").select("owner_user_id,owner_email").eq("id", restaurantId).maybeSingle(),
    admin.from("restaurant_memberships").select("user_id").eq("restaurant_id", restaurantId),
  ]);

  if (restaurant?.owner_user_id) {
    userIds.add(restaurant.owner_user_id);
  }

  for (const membership of memberships ?? []) {
    userIds.add(membership.user_id);
  }

  if (restaurant?.owner_email) {
    const ownerIdsByEmail = await findAuthUserIdsByEmail(admin, restaurant.owner_email);
    for (const userId of ownerIdsByEmail) {
      userIds.add(userId);
    }
  }

  return Array.from(userIds);
}

async function deleteAuthUsersIfUnused(admin: SupabaseAdminClient, userIds: string[], currentUserId: string) {
  let deletedCount = 0;
  let skippedCount = 0;

  for (const userId of Array.from(new Set(userIds))) {
    if (!userId || userId === currentUserId) {
      skippedCount += 1;
      continue;
    }

    const { data: profile } = await admin.from("profiles").select("global_role").eq("id", userId).maybeSingle();
    if (profile?.global_role === "superadmin") {
      skippedCount += 1;
      continue;
    }

    const [{ data: memberships }, { data: ownedRestaurants }] = await Promise.all([
      admin.from("restaurant_memberships").select("restaurant_id").eq("user_id", userId).limit(1),
      admin.from("restaurants").select("id").eq("owner_user_id", userId).limit(1),
    ]);

    if ((memberships?.length ?? 0) > 0 || (ownedRestaurants?.length ?? 0) > 0) {
      skippedCount += 1;
      continue;
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserError && !deleteUserError.message.toLowerCase().includes("not found")) {
      throw new Error(`auth-delete-failed:${deleteUserError.message}`);
    }

    await admin.from("profiles").delete().eq("id", userId);
    deletedCount += 1;
  }

  return { deletedCount, skippedCount };
}

function secureRandomIndex(length: number) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % length;
}

function generateSecurePassword() {
  const groups = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%*?"];
  const allCharacters = groups.join("");
  const password = [
    ...groups.map((group) => group[secureRandomIndex(group.length)]),
    ...Array.from({ length: 14 }, () => allCharacters[secureRandomIndex(allCharacters.length)]),
  ];

  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = secureRandomIndex(index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }

  return password.join("");
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

async function requireRestaurantAccess(restaurantId: string, returnTo?: string) {
  await restaurantAccessService.claimOrRedirect(restaurantId, returnTo ?? `/admin/restaurantes/${restaurantId}/dashboard`);
}

async function requireRestaurantAdminOrSuperadmin(restaurantId: string) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("global_role").eq("id", user.id).maybeSingle();

  if (profile?.global_role === "superadmin") {
    return { supabase, user, isSuperadmin: true };
  }

  const { data: membership } = await supabase
    .from("restaurant_memberships")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .eq("role", "restaurant_admin")
    .maybeSingle();

  if (!membership) {
    redirect(`/admin/restaurantes/${restaurantId}/dashboard?error=admin-required`);
  }

  return { supabase, user, isSuperadmin: false };
}

function redirectWithError(path: string, error: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${error}`);
}

async function requireRestaurantOwnerOrSuperadmin(restaurantId: string, returnTo = `/admin/restaurantes/${restaurantId}/dashboard`) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("global_role").eq("id", user.id).maybeSingle();

  if (profile?.global_role === "superadmin") {
    return { supabase, user, isSuperadmin: true };
  }

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("owner_user_id")
    .eq("id", restaurantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (restaurant?.owner_user_id !== user.id) {
    redirectWithError(returnTo, "owner-required");
  }

  return { supabase, user, isSuperadmin: false };
}

async function requireRestaurantMemberOrSuperadmin(restaurantId: string) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("global_role").eq("id", user.id).maybeSingle();

  if (profile?.global_role === "superadmin") {
    return { supabase, user, isSuperadmin: true };
  }

  const { data: membership } = await supabase
    .from("restaurant_memberships")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership) {
    redirect(`/admin/restaurantes/${restaurantId}/dashboard?error=membership-required`);
  }

  return { supabase, user, isSuperadmin: false };
}

async function getPlanKeyForRestaurant(supabase: Awaited<ReturnType<typeof createClient>>, restaurantId: string): Promise<PlanKey> {
  const { data: subscription } = await supabase
    .from("restaurant_subscriptions")
    .select("plan_id")
    .eq("restaurant_id", restaurantId)
    .in("status", ["trialing", "active", "past_due"])
    .maybeSingle();

  if (!subscription?.plan_id) {
    return fullPlanKey;
  }

  const { data: plan } = await supabase.from("subscription_plans").select("key").eq("id", subscription.plan_id).maybeSingle();
  return (plan?.key as PlanKey | undefined) ?? fullPlanKey;
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

function platformConfigPath(restaurantId: string) {
  return `/admin/restaurantes/${restaurantId}/configuracion?tab=plataforma`;
}

function ownerAccountPath(restaurantId: string) {
  return `/admin/restaurantes/${restaurantId}/cuenta`;
}

async function ensurePlatformPaymentCycle(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  restaurantId: string,
  dueDate: string,
) {
  const { data: existing } = await admin
    .from("restaurant_platform_payment_cycles")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("due_date", dueDate)
    .maybeSingle();

  if (existing) {
    return existing;
  }

  const { data } = await admin
    .from("restaurant_platform_payment_cycles")
    .insert({
      restaurant_id: restaurantId,
      due_date: dueDate,
    })
    .select("*")
    .single();

  return data;
}

async function reactivateRestaurantAfterPlatformPayment(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  restaurantId: string,
) {
  const { data: restaurant } = await admin.from("restaurants").select("status,deactivated_by").eq("id", restaurantId).maybeSingle();
  if (restaurant?.status === "suspended" && !restaurant.deactivated_by) {
    await admin.from("restaurants").update({ status: "active", deactivated_at: null, deactivated_by: null }).eq("id", restaurantId);
  }

  await admin.from("restaurant_subscriptions").update({ status: "active" }).eq("restaurant_id", restaurantId).in("status", ["trialing", "past_due"]);
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

async function updateRestaurantOwnerAccess({
  supabase,
  restaurantId,
  currentOwnerUserId,
  currentOwnerName,
  currentOwnerEmail,
  ownerName,
  ownerEmail,
  ownerPassword,
  fallbackUserId,
  fallbackEmail,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  restaurantId: string;
  currentOwnerUserId?: string | null;
  currentOwnerName?: string | null;
  currentOwnerEmail?: string | null;
  ownerName?: string;
  ownerEmail?: string;
  ownerPassword?: string;
  fallbackUserId: string;
  fallbackEmail: string;
}) {
  const normalizedName = ownerName?.trim() || currentOwnerName?.trim() || "Responsable";
  const normalizedEmail = ownerEmail?.trim().toLowerCase() || currentOwnerEmail?.trim().toLowerCase() || "";

  if (!normalizedEmail) {
    if (ownerPassword) {
      throw new Error("owner-email-required");
    }

    return {
      id: currentOwnerUserId ?? null,
      email: null,
      name: normalizedName,
    };
  }

  const admin = createAdminClient();

  if (!admin) {
    throw new Error("service-role-required");
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id,email,full_name,global_role")
    .eq("email", normalizedEmail)
    .maybeSingle();

  let ownerId = currentOwnerUserId ?? null;

  if (existingProfile && existingProfile.id !== currentOwnerUserId) {
    ownerId = existingProfile.id;

    const updatePayload: {
      password?: string;
      user_metadata?: {
        full_name: string;
      };
    } = {
      user_metadata: {
        full_name: normalizedName,
      },
    };

    if (ownerPassword) {
      updatePayload.password = ownerPassword;
    }

    const { error: updateExistingError } = await admin.auth.admin.updateUserById(existingProfile.id, updatePayload);
    if (updateExistingError) {
      throw updateExistingError;
    }

    await supabase.from("profiles").upsert(
      {
        id: existingProfile.id,
        email: normalizedEmail,
        full_name: normalizedName,
        global_role: existingProfile.global_role,
      },
      { onConflict: "id" },
    );
  } else if (currentOwnerUserId) {
    ownerId = currentOwnerUserId;

    const updatePayload: {
      email?: string;
      email_confirm?: true;
      password?: string;
      user_metadata: {
        full_name: string;
      };
    } = {
      user_metadata: {
        full_name: normalizedName,
      },
    };

    if (normalizedEmail !== currentOwnerEmail?.trim().toLowerCase()) {
      updatePayload.email = normalizedEmail;
      updatePayload.email_confirm = true;
    }

    if (ownerPassword) {
      updatePayload.password = ownerPassword;
    }

    const { error: updateCurrentError } = await admin.auth.admin.updateUserById(currentOwnerUserId, updatePayload);
    if (updateCurrentError) {
      throw updateCurrentError;
    }

    const { data: currentProfile } = await supabase.from("profiles").select("global_role").eq("id", currentOwnerUserId).maybeSingle();

    await supabase.from("profiles").upsert(
      {
        id: currentOwnerUserId,
        email: normalizedEmail,
        full_name: normalizedName,
        global_role: currentProfile?.global_role ?? null,
      },
      { onConflict: "id" },
    );
  } else {
    const owner = await ensureRestaurantOwner({
      supabase,
      fallbackUserId,
      fallbackEmail,
      ownerName: normalizedName,
      ownerEmail: normalizedEmail,
      ownerPassword,
    });

    ownerId = owner.id;
  }

  if (!ownerId) {
    throw new Error("owner-not-found");
  }

  await supabase.from("restaurant_memberships").upsert(
    {
      restaurant_id: restaurantId,
      user_id: ownerId,
      role: "restaurant_admin",
      is_active: true,
    },
    { onConflict: "restaurant_id,user_id,role" },
  );

  return {
    id: ownerId,
    email: normalizedEmail,
    name: normalizedName,
  };
}

async function getOwnerBranchQuota(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  ownerUserId: string,
) {
  const [membershipsResult, entitlementResult] = await Promise.all([
    admin
      .from("restaurant_memberships")
      .select("restaurant_id")
      .eq("user_id", ownerUserId)
      .eq("role", "restaurant_admin")
      .eq("is_active", true),
    admin.from("owner_branch_entitlements").select("branch_limit").eq("owner_user_id", ownerUserId).maybeSingle(),
  ]);
  throwIfSupabaseError(membershipsResult, "owner-memberships-read");
  throwIfSupabaseError(entitlementResult, "owner-entitlement-read");

  const memberships = membershipsResult.data;
  const membershipRestaurantIds = Array.from(new Set((memberships ?? []).map((membership) => membership.restaurant_id)));
  const limit = Math.max(1, Number(entitlementResult.data?.branch_limit ?? 1));

  if (!membershipRestaurantIds.length) {
    return { used: 0, limit };
  }

  const { data: restaurants } = await admin
    .from("restaurants")
    .select("id")
    .in("id", membershipRestaurantIds)
    .is("deleted_at", null);

  const nonArchivedRestaurantIds = (restaurants ?? []).map((restaurant) => restaurant.id);
  return { used: nonArchivedRestaurantIds.length, limit };
}

function throwIfSupabaseError(result: { error: { code?: string; message: string } | null }, operation: string) {
  if (result.error) {
    throw new Error(`${operation}:${result.error.code ?? result.error.message}`);
  }
}

async function cloneBranchCatalog(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  sourceRestaurantId: string,
  targetRestaurantId: string,
) {
  const categoriesResult = await admin
    .from("categories")
    .select("id,name,description,image_url,sort_order,is_active")
    .eq("restaurant_id", sourceRestaurantId)
    .order("sort_order");
  throwIfSupabaseError(categoriesResult, "categories-read");
  const categories = categoriesResult.data;

  const categoryIdMap = new Map<string, string>();
  const categoryRows = (categories ?? []).map((category) => {
    const id = crypto.randomUUID();
    categoryIdMap.set(category.id, id);
    return {
      id,
      restaurant_id: targetRestaurantId,
      name: category.name,
      description: category.description,
      image_url: category.image_url,
      sort_order: category.sort_order,
      is_active: category.is_active,
    };
  });

  if (categoryRows.length) {
    throwIfSupabaseError(await admin.from("categories").insert(categoryRows), "categories-clone");
  }

  const productsResult = await admin
    .from("products")
    .select("id,category_id,name,description,price,image_url,image_position_x,image_position_y,image_zoom,is_available,is_featured,track_stock,sort_order")
    .eq("restaurant_id", sourceRestaurantId)
    .order("sort_order");
  throwIfSupabaseError(productsResult, "products-read");
  const products = productsResult.data;

  const productIdMap = new Map<string, string>();
  const productRows = (products ?? []).map((product) => {
    const id = crypto.randomUUID();
    productIdMap.set(product.id, id);
    return {
      id,
      restaurant_id: targetRestaurantId,
      category_id: product.category_id ? (categoryIdMap.get(product.category_id) ?? null) : null,
      name: product.name,
      description: product.description,
      price: product.price,
      image_url: product.image_url,
      image_position_x: product.image_position_x,
      image_position_y: product.image_position_y,
      image_zoom: product.image_zoom,
      is_available: product.is_available,
      is_featured: product.is_featured,
      track_stock: product.track_stock,
      sort_order: product.sort_order,
    };
  });

  if (productRows.length) {
    throwIfSupabaseError(await admin.from("products").insert(productRows), "products-clone");
  }

  const variantsResult = await admin
    .from("product_variants")
    .select("product_id,name,description,price_delta,sort_order,is_active")
    .eq("restaurant_id", sourceRestaurantId)
    .order("sort_order");
  throwIfSupabaseError(variantsResult, "variants-read");
  const variants = variantsResult.data;

  const variantRows = (variants ?? [])
    .map((variant) => {
      const productId = productIdMap.get(variant.product_id);
      return productId
        ? {
            restaurant_id: targetRestaurantId,
            product_id: productId,
            name: variant.name,
            description: variant.description,
            price_delta: variant.price_delta,
            sort_order: variant.sort_order,
            is_active: variant.is_active,
          }
        : null;
    })
    .filter(Boolean);

  if (variantRows.length) {
    throwIfSupabaseError(await admin.from("product_variants").insert(variantRows), "variants-clone");
  }

  const optionGroupsResult = await admin
    .from("product_option_groups")
    .select("id,product_id,name,description,min_choices,max_choices,is_required,sort_order,is_active")
    .eq("restaurant_id", sourceRestaurantId)
    .order("sort_order");
  throwIfSupabaseError(optionGroupsResult, "option-groups-read");
  const optionGroups = optionGroupsResult.data;

  const optionGroupIdMap = new Map<string, string>();
  const optionGroupRows = (optionGroups ?? [])
    .map((group) => {
      const productId = productIdMap.get(group.product_id);
      if (!productId) {
        return null;
      }

      const id = crypto.randomUUID();
      optionGroupIdMap.set(group.id, id);
      return {
        id,
        restaurant_id: targetRestaurantId,
        product_id: productId,
        name: group.name,
        description: group.description,
        min_choices: group.min_choices,
        max_choices: group.max_choices,
        is_required: group.is_required,
        sort_order: group.sort_order,
        is_active: group.is_active,
      };
    })
    .filter(Boolean);

  if (optionGroupRows.length) {
    throwIfSupabaseError(await admin.from("product_option_groups").insert(optionGroupRows), "option-groups-clone");
  }

  const optionsResult = await admin
    .from("product_options")
    .select("product_id,option_group_id,name,description,price_delta,sort_order,is_active")
    .eq("restaurant_id", sourceRestaurantId)
    .order("sort_order");
  throwIfSupabaseError(optionsResult, "options-read");
  const options = optionsResult.data;

  const optionRows = (options ?? [])
    .map((option) => {
      const productId = productIdMap.get(option.product_id);
      const optionGroupId = optionGroupIdMap.get(option.option_group_id);
      return productId && optionGroupId
        ? {
            restaurant_id: targetRestaurantId,
            product_id: productId,
            option_group_id: optionGroupId,
            name: option.name,
            description: option.description,
            price_delta: option.price_delta,
            sort_order: option.sort_order,
            is_active: option.is_active,
          }
        : null;
    })
    .filter(Boolean);

  if (optionRows.length) {
    throwIfSupabaseError(await admin.from("product_options").insert(optionRows), "options-clone");
  }
}

async function cloneBranchRuntimeSettings(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  sourceRestaurantId: string,
  targetRestaurantId: string,
) {
  const [settingsResult, hoursResult, subscriptionResult] = await Promise.all([
    admin.from("restaurant_settings").select("*").eq("restaurant_id", sourceRestaurantId).maybeSingle(),
    admin.from("business_hours").select("day_of_week,opens_at,closes_at,is_closed").eq("restaurant_id", sourceRestaurantId),
    admin
      .from("restaurant_subscriptions")
      .select("plan_id,status")
      .eq("restaurant_id", sourceRestaurantId)
      .in("status", ["trialing", "active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  throwIfSupabaseError(settingsResult, "settings-read");
  throwIfSupabaseError(hoursResult, "hours-read");
  throwIfSupabaseError(subscriptionResult, "subscription-read");
  const settings = settingsResult.data;
  const hours = hoursResult.data;
  const subscription = subscriptionResult.data;

  if (settings) {
    throwIfSupabaseError(await admin.from("restaurant_settings").insert({
      restaurant_id: targetRestaurantId,
      delivery_enabled: true,
      pickup_enabled: true,
      table_orders_enabled: true,
      inventory_enabled: true,
      cash_enabled: true,
      kitchen_enabled: true,
      delivery_fee: settings.delivery_fee,
      delivery_qr_prepayment_enabled: settings.delivery_qr_prepayment_enabled ?? true,
      far_delivery_distance_km: settings.far_delivery_distance_km ?? 5,
      free_delivery_from: settings.free_delivery_from,
      min_order_amount: settings.min_order_amount,
      currency: settings.currency,
      invoice_enabled: settings.invoice_enabled,
      qr_payment_url: settings.qr_payment_url,
      qr_account_name: settings.qr_account_name,
      qr_account_document: settings.qr_account_document,
      qr_bank_name: settings.qr_bank_name,
      qr_account_type: settings.qr_account_type,
      qr_currency: settings.qr_currency,
      print_format: settings.print_format,
      auto_print_kitchen: settings.auto_print_kitchen,
      print_logo: settings.print_logo,
    }), "settings-clone");
  } else {
    throwIfSupabaseError(await admin.from("restaurant_settings").insert({
      restaurant_id: targetRestaurantId,
      delivery_enabled: true,
      pickup_enabled: true,
      table_orders_enabled: true,
      inventory_enabled: true,
      cash_enabled: true,
      kitchen_enabled: true,
      delivery_fee: 0,
      delivery_qr_prepayment_enabled: true,
      far_delivery_distance_km: 5,
      min_order_amount: 0,
      currency: "BOB",
    }), "settings-create");
  }

  const moduleRows = fullPlanModules.map((moduleKey) => ({
    restaurant_id: targetRestaurantId,
    module_key: moduleKey,
    is_enabled: true,
  }));

  if (moduleRows.length) {
    throwIfSupabaseError(await admin.from("module_settings").insert(moduleRows), "modules-clone");
  }

  const hourRows = (hours ?? []).map((hour) => ({
    restaurant_id: targetRestaurantId,
    day_of_week: hour.day_of_week,
    opens_at: hour.opens_at,
    closes_at: hour.closes_at,
    is_closed: hour.is_closed,
  }));

  if (hourRows.length) {
    throwIfSupabaseError(await admin.from("business_hours").insert(hourRows), "hours-clone");
  }

  if (subscription) {
    throwIfSupabaseError(await admin.from("restaurant_subscriptions").insert({
      restaurant_id: targetRestaurantId,
      plan_id: subscription.plan_id,
      status: subscription.status,
    }), "subscription-clone");
  }
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
    revalidatePath(publicRestaurantPath(restaurantSlug));
    revalidatePath(publicRestaurantPath(restaurantSlug, "seguimiento"));
    revalidatePath(`/r/${restaurantSlug}`);
    revalidatePath(`/r/${restaurantSlug}/seguimiento`);
  }
}

function booleanFromForm(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function adminReturnTo(formData: FormData, fallback: string) {
  const value = String(formData.get("returnTo") || "");
  return value.startsWith("/admin") ? value : fallback;
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

function parseProductDays(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
}

async function revalidateRestaurantCatalogPaths(restaurantId: string, admin?: NonNullable<ReturnType<typeof createAdminClient>>) {
  revalidatePath(`/admin/restaurantes/${restaurantId}/categorias`);
  revalidatePath(`/admin/restaurantes/${restaurantId}/productos`);
  revalidatePath("/", "layout");
  revalidatePath("/r", "layout");

  if (!admin) {
    return;
  }

  const { data: restaurant } = await admin.from("restaurants").select("slug").eq("id", restaurantId).maybeSingle();
  const restaurantSlug = restaurant?.slug;
  if (!restaurantSlug) {
    return;
  }

  revalidatePath(publicRestaurantPath(restaurantSlug));
  revalidatePath(`/r/${restaurantSlug}`);
}

function optionalDateTimeInputToIso(value?: string) {
  if (!value?.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function optionalDateTimeInputToDate(value?: string) {
  const normalized = value?.trim();
  if (!normalized) {
    return { date: null, invalid: false };
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
    return { date: null, invalid: true };
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? { date: null, invalid: true } : { date, invalid: false };
}

function optionalTimeInput(value?: string) {
  const normalized = value?.trim();
  return normalized && /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : null;
}

function timeInputToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function validateProductScheduleInput({
  availableFrom,
  availableUntil,
  availableStartTime,
  availableEndTime,
}: {
  availableFrom?: string;
  availableUntil?: string;
  availableStartTime?: string;
  availableEndTime?: string;
}) {
  const from = optionalDateTimeInputToDate(availableFrom);
  const until = optionalDateTimeInputToDate(availableUntil);

  if (from.invalid || until.invalid) {
    return "invalid";
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  if ((from.date && from.date < todayStart) || (until.date && until.date < todayStart)) {
    return "schedule-past";
  }

  if (from.date && until.date && until.date <= from.date) {
    return "schedule-order";
  }

  const start = optionalTimeInput(availableStartTime);
  const end = optionalTimeInput(availableEndTime);
  if ((availableStartTime && !start) || (availableEndTime && !end)) {
    return "invalid";
  }

  if (start && end && timeInputToMinutes(end) <= timeInputToMinutes(start)) {
    return "time-order";
  }

  return null;
}

async function redirectAfterAuthenticatedUser(userId: string): Promise<never> {
  const supabase = await createClient();
  const [{ data: profile }, { data: customerProfile }] = await Promise.all([
    supabase.from("profiles").select("global_role").eq("id", userId).maybeSingle(),
    supabase.from("customer_profiles").select("id").eq("id", userId).maybeSingle(),
  ]);

  if (!profile && customerProfile) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=customer-account");
  }

  if (profile?.global_role === "superadmin") {
    redirect("/admin");
  }

  const memberships = await membershipService.listActiveRestaurantsForUser(userId);
  const fallbackMemberships = memberships.length ? memberships : await membershipService.listRestaurantsForUser(userId);
  const isOwner = fallbackMemberships.some((membership) => membership.role === "restaurant_admin" && membership.restaurant.ownerUserId === userId);

  if (isOwner || memberships.length === 0) {
    if (!isOwner && fallbackMemberships.length > 0) {
      redirect("/admin?error=restaurant-suspended");
    }
    redirect("/dueno");
  }

  if (memberships.length === 1) {
    redirect(`/admin/restaurantes/${memberships[0].restaurant.id}/dashboard`);
  }

  redirect("/admin");
}

export async function signInAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/admin/login?error=invalid");
  }

  const loginRateLimit = await consumeRateLimit({
    scope: "admin-login",
    identity: parsed.data.email,
    maxAttempts: 8,
    windowSeconds: 15 * 60,
    blockSeconds: 15 * 60,
  });

  if (!loginRateLimit.allowed) {
    redirect("/admin/login?error=rate-limit");
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

  await clearRateLimit("admin-login", loginRateLimit.identifierHash);

  if (user.user_metadata?.must_change_password === true) {
    redirect("/admin/cambiar-contrasena");
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/dueno", "layout");
  await redirectAfterAuthenticatedUser(user.id);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.rpc("release_all_restaurant_access_sessions", {
    p_reason: "Cierre de sesión",
  });
  await supabase.auth.signOut();
  revalidatePath("/admin", "layout");
  redirect("/admin/login");
}

export async function changeInitialPasswordAction(
  _state: ChangeInitialPasswordFormState,
  formData: FormData,
): Promise<ChangeInitialPasswordFormState> {
  const parsed = changeInitialPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    redirect("/admin/login?error=session");
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: {
      ...(user.user_metadata ?? {}),
      must_change_password: false,
      password_changed_at: new Date().toISOString(),
    },
  });

  if (error) {
    return { error: "update" };
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/dueno", "layout");
  await redirectAfterAuthenticatedUser(user.id);
  return { error: "update" };
}

export async function setRestaurantStatusAction(formData: FormData) {
  const returnTo = adminReturnTo(formData, "/admin/restaurantes");
  const parsed = setRestaurantStatusSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=invalid-status`);
  }

  const { supabase } = await requireSuperadmin();
  const { error } = await supabase.rpc("set_restaurant_status", {
    p_restaurant_id: parsed.data.restaurantId,
    p_status: parsed.data.status,
  });

  if (error) {
    redirect(`${returnTo}?error=${error.code}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/restaurantes");
  revalidatePath("/admin/restauracion");
  redirect(`${returnTo}?status=1`);
}

export async function setOwnerAccountStatusAction(formData: FormData) {
  const fallbackRestaurantId = String(formData.get("restaurantId") || "");
  const returnTo = adminReturnTo(formData, fallbackRestaurantId ? `/admin/restaurantes/${fallbackRestaurantId}/cuenta` : "/admin/restaurantes");
  const parsed = setOwnerAccountStatusSchema.safeParse({
    ownerUserId: formData.get("ownerUserId"),
    restaurantId: formData.get("restaurantId"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=invalid-owner-account-status`);
  }

  const { supabase, user } = await requireSuperadmin();
  const { data: restaurants, error: readError } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_user_id", parsed.data.ownerUserId)
    .is("deleted_at", null);

  if (readError) {
    redirect(`${returnTo}?error=${readError.code}`);
  }

  if (!restaurants?.length) {
    redirect(`${returnTo}?error=owner-account-empty`);
  }

  const now = new Date().toISOString();
  const restaurantIds = restaurants.map((restaurant) => restaurant.id);
  const { error } = await supabase
    .from("restaurants")
    .update({
      status: parsed.data.status,
      deactivated_at: parsed.data.status === "active" ? null : now,
      deactivated_by: parsed.data.status === "active" ? null : user.id,
      updated_at: now,
    })
    .eq("owner_user_id", parsed.data.ownerUserId)
    .is("deleted_at", null);

  if (error) {
    redirect(`${returnTo}?error=${error.code}`);
  }

  if (parsed.data.status === "suspended") {
    await supabase
      .from("restaurant_access_sessions")
      .update({
        status: "released",
        released_at: now,
        release_reason: "Cuenta suspendida por superadmin",
      })
      .in("restaurant_id", restaurantIds)
      .eq("status", "active");
  }

  await supabase.rpc("write_admin_audit", {
    p_action: parsed.data.status === "active" ? "owner_account_reactivated" : "owner_account_suspended",
    p_entity_type: "owner_account",
    p_entity_id: parsed.data.ownerUserId,
    p_restaurant_id: parsed.data.restaurantId,
    p_severity: parsed.data.status === "active" ? "warning" : "critical",
    p_metadata: {
      affected_restaurant_ids: restaurantIds,
      status: parsed.data.status,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/restaurantes");
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/cuenta`);
  revalidatePath("/dueno");
  revalidatePath("/dueno/sucursales");
  redirect(`${returnTo}?account=${parsed.data.status}`);
}

export async function archiveRestaurantAction(formData: FormData) {
  const returnTo = adminReturnTo(formData, "/admin/restaurantes");
  const parsed = restaurantIdSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=invalid-restaurant`);
  }

  const { supabase } = await requireSuperadmin();
  const { error } = await supabase.rpc("archive_restaurant", {
    p_restaurant_id: parsed.data.restaurantId,
  });

  if (error) {
    redirect(`${returnTo}?error=${error.code}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/restaurantes");
  revalidatePath("/admin/restauracion");
  redirect(`${returnTo}?archived=1`);
}

export async function restoreRestaurantAction(formData: FormData) {
  const returnTo = adminReturnTo(formData, "/admin/restauracion");
  const parsed = restaurantIdSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=invalid-restaurant`);
  }

  const { supabase } = await requireSuperadmin();
  const { error } = await supabase.rpc("restore_restaurant", {
    p_restaurant_id: parsed.data.restaurantId,
  });

  if (error) {
    redirect(`${returnTo}?error=${error.code}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/restaurantes");
  revalidatePath("/admin/restauracion");
  redirect(`${returnTo}?restored=1`);
}

export async function permanentlyDeleteRestaurantAction(formData: FormData) {
  const returnTo = adminReturnTo(formData, "/admin/restauracion");
  const parsed = permanentDeleteRestaurantSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    confirmationSlug: formData.get("confirmationSlug"),
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=invalid-delete`);
  }

  const { supabase, user } = await requireSuperadmin();
  const admin = createAdminClient();

  if (!admin) {
    redirect(`${returnTo}?error=service-role-required`);
  }

  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id,slug,deleted_at")
    .eq("id", parsed.data.restaurantId)
    .maybeSingle();

  if (restaurantError || !restaurant) {
    redirect(`${returnTo}?error=restaurant-not-found`);
  }

  if (!restaurant.deleted_at) {
    redirect(`${returnTo}?error=archive-required`);
  }

  const authUserIdsForCleanup = await collectRestaurantUserIdsForDeletion(admin, restaurant.id);

  await deleteRestaurantAssets(restaurant.id, restaurant.slug);

  const { error } = await supabase.rpc("permanently_delete_restaurant", {
    p_restaurant_id: parsed.data.restaurantId,
    p_confirmation_slug: parsed.data.confirmationSlug,
  });

  if (error) {
    redirect(`${returnTo}?error=${error.code}`);
  }

  let authUsersDeleted = 0;
  try {
    const cleanup = await deleteAuthUsersIfUnused(admin, authUserIdsForCleanup, user.id);
    authUsersDeleted = cleanup.deletedCount;
  } catch {
    redirect(`${returnTo}?deleted=1&auth_cleanup=failed`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/restaurantes");
  revalidatePath("/admin/restauracion");
  redirect(`${returnTo}?deleted=1&authUsersDeleted=${authUsersDeleted}`);
}

export async function createSupportTicketAction(formData: FormData) {
  const branchName = String(formData.get("branchName") || "").trim();
  const branchCity = String(formData.get("branchCity") || "").trim();
  const branchAddress = String(formData.get("branchAddress") || "").trim();
  const branchDetails = [
    branchName ? `Sucursal solicitada: ${branchName}` : "",
    branchCity ? `Ciudad: ${branchCity}` : "",
    branchAddress ? `Direccion/zona: ${branchAddress}` : "",
  ].filter(Boolean);
  const rawDescription = String(formData.get("description") || "").trim();
  const description = [...branchDetails, rawDescription].filter(Boolean).join("\n\n");
  const parsed = supportTicketSchema.safeParse({
    restaurantId: formData.get("restaurantId") || undefined,
    title: formData.get("title"),
    description: description || undefined,
    category: formData.get("category") || "other",
    priority: formData.get("priority") || "medium",
  });

  if (!parsed.success) {
    const restaurantId = String(formData.get("restaurantId") || "");
    const fallbackPath = restaurantId ? `/admin/restaurantes/${restaurantId}/soporte` : "/admin/soporte";
    redirect(`${fallbackPath}?error=invalid-ticket`);
  }

  const attachmentEntries = formData.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const files = attachmentEntries.slice(0, MAX_SUPPORT_ATTACHMENTS);

  if (attachmentEntries.length > MAX_SUPPORT_ATTACHMENTS || files.some((file) => !file.type.startsWith("image/") || file.size > MAX_SUPPORT_ATTACHMENT_BYTES)) {
    const invalidPath = parsed.data.restaurantId
      ? `/admin/restaurantes/${parsed.data.restaurantId}/soporte`
      : "/admin/soporte";
    redirect(`${invalidPath}?error=invalid-attachment`);
  }

  const authResult = parsed.data.restaurantId
    ? await requireRestaurantMemberOrSuperadmin(parsed.data.restaurantId)
    : { ...(await requireSuperadmin()), isSuperadmin: true };
  const { supabase, user, isSuperadmin } = authResult;
  const returnTo = adminReturnTo(formData, parsed.data.restaurantId && !isSuperadmin ? `/admin/restaurantes/${parsed.data.restaurantId}/soporte` : "/admin/soporte");
  const { data: restaurant } = parsed.data.restaurantId
    ? await supabase.from("restaurants").select("name").eq("id", parsed.data.restaurantId).maybeSingle()
    : { data: null };

  if (!isSuperadmin && !parsed.data.restaurantId) {
    redirect("/admin/soporte?error=restaurant-required");
  }

  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .insert({
      restaurant_id: parsed.data.restaurantId,
      restaurant_name_snapshot: restaurant?.name ?? null,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      category: parsed.data.category,
      priority: parsed.data.priority,
      status: "open",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !ticket) {
    redirect(`${returnTo}?error=${error?.code ?? "ticket-create"}`);
  }

  if (files.length) {
    const attachmentRows = [];

    for (const file of files) {
      const folder = parsed.data.restaurantId ? `restaurants/${parsed.data.restaurantId}/support/${ticket.id}` : `platform/support/${ticket.id}`;
      const fileUrl = await uploadPrivateFile(file, folder);

      if (!fileUrl) {
        continue;
      }

      attachmentRows.push({
        ticket_id: ticket.id,
        restaurant_id: parsed.data.restaurantId ?? null,
        file_url: fileUrl,
        file_name: file.name,
        file_size: file.size,
        uploaded_by: user.id,
      });
    }

    if (attachmentRows.length) {
      const { error: attachmentError } = await supabase.from("support_ticket_attachments").insert(attachmentRows);

      if (attachmentError) {
        redirect(`${returnTo}?error=${attachmentError.code}`);
      }
    }
  }

  await supabase.rpc("write_admin_audit", {
    p_action: "support_ticket_created",
    p_entity_type: "support_ticket",
    p_entity_id: ticket.id,
    p_restaurant_id: parsed.data.restaurantId ?? null,
    p_severity: parsed.data.priority === "urgent" ? "critical" : "info",
    p_metadata: { title: parsed.data.title, priority: parsed.data.priority },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/soporte");
  if (parsed.data.restaurantId) {
    revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/soporte`);
    revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}`);
  }
  redirect(`${returnTo}?ticket=1`);
}

export async function updateSupportTicketAction(formData: FormData) {
  const parsed = updateSupportTicketSchema.safeParse({
    ticketId: formData.get("ticketId"),
    status: formData.get("status"),
    priority: formData.get("priority"),
  });

  if (!parsed.success) {
    redirect("/admin/soporte?error=invalid-ticket-update");
  }

  const { supabase, user } = await requireSuperadmin();
  const returnTo = adminReturnTo(formData, "/admin/soporte");
  const closed = parsed.data.status === "resolved" || parsed.data.status === "closed";
  const { data: updatedTicket, error } = await supabase
    .from("support_tickets")
    .update({
      status: parsed.data.status,
      priority: parsed.data.priority,
      first_response_at: parsed.data.status === "in_progress" ? new Date().toISOString() : undefined,
      resolved_at: closed ? new Date().toISOString() : null,
      resolved_by: closed ? user.id : null,
    })
    .eq("id", parsed.data.ticketId)
    .select("restaurant_id")
    .single();

  if (error) {
    redirect(`${returnTo}?error=${error.code}`);
  }

  await supabase.rpc("write_admin_audit", {
    p_action: "support_ticket_updated",
    p_entity_type: "support_ticket",
    p_entity_id: parsed.data.ticketId,
    p_severity: "info",
    p_metadata: { status: parsed.data.status, priority: parsed.data.priority },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/soporte");
  if (updatedTicket?.restaurant_id) {
    revalidatePath(`/admin/restaurantes/${updatedTicket.restaurant_id}/soporte`);
    revalidatePath(`/admin/restaurantes/${updatedTicket.restaurant_id}`);
  }
  redirect(`${returnTo}?updated=1`);
}

export async function createIncidentAction(formData: FormData) {
  const parsed = incidentSchema.safeParse({
    restaurantId: formData.get("restaurantId") || undefined,
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    impactArea: formData.get("impactArea") || "platform",
    severity: formData.get("severity") || "minor",
  });

  if (!parsed.success) {
    redirect("/admin/incidencias?error=invalid-incident");
  }

  const { supabase, user } = await requireSuperadmin();
  const { data: restaurant } = parsed.data.restaurantId
    ? await supabase.from("restaurants").select("name").eq("id", parsed.data.restaurantId).maybeSingle()
    : { data: null };
  const { data: incident, error } = await supabase
    .from("platform_incidents")
    .insert({
      affected_restaurant_id: parsed.data.restaurantId,
      affected_restaurant_snapshot: restaurant?.name ?? null,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      impact_area: parsed.data.impactArea,
      severity: parsed.data.severity,
      status: "investigating",
      reported_by: user.id,
    })
    .select("id")
    .single();

  if (error || !incident) {
    redirect(`/admin/incidencias?error=${error?.code ?? "incident-create"}`);
  }

  await supabase.rpc("write_admin_audit", {
    p_action: "incident_created",
    p_entity_type: "platform_incident",
    p_entity_id: incident.id,
    p_restaurant_id: parsed.data.restaurantId ?? null,
    p_severity: parsed.data.severity === "critical" ? "critical" : "warning",
    p_metadata: { title: parsed.data.title, impactArea: parsed.data.impactArea, severity: parsed.data.severity },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/incidencias");
  redirect("/admin/incidencias?incident=1");
}

export async function updateIncidentAction(formData: FormData) {
  const parsed = updateIncidentSchema.safeParse({
    incidentId: formData.get("incidentId"),
    status: formData.get("status"),
    severity: formData.get("severity"),
    postmortem: formData.get("postmortem") || undefined,
  });

  if (!parsed.success) {
    redirect("/admin/incidencias?error=invalid-incident-update");
  }

  const { supabase, user } = await requireSuperadmin();
  const resolved = parsed.data.status === "resolved";
  const { error } = await supabase
    .from("platform_incidents")
    .update({
      status: parsed.data.status,
      severity: parsed.data.severity,
      postmortem: parsed.data.postmortem ?? null,
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? user.id : null,
    })
    .eq("id", parsed.data.incidentId);

  if (error) {
    redirect(`/admin/incidencias?error=${error.code}`);
  }

  await supabase.rpc("write_admin_audit", {
    p_action: "incident_updated",
    p_entity_type: "platform_incident",
    p_entity_id: parsed.data.incidentId,
    p_severity: parsed.data.severity === "critical" ? "critical" : "warning",
    p_metadata: { status: parsed.data.status, severity: parsed.data.severity },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/incidencias");
  redirect("/admin/incidencias?updated=1");
}

export async function releaseAccessSessionByIdAction(formData: FormData) {
  const parsed = releaseAccessSessionSchema.safeParse({
    sessionId: formData.get("sessionId"),
  });

  if (!parsed.success) {
    redirect("/admin/soporte?error=invalid-session");
  }

  const { supabase } = await requireSuperadmin();
  const { error } = await supabase.rpc("release_restaurant_access_session_by_id", {
    p_session_id: parsed.data.sessionId,
    p_reason: "Liberada desde soporte",
  });

  if (error) {
    redirect(`/admin/soporte?error=${error.code}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/soporte");
  redirect("/admin/soporte?released=1");
}

export async function releaseCurrentRestaurantAccessAction(formData: FormData) {
  const returnTo = adminReturnTo(formData, "/admin");
  const parsed = restaurantIdSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
  });

  if (!parsed.success) {
    redirect("/admin?error=invalid-session-release");
  }

  await restaurantAccessService.release(parsed.data.restaurantId, "Liberada para cambiar de restaurante");
  revalidatePath("/admin", "layout");
  redirect(returnTo);
}

export async function updatePlanAction(formData: FormData) {
  const parsed = updatePlanSchema.safeParse({
    planId: formData.get("planId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    priceMonthly: formData.get("priceMonthly") || 0,
    additionalRestaurantPriceMonthly: formData.get("additionalRestaurantPriceMonthly") || 0,
    maxRestaurants: formData.get("maxRestaurants") || 1,
    maxUsersPerRestaurant: formData.get("maxUsersPerRestaurant") || 1,
  });

  if (!parsed.success) {
    redirect("/admin/planes?error=invalid-plan");
  }

  const { supabase } = await requireSuperadmin();
  const { error: planError } = await supabase
    .from("subscription_plans")
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      price_monthly: parsed.data.priceMonthly,
      additional_restaurant_price_monthly: parsed.data.additionalRestaurantPriceMonthly,
      max_restaurants: parsed.data.maxRestaurants,
      max_users_per_restaurant: parsed.data.maxUsersPerRestaurant,
      is_active: true,
    })
    .eq("id", parsed.data.planId);

  if (planError) {
    redirect(`/admin/planes?error=${planError.code}`);
  }

  const moduleRows = moduleCatalog.map((module) => ({
    plan_id: parsed.data.planId,
    module_key: module.key,
    is_enabled: true,
  }));
  const { error: moduleError } = await supabase.from("plan_modules").upsert(moduleRows, { onConflict: "plan_id,module_key" });

  if (moduleError) {
    redirect(`/admin/planes?error=${moduleError.code}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/planes");
  revalidatePath("/admin/restaurantes", "layout");
  redirect("/admin/planes?plans=1");
}

export async function updateOwnerBranchEntitlementAction(formData: FormData) {
  const parsed = updateOwnerBranchEntitlementSchema.safeParse({
    ownerUserId: formData.get("ownerUserId"),
    restaurantId: formData.get("restaurantId"),
    branchLimit: formData.get("branchLimit") || 1,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/cuenta?error=invalid-entitlement`);
  }

  const { user } = await requireSuperadmin();
  const admin = createAdminClient();

  if (!admin) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/cuenta?error=service-role-required`);
  }

  const error = await upsertOwnerBranchEntitlementOrFallback({
    admin,
    ownerUserId: parsed.data.ownerUserId,
    branchLimit: parsed.data.branchLimit,
    actorUserId: user.id,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/cuenta?error=${error}`);
  }

  revalidatePath("/admin/restaurantes");
  revalidatePath("/admin/soporte");
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/cuenta`);
  revalidatePath("/dueno");
  revalidatePath("/dueno/plan");
  revalidatePath("/dueno/sucursales");
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/cuenta?saved=cupos`);
}

export async function updateBranchRequestPaymentSettingsAction(formData: FormData) {
  const parsed = updateBranchRequestPaymentSettingsSchema.safeParse({
    amount: formData.get("amount") || 199,
    currency: formData.get("currency") || "BOB",
    currentBranchRequestQrUrl: formData.get("currentBranchRequestQrUrl") || undefined,
    qrNote: formData.get("qrNote") || undefined,
  });

  if (!parsed.success) {
    redirect("/admin/soporte?tab=solicitudes&error=invalid-branch-payment-settings");
  }

  const { user } = await requireSuperadmin();
  const admin = createAdminClient();

  if (!admin) {
    redirect("/admin/soporte?tab=solicitudes&error=service-role-required");
  }

  let qrUrl: string | null = parsed.data.currentBranchRequestQrUrl ?? null;

  try {
    qrUrl = (await uploadPublicImage(formData.get("branchRequestQrFile") as File | null, "platform/branch-requests/qr")) ?? qrUrl;
  } catch {
    redirect("/admin/soporte?tab=solicitudes&error=branch-request-qr-upload");
  }

  const { error } = await admin.from("platform_branch_request_payment_settings").upsert(
    {
      id: true,
      amount: parsed.data.amount,
      currency: parsed.data.currency.toUpperCase(),
      qr_url: qrUrl,
      qr_note: parsed.data.qrNote ?? null,
      updated_by: user.id,
    },
    { onConflict: "id" },
  );

  if (error) {
    redirect(`/admin/soporte?tab=solicitudes&error=${cashErrorKey(error, "branch-payment-settings-save")}`);
  }

  revalidatePath("/admin/soporte");
  revalidatePath("/dueno/soporte");
  redirect("/admin/soporte?tab=solicitudes&settings=1");
}

export async function requestOwnerBranchCapacityAction(formData: FormData) {
  const parsed = requestOwnerBranchCapacitySchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    requestedAdditional: formData.get("requestedAdditional") || 1,
    reason: formData.get("reason") || undefined,
  });

  if (!parsed.success) {
    redirect("/dueno/soporte?error=invalid-branch-request");
  }

  const { supabase, user } = await requireUser();
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id,owner_user_id")
    .eq("id", parsed.data.restaurantId)
    .eq("owner_user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!restaurant) {
    redirect("/dueno/soporte?error=owner-required");
  }

  const currentLimit = await getOwnerBranchLimit(user.id);
  const paymentSettings = await getBranchRequestPaymentSettings();

  if (!paymentSettings.qrUrl) {
    redirect("/dueno/soporte?error=branch-payment-unconfigured");
  }

  const proofFile = formData.get("paymentProofFile") as File | null;

  if (!proofFile || proofFile.size === 0) {
    redirect("/dueno/soporte?error=branch-payment-proof-required");
  }

  const proofTypeIsValid = proofFile.type.startsWith("image/") || proofFile.type === "application/pdf";

  if (!proofTypeIsValid || proofFile.size > MAX_BRANCH_REQUEST_PAYMENT_PROOF_BYTES) {
    redirect("/dueno/soporte?error=invalid-branch-payment-proof");
  }

  let proofUrl: string | null = null;

  try {
    proofUrl = await uploadPrivateFile(proofFile, `platform/branch-requests/proofs/${user.id}`);
  } catch {
    redirect("/dueno/soporte?error=branch-payment-proof-upload");
  }

  if (!proofUrl) {
    redirect("/dueno/soporte?error=branch-payment-proof-upload");
  }

  const totalPaymentAmount = paymentSettings.amount * parsed.data.requestedAdditional;

  const { error } = await supabase.from("owner_branch_capacity_requests").insert({
    owner_user_id: user.id,
    source_restaurant_id: restaurant.id,
    requested_additional: parsed.data.requestedAdditional,
    reason: parsed.data.reason ?? null,
    current_limit: currentLimit,
    payment_amount: totalPaymentAmount,
    payment_currency: paymentSettings.currency,
    payment_qr_url: paymentSettings.qrUrl,
    payment_qr_note: paymentSettings.qrNote ?? null,
    payment_proof_url: proofUrl,
    payment_proof_file_name: proofFile.name,
    payment_proof_file_size: proofFile.size,
    payment_proof_uploaded_at: new Date().toISOString(),
  });

  if (error) {
    const errorKey = error.code === "23505" ? "branch-request-pending" : error.code;
    redirect(`/dueno/soporte?error=${errorKey}`);
  }

  revalidatePath("/dueno/soporte");
  revalidatePath("/admin/soporte");
  revalidatePath(`/admin/restaurantes/${restaurant.id}/cuenta`);
  redirect("/dueno/soporte?requested=1");
}

export async function resolveOwnerBranchCapacityAction(formData: FormData) {
  const returnTo = adminReturnTo(formData, `/admin/restaurantes/${formData.get("restaurantId")}/cuenta`);
  const parsed = resolveOwnerBranchCapacitySchema.safeParse({
    requestId: formData.get("requestId"),
    restaurantId: formData.get("restaurantId"),
    approvedLimit: formData.get("approvedLimit") || undefined,
    resolutionNotes: formData.get("resolutionNotes") || undefined,
    decision: formData.get("decision"),
  });

  if (!parsed.success || (parsed.data.decision === "approve" && !parsed.data.approvedLimit)) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=invalid-branch-request`);
  }

  const { supabase } = await requireSuperadmin();

  if (parsed.data.decision === "approve") {
    const { data: request } = await supabase
      .from("owner_branch_capacity_requests")
      .select("owner_user_id,current_limit")
      .eq("id", parsed.data.requestId)
      .maybeSingle();
    const { data: entitlement } = request?.owner_user_id
      ? await supabase.from("owner_branch_entitlements").select("branch_limit").eq("owner_user_id", request.owner_user_id).maybeSingle()
      : { data: null };
    const minimumApprovedLimit = Math.max(Number(request?.current_limit ?? 1), Number(entitlement?.branch_limit ?? 1));

    if ((parsed.data.approvedLimit ?? 0) < minimumApprovedLimit) {
      redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=invalid-branch-request`);
    }
  }

  const { error } = await supabase.rpc("resolve_owner_branch_capacity_request", {
    p_request_id: parsed.data.requestId,
    p_approve: parsed.data.decision === "approve",
    p_approved_limit: parsed.data.approvedLimit ?? null,
    p_resolution_notes: parsed.data.resolutionNotes ?? null,
  });

  if (error) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${error.code}`);
  }

  revalidatePath("/admin/restaurantes");
  revalidatePath("/admin/soporte");
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/cuenta`);
  revalidatePath("/dueno");
  revalidatePath("/dueno/soporte");
  revalidatePath("/dueno/sucursales");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}saved=solicitud`);
}

export async function manageResponsibleAccessAction(
  _state: ResponsibleAccessFormState,
  formData: FormData,
): Promise<ResponsibleAccessFormState> {
  const parsed = manageResponsibleAccessSchema.safeParse({
    email: formData.get("email") ? String(formData.get("email")) : undefined,
    fullName: formData.get("fullName") ? String(formData.get("fullName")) : undefined,
    restaurantId: formData.get("restaurantId"),
    targetUserId: formData.get("targetUserId"),
    intent: formData.get("intent"),
  });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const { supabase, user } = await requireUser();
  const admin = createAdminClient();
  if (!admin) {
    return { error: "service-role-required" };
  }

  if (parsed.data.targetUserId === user.id) {
    return { error: "owner-protected" };
  }

  const [{ data: restaurant }, { data: membership }] = await Promise.all([
    admin.from("restaurants").select("owner_user_id").eq("id", parsed.data.restaurantId).is("deleted_at", null).maybeSingle(),
    admin
      .from("restaurant_memberships")
      .select("user_id,is_active")
      .eq("restaurant_id", parsed.data.restaurantId)
      .eq("user_id", parsed.data.targetUserId)
      .maybeSingle(),
  ]);

  if (restaurant?.owner_user_id !== user.id || !membership) {
    return { error: "owner-required" };
  }

  const { data: targetUser } = await admin.auth.admin.getUserById(parsed.data.targetUserId);
  if (targetUser.user?.user_metadata?.branch_restaurant_id !== parsed.data.restaurantId) {
    return { error: "responsible-account-required" };
  }

  if (parsed.data.intent === "reset-password") {
    const temporaryPassword = generateSecurePassword();
    const { error } = await admin.auth.admin.updateUserById(parsed.data.targetUserId, {
      password: temporaryPassword,
      user_metadata: {
        ...(targetUser.user?.user_metadata ?? {}),
        must_change_password: true,
        password_reset_by_owner_at: new Date().toISOString(),
      },
    });

    if (error) {
      return { error: "password-reset" };
    }

    await supabase.rpc("write_admin_audit", {
      p_action: "branch_responsible_password_reset",
      p_entity_type: "profile",
      p_entity_id: parsed.data.targetUserId,
      p_restaurant_id: parsed.data.restaurantId,
      p_severity: "warning",
    });

    return { success: "password-reset", temporaryPassword };
  }

  if (parsed.data.intent === "update-profile") {
    const fullName = parsed.data.fullName?.trim() ?? "";
    const email = parsed.data.email?.trim().toLowerCase() || targetUser.user?.email?.trim().toLowerCase() || "";

    if (!fullName || !email) {
      return { error: "invalid-profile" };
    }

    const duplicateUserIds = await findAuthUserIdsByEmail(admin, email);
    if (duplicateUserIds.some((userId) => userId !== parsed.data.targetUserId)) {
      return { error: "responsible-email-exists" };
    }

    const { error: authError } = await admin.auth.admin.updateUserById(parsed.data.targetUserId, {
      email,
      email_confirm: true,
      user_metadata: {
        ...(targetUser.user?.user_metadata ?? {}),
        full_name: fullName,
      },
    });

    if (authError) {
      return { error: "responsible-profile-auth" };
    }

    const { error: profileError } = await admin
      .from("profiles")
      .upsert({
        id: parsed.data.targetUserId,
        email,
        full_name: fullName,
        global_role: "restaurant_admin",
      });

    if (profileError) {
      return { error: "responsible-profile-update" };
    }

    await supabase.rpc("write_admin_audit", {
      p_action: "branch_responsible_profile_updated",
      p_entity_type: "profile",
      p_entity_id: parsed.data.targetUserId,
      p_restaurant_id: parsed.data.restaurantId,
      p_severity: "info",
    });

    revalidatePath("/dueno/responsables");
    revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
    return { success: "profile-updated" };
  }

  const isActive = parsed.data.intent === "reactivate";
  const { error } = await admin
    .from("restaurant_memberships")
    .update({ is_active: isActive })
    .eq("restaurant_id", parsed.data.restaurantId)
    .eq("user_id", parsed.data.targetUserId);

  if (error) {
    return { error: "membership-update" };
  }

  await supabase.rpc("write_admin_audit", {
    p_action: isActive ? "branch_responsible_reactivated" : "branch_responsible_deactivated",
    p_entity_type: "restaurant_membership",
    p_entity_id: parsed.data.targetUserId,
    p_restaurant_id: parsed.data.restaurantId,
    p_severity: isActive ? "info" : "warning",
  });

  revalidatePath("/dueno/responsables");
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  return { success: isActive ? "reactivated" : "deactivated" };
}

export async function createOwnerClientAction(
  _state: CreateOwnerFormState,
  formData: FormData,
): Promise<CreateOwnerFormState> {
  const parsed = createOwnerClientSchema.safeParse({
    ownerName: formData.get("ownerName"),
    ownerEmail: formData.get("ownerEmail"),
    ownerPhone: formData.get("ownerPhone"),
    ownerDocumentNumber: formData.get("ownerDocumentNumber"),
    ownerBirthDate: formData.get("ownerBirthDate"),
    branchLimit: formData.get("branchLimit") || 1,
  });

  if (!parsed.success) {
    return ownerFormError(formData, "invalid");
  }

  const { supabase, user } = await requireSuperadmin();
  const normalizedEmail = parsed.data.ownerEmail.trim().toLowerCase();
  const normalizedName = parsed.data.ownerName.trim();
  const normalizedPhone = parsed.data.ownerPhone.trim();
  const normalizedDocumentNumber = normalizeDocumentNumber(parsed.data.ownerDocumentNumber);

  if (await ownerEmailAlreadyExists(supabase, normalizedEmail)) {
    return ownerFormError(formData, "owner-email-exists");
  }

  const admin = createAdminClient();

  if (!admin) {
    return ownerFormError(formData, "service-role-required");
  }

  const temporaryPassword = generateSecurePassword();
  const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      full_name: normalizedName,
      must_change_password: true,
    },
  });

  let ownerUserId = createdUser.user?.id ?? null;
  let shouldRollbackAuthUser = Boolean(ownerUserId);

  if (createError || !ownerUserId) {
    const recoveredUser = await findAuthUserByEmail(admin, normalizedEmail);

    if (!recoveredUser?.id) {
      return ownerFormError(formData, `owner-create:${createError?.message ?? "unknown"}`);
    }

    if (await authUserHasBusinessReferences(admin, recoveredUser.id)) {
      return ownerFormError(formData, "owner-email-exists");
    }

    ownerUserId = recoveredUser.id;
    shouldRollbackAuthUser = true;

    const { error: updateRecoveredError } = await admin.auth.admin.updateUserById(ownerUserId, {
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        ...(recoveredUser.user_metadata ?? {}),
        full_name: normalizedName,
        must_change_password: true,
      },
    });

    if (updateRecoveredError) {
      await admin.auth.admin.deleteUser(ownerUserId);
      return ownerFormError(formData, `owner-create:${updateRecoveredError.message}`);
    }
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: ownerUserId,
      email: normalizedEmail,
      full_name: normalizedName,
      phone: normalizedPhone,
      document_number: parsed.data.ownerDocumentNumber.trim().toUpperCase(),
      document_number_normalized: normalizedDocumentNumber,
      birth_date: parsed.data.ownerBirthDate,
      owner_profile_completed_at: new Date().toISOString(),
      global_role: null,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    if (shouldRollbackAuthUser) {
      await admin.auth.admin.deleteUser(ownerUserId);
    }
    return ownerFormError(formData, profileError.code ?? "profile-create");
  }

  const entitlementError = await upsertOwnerBranchEntitlementOrFallback({
    admin,
    ownerUserId,
    branchLimit: parsed.data.branchLimit,
    actorUserId: user.id,
    createdBy: true,
  });

  if (entitlementError) {
    if (shouldRollbackAuthUser) {
      await admin.auth.admin.deleteUser(ownerUserId);
    }
    return ownerFormError(formData, entitlementError);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/restaurantes");
  return { success: normalizedEmail, temporaryPassword };
}

export async function updateOwnerProfileAction(formData: FormData) {
  const parsed = updateOwnerProfileSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    documentNumber: formData.get("documentNumber"),
    birthDate: formData.get("birthDate"),
  });

  if (!parsed.success) {
    redirect("/dueno/cuenta?error=invalid-profile");
  }

  const { supabase, user } = await requireUser();
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("email,global_role,owner_profile_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile?.global_role === "superadmin") {
    redirect("/admin");
  }

  const admin = createAdminClient();
  if (!admin) {
    redirect("/dueno/cuenta?error=service-role-required");
  }

  const now = new Date().toISOString();
  const normalizedName = parsed.data.fullName.trim();
  const normalizedPhone = parsed.data.phone.trim();
  const documentNumber = parsed.data.documentNumber.trim().toUpperCase();
  const documentNumberNormalized = normalizeDocumentNumber(documentNumber);

  const { error } = await admin.from("profiles").upsert(
    {
      id: user.id,
      email: existingProfile?.email ?? user.email ?? "",
      full_name: normalizedName,
      phone: normalizedPhone,
      document_number: documentNumber,
      document_number_normalized: documentNumberNormalized,
      birth_date: parsed.data.birthDate,
      owner_profile_completed_at: existingProfile?.owner_profile_completed_at ?? now,
      global_role: existingProfile?.global_role ?? null,
    },
    { onConflict: "id" },
  );

  if (error) {
    redirect(`/dueno/cuenta?error=${cashErrorKey(error, "owner-profile-update")}`);
  }

  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata ?? {}),
      full_name: normalizedName,
    },
  });

  await supabase.rpc("write_admin_audit", {
    p_action: existingProfile?.owner_profile_completed_at ? "owner_profile_updated" : "owner_profile_completed",
    p_entity_type: "profile",
    p_entity_id: user.id,
    p_restaurant_id: null,
    p_severity: "info",
    p_ip_address: null,
    p_user_agent: null,
    p_metadata: {
      completed: true,
      updatedFields: ["full_name", "phone", "document_number", "birth_date"],
    } satisfies Json,
  });

  revalidatePath("/dueno");
  revalidatePath("/dueno/cuenta");
  redirect("/dueno/cuenta?saved=1");
}

export async function createOwnedRestaurantFormAction(
  _state: CreateRestaurantFormState,
  formData: FormData,
): Promise<CreateRestaurantFormState> {
  const parsed = createRestaurantSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
    description: formData.get("description") || undefined,
    whatsapp: formData.get("whatsapp") || undefined,
    address: formData.get("address") || undefined,
    addressReference: formData.get("addressReference") || undefined,
    city: formData.get("city") || undefined,
    latitude: formData.get("latitude") || undefined,
    longitude: formData.get("longitude") || undefined,
    mapsUrl: formData.get("mapsUrl") || undefined,
    businessType: formData.get("businessType") || "food",
    publicCategory: formData.get("publicCategory") || undefined,
    primaryColor: formData.get("primaryColor") || defaultRestaurantPalette.primaryColor,
    secondaryColor: formData.get("secondaryColor") || defaultRestaurantPalette.secondaryColor,
    planKey: formData.get("planKey") || fullPlanKey,
    branchUserName: formData.get("branchUserName"),
    branchUserEmail: formData.get("branchUserEmail"),
    ownerName: undefined,
    ownerEmail: undefined,
    ownerPassword: undefined,
  });

  if (!parsed.success) {
    return restaurantFormError(formData, "invalid");
  }

  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("email,full_name,global_role").eq("id", user.id).maybeSingle();

  if (profile?.global_role === "superadmin") {
    return restaurantFormError(formData, "owner-only");
  }

  const admin = createAdminClient();

  if (!admin) {
    return restaurantFormError(formData, "service-role-required");
  }

  const { data: existingMemberships, error: membershipsError } = await admin
    .from("restaurant_memberships")
    .select("restaurant_id")
    .eq("user_id", user.id)
    .eq("role", "restaurant_admin")
    .eq("is_active", true);

  if (membershipsError) {
    return restaurantFormError(formData, membershipsError.code ?? "membership-check");
  }

  const membershipRestaurantIds = Array.from(new Set((existingMemberships ?? []).map((membership) => membership.restaurant_id)));
  if (membershipRestaurantIds.length) {
    const { data: nonArchivedOwnedRestaurants, error: ownedRestaurantsError } = await admin
      .from("restaurants")
      .select("id")
      .in("id", membershipRestaurantIds)
      .eq("owner_user_id", user.id)
      .is("deleted_at", null)
      .limit(1);

    if (ownedRestaurantsError) {
      return restaurantFormError(formData, ownedRestaurantsError.code ?? "restaurant-check");
    }

    if (nonArchivedOwnedRestaurants?.length) {
      return restaurantFormError(formData, "restaurant-exists");
    }
  }

  const slug = toSlug(parsed.data.slug || parsed.data.name);
  const normalizedBranchUserEmail = parsed.data.branchUserEmail.trim().toLowerCase();
  const [{ data: existingSlug }, { data: existingBranchProfile }] = await Promise.all([
    admin.from("restaurants").select("id").eq("slug", slug).maybeSingle(),
    admin.from("profiles").select("id").eq("email", normalizedBranchUserEmail).maybeSingle(),
  ]);

  if (existingSlug) {
    return restaurantFormError(formData, "slug-exists");
  }

  if (existingBranchProfile) {
    return restaurantFormError(formData, "branch-user-email-exists");
  }

  let logoUrl: string | null = null;
  let bannerUrl: string | null = null;

  try {
    [logoUrl, bannerUrl] = await Promise.all([
      uploadPublicImage(formData.get("logoFile") as File | null, `restaurants/${slug}/identity`),
      uploadPublicImage(formData.get("bannerFile") as File | null, `restaurants/${slug}/identity`),
    ]);
  } catch {
    return restaurantFormError(formData, "storage-upload");
  }

  const planKey = fullPlanKey;
  const [enabledPlanModules, planResult] = await Promise.all([
    modulesForPlan(planKey),
    admin.from("subscription_plans").select("id").eq("key", planKey).maybeSingle(),
  ]);
  const businessType = normalizeRestaurantBusinessType(parsed.data.businessType);
  const publicCategory = normalizeRestaurantCategory(parsed.data.publicCategory, businessType);
  const ownerName = profile?.full_name || user.user_metadata?.full_name || user.email || "Dueno";
  const ownerEmail = profile?.email || user.email || "";
  const { data: restaurant, error: restaurantError } = await admin
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
      address_reference: parsed.data.addressReference,
      city: parsed.data.city,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
      maps_url: parsed.data.mapsUrl ?? null,
      business_type: businessType,
      public_category: publicCategory,
      owner_user_id: user.id,
      owner_name: ownerName,
      owner_email: ownerEmail,
    })
    .select("id")
    .single();

  if (restaurantError || !restaurant) {
    console.error("createOwnedRestaurantFormAction:restaurants.insert", restaurantError);
    return restaurantFormError(formData, `create:${actionErrorDetail(restaurantError, "insert-empty")}`);
  }

  const branchUserName = parsed.data.branchUserName.trim();
  const temporaryPassword = generateSecurePassword();
  const { data: branchUser, error: branchUserError } = await admin.auth.admin.createUser({
    email: normalizedBranchUserEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      full_name: branchUserName,
      must_change_password: true,
      branch_restaurant_id: restaurant.id,
    },
  });

  if (branchUserError || !branchUser.user?.id) {
    await admin.from("restaurants").delete().eq("id", restaurant.id);
    await deleteRestaurantAssets(restaurant.id, slug);
    return restaurantFormError(formData, branchUserError?.message.toLowerCase().includes("already") ? "branch-user-email-exists" : "branch-user-create");
  }

  const { error: branchProfileError } = await admin.from("profiles").upsert(
    {
      id: branchUser.user.id,
      email: normalizedBranchUserEmail,
      full_name: branchUserName,
      global_role: null,
    },
    { onConflict: "id" },
  );

  if (branchProfileError) {
    await admin.auth.admin.deleteUser(branchUser.user.id);
    await admin.from("restaurants").delete().eq("id", restaurant.id);
    await deleteRestaurantAssets(restaurant.id, slug);
    return restaurantFormError(formData, "branch-user-profile");
  }

  const moduleRows = enabledPlanModules.map((moduleKey) => ({
    restaurant_id: restaurant.id,
    module_key: moduleKey,
    is_enabled: true,
  }));
  try {
    if (planResult.error || !planResult.data) {
      throw new Error(planResult.error?.code ?? "plan-not-found");
    }

    const setupResults = await Promise.all([
      admin.from("restaurant_settings").insert({
        restaurant_id: restaurant.id,
        delivery_enabled: true,
        pickup_enabled: true,
        table_orders_enabled: enabledPlanModules.includes("table_qr"),
        inventory_enabled: enabledPlanModules.includes("inventory"),
        cash_enabled: enabledPlanModules.includes("cash"),
        kitchen_enabled: enabledPlanModules.includes("kitchen"),
        delivery_fee: 0,
        delivery_qr_prepayment_enabled: true,
        far_delivery_distance_km: 5,
        min_order_amount: 0,
        currency: "BOB",
      }),
      admin.from("restaurant_memberships").insert([
        {
          restaurant_id: restaurant.id,
          user_id: user.id,
          role: "restaurant_admin",
          is_active: true,
        },
        {
          restaurant_id: restaurant.id,
          user_id: branchUser.user.id,
          role: "restaurant_admin",
          is_active: true,
        },
      ]),
      admin.from("restaurant_subscriptions").insert({
        restaurant_id: restaurant.id,
        plan_id: planResult.data.id,
        status: "trialing",
      }),
      moduleRows.length ? admin.from("module_settings").insert(moduleRows) : Promise.resolve({ error: null }),
    ]);
    const failedSetup = setupResults.find((result) => result.error);

    if (failedSetup?.error) {
      throw new Error(failedSetup.error.code ?? failedSetup.error.message);
    }
  } catch (error) {
    await admin.auth.admin.deleteUser(branchUser.user.id);
    await admin.from("restaurants").delete().eq("id", restaurant.id);
    await deleteRestaurantAssets(restaurant.id, slug);
    return restaurantFormError(formData, `setup:${error instanceof Error ? error.message : "unknown"}`);
  }

  revalidatePath("/admin");
  revalidatePath("/dueno");
  revalidatePath("/admin/restaurantes");
  return { redirectTo: "/dueno", success: true, temporaryPassword };
}

async function createBranchResult(formData: FormData): Promise<CreateBranchFormState> {
  const parsed = createBranchSchema.safeParse({
    sourceRestaurantId: formData.get("sourceRestaurantId"),
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
    whatsapp: formData.get("whatsapp") || undefined,
    address: formData.get("address") || undefined,
    addressReference: formData.get("addressReference") || undefined,
    city: formData.get("city") || undefined,
    latitude: formData.get("latitude") || undefined,
    longitude: formData.get("longitude") || undefined,
    mapsUrl: formData.get("mapsUrl") || undefined,
    branchUserName: formData.get("branchUserName"),
    branchUserEmail: formData.get("branchUserEmail"),
  });

  if (!parsed.success) {
    return branchFormError(formData, "invalid");
  }

  const { user } = await requireUser();
  const admin = createAdminClient();

  if (!admin) {
    return branchFormError(formData, "service-role-required");
  }

  const { data: membership } = await admin
    .from("restaurant_memberships")
    .select("role")
    .eq("restaurant_id", parsed.data.sourceRestaurantId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (membership?.role !== "restaurant_admin") {
    return branchFormError(formData, "owner-required");
  }

  let branchQuota: { used: number; limit: number };
  try {
    branchQuota = await getOwnerBranchQuota(admin, user.id);
  } catch {
    return branchFormError(formData, "owner-entitlement");
  }
  const { used, limit } = branchQuota;

  if (used >= limit) {
    return branchFormError(formData, "branch-limit");
  }

  const { data: sourceRestaurant } = await admin
    .from("restaurants")
    .select("*")
    .eq("id", parsed.data.sourceRestaurantId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (!sourceRestaurant) {
    return branchFormError(formData, "source-not-found");
  }

  if (sourceRestaurant.owner_user_id !== user.id) {
    return branchFormError(formData, "owner-required");
  }

  const slug = toSlug(parsed.data.slug || parsed.data.name);
  const { data: existingSlug } = await admin.from("restaurants").select("id").eq("slug", slug).maybeSingle();

  if (existingSlug) {
    return branchFormError(formData, "slug-exists");
  }

  const normalizedBranchUserEmail = parsed.data.branchUserEmail.trim().toLowerCase();
  const { data: existingBranchProfile } = await admin.from("profiles").select("id").eq("email", normalizedBranchUserEmail).maybeSingle();

  if (existingBranchProfile) {
    return branchFormError(formData, "branch-user-email-exists");
  }

  const { data: authUsers, error: authUsersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (authUsersError) {
    return branchFormError(formData, "branch-user-check");
  }

  if (authUsers.users.some((authUser) => authUser.email?.toLowerCase() === normalizedBranchUserEmail)) {
    return branchFormError(formData, "branch-user-email-exists");
  }

  const { data: branch, error: branchError } = await admin
    .from("restaurants")
    .insert({
      name: parsed.data.name,
      slug,
      description: sourceRestaurant.description,
      status: "active",
      logo_url: sourceRestaurant.logo_url,
      banner_url: sourceRestaurant.banner_url,
      primary_color: sourceRestaurant.primary_color,
      secondary_color: sourceRestaurant.secondary_color,
      whatsapp: parsed.data.whatsapp || sourceRestaurant.whatsapp,
      address: parsed.data.address,
      address_reference: parsed.data.addressReference,
      city: parsed.data.city,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
      maps_url: parsed.data.mapsUrl ?? null,
      business_type: sourceRestaurant.business_type,
      public_category: sourceRestaurant.public_category,
      owner_user_id: sourceRestaurant.owner_user_id ?? user.id,
      owner_name: sourceRestaurant.owner_name,
      owner_email: sourceRestaurant.owner_email ?? user.email,
      background_color: sourceRestaurant.background_color,
      surface_color: sourceRestaurant.surface_color,
      text_color: sourceRestaurant.text_color,
      muted_color: sourceRestaurant.muted_color,
      border_color: sourceRestaurant.border_color,
      nav_background_color: sourceRestaurant.nav_background_color,
      nav_text_color: sourceRestaurant.nav_text_color,
      menu_background_image_url: sourceRestaurant.menu_background_image_url,
      public_banner_size: sourceRestaurant.public_banner_size,
    })
    .select("id")
    .single();

  if (branchError || !branch) {
    console.error("createBranchFormAction:restaurants.insert", branchError);
    return branchFormError(formData, `create:${actionErrorDetail(branchError, "insert-empty")}`);
  }

  const branchUserName = parsed.data.branchUserName.trim();
  const temporaryPassword = generateSecurePassword();
  const { data: branchUser, error: branchUserError } = await admin.auth.admin.createUser({
    email: normalizedBranchUserEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      full_name: branchUserName,
      must_change_password: true,
      branch_restaurant_id: branch.id,
    },
  });

  if (branchUserError || !branchUser.user?.id) {
    await admin.from("restaurants").delete().eq("id", branch.id);
    return branchFormError(formData, branchUserError?.message.toLowerCase().includes("already") ? "branch-user-email-exists" : "branch-user-create");
  }

  const { error: branchProfileError } = await admin.from("profiles").upsert(
    {
      id: branchUser.user.id,
      email: normalizedBranchUserEmail,
      full_name: branchUserName,
      global_role: null,
    },
    { onConflict: "id" },
  );

  if (branchProfileError) {
    await admin.auth.admin.deleteUser(branchUser.user.id);
    await admin.from("restaurants").delete().eq("id", branch.id);
    return branchFormError(formData, "branch-user-profile");
  }

  try {
    throwIfSupabaseError(
      await admin.from("restaurant_memberships").insert([
        {
          restaurant_id: branch.id,
          user_id: user.id,
          role: "restaurant_admin",
          is_active: true,
        },
        {
          restaurant_id: branch.id,
          user_id: branchUser.user.id,
          role: "restaurant_admin",
          is_active: true,
        },
      ]),
      "branch-memberships",
    );
    await cloneBranchRuntimeSettings(admin, parsed.data.sourceRestaurantId, branch.id);
    await cloneBranchCatalog(admin, parsed.data.sourceRestaurantId, branch.id);
  } catch (error) {
    await admin.auth.admin.deleteUser(branchUser.user.id);
    await admin.from("restaurants").delete().eq("id", branch.id);
    return branchFormError(formData, `setup:${error instanceof Error ? error.message : "unknown"}`);
  }

  revalidatePath("/admin");
  revalidatePath("/dueno");
  revalidatePath("/admin/restaurantes");
  revalidatePath("/dueno/sucursales");
  return { redirectTo: "/dueno/sucursales?created=1", success: true, temporaryPassword };
}

export async function createBranchFormAction(
  _state: CreateBranchFormState,
  formData: FormData,
): Promise<CreateBranchFormState> {
  return createBranchResult(formData);
}

export async function createBranchAction(formData: FormData) {
  const result = await createBranchResult(formData);

  if (result.success) {
    redirect(result.redirectTo ?? "/dueno/sucursales?created=1");
  }

  redirect(`/dueno/sucursales/nueva?error=${result.error ?? "create"}`);
}

async function dispatchRestaurantSettingsIntent(rawIntent: string, formData: FormData, returnTab: string) {
  const [intent, entityId] = rawIntent.split(":");
  const restaurantId = String(formData.get("restaurantId") || "");
  const configPath = `/admin/restaurantes/${restaurantId}/configuracion?tab=${returnTab}`;

  switch (intent) {
    case "save-delivery-zone":
      return saveDeliveryZoneAction(formData);
    case "toggle-delivery-zone":
      if (entityId) {
        formData.set("zoneId", entityId);
        return toggleDeliveryZoneAction(formData);
      }
      break;
    case "delete-delivery-zone":
      if (entityId) {
        formData.set("zoneId", entityId);
        return deleteDeliveryZoneAction(formData);
      }
      break;
    case "close-today":
      return closeRestaurantTodayAction(formData);
    case "create-announcement":
      return createRestaurantAnnouncementAction(formData);
    case "update-announcement":
      if (entityId) {
        formData.set("announcementId", entityId);
        return updateRestaurantAnnouncementAction(formData);
      }
      break;
    case "deactivate-announcement":
      if (entityId) {
        formData.set("announcementId", entityId);
        return deactivateRestaurantAnnouncementAction(formData);
      }
      break;
    case "mark-invoice-issued":
      if (entityId) {
        formData.set("orderId", entityId);
        return markInvoiceIssuedAction(formData);
      }
      break;
    case "create-owner-request":
      return createOwnerChangeRequestAction(formData);
    case "reject-owner-request":
      return rejectOwnerChangeRequestAction(formData);
    case "approve-owner-request":
      return approveOwnerChangeRequestAction(formData);
  }

  redirect(`${configPath}&error=invalid`);
}

export async function updateRestaurantConfigurationAction(formData: FormData) {
  const returnTab = String(formData.get("tab") || "general");
  const settingsIntent = String(formData.get("settingsIntent") || "");

  if (settingsIntent) {
    await dispatchRestaurantSettingsIntent(settingsIntent, formData, returnTab);
    return;
  }

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
    businessType: formData.get("businessType") || "food",
    publicCategory: formData.get("publicCategory") || undefined,
    latitude: formData.get("latitude") || undefined,
    longitude: formData.get("longitude") || undefined,
    mapsUrl: formData.get("mapsUrl") || undefined,
    primaryColor: formData.get("primaryColor") || defaultRestaurantPalette.primaryColor,
    secondaryColor: formData.get("secondaryColor") || defaultRestaurantPalette.secondaryColor,
    backgroundColor: formData.get("backgroundColor") || defaultRestaurantPalette.backgroundColor,
    surfaceColor: formData.get("surfaceColor") || defaultRestaurantPalette.surfaceColor,
    textColor: formData.get("textColor") || defaultRestaurantPalette.textColor,
    mutedColor: formData.get("mutedColor") || defaultRestaurantPalette.mutedColor,
    borderColor: formData.get("borderColor") || defaultRestaurantPalette.borderColor,
    navBackgroundColor: formData.get("navBackgroundColor") || defaultRestaurantPalette.navBackgroundColor,
    navTextColor: formData.get("navTextColor") || defaultRestaurantPalette.navTextColor,
    currentMenuBackgroundImageUrl: formData.get("currentMenuBackgroundImageUrl") || undefined,
    publicBannerSize: formData.get("publicBannerSize") || "compact",
    deliveryEnabled: booleanFromForm(formData, "deliveryEnabled"),
    pickupEnabled: booleanFromForm(formData, "pickupEnabled"),
    tableOrdersEnabled: booleanFromForm(formData, "tableOrdersEnabled"),
    inventoryEnabled: booleanFromForm(formData, "inventoryEnabled"),
    cashEnabled: booleanFromForm(formData, "cashEnabled"),
    kitchenEnabled: booleanFromForm(formData, "kitchenEnabled"),
    deliveryFee: formData.get("deliveryFee") || 0,
    deliveryQrPrepaymentEnabled: booleanFromForm(formData, "deliveryQrPrepaymentEnabled"),
    farDeliveryDistanceKm: formData.get("farDeliveryDistanceKm") || 5,
    freeDeliveryFrom: formData.get("freeDeliveryFrom") || undefined,
    minOrderAmount: formData.get("minOrderAmount") || 0,
    currency: String(formData.get("currency") || "BOB").toUpperCase(),
    invoiceEnabled: booleanFromForm(formData, "invoiceEnabled"),
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
    ownerName: formData.get("ownerName") || undefined,
    ownerEmail: formData.get("ownerEmail") || undefined,
    ownerPassword: formData.get("ownerPassword") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/configuracion?tab=${returnTab}&error=invalid`);
  }

  const configReturnPath = `/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=${returnTab}`;
  await requireRestaurantAccess(parsed.data.restaurantId, configReturnPath);

  const { supabase, user, isSuperadmin } = await requireRestaurantAdminOrSuperadmin(parsed.data.restaurantId);
  const admin = createAdminClient();

  if (!admin) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=${returnTab}&error=service-role-required`);
  }

  const { data: currentRestaurant } = await supabase
    .from("restaurants")
    .select("owner_user_id,owner_name,owner_email,status,business_type")
    .eq("id", parsed.data.restaurantId)
    .maybeSingle();

  const { data: currentSettings } = await supabase
    .from("restaurant_settings")
    .select(
      "delivery_enabled,pickup_enabled,table_orders_enabled,inventory_enabled,cash_enabled,kitchen_enabled,delivery_fee,delivery_qr_prepayment_enabled,far_delivery_distance_km,free_delivery_from,min_order_amount,currency,invoice_enabled,qr_payment_url,qr_account_name,qr_account_document,qr_bank_name,qr_account_type,qr_currency",
    )
    .eq("restaurant_id", parsed.data.restaurantId)
    .maybeSingle();

  if (!currentRestaurant) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=${returnTab}&error=restaurant-not-found`);
  }

  const canManageOwnerSettings = isSuperadmin || currentRestaurant.owner_user_id === user.id;
  const canManagePayments = canManageOwnerSettings;
  const canManageDeliverySettings = canManageOwnerSettings;
  if (returnTab === "pagos" && !canManagePayments) {
    redirectWithError(configReturnPath, "owner-required");
  }
  if (returnTab === "delivery" && !canManageDeliverySettings) {
    redirectWithError(configReturnPath, "owner-required");
  }

  const canChangePlan = isSuperadmin;
  const planKey = canChangePlan && parsed.data.planKey ? parsed.data.planKey : await getPlanKeyForRestaurant(supabase, parsed.data.restaurantId);
  const allowedModules = await modulesForPlan(planKey);
  const businessType = normalizeRestaurantBusinessType(parsed.data.businessType ?? currentRestaurant.business_type ?? "food");
  const normalizedCategory = normalizeRestaurantCategory(parsed.data.publicCategory, businessType);
  const nextRestaurantStatus = isSuperadmin
    ? parsed.data.status
    : currentRestaurant.status === "suspended"
      ? "suspended"
      : parsed.data.status === "inactive"
        ? "inactive"
        : "active";
  const canWriteDeliverySettings = canManageDeliverySettings && returnTab === "delivery";
  const moduleState = {
    deliveryEnabled: canWriteDeliverySettings ? parsed.data.deliveryEnabled : (currentSettings?.delivery_enabled ?? parsed.data.deliveryEnabled),
    pickupEnabled: currentSettings?.pickup_enabled ?? parsed.data.pickupEnabled,
    tableOrdersEnabled: allowedModules.includes("table_qr"),
    inventoryEnabled: allowedModules.includes("inventory"),
    cashEnabled: allowedModules.includes("cash"),
    kitchenEnabled: allowedModules.includes("kitchen"),
  };

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
  const qrPaymentUrl = canManagePayments
    ? ((await uploadPublicImage(formData.get("qrPaymentFile") as File | null, `restaurants/${parsed.data.restaurantId}/payments`)) ??
      parsed.data.qrPaymentUrl ??
      parsed.data.currentQrPaymentUrl ??
      null)
    : (currentSettings?.qr_payment_url ?? parsed.data.currentQrPaymentUrl ?? null);

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
    business_type: typeof businessType;
    public_category: string | null;
    latitude: number | null;
    longitude: number | null;
    maps_url: string | null;
    logo_url?: string;
    banner_url?: string;
  } = {
    name: parsed.data.name,
    slug,
    description: parsed.data.description ?? null,
    status: nextRestaurantStatus,
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
    business_type: businessType,
    public_category: normalizedCategory,
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

  const owner = await updateRestaurantOwnerAccess({
    supabase,
    restaurantId: parsed.data.restaurantId,
    currentOwnerUserId: currentRestaurant.owner_user_id,
    currentOwnerName: currentRestaurant.owner_name,
    currentOwnerEmail: currentRestaurant.owner_email,
    ownerName: isSuperadmin ? parsed.data.ownerName : currentRestaurant.owner_name ?? undefined,
    ownerEmail: isSuperadmin ? parsed.data.ownerEmail || undefined : currentRestaurant.owner_email ?? undefined,
    ownerPassword: isSuperadmin ? parsed.data.ownerPassword || undefined : undefined,
    fallbackUserId: user.id,
    fallbackEmail: user.email ?? "",
  }).catch((error: Error) => {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=${returnTab}&error=${error.message}`);
  });

  const { error: restaurantError } = await admin
    .from("restaurants")
    .update({
      ...restaurantUpdate,
      owner_user_id: owner.id,
      owner_name: owner.name,
      owner_email: owner.email,
    })
    .eq("id", parsed.data.restaurantId);

  if (restaurantError) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=${returnTab}&error=${restaurantError.code}`);
  }

  const deliverySettings = canWriteDeliverySettings
    ? {
        delivery_fee: parsed.data.deliveryFee,
        delivery_qr_prepayment_enabled: parsed.data.deliveryQrPrepaymentEnabled,
        far_delivery_distance_km: parsed.data.farDeliveryDistanceKm,
        free_delivery_from: parsed.data.freeDeliveryFrom ?? null,
        min_order_amount: parsed.data.minOrderAmount,
      }
    : {
        delivery_fee: currentSettings?.delivery_fee ?? 0,
        delivery_qr_prepayment_enabled: currentSettings?.delivery_qr_prepayment_enabled ?? true,
        far_delivery_distance_km: currentSettings?.far_delivery_distance_km ?? 5,
        free_delivery_from: currentSettings?.free_delivery_from ?? null,
        min_order_amount: currentSettings?.min_order_amount ?? 0,
      };

  const paymentSettings = canManagePayments
    ? {
        currency: parsed.data.currency,
        invoice_enabled: parsed.data.invoiceEnabled,
        qr_payment_url: qrPaymentUrl,
        qr_account_name: parsed.data.qrAccountName ?? null,
        qr_account_document: parsed.data.qrAccountDocument ?? null,
        qr_bank_name: parsed.data.qrBankName ?? null,
        qr_account_type: parsed.data.qrAccountType ?? null,
        qr_currency: parsed.data.qrCurrency,
      }
    : {
        currency: currentSettings?.currency ?? "BOB",
        invoice_enabled: currentSettings?.invoice_enabled ?? false,
        qr_payment_url: qrPaymentUrl,
        qr_account_name: currentSettings?.qr_account_name ?? null,
        qr_account_document: currentSettings?.qr_account_document ?? null,
        qr_bank_name: currentSettings?.qr_bank_name ?? null,
        qr_account_type: currentSettings?.qr_account_type ?? null,
        qr_currency: currentSettings?.qr_currency ?? currentSettings?.currency ?? "BOB",
      };

  const { error: settingsError } = await supabase.from("restaurant_settings").upsert(
    {
      restaurant_id: parsed.data.restaurantId,
      delivery_enabled: moduleState.deliveryEnabled,
      pickup_enabled: moduleState.pickupEnabled,
      table_orders_enabled: moduleState.tableOrdersEnabled,
      inventory_enabled: moduleState.inventoryEnabled,
      cash_enabled: moduleState.cashEnabled,
      kitchen_enabled: moduleState.kitchenEnabled,
      ...deliverySettings,
      ...paymentSettings,
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

  const moduleRows = fullPlanModules.map((moduleKey) => ({
    restaurant_id: parsed.data.restaurantId,
    module_key: moduleKey,
    is_enabled: true,
  }));

  const { error: modulesError } = await supabase.from("module_settings").upsert(moduleRows, { onConflict: "restaurant_id,module_key" });

  if (modulesError) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=${returnTab}&error=${modulesError.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  revalidatePath(publicRestaurantPath(parsed.data.currentSlug));
  revalidatePath(publicRestaurantPath(slug));
  revalidatePath(`/r/${parsed.data.currentSlug}`);
  revalidatePath(`/r/${slug}`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=${returnTab}&saved=1`);
}

export async function updatePlatformBillingSettingsAction(formData: FormData) {
  const parsed = updatePlatformBillingSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    currentPlatformQrUrl: formData.get("currentPlatformQrUrl") || undefined,
    nextDueDate: formData.get("platformNextDueDate"),
    reminderDays: formData.get("platformReminderDays") || 4,
    platformQrNote: formData.get("platformQrNote") || undefined,
  });

  if (!parsed.success) {
    redirect(`${platformConfigPath(String(formData.get("restaurantId")))}&error=invalid-platform-billing`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, platformConfigPath(parsed.data.restaurantId));
  const { isSuperadmin } = await requireRestaurantAdminOrSuperadmin(parsed.data.restaurantId);
  if (!isSuperadmin) {
    redirect(`${platformConfigPath(parsed.data.restaurantId)}&error=superadmin-required`);
  }

  const admin = createAdminClient();
  if (!admin) {
    redirect(`${platformConfigPath(parsed.data.restaurantId)}&error=service-role-required`);
  }

  const { data: existing } = await admin
    .from("restaurant_platform_billing")
    .select("id,platform_qr_url")
    .eq("restaurant_id", parsed.data.restaurantId)
    .maybeSingle();

  const platformQrUrl =
    (await uploadPublicImage(formData.get("platformQrFile") as File | null, `platform/billing/${parsed.data.restaurantId}`)) ??
    parsed.data.currentPlatformQrUrl ??
    existing?.platform_qr_url ??
    null;

  const { error } = await admin.from("restaurant_platform_billing").upsert(
    {
      id: existing?.id,
      restaurant_id: parsed.data.restaurantId,
      billing_anchor_date: parsed.data.nextDueDate,
      next_due_date: parsed.data.nextDueDate,
      reminder_days: parsed.data.reminderDays,
      platform_qr_url: platformQrUrl,
      platform_qr_note: parsed.data.platformQrNote ?? null,
    },
    { onConflict: "restaurant_id" },
  );

  if (error) {
    redirect(`${platformConfigPath(parsed.data.restaurantId)}&error=${cashErrorKey(error, "platform-billing-save")}`);
  }

  await ensurePlatformPaymentCycle(admin, parsed.data.restaurantId, parsed.data.nextDueDate);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}`);
  redirect(`${platformConfigPath(parsed.data.restaurantId)}&billingSaved=1`);
}

export async function submitPlatformPaymentProofAction(formData: FormData) {
  const parsed = submitPlatformPaymentProofSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    dueDate: formData.get("platformDueDate"),
    notes: formData.get("platformPaymentNotes") || undefined,
  });

  if (!parsed.success) {
    redirect(`${platformConfigPath(String(formData.get("restaurantId")))}&error=invalid-platform-proof`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, platformConfigPath(parsed.data.restaurantId));
  await requireRestaurantAdminOrSuperadmin(parsed.data.restaurantId);

  const admin = createAdminClient();
  if (!admin) {
    redirect(`${platformConfigPath(parsed.data.restaurantId)}&error=service-role-required`);
  }

  const { data: billing } = await admin
    .from("restaurant_platform_billing")
    .select("next_due_date,platform_qr_url")
    .eq("restaurant_id", parsed.data.restaurantId)
    .maybeSingle();

  if (!billing?.platform_qr_url) {
    redirect(`${platformConfigPath(parsed.data.restaurantId)}&error=platform-billing-not-configured`);
  }

  if (billing.next_due_date !== parsed.data.dueDate) {
    redirect(`${platformConfigPath(parsed.data.restaurantId)}&error=platform-cycle-mismatch`);
  }

  const proofFile = formData.get("platformPaymentProofFile") as File | null;
  if (!proofFile || proofFile.size === 0) {
    redirect(`${platformConfigPath(parsed.data.restaurantId)}&error=platform-proof-required`);
  }

  const cycle = await ensurePlatformPaymentCycle(admin, parsed.data.restaurantId, parsed.data.dueDate);
  if (cycle?.paid_at) {
    redirect(`${platformConfigPath(parsed.data.restaurantId)}&error=platform-cycle-paid`);
  }

  const proofUrl = await uploadPrivateFile(proofFile, `platform/payments/${parsed.data.restaurantId}`);
  if (!proofUrl) {
    redirect(`${platformConfigPath(parsed.data.restaurantId)}&error=platform-proof-upload`);
  }

  const { error } = await admin
    .from("restaurant_platform_payment_cycles")
    .update({
      proof_url: proofUrl,
      proof_uploaded_at: new Date().toISOString(),
      proof_verified_at: null,
      proof_verified_by: null,
      notes: parsed.data.notes ?? null,
    })
    .eq("id", cycle?.id ?? "");

  if (error) {
    redirect(`${platformConfigPath(parsed.data.restaurantId)}&error=${cashErrorKey(error, "platform-proof-save")}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  redirect(`${platformConfigPath(parsed.data.restaurantId)}&paymentUploaded=1`);
}

export async function verifyPlatformPaymentProofAction(formData: FormData) {
  const parsed = resolvePlatformPaymentCycleSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    cycleId: formData.get("cycleId"),
    notes: formData.get("platformResolutionNotes") || undefined,
  });

  if (!parsed.success) {
    redirect(`${platformConfigPath(String(formData.get("restaurantId")))}&error=invalid-platform-cycle`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, platformConfigPath(parsed.data.restaurantId));
  const { user } = await requireSuperadmin();

  const admin = createAdminClient();
  if (!admin) {
    redirect(`${platformConfigPath(parsed.data.restaurantId)}&error=service-role-required`);
  }

  const { data: cycle } = await admin
    .from("restaurant_platform_payment_cycles")
    .select("id,proof_url")
    .eq("id", parsed.data.cycleId)
    .eq("restaurant_id", parsed.data.restaurantId)
    .maybeSingle();

  if (!cycle?.proof_url) {
    redirect(`${platformConfigPath(parsed.data.restaurantId)}&error=platform-proof-missing`);
  }

  const { error } = await admin
    .from("restaurant_platform_payment_cycles")
    .update({
      proof_verified_at: new Date().toISOString(),
      proof_verified_by: user.id,
      notes: parsed.data.notes ?? null,
    })
    .eq("id", parsed.data.cycleId);

  if (error) {
    redirect(`${platformConfigPath(parsed.data.restaurantId)}&error=${cashErrorKey(error, "platform-proof-verify")}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  redirect(`${platformConfigPath(parsed.data.restaurantId)}&paymentVerified=1`);
}

export async function markPlatformPaymentPaidAction(formData: FormData) {
  const parsed = resolvePlatformPaymentCycleSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    cycleId: formData.get("cycleId"),
    notes: formData.get("platformResolutionNotes") || undefined,
  });

  if (!parsed.success) {
    redirect(`${platformConfigPath(String(formData.get("restaurantId")))}&error=invalid-platform-cycle`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, platformConfigPath(parsed.data.restaurantId));
  const { user } = await requireSuperadmin();

  const admin = createAdminClient();
  if (!admin) {
    redirect(`${platformConfigPath(parsed.data.restaurantId)}&error=service-role-required`);
  }

  const { data: billing } = await admin
    .from("restaurant_platform_billing")
    .select("next_due_date")
    .eq("restaurant_id", parsed.data.restaurantId)
    .maybeSingle();

  const { data: cycle } = await admin
    .from("restaurant_platform_payment_cycles")
    .select("id,due_date,proof_verified_at")
    .eq("id", parsed.data.cycleId)
    .eq("restaurant_id", parsed.data.restaurantId)
    .maybeSingle();

  if (!billing || !cycle) {
    redirect(`${platformConfigPath(parsed.data.restaurantId)}&error=platform-cycle-missing`);
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("restaurant_platform_payment_cycles")
    .update({
      proof_verified_at: cycle.proof_verified_at ?? now,
      proof_verified_by: user.id,
      paid_at: now,
      paid_by: user.id,
      notes: parsed.data.notes ?? null,
    })
    .eq("id", parsed.data.cycleId);

  if (error) {
    redirect(`${platformConfigPath(parsed.data.restaurantId)}&error=${cashErrorKey(error, "platform-payment-paid")}`);
  }

  if (billing.next_due_date === cycle.due_date) {
    const nextDueDate = platformBillingService.addMonthsClamped(cycle.due_date, 1);
    await admin.from("restaurant_platform_billing").update({ next_due_date: nextDueDate }).eq("restaurant_id", parsed.data.restaurantId);
    await ensurePlatformPaymentCycle(admin, parsed.data.restaurantId, nextDueDate);
  }

  await reactivateRestaurantAfterPlatformPayment(admin, parsed.data.restaurantId);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}`);
  redirect(`${platformConfigPath(parsed.data.restaurantId)}&paymentPaid=1`);
}

export async function updateOwnerBillingSettingsAction(formData: FormData) {
  const parsed = updateOwnerBillingSettingsSchema.safeParse({
    ownerUserId: formData.get("ownerUserId"),
    restaurantId: formData.get("restaurantId"),
    currentOwnerBillingQrUrl: formData.get("currentOwnerBillingQrUrl") || undefined,
    nextDueDate: formData.get("ownerBillingNextDueDate"),
    reminderDays: formData.get("ownerBillingReminderDays") || 4,
    currency: formData.get("ownerBillingCurrency") || "BOB",
    platformQrNote: formData.get("ownerBillingQrNote") || undefined,
  });

  const fallbackRestaurantId = String(formData.get("restaurantId") || "");
  const returnTo = ownerAccountPath(fallbackRestaurantId);

  if (!parsed.success) {
    redirect(`${returnTo}?error=invalid-owner-billing-settings`);
  }

  const { user } = await requireSuperadmin();
  const admin = createAdminClient();
  if (!admin) {
    redirect(`${ownerAccountPath(parsed.data.restaurantId)}?error=service-role-required`);
  }

  const existingSnapshot = await ownerBillingService.getSnapshot(parsed.data.ownerUserId, { actorUserId: user.id, enforce: false });
  const currentQrUrl = existingSnapshot?.settings.platformQrUrl ?? undefined;
  let qrUrl: string | null = parsed.data.currentOwnerBillingQrUrl ?? currentQrUrl ?? null;

  try {
    qrUrl = (await uploadPublicImage(formData.get("ownerBillingQrFile") as File | null, `platform/owner-billing/${parsed.data.ownerUserId}/qr`)) ?? qrUrl;
  } catch {
    redirect(`${ownerAccountPath(parsed.data.restaurantId)}?error=owner-billing-qr-upload`);
  }

  const { error } = await admin.from("owner_platform_billing_settings").upsert(
    {
      owner_user_id: parsed.data.ownerUserId,
      billing_anchor_day: 15,
      next_due_date: parsed.data.nextDueDate,
      reminder_days: parsed.data.reminderDays,
      currency: parsed.data.currency.toUpperCase(),
      platform_qr_url: qrUrl,
      platform_qr_note: parsed.data.platformQrNote ?? null,
      updated_by: user.id,
    },
    { onConflict: "owner_user_id" },
  );

  if (error) {
    redirect(`${ownerAccountPath(parsed.data.restaurantId)}?error=${cashErrorKey(error, "owner-billing-settings-save")}`);
  }

  await ownerBillingService.getSnapshot(parsed.data.ownerUserId, { actorUserId: user.id, enforce: false });
  revalidatePath(ownerAccountPath(parsed.data.restaurantId));
  revalidatePath("/dueno/plan");
  redirect(`${ownerAccountPath(parsed.data.restaurantId)}?billingSaved=1`);
}

export async function submitOwnerBillingPaymentProofAction(formData: FormData) {
  const parsed = submitOwnerBillingPaymentProofSchema.safeParse({
    dueDate: formData.get("ownerBillingDueDate"),
    notes: formData.get("ownerBillingPaymentNotes") || undefined,
  });

  if (!parsed.success) {
    redirect("/dueno/plan?error=invalid-owner-billing-proof");
  }

  const { supabase, user } = await requireUser();
  const snapshot = await ownerBillingService.getSnapshot(user.id, { actorUserId: user.id, enforce: false });
  if (!snapshot?.isConfigured) {
    redirect("/dueno/plan?error=owner-billing-not-configured");
  }

  if (snapshot.currentCycle.dueDate !== parsed.data.dueDate) {
    redirect("/dueno/plan?error=owner-billing-cycle-mismatch");
  }

  if (snapshot.currentCycle.paidAt) {
    redirect("/dueno/plan?error=owner-billing-cycle-paid");
  }

  const proofFile = formData.get("ownerBillingPaymentProofFile") as File | null;
  if (!proofFile || proofFile.size === 0) {
    redirect("/dueno/plan?error=owner-billing-proof-required");
  }

  const proofTypeIsValid = proofFile.type.startsWith("image/") || proofFile.type === "application/pdf";
  if (!proofTypeIsValid || proofFile.size > MAX_OWNER_BILLING_PAYMENT_PROOF_BYTES) {
    redirect("/dueno/plan?error=invalid-owner-billing-proof");
  }

  let proofUrl: string | null = null;
  try {
    proofUrl = await uploadPrivateFile(proofFile, `platform/owner-billing/${user.id}/proofs`);
  } catch {
    redirect("/dueno/plan?error=owner-billing-proof-upload");
  }

  if (!proofUrl) {
    redirect("/dueno/plan?error=owner-billing-proof-upload");
  }

  const admin = createAdminClient();
  if (!admin) {
    redirect("/dueno/plan?error=service-role-required");
  }

  const { error } = await admin
    .from("owner_platform_payment_cycles")
    .update({
      proof_url: proofUrl,
      proof_uploaded_at: new Date().toISOString(),
      proof_verified_at: null,
      proof_verified_by: null,
      notes: parsed.data.notes ?? null,
      status: "proof_uploaded",
    })
    .eq("id", snapshot.currentCycle.id)
    .eq("owner_user_id", user.id);

  if (error) {
    redirect(`/dueno/plan?error=${cashErrorKey(error, "owner-billing-proof-save")}`);
  }

  await supabase.rpc("write_admin_audit", {
    p_action: "owner_billing_proof_uploaded",
    p_entity_type: "owner_platform_payment_cycle",
    p_entity_id: snapshot.currentCycle.id,
    p_restaurant_id: null,
    p_severity: "info",
    p_metadata: {
      amountDue: snapshot.currentCycle.amountDue,
      dueDate: snapshot.currentCycle.dueDate,
      ownerUserId: user.id,
    } satisfies Json,
  });

  revalidatePath("/dueno/plan");
  revalidatePath("/admin/restaurantes");
  redirect("/dueno/plan?paymentUploaded=1");
}

export async function approveOwnerBillingPaymentAction(formData: FormData) {
  const parsed = resolveOwnerBillingPaymentSchema.safeParse({
    ownerUserId: formData.get("ownerUserId"),
    restaurantId: formData.get("restaurantId"),
    cycleId: formData.get("cycleId"),
    notes: formData.get("ownerBillingResolutionNotes") || undefined,
  });

  const fallbackRestaurantId = String(formData.get("restaurantId") || "");
  const returnTo = ownerAccountPath(fallbackRestaurantId);

  if (!parsed.success) {
    redirect(`${returnTo}?error=invalid-owner-billing-cycle`);
  }

  const { supabase, user } = await requireSuperadmin();

  try {
    await ownerBillingService.markPaid({
      actorUserId: user.id,
      cycleId: parsed.data.cycleId,
      notes: parsed.data.notes,
      ownerUserId: parsed.data.ownerUserId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "owner-billing-payment-paid";
    redirect(`${ownerAccountPath(parsed.data.restaurantId)}?error=${encodeURIComponent(message)}`);
  }

  await supabase.rpc("write_admin_audit", {
    p_action: "owner_billing_payment_approved",
    p_entity_type: "owner_platform_payment_cycle",
    p_entity_id: parsed.data.cycleId,
    p_restaurant_id: parsed.data.restaurantId,
    p_severity: "warning",
    p_metadata: {
      ownerUserId: parsed.data.ownerUserId,
    } satisfies Json,
  });

  revalidatePath(ownerAccountPath(parsed.data.restaurantId));
  revalidatePath("/admin/restaurantes");
  revalidatePath("/dueno");
  revalidatePath("/dueno/plan");
  revalidatePath("/dueno/sucursales");
  redirect(`${ownerAccountPath(parsed.data.restaurantId)}?paymentPaid=1`);
}

export async function createOwnerChangeRequestAction(formData: FormData) {
  const parsed = createOwnerChangeRequestSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    requestedOwnerName: formData.get("requestedOwnerName"),
    requestedOwnerEmail: formData.get("requestedOwnerEmail"),
    reason: formData.get("ownerChangeReason") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/configuracion?tab=responsable&error=invalid-owner-request`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=responsable`);
  const { supabase, user } = await requireRestaurantAdminOrSuperadmin(parsed.data.restaurantId);

  const requests = await platformBillingService.listOwnerChangeRequests(parsed.data.restaurantId);
  if (requests.some((request) => request.status === "pending")) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=responsable&error=owner-change-pending`);
  }

  const policy = await platformBillingService.getOwnerChangePolicy(parsed.data.restaurantId);
  if (!policy.canRequestNow) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=responsable&error=owner-change-cooldown`);
  }

  const { data: currentRestaurant } = await supabase
    .from("restaurants")
    .select("owner_name,owner_email")
    .eq("id", parsed.data.restaurantId)
    .maybeSingle();

  const { error } = await supabase.from("restaurant_owner_change_requests").insert({
    restaurant_id: parsed.data.restaurantId,
    requested_by: user.id,
    current_owner_name: currentRestaurant?.owner_name ?? null,
    current_owner_email: currentRestaurant?.owner_email ?? null,
    requested_owner_name: parsed.data.requestedOwnerName.trim(),
    requested_owner_email: parsed.data.requestedOwnerEmail.trim().toLowerCase(),
    reason: parsed.data.reason ?? null,
    eligible_at: new Date().toISOString(),
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=responsable&error=${cashErrorKey(error, "owner-request-create")}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=responsable&ownerRequest=1`);
}

export async function approveOwnerChangeRequestAction(formData: FormData) {
  const parsed = resolveOwnerChangeRequestSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    requestId: formData.get("requestId"),
    notes: formData.get("ownerResolutionNotes") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/configuracion?tab=responsable&error=invalid-owner-resolution`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=responsable`);
  const { supabase, user } = await requireSuperadmin();

  const admin = createAdminClient();
  if (!admin) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=responsable&error=service-role-required`);
  }

  const { data: request } = await supabase
    .from("restaurant_owner_change_requests")
    .select("*")
    .eq("id", parsed.data.requestId)
    .eq("restaurant_id", parsed.data.restaurantId)
    .maybeSingle();

  if (!request || request.status !== "pending") {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=responsable&error=owner-request-missing`);
  }

  const { data: currentRestaurant } = await supabase
    .from("restaurants")
    .select("owner_user_id,owner_name,owner_email")
    .eq("id", parsed.data.restaurantId)
    .maybeSingle();

  if (!currentRestaurant) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=responsable&error=restaurant-not-found`);
  }

  const owner = await updateRestaurantOwnerAccess({
    supabase,
    restaurantId: parsed.data.restaurantId,
    currentOwnerUserId: currentRestaurant.owner_user_id,
    currentOwnerName: currentRestaurant.owner_name,
    currentOwnerEmail: currentRestaurant.owner_email,
    ownerName: request.requested_owner_name,
    ownerEmail: request.requested_owner_email,
    fallbackUserId: user.id,
    fallbackEmail: user.email ?? "",
  }).catch((error: Error) => {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=responsable&error=${error.message}`);
  });

  await admin
    .from("restaurants")
    .update({
      owner_user_id: owner.id,
      owner_name: owner.name,
      owner_email: owner.email,
    })
    .eq("id", parsed.data.restaurantId);

  const { error } = await admin
    .from("restaurant_owner_change_requests")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      resolution_notes: parsed.data.notes ?? null,
    })
    .eq("id", parsed.data.requestId);

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=responsable&error=${cashErrorKey(error, "owner-request-approve")}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=responsable&ownerApproved=1`);
}

export async function rejectOwnerChangeRequestAction(formData: FormData) {
  const parsed = resolveOwnerChangeRequestSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    requestId: formData.get("requestId"),
    notes: formData.get("ownerResolutionNotes") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/configuracion?tab=responsable&error=invalid-owner-resolution`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=responsable`);
  const { user } = await requireSuperadmin();

  const admin = createAdminClient();
  if (!admin) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=responsable&error=service-role-required`);
  }

  const { error } = await admin
    .from("restaurant_owner_change_requests")
    .update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      rejected_by: user.id,
      resolution_notes: parsed.data.notes ?? null,
    })
    .eq("id", parsed.data.requestId)
    .eq("restaurant_id", parsed.data.restaurantId);

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=responsable&error=${cashErrorKey(error, "owner-request-reject")}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=responsable&ownerRejected=1`);
}

function dateTimeInputToIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function revalidateAnnouncementPaths(restaurantId: string, restaurantSlug?: string) {
  revalidatePath("/");
  revalidatePath(`/admin/restaurantes/${restaurantId}/configuracion`);
  if (restaurantSlug) {
    revalidatePath(publicRestaurantPath(restaurantSlug));
    revalidatePath(`/r/${restaurantSlug}`);
  }
}

export async function createRestaurantAnnouncementAction(formData: FormData) {
  const parsed = createAnnouncementSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    restaurantSlug: formData.get("restaurantSlug") || undefined,
    type: formData.get("announcementType") || "announcement",
    title: formData.get("announcementTitle"),
    body: formData.get("announcementBody") || undefined,
    startsAt: formData.get("announcementStartsAt"),
    endsAt: formData.get("announcementEndsAt") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/configuracion?tab=avisos&error=invalid-announcement`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=avisos`);
  const { supabase, user } = await requireRestaurantAdminOrSuperadmin(parsed.data.restaurantId);
  const imageUrl = await uploadPublicImage(formData.get("announcementImageFile") as File | null, `restaurants/${parsed.data.restaurantId}/announcements`);

  const { error } = await supabase.from("restaurant_announcements").insert({
    restaurant_id: parsed.data.restaurantId,
    type: parsed.data.type,
    title: parsed.data.title.trim(),
    body: parsed.data.body?.trim() || null,
    image_url: imageUrl ?? null,
    starts_at: dateTimeInputToIso(parsed.data.startsAt),
    ends_at: parsed.data.endsAt ? dateTimeInputToIso(parsed.data.endsAt) : null,
    is_active: true,
    created_by: user.id,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=avisos&error=${error.code}`);
  }

  revalidateAnnouncementPaths(parsed.data.restaurantId, parsed.data.restaurantSlug);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=avisos&announcement=1`);
}

export async function updateRestaurantAnnouncementAction(formData: FormData) {
  const announcementId = String(formData.get("announcementId") || "");
  const parsed = updateAnnouncementSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    restaurantSlug: formData.get("restaurantSlug") || undefined,
    announcementId,
    type: formData.get(`announcementType_${announcementId}`) || "announcement",
    title: formData.get(`announcementTitle_${announcementId}`),
    body: formData.get(`announcementBody_${announcementId}`) || undefined,
    startsAt: formData.get(`announcementStartsAt_${announcementId}`),
    endsAt: formData.get(`announcementEndsAt_${announcementId}`) || undefined,
    isActive: booleanFromForm(formData, `announcementIsActive_${announcementId}`),
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/configuracion?tab=avisos&error=invalid-announcement`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=avisos`);
  const { supabase } = await requireRestaurantAdminOrSuperadmin(parsed.data.restaurantId);
  const imageUrl = await uploadPublicImage(formData.get(`announcementImageFile_${announcementId}`) as File | null, `restaurants/${parsed.data.restaurantId}/announcements`);

  const updatePayload: {
    type: "announcement" | "closure";
    title: string;
    body: string | null;
    starts_at: string;
    ends_at: string | null;
    is_active: boolean;
    image_url?: string;
  } = {
    type: parsed.data.type,
    title: parsed.data.title.trim(),
    body: parsed.data.body?.trim() || null,
    starts_at: dateTimeInputToIso(parsed.data.startsAt),
    ends_at: parsed.data.endsAt ? dateTimeInputToIso(parsed.data.endsAt) : null,
    is_active: parsed.data.isActive,
  };

  if (imageUrl) {
    updatePayload.image_url = imageUrl;
  }

  const { error } = await supabase
    .from("restaurant_announcements")
    .update(updatePayload)
    .eq("id", parsed.data.announcementId)
    .eq("restaurant_id", parsed.data.restaurantId);

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=avisos&error=${error.code}`);
  }

  revalidateAnnouncementPaths(parsed.data.restaurantId, parsed.data.restaurantSlug);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=avisos&announcement=updated`);
}

export async function closeRestaurantTodayAction(formData: FormData) {
  const parsed = closeTodaySchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    restaurantSlug: formData.get("restaurantSlug") || undefined,
    title: formData.get("closureTitle") || "Cerrado por hoy",
    body: formData.get("closureBody") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/configuracion?tab=avisos&error=invalid-closure`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=avisos`);
  const { supabase, user } = await requireRestaurantAdminOrSuperadmin(parsed.data.restaurantId);
  const endsAt = new Date();
  endsAt.setHours(23, 59, 59, 999);

  const { error } = await supabase.from("restaurant_announcements").insert({
    restaurant_id: parsed.data.restaurantId,
    type: "closure",
    title: parsed.data.title.trim(),
    body: parsed.data.body?.trim() || "No recibiremos pedidos hasta el proximo horario disponible.",
    starts_at: new Date().toISOString(),
    ends_at: endsAt.toISOString(),
    is_active: true,
    created_by: user.id,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=avisos&error=${error.code}`);
  }

  revalidateAnnouncementPaths(parsed.data.restaurantId, parsed.data.restaurantSlug);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=avisos&closed=1`);
}

export async function deactivateRestaurantAnnouncementAction(formData: FormData) {
  const parsedInput = announcementDeactivateInputSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    restaurantSlug: formData.get("restaurantSlug") || undefined,
    announcementId: formData.get("announcementId"),
  });

  if (!parsedInput.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/configuracion?tab=avisos&error=invalid-announcement`);
  }

  let restaurantId = parsedInput.data.restaurantId;
  if (!restaurantId) {
    const admin = createAdminClient();
    if (admin) {
      const { data: announcement } = await admin.from("restaurant_announcements").select("restaurant_id").eq("id", parsedInput.data.announcementId).maybeSingle();
      restaurantId = announcement?.restaurant_id;
    }
  }

  const parsed = announcementIdSchema.safeParse({
    restaurantId,
    restaurantSlug: parsedInput.data.restaurantSlug,
    announcementId: parsedInput.data.announcementId,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${restaurantId ?? formData.get("restaurantId")}/configuracion?tab=avisos&error=invalid-announcement`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=avisos`);
  const { supabase } = await requireRestaurantAdminOrSuperadmin(parsed.data.restaurantId);
  const { error } = await supabase
    .from("restaurant_announcements")
    .update({ is_active: false })
    .eq("id", parsed.data.announcementId)
    .eq("restaurant_id", parsed.data.restaurantId);

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=avisos&error=${error.code}`);
  }

  revalidateAnnouncementPaths(parsed.data.restaurantId, parsed.data.restaurantSlug);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=avisos&disabled=1`);
}

function invoiceConfigurationPath(restaurantId: string, formData: FormData) {
  const params = new URLSearchParams({ tab: "facturas" });
  const invoiceFrom = String(formData.get("invoiceFrom") || "");
  const invoiceTo = String(formData.get("invoiceTo") || "");
  const invoiceStatus = String(formData.get("invoiceStatus") || "all");

  if (/^\d{4}-\d{2}-\d{2}$/.test(invoiceFrom)) {
    params.set("invoiceFrom", invoiceFrom);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(invoiceTo)) {
    params.set("invoiceTo", invoiceTo);
  }

  if (invoiceStatus === "pending" || invoiceStatus === "issued") {
    params.set("invoiceStatus", invoiceStatus);
  }

  return `/admin/restaurantes/${restaurantId}/configuracion?${params.toString()}`;
}

export async function markInvoiceIssuedAction(formData: FormData) {
  const restaurantId = String(formData.get("restaurantId") || "");
  const parsed = markInvoiceIssuedSchema.safeParse({
    restaurantId,
    orderId: formData.get("orderId"),
    invoiceNumber: formData.get(`invoiceNumber_${formData.get("orderId")}`) || undefined,
    invoiceNotes: formData.get(`invoiceNotes_${formData.get("orderId")}`) || undefined,
  });

  if (!parsed.success) {
    redirectWithError(invoiceConfigurationPath(restaurantId, formData), "invalid-invoice");
  }

  const invoiceReturnPath = invoiceConfigurationPath(parsed.data.restaurantId, formData);
  await requireRestaurantAccess(parsed.data.restaurantId, invoiceReturnPath);
  const { supabase, user } = await requireRestaurantAdminOrSuperadmin(parsed.data.restaurantId);
  const { error } = await supabase
    .from("orders")
    .update({
      invoice_issued_at: new Date().toISOString(),
      invoice_issued_by: user.id,
      invoice_number: parsed.data.invoiceNumber?.trim() || null,
      invoice_notes: parsed.data.invoiceNotes?.trim() || null,
    })
    .eq("id", parsed.data.orderId)
    .eq("restaurant_id", parsed.data.restaurantId)
    .eq("invoice_required", true)
    .is("invoice_issued_at", null);

  if (error) {
    redirectWithError(invoiceReturnPath, cashErrorKey(error, "invoice-issued"));
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion`);
  redirect(`${invoiceReturnPath}&invoiceMarked=1`);
}

export async function createCategoryAction(formData: FormData) {
  const returnPath =
    formData.get("returnTo") === "products" && formData.get("restaurantId")
      ? `/admin/restaurantes/${formData.get("restaurantId")}/productos`
      : `/admin/restaurantes/${formData.get("restaurantId")}/categorias`;
  const parsed = createCategorySchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    sortOrder: formData.get("sortOrder") || 0,
    isActive: formData.has("isActive") ? formData.get("isActive") === "on" : true,
  });

  if (!parsed.success) {
    redirectWithError(returnPath, "invalid");
  }

  await requireRestaurantOwnerOrSuperadmin(parsed.data.restaurantId, returnPath);
  const admin = createAdminClient();

  if (!admin) {
    redirectWithError(returnPath, "service-role-required");
  }

  let imageUrl: string | null = null;
  try {
    imageUrl = await uploadPublicImage(formData.get("imageFile") as File | null, `restaurants/${parsed.data.restaurantId}/categories`);
  } catch {
    redirectWithError(returnPath, "storage-upload");
  }

  const { error } = await admin.from("categories").insert({
    restaurant_id: parsed.data.restaurantId,
    name: parsed.data.name,
    description: parsed.data.description,
    image_url: imageUrl,
    sort_order: parsed.data.sortOrder,
    is_active: parsed.data.isActive,
  });

  if (error) {
    redirectWithError(returnPath, error.code);
  }

  await revalidateRestaurantCatalogPaths(parsed.data.restaurantId, admin);
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
    compareAtPrice: formData.get("compareAtPrice") || undefined,
    imageUrl: "",
    imagePositionX: formData.get("imagePositionX") || 50,
    imagePositionY: formData.get("imagePositionY") || 50,
    imageZoom: formData.get("imageZoom") || 1,
    isAvailable: formData.get("isAvailable") === "on",
    isFeatured: formData.get("isFeatured") === "on",
    trackStock: formData.get("trackStock") === "on",
    productKind: formData.get("productKind") || "standard",
    availableFrom: formData.get("availableFrom") || undefined,
    availableUntil: formData.get("availableUntil") || undefined,
    availableDays: parseProductDays(formData.get("availableDays")),
    availableStartTime: formData.get("availableStartTime") || undefined,
    availableEndTime: formData.get("availableEndTime") || undefined,
    sortOrder: formData.get("sortOrder") || 0,
    variants: parseJsonArray(formData.get("variantsJson")),
    optionGroups: parseJsonArray(formData.get("optionGroupsJson")),
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/productos?error=invalid`);
  }

  const scheduleError = validateProductScheduleInput(parsed.data);
  if (scheduleError) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=${scheduleError}`);
  }

  await requireRestaurantOwnerOrSuperadmin(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/productos`);
  const admin = createAdminClient();

  if (!admin) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=service-role-required`);
  }

  let imageUrl: string | null = null;
  try {
    imageUrl = await uploadPublicImage(formData.get("imageFile") as File | null, `restaurants/${parsed.data.restaurantId}/products`);
  } catch {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=storage-upload`);
  }

  const { data: product, error } = await admin
    .from("products")
    .insert({
      restaurant_id: parsed.data.restaurantId,
      category_id: parsed.data.categoryId,
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price,
      compare_at_price: parsed.data.compareAtPrice ?? null,
      image_url: imageUrl,
      image_position_x: clampProductImagePosition(parsed.data.imagePositionX),
      image_position_y: clampProductImagePosition(parsed.data.imagePositionY),
      image_zoom: clampProductImageZoom(parsed.data.imageZoom),
      is_available: parsed.data.isAvailable,
      is_featured: parsed.data.isFeatured,
      track_stock: parsed.data.trackStock,
      product_kind: parsed.data.productKind,
      available_from: optionalDateTimeInputToIso(parsed.data.availableFrom),
      available_until: optionalDateTimeInputToIso(parsed.data.availableUntil),
      available_days: parsed.data.availableDays?.length ? parsed.data.availableDays : null,
      available_start_time: optionalTimeInput(parsed.data.availableStartTime),
      available_end_time: optionalTimeInput(parsed.data.availableEndTime),
      sort_order: parsed.data.sortOrder,
    })
    .select("id")
    .single();

  if (error || !product) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=${error?.code ?? "product-create"}`);
  }

  const variants = parsed.data.variants.filter((variant) => variant.name.trim());
  if (variants.length) {
    const { error: variantsError } = await admin.from("product_variants").insert(
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
    const { data: insertedGroup, error: groupError } = await admin
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
      const { error: optionsError } = await admin.from("product_options").insert(
        options.map((option) => ({
          restaurant_id: parsed.data.restaurantId,
          product_id: product.id,
          option_group_id: insertedGroup.id,
          name: option.name.trim(),
          description: option.description || null,
          price_delta: option.priceDelta,
          inventory_item_id: option.inventoryItemId || null,
          inventory_quantity: option.inventoryItemId ? (option.inventoryQuantity ?? 1) : null,
          inventory_waste_factor: option.inventoryWasteFactor,
          sort_order: option.sortOrder,
          is_active: option.isActive,
        })),
      );

      if (optionsError) {
        redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=${optionsError.code}`);
      }
    }
  }

  await revalidateRestaurantCatalogPaths(parsed.data.restaurantId, admin);
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
    compareAtPrice: formData.get("compareAtPrice") || undefined,
    imageUrl: "",
    imagePositionX: formData.get("imagePositionX") || 50,
    imagePositionY: formData.get("imagePositionY") || 50,
    imageZoom: formData.get("imageZoom") || 1,
    isAvailable: formData.get("isAvailable") === "on",
    isFeatured: formData.get("isFeatured") === "on",
    trackStock: formData.get("trackStock") === "on",
    productKind: formData.get("productKind") || "standard",
    availableFrom: formData.get("availableFrom") || undefined,
    availableUntil: formData.get("availableUntil") || undefined,
    availableDays: parseProductDays(formData.get("availableDays")),
    availableStartTime: formData.get("availableStartTime") || undefined,
    availableEndTime: formData.get("availableEndTime") || undefined,
    sortOrder: formData.get("sortOrder") || 0,
    variants: parseJsonArray(formData.get("variantsJson")),
    optionGroups: parseJsonArray(formData.get("optionGroupsJson")),
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/productos?error=invalid-update`);
  }

  const scheduleError = validateProductScheduleInput(parsed.data);
  if (scheduleError) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=${scheduleError}`);
  }

  await requireRestaurantOwnerOrSuperadmin(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/productos`);
  const admin = createAdminClient();

  if (!admin) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=service-role-required`);
  }

  let imageUrl: string | null = null;
  try {
    imageUrl = await uploadPublicImage(formData.get("imageFile") as File | null, `restaurants/${parsed.data.restaurantId}/products`);
  } catch {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=storage-upload`);
  }

  const updatePayload: {
    category_id?: string | null;
    name: string;
    description: string | null;
    price: number;
    compare_at_price: number | null;
    is_available: boolean;
    is_featured: boolean;
    track_stock: boolean;
    product_kind: "standard" | "promotion" | "lunch";
    available_from: string | null;
    available_until: string | null;
    available_days: number[] | null;
    available_start_time: string | null;
    available_end_time: string | null;
    sort_order: number;
    image_url?: string | null;
    image_position_x: number;
    image_position_y: number;
    image_zoom: number;
  } = {
    category_id: parsed.data.categoryId ?? null,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    price: parsed.data.price,
    compare_at_price: parsed.data.compareAtPrice ?? null,
    is_available: parsed.data.isAvailable,
    is_featured: parsed.data.isFeatured,
    track_stock: parsed.data.trackStock,
    product_kind: parsed.data.productKind,
    available_from: optionalDateTimeInputToIso(parsed.data.availableFrom),
    available_until: optionalDateTimeInputToIso(parsed.data.availableUntil),
    available_days: parsed.data.availableDays?.length ? parsed.data.availableDays : null,
    available_start_time: optionalTimeInput(parsed.data.availableStartTime),
    available_end_time: optionalTimeInput(parsed.data.availableEndTime),
    sort_order: parsed.data.sortOrder,
    image_position_x: clampProductImagePosition(parsed.data.imagePositionX),
    image_position_y: clampProductImagePosition(parsed.data.imagePositionY),
    image_zoom: clampProductImageZoom(parsed.data.imageZoom),
  };

  if (imageUrl) {
    updatePayload.image_url = imageUrl;
  }

  const { error } = await admin
    .from("products")
    .update(updatePayload)
    .eq("id", parsed.data.productId)
    .eq("restaurant_id", parsed.data.restaurantId);

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=${error.code}`);
  }

  await admin.from("product_variants").delete().eq("restaurant_id", parsed.data.restaurantId).eq("product_id", parsed.data.productId);
  await admin.from("product_option_groups").delete().eq("restaurant_id", parsed.data.restaurantId).eq("product_id", parsed.data.productId);

  const variants = parsed.data.variants.filter((variant) => variant.name.trim());
  if (variants.length) {
    const { error: variantsError } = await admin.from("product_variants").insert(
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
    const { data: insertedGroup, error: groupError } = await admin
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
      const { error: optionsError } = await admin.from("product_options").insert(
        options.map((option) => ({
          restaurant_id: parsed.data.restaurantId,
          product_id: parsed.data.productId,
          option_group_id: insertedGroup.id,
          name: option.name.trim(),
          description: option.description || null,
          price_delta: option.priceDelta,
          inventory_item_id: option.inventoryItemId || null,
          inventory_quantity: option.inventoryItemId ? (option.inventoryQuantity ?? 1) : null,
          inventory_waste_factor: option.inventoryWasteFactor,
          sort_order: option.sortOrder,
          is_active: option.isActive,
        })),
      );

      if (optionsError) {
        redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=${optionsError.code}`);
      }
    }
  }

  await revalidateRestaurantCatalogPaths(parsed.data.restaurantId, admin);
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

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/mesas`);

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

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/mesas`);

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
  revalidatePath("/", "layout");
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

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/mesas`);

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
  revalidatePath("/", "layout");
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
    tab: formData.get("tab") || undefined,
  });

  if (!parsed.success) {
    redirect("/admin?error=invalid-order-status");
  }

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/pedidos`);

  const nextStatus = parsed.data.status as OrderStatus;
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data: order } = await supabase
    .from("orders")
    .select("status,payment_status")
    .eq("restaurant_id", parsed.data.restaurantId)
    .eq("id", parsed.data.orderId)
    .maybeSingle();

  if (!order) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/pedidos?error=order-not-found`);
  }

  const validTransitions: Record<OrderStatus, OrderStatus[]> = {
    pending: ["accepted", "cancelled"],
    accepted: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready: ["delivered", "cancelled"],
    delivered: [],
    cancelled: [],
  };

  if (nextStatus !== order.status && !validTransitions[order.status as OrderStatus].includes(nextStatus)) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/pedidos?error=invalid-order-transition`);
  }
  const statusChanged = nextStatus !== order.status;

  if (nextStatus === "cancelled" && order.payment_status === "paid") {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/pedidos?error=refund-required`);
  }

  if (nextStatus === "accepted") {
    const session = await getOpenCashSession(parsed.data.restaurantId);

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

  const { error: updateError } = await supabase.from("orders").update(updatePayload).eq("id", parsed.data.orderId).eq("restaurant_id", parsed.data.restaurantId);
  if (updateError) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/pedidos?error=${updateError.code}`);
  }

  if (nextStatus === "cancelled") {
    await supabase.rpc("reverse_order_inventory_usage", {
      p_order_id: parsed.data.orderId,
      p_reason: "Reversión por cancelación de pedido",
    });
  }

  if (statusChanged) {
    await sendOrderStatusPush({
      orderId: parsed.data.orderId,
      status: nextStatus,
    }).catch((error) => {
      console.error("order-status-push-failed", error);
    });
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/pedidos`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  if (parsed.data.restaurantSlug) {
    revalidatePath(`/cocina/${parsed.data.restaurantSlug}`);
    revalidatePath(publicRestaurantPath(parsed.data.restaurantSlug));
    revalidatePath(publicRestaurantPath(parsed.data.restaurantSlug, "seguimiento"));
    revalidatePath(`/r/${parsed.data.restaurantSlug}`);
    revalidatePath(`/r/${parsed.data.restaurantSlug}/seguimiento`);
  }

  if (parsed.data.source === "kitchen" && parsed.data.restaurantSlug) {
    redirect(`/cocina/${parsed.data.restaurantSlug}`);
  }

  if (parsed.data.source === "pedidos") {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/pedidos?updated=1&tab=cocina`);
  }

  if (parsed.data.source === "caja") {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?tab=${parsed.data.tab ?? "pedidos"}&updated=1`);
  }

  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/pedidos?updated=1`);
}

function normalizePhoneForWhatsApp(phone: string) {
  return phone.replace(/\D/g, "");
}

function endOfBusinessDayIso(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? date.getUTCFullYear());
  const month = Number(parts.find((part) => part.type === "month")?.value ?? date.getUTCMonth() + 1);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? date.getUTCDate());

  return new Date(Date.UTC(year, month - 1, day + 1, 4, 0, 0, 0)).toISOString();
}

async function currentPublicOrigin() {
  const headerStore = await headers();
  const fallbackPort = process.env.PORT?.trim() || "3000";
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? `localhost:${fallbackPort}`;
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function createDeliveryLinkAction(input: {
  restaurantId: string;
  restaurantSlug: string;
  orderId: string;
  deliveryPhone: string;
  deliveryName?: string;
}) {
  const parsed = createDeliveryLinkSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: "Datos invalidos para enviar al repartidor." };
  }

  const { supabase } = await requireRestaurantMemberOrSuperadmin(parsed.data.restaurantId);
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, restaurant_id, order_number, order_type, status, customer_name, customer_phone, customer_address, delivery_address_detail, delivery_latitude, delivery_longitude, delivery_maps_url")
    .eq("restaurant_id", parsed.data.restaurantId)
    .eq("id", parsed.data.orderId)
    .maybeSingle();

  if (orderError || !order) {
    return { ok: false, error: "No encontramos ese pedido." };
  }

  if (order.order_type !== "delivery") {
    return { ok: false, error: "Solo los pedidos delivery se pueden enviar a repartidor." };
  }

  if (["cancelled", "delivered"].includes(order.status)) {
    return { ok: false, error: "Este pedido ya no esta disponible para envio." };
  }

  await supabase.rpc("expire_old_delivery_links");

  const deliveryToken = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const deliveryPhone = parsed.data.deliveryPhone?.trim() ?? "";
  const deliveryName = parsed.data.deliveryName?.trim() || null;
  const expiresAt = endOfBusinessDayIso();

  const { error } = await supabase.from("order_delivery_links").upsert(
    {
      restaurant_id: parsed.data.restaurantId,
      order_id: parsed.data.orderId,
      delivery_token: deliveryToken,
      delivery_phone: deliveryPhone,
      delivery_name: deliveryName,
      status: "active",
      opened_at: null,
      arrived_at: null,
      delivered_at: null,
      expires_at: expiresAt,
    },
    { onConflict: "order_id" },
  );

  if (error) {
    return { ok: false, error: `No se pudo generar el link: ${error.message}` };
  }

  const deliveryUrl = `${await currentPublicOrigin()}/delivery/${deliveryToken}`;
  const deliveryMapsUrl = hasValidCoordinates(order.delivery_latitude, order.delivery_longitude)
    ? directionsToMapsUrl({
        address: order.customer_address,
        latitude: Number(order.delivery_latitude),
        longitude: Number(order.delivery_longitude),
      })
    : order.delivery_maps_url;

  const message = encodeURIComponent(
    [
      `Pedido ${order.order_number} para entregar.`,
      `Cliente: ${order.customer_name ?? "Cliente"}`,
      order.customer_phone ? `Telefono: ${order.customer_phone}` : "",
      order.customer_address ? `Direccion: ${order.customer_address}` : "",
      order.delivery_address_detail ? `Referencia: ${order.delivery_address_detail}` : "",
      deliveryMapsUrl ? `Google Maps: ${deliveryMapsUrl}` : "",
      `Abrir datos y marcar entrega: ${deliveryUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  const whatsappDigits = normalizePhoneForWhatsApp(deliveryPhone);
  const whatsappUrl = whatsappDigits ? `https://wa.me/${whatsappDigits}?text=${message}` : "";

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/pedidos`);
  revalidatePath(`/cocina/${parsed.data.restaurantSlug}`);

  return {
    ok: true,
    orderNumber: order.order_number,
    deliveryUrl,
    whatsappUrl,
    deliveryPhone,
    expiresAt,
  };
}

export async function saveDeliveryZoneAction(formData: FormData) {
  const parsed = deliveryZoneSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    zoneId: formData.get("zoneId") || undefined,
    name: formData.get("zoneName"),
    city: formData.get("zoneCity") || undefined,
    centerLatitude: formData.get("zoneLatitude") || undefined,
    centerLongitude: formData.get("zoneLongitude") || undefined,
    radiusKm: formData.get("zoneRadiusKm") || 3,
    deliveryFee: formData.get("zoneDeliveryFee") || 0,
    minOrderAmount: formData.get("zoneMinOrderAmount") || 0,
  });

  const restaurantId = String(formData.get("restaurantId") || "");
  if (!parsed.success) {
    redirect(`/admin/restaurantes/${restaurantId}/configuracion?tab=delivery&error=invalid-zone`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=delivery`);
  const { supabase } = await requireRestaurantOwnerOrSuperadmin(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=delivery`);

  const payload = {
    restaurant_id: parsed.data.restaurantId,
    name: parsed.data.name,
    city: parsed.data.city ?? null,
    center_latitude: parsed.data.centerLatitude ?? null,
    center_longitude: parsed.data.centerLongitude ?? null,
    radius_km: parsed.data.radiusKm,
    delivery_fee: parsed.data.deliveryFee,
    min_order_amount: parsed.data.minOrderAmount,
    is_active: true,
  };

  const response = parsed.data.zoneId
    ? await supabase.from("restaurant_delivery_zones").update(payload).eq("restaurant_id", parsed.data.restaurantId).eq("id", parsed.data.zoneId)
    : await supabase.from("restaurant_delivery_zones").insert(payload);

  if (response.error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=delivery&error=${response.error.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=delivery&zone=1`);
}

export async function toggleDeliveryZoneAction(formData: FormData) {
  const parsed = deliveryZoneIdSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    zoneId: formData.get("zoneId"),
  });

  const restaurantId = String(formData.get("restaurantId") || "");
  if (!parsed.success) {
    redirect(`/admin/restaurantes/${restaurantId}/configuracion?tab=delivery&error=invalid-zone`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=delivery`);
  const { supabase } = await requireRestaurantOwnerOrSuperadmin(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=delivery`);
  const { data: zone } = await supabase
    .from("restaurant_delivery_zones")
    .select("is_active")
    .eq("restaurant_id", parsed.data.restaurantId)
    .eq("id", parsed.data.zoneId)
    .maybeSingle();

  const { error } = await supabase
    .from("restaurant_delivery_zones")
    .update({ is_active: !(zone?.is_active ?? true) })
    .eq("restaurant_id", parsed.data.restaurantId)
    .eq("id", parsed.data.zoneId);

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=delivery&error=${error.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=delivery&zone=1`);
}

export async function deleteDeliveryZoneAction(formData: FormData) {
  const parsed = deliveryZoneIdSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    zoneId: formData.get("zoneId"),
  });

  const restaurantId = String(formData.get("restaurantId") || "");
  if (!parsed.success) {
    redirect(`/admin/restaurantes/${restaurantId}/configuracion?tab=delivery&error=invalid-zone`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=delivery`);
  const { supabase } = await requireRestaurantOwnerOrSuperadmin(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=delivery`);
  const { error } = await supabase
    .from("restaurant_delivery_zones")
    .delete()
    .eq("restaurant_id", parsed.data.restaurantId)
    .eq("id", parsed.data.zoneId);

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=delivery&error=${error.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/configuracion?tab=delivery&zone=1`);
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

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/caja?tab=cierre`);

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

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/caja?tab=cierre`);

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

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/caja?tab=egresos`);

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
  await requireRestaurantAccess(parsed.data.restaurantId, redirectPath);

  const receiptFile = formData.get("paymentReceiptFile") as File | null;
  const uploadedReceiptUrl =
    receiptFile && receiptFile.size > 0
      ? await uploadPrivateFile(receiptFile, `restaurants/${parsed.data.restaurantId}/payment-receipts`)
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

  await requireRestaurantAccess(parsed.data.restaurantId, orderDecisionRedirectPath(parsed.data.restaurantId, parsed.data.source));

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
    customerPhone: formData.get("customerPhone") || undefined,
    orderOrigin: formData.get("orderOrigin") || "pos_counter",
    cart,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/caja?tab=venta&error=invalid-pos-sale`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/caja?tab=venta`);

  const { supabase, user } = await requireUser();
  void user;

  if (parsed.data.paymentMethod === "qr") {
    const { data: settings } = await supabase
      .from("restaurant_settings")
      .select("qr_payment_url")
      .eq("restaurant_id", parsed.data.restaurantId)
      .maybeSingle();

    if (!normalizeQrPaymentUrl(settings?.qr_payment_url)) {
      redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?tab=venta&error=qr-unavailable`);
    }
  }

  const receiptFile = formData.get("paymentReceiptFile") as File | null;
  const paymentReceiptUrl =
    parsed.data.paymentMethod === "qr" && receiptFile && receiptFile.size > 0
      ? await uploadPrivateFile(receiptFile, `restaurants/${parsed.data.restaurantId}/payment-receipts`)
      : null;

  if (parsed.data.paymentMethod === "qr" && !paymentReceiptUrl && !parsed.data.paymentReceiptReference) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?tab=venta&error=receipt-required`);
  }

  const orderNumber = `POS-${Date.now()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

  const { data: orderId, error } = await supabase.rpc("create_pos_sale_with_cash_movement", {
    p_restaurant_id: parsed.data.restaurantId,
    p_order_number: orderNumber,
    p_customer_name: parsed.data.customerName ?? null,
    p_customer_phone: parsed.data.customerPhone ?? null,
    p_order_origin: parsed.data.orderOrigin as OrderOrigin,
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

  const { data: createdOrder } = await supabase
    .from("orders")
    .select("id,order_number,tracking_token,customer_phone")
    .eq("id", orderId ?? "")
    .maybeSingle();

  const redirectUrl = new URL(`/admin/restaurantes/${parsed.data.restaurantId}/caja`, await currentPublicOrigin());
  redirectUrl.searchParams.set("tab", "venta");
  redirectUrl.searchParams.set("pos", "1");

  if (createdOrder?.id && createdOrder.order_number && createdOrder.tracking_token) {
    redirectUrl.searchParams.set("posOrderId", createdOrder.id);
    redirectUrl.searchParams.set("posOrderNumber", createdOrder.order_number);
    redirectUrl.searchParams.set("posTrackingToken", createdOrder.tracking_token);
    if (createdOrder.customer_phone) {
      redirectUrl.searchParams.set("posCustomerPhone", createdOrder.customer_phone);
    }
  }

  redirect(redirectUrl.pathname + redirectUrl.search);
}

export async function refundOrderAction(formData: FormData) {
  const parsed = refundOrderSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    orderId: formData.get("orderId"),
    restaurantSlug: formData.get("restaurantSlug") || undefined,
    reason: formData.get("reason"),
    source: formData.get("source") || "pedidos",
  });

  const fallbackPath = orderDecisionRedirectPath(String(formData.get("restaurantId")), "pedidos");
  if (!parsed.success) {
    redirect(`${fallbackPath}${fallbackPath.includes("?") ? "&" : "?"}error=refund-reason-required`);
  }

  const redirectPath = orderDecisionRedirectPath(parsed.data.restaurantId, parsed.data.source);
  await requireRestaurantAccess(parsed.data.restaurantId, redirectPath);
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("refund_order_atomic", {
    p_restaurant_id: parsed.data.restaurantId,
    p_order_id: parsed.data.orderId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    redirect(`${redirectPath}${redirectPath.includes("?") ? "&" : "?"}error=${cashErrorKey(error, "refund-order")}`);
  }

  await revalidateOrderDecisionPaths(parsed.data.restaurantId, parsed.data.restaurantSlug);
  redirect(`${redirectPath}${redirectPath.includes("?") ? "&" : "?"}refunded=1`);
}

export async function createInventoryItemAction(formData: FormData) {
  const parsed = createInventoryItemSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    name: formData.get("name"),
    itemKind: formData.get("itemKind") || "ingredient",
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

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/inventario`);

  const { supabase, user } = await requireUser();
  const { data: item, error } = await supabase
    .from("inventory_items")
    .insert({
      restaurant_id: parsed.data.restaurantId,
      name: parsed.data.name,
      item_kind: parsed.data.itemKind,
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

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=proveedores`);

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

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=catalogo`);

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

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=zonas`);

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

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=recetas`);

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

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=proveedores`);

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
    lotCode: formData.get("lotCode") || undefined,
    expiresOn: formData.get("expiresOn") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/inventario?error=invalid-movement`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/inventario`);

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
    p_lot_code: parsed.data.lotCode || null,
    p_expires_on: parsed.data.expiresOn || null,
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

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=zonas`);

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

export async function transferInventoryBranchAction(formData: FormData) {
  const parsed = transferInventoryBranchSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    targetRestaurantId: formData.get("targetRestaurantId"),
    inventoryItemId: formData.get("inventoryItemId"),
    targetInventoryItemId: formData.get("targetInventoryItemId"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/inventario?tab=transferencias&error=invalid-branch-transfer`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=transferencias`);

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("transfer_inventory_branch_atomic", {
    p_from_restaurant_id: parsed.data.restaurantId,
    p_to_restaurant_id: parsed.data.targetRestaurantId,
    p_from_inventory_item_id: parsed.data.inventoryItemId,
    p_to_inventory_item_id: parsed.data.targetInventoryItemId,
    p_quantity: parsed.data.quantity,
    p_reason: parsed.data.reason,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=transferencias&error=${cashErrorKey(error, "branch-transfer")}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/inventario`);
  revalidatePath(`/admin/restaurantes/${parsed.data.targetRestaurantId}/inventario`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=transferencias&transfer=1`);
}

export async function openInventoryCountAction(formData: FormData) {
  const parsed = inventoryCountRestaurantSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/inventario?tab=conteo&error=invalid-count`);
  }

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=conteo`);

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

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=conteo`);

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

  await requireRestaurantAccess(parsed.data.restaurantId, `/admin/restaurantes/${parsed.data.restaurantId}/inventario?tab=conteo`);

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
