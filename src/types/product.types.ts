export type Category = {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  imageUrl?: string;
  sortOrder: number;
  isActive: boolean;
};

export type Product = {
  id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  prepMinutes: number;
  imageUrl: string;
  imagePositionX: number;
  imagePositionY: number;
  imageZoom: number;
  isAvailable: boolean;
  isFeatured: boolean;
  isAutoFeatured?: boolean;
  trackStock: boolean;
  productKind: "standard" | "promotion" | "lunch";
  availableFrom?: string;
  availableUntil?: string;
  availableDays?: number[];
  availableStartTime?: string;
  availableEndTime?: string;
  isPromotion?: boolean;
  orderCount: number;
  lastOrderedAt?: string;
  sortOrder: number;
};

export type ProductVariant = {
  id: string;
  restaurantId: string;
  productId: string;
  name: string;
  description: string;
  priceDelta: number;
  sortOrder: number;
  isActive: boolean;
};

export type ProductOption = {
  id: string;
  restaurantId: string;
  productId: string;
  optionGroupId: string;
  name: string;
  description: string;
  priceDelta: number;
  inventoryItemId?: string;
  inventoryQuantity?: number;
  inventoryWasteFactor: number;
  sortOrder: number;
  isActive: boolean;
};

export type ProductOptionGroup = {
  id: string;
  restaurantId: string;
  productId: string;
  name: string;
  description: string;
  minChoices: number;
  maxChoices: number;
  isRequired: boolean;
  sortOrder: number;
  isActive: boolean;
  options: ProductOption[];
};

export type ProductConfiguration = {
  variants: ProductVariant[];
  optionGroups: ProductOptionGroup[];
};

export type BranchProductAlternative = {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  city: string;
  address?: string;
};

export type ProductStockAvailability = {
  productId: string;
  isAvailableHere: boolean;
  reason?: "stock";
  alternatives: BranchProductAlternative[];
};
