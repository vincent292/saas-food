export const restaurantCategoryOptions = [
  { value: "hamburguesas", label: "Hamburguesas", keywords: ["burger", "hamburguesa", "smash"] },
  { value: "pizzas", label: "Pizzas", keywords: ["pizza", "pizzeria"] },
  { value: "pollos", label: "Pollos", keywords: ["pollo", "broaster", "alitas"] },
  { value: "parrillas", label: "Parrillas", keywords: ["parrilla", "asado", "carnes"] },
  { value: "almuerzos", label: "Almuerzos", keywords: ["almuerzo", "comida", "menu"] },
  { value: "asiatica", label: "Asiatica", keywords: ["sushi", "wok", "china", "asiatica"] },
  { value: "saludable", label: "Saludable", keywords: ["saludable", "veggie", "ensalada"] },
  { value: "cafeteria", label: "Cafeteria", keywords: ["cafe", "cafeteria", "postre"] },
  { value: "postres", label: "Postres", keywords: ["postre", "dulce", "helado"] },
  { value: "bebidas", label: "Bebidas", keywords: ["bebida", "jugo", "limonada"] },
] as const;

export const restaurantLocationOptions = [
  "Cochabamba",
  "La Paz",
  "Santa Cruz",
  "El Alto",
  "Sucre",
  "Oruro",
  "Potosi",
  "Tarija",
  "Trinidad",
  "Cobija",
] as const;

export type RestaurantCategoryValue = (typeof restaurantCategoryOptions)[number]["value"];

export function restaurantCategoryLabel(value?: string | null) {
  if (!value) {
    return "";
  }

  return restaurantCategoryOptions.find((option) => option.value === value)?.label ?? value;
}

export function inferRestaurantCategory(input: string) {
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return restaurantCategoryOptions.find((option) => option.keywords.some((keyword) => normalized.includes(keyword)))?.value ?? "";
}
