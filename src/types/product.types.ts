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
  imageUrl: string;
  isAvailable: boolean;
  isFeatured: boolean;
  trackStock: boolean;
  isPromotion?: boolean;
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
