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
