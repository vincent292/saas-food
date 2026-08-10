import { Buffer } from "node:buffer";
import type { MenuImportCategory, MenuImportDraft, MenuImportProduct } from "@/types/menu-import.types";

const defaultModel = "gemini-3.6-flash";
const maxInlineFileBytes = 10 * 1024 * 1024;
const supportedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

const menuImportSchema = {
  type: "object",
  properties: {
    isMenu: {
      type: "boolean",
      description: "True only when the file clearly contains a restaurant menu with product names and prices.",
    },
    rejectionReason: {
      type: "string",
      description: "Short Spanish reason when isMenu is false.",
    },
    sourceName: {
      type: "string",
      description: "Restaurant or menu name if visible.",
    },
    categories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          products: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                price: { type: "number" },
                prepMinutes: { type: "integer" },
                isFeatured: { type: "boolean" },
              },
              required: ["name", "description", "price", "prepMinutes", "isFeatured"],
            },
          },
          subcategories: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                products: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      description: { type: "string" },
                      price: { type: "number" },
                      prepMinutes: { type: "integer" },
                      isFeatured: { type: "boolean" },
                    },
                    required: ["name", "description", "price", "prepMinutes", "isFeatured"],
                  },
                },
              },
              required: ["name", "description", "products"],
            },
          },
        },
        required: ["name", "description", "products", "subcategories"],
      },
    },
  },
  required: ["isMenu", "rejectionReason", "categories"],
};

type GeminiTextPart = {
  text?: string;
};

type GeminiInteractionResponse = {
  output_text?: string;
  outputText?: string;
  steps?: Array<{
    content?: GeminiTextPart[];
  }>;
  candidates?: Array<{
    content?: {
      parts?: GeminiTextPart[];
    };
  }>;
};

export function validateMenuImportFile(file: File | null) {
  if (!file || file.size <= 0) {
    return "file-required";
  }

  if (!supportedMimeTypes.has(file.type)) {
    return "unsupported-file";
  }

  if (file.size > maxInlineFileBytes) {
    return "file-too-large";
  }

  return null;
}

export async function analyzeMenuFileWithGemini(file: File, notes = ""): Promise<MenuImportDraft> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("gemini-not-configured");
  }

  const model = process.env.GEMINI_MODEL?.trim() || defaultModel;
  const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          type: "text",
          text:
            "Extrae el menu de este archivo para cargarlo en un sistema de restaurante. " +
            "Primero decide si el archivo realmente es un menu de restaurante legible. " +
            "Si no es menu, es una foto borrosa, no hay productos, o no hay precios claros, devuelve isMenu=false, rejectionReason breve y categories vacio. " +
            "Devuelve solo productos reales con precio. Usa BOB/Bs como moneda implicita. " +
            (notes ? `Aclaraciones del usuario para interpretar el menu: ${notes}. ` : "") +
            "Agrupa por categorias visibles y conserva subcategorias visibles en subcategories. " +
            "Si una seccion tiene tamanos o cantidades con precios distintos, crea productos separados con la cantidad en el nombre. " +
            "Ignora numeros ordinales de lista como 1., 2., 3. cuando no sean parte del nombre ni del precio. " +
            "Si no hay categorias claras, crea una categoria coherente. " +
            "Descripcion corta en espanol. prepMinutes debe estimar minutos de cocina: 7 para salsas/extras simples, 10-12 guarniciones, 15-20 platos con pollo/hamburguesas/alitas, 25+ combos grandes. " +
            "Marca isFeatured solo para combos, promos o items claramente destacados. No inventes productos ni precios.",
        },
        {
          type: file.type === "application/pdf" ? "document" : "image",
          data: bytes,
          mime_type: file.type,
        },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: menuImportSchema,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`gemini-request-${response.status}`);
  }

  const payload = (await response.json()) as GeminiInteractionResponse;
  const text = extractGeminiText(payload);
  if (!text) {
    throw new Error("gemini-empty-response");
  }

  return normalizeMenuImportDraft(JSON.parse(text) as Partial<MenuImportDraft>);
}

function extractGeminiText(payload: GeminiInteractionResponse) {
  const directText = payload.output_text ?? payload.outputText;
  if (directText?.trim()) {
    return directText.trim();
  }

  const lastStep = payload.steps?.at(-1);
  const stepText = lastStep?.content?.map((part) => part.text ?? "").join("").trim();
  if (stepText) {
    return stepText;
  }

  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
}

export function normalizeMenuImportDraft(input: Partial<MenuImportDraft>): MenuImportDraft {
  const isMenu = input.isMenu === true;
  const categories = Array.isArray(input.categories) ? input.categories : [];
  const normalizedCategories = categories
    .flatMap(normalizeCategoryWithSubcategories)
    .filter((category): category is MenuImportCategory => Boolean(category && category.products.length));

  return {
    isMenu,
    rejectionReason: typeof input.rejectionReason === "string" ? input.rejectionReason.trim().slice(0, 180) : undefined,
    sourceName: typeof input.sourceName === "string" ? input.sourceName.trim().slice(0, 120) : undefined,
    categories: isMenu ? normalizedCategories.slice(0, 40) : [],
  };
}

function normalizeCategoryWithSubcategories(category: Partial<MenuImportCategory> | null | undefined): MenuImportCategory[] {
  if (!category) {
    return [];
  }

  const name = normalizeText(category.name, "Sin categoria", 80);
  const products = Array.isArray(category.products) ? category.products : [];
  const subcategories = Array.isArray(category.subcategories) ? category.subcategories : [];
  const normalized: MenuImportCategory[] = [];

  const baseProducts = products
    .map(normalizeProduct)
    .filter((product): product is MenuImportProduct => Boolean(product))
    .slice(0, 120);

  if (baseProducts.length) {
    normalized.push({
      name,
      description: normalizeText(category.description, "", 180),
      products: baseProducts,
    });
  }

  for (const subcategory of subcategories) {
    const subcategoryName = normalizeText(subcategory?.name, "", 80);
    const subcategoryProducts = (Array.isArray(subcategory?.products) ? subcategory.products : [])
      .map(normalizeProduct)
      .filter((product): product is MenuImportProduct => Boolean(product))
      .slice(0, 120);

    if (subcategoryName && subcategoryProducts.length) {
      normalized.push({
        name: `${name} / ${subcategoryName}`.slice(0, 80),
        description: normalizeText(subcategory?.description, normalizeText(category.description, "", 180), 180),
        products: subcategoryProducts,
      });
    }
  }

  return normalized;
}

function normalizeProduct(product: Partial<MenuImportProduct> | null | undefined): MenuImportProduct | null {
  if (!product) {
    return null;
  }

  const name = normalizeText(product.name, "", 100);
  if (!name) {
    return null;
  }

  return {
    name,
    description: normalizeText(product.description, "", 240),
    price: clampNumber(product.price, 0, 100000, 0),
    prepMinutes: Math.round(clampNumber(product.prepMinutes, 1, 240, 15)),
    isFeatured: product.isFeatured === true,
  };
}

function normalizeText(value: unknown, fallback: string, maxLength: number) {
  return (typeof value === "string" ? value : fallback).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numeric));
}
