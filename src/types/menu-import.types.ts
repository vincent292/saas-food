export type MenuImportProduct = {
  name: string;
  description: string;
  price: number;
  prepMinutes: number;
  isFeatured: boolean;
};

export type MenuImportCategory = {
  name: string;
  description: string;
  products: MenuImportProduct[];
  subcategories?: MenuImportCategory[];
};

export type MenuImportDraft = {
  sourceName?: string;
  categories: MenuImportCategory[];
};

export type MenuImportAnalyzeResult =
  | {
      ok: true;
      draft: MenuImportDraft;
    }
  | {
      ok: false;
      error: string;
    };

export type MenuImportCommitResult =
  | {
      ok: true;
      categoriesCreated: number;
      categoriesUpdated: number;
      productsCreated: number;
      productsUpdated: number;
    }
  | {
      ok: false;
      error: string;
    };
