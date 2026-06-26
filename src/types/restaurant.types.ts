export type AppRole = "superadmin" | "restaurant_admin" | "cashier" | "kitchen" | "waiter";
export type RestaurantStatus = "active" | "inactive" | "suspended";
export type PlanKey = "basic" | "pro" | "premium";
export type ModuleKey =
  | "public_menu"
  | "orders"
  | "table_qr"
  | "kitchen"
  | "cash"
  | "inventory"
  | "reports"
  | "multi_user";

export type RestaurantTheme = {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
};

export type Restaurant = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: RestaurantStatus;
  logoUrl: string;
  bannerUrl: string;
  primaryColor: string;
  secondaryColor: string;
  whatsapp: string;
  address: string;
  city: string;
  theme: RestaurantTheme;
  planKey?: PlanKey;
  activeModules?: ModuleKey[];
};

export type RestaurantSettings = {
  restaurantId: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  tableOrdersEnabled: boolean;
  inventoryEnabled: boolean;
  cashEnabled: boolean;
  kitchenEnabled: boolean;
  deliveryFee: number;
  freeDeliveryFrom: number;
  minOrderAmount: number;
  currency: string;
  qrPaymentUrl: string;
  printFormat?: "thermal_58" | "thermal_80" | "large";
  autoPrintKitchen?: boolean;
  printLogo?: boolean;
};

export type BusinessHour = {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
};

export type SubscriptionPlan = {
  id: string;
  key: PlanKey;
  name: string;
  description: string;
  priceMonthly: number;
  maxRestaurants: number;
  maxUsersPerRestaurant: number;
  isActive: boolean;
  modules: ModuleKey[];
};

export type RestaurantSubscription = {
  id: string;
  restaurantId: string;
  planId: string;
  status: "trialing" | "active" | "past_due" | "cancelled";
  startsAt: string;
  endsAt?: string;
};
