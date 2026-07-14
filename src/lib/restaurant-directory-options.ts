import type { OrderStatus, OrderType } from "@/types/order.types";
import type { BusinessType } from "@/types/restaurant.types";

type BusinessTypeOption = {
  value: BusinessType;
  label: string;
  description: string;
};

type CategoryOption = {
  value: string;
  label: string;
  businessType: BusinessType;
};

export const restaurantBusinessTypeValues = [
  "food",
  "fashion",
  "footwear",
  "pharmacy",
  "market",
  "beauty",
  "home",
  "electronics",
  "services",
  "other",
] as const;

export const restaurantBusinessTypeOptions: BusinessTypeOption[] = [
  { value: "food", label: "Restaurantes y comida", description: "Menus, cocina, mesas, delivery y recojo." },
  { value: "fashion", label: "Ropa y moda", description: "Tiendas de ropa, accesorios y moda." },
  { value: "footwear", label: "Calzados", description: "Zapatos, zapatillas, sandalias y bolsos." },
  { value: "pharmacy", label: "Farmacia y bienestar", description: "Farmacia, dermocosmetica y salud." },
  { value: "market", label: "Mercados y abarrotes", description: "Supermercados, panaderias y frescos." },
  { value: "beauty", label: "Belleza y cuidado", description: "Salon, barberia, maquillaje y perfumeria." },
  { value: "home", label: "Hogar y decoracion", description: "Muebles, bazar, ferreteria y hogar." },
  { value: "electronics", label: "Tecnologia", description: "Celulares, computacion y electrohogar." },
  { value: "services", label: "Servicios", description: "Lavanderia, imprenta y mensajeria." },
  { value: "other", label: "Otros negocios", description: "Rubros generales o mixtos." },
];

const categoryGroups: Record<BusinessType, Omit<CategoryOption, "businessType">[]> = {
  food: [
    { value: "hamburguesas", label: "Hamburguesas" },
    { value: "pizzas", label: "Pizzas" },
    { value: "pollo_frito", label: "Pollo y broaster" },
    { value: "sushi", label: "Sushi y japonesa" },
    { value: "cafeteria", label: "Cafeteria" },
    { value: "bebidas", label: "Bebidas" },
    { value: "helados_postres", label: "Helados y postres" },
    { value: "saludable", label: "Saludable" },
    { value: "sandwiches_combos", label: "Sandwiches y combos" },
    { value: "comida_casera", label: "Comida casera" },
  ],
  fashion: [
    { value: "ropa_mujer", label: "Ropa de mujer" },
    { value: "ropa_hombre", label: "Ropa de hombre" },
    { value: "ropa_infantil", label: "Ropa infantil" },
    { value: "accesorios_moda", label: "Accesorios" },
    { value: "lenceria", label: "Lenceria" },
  ],
  footwear: [
    { value: "zapatillas_deportivas", label: "Zapatillas deportivas" },
    { value: "zapatos_casuales", label: "Zapatos casuales" },
    { value: "sandalias", label: "Sandalias" },
    { value: "botas", label: "Botas" },
    { value: "bolsos_mochilas", label: "Bolsos y mochilas" },
  ],
  pharmacy: [
    { value: "farmacia", label: "Farmacia" },
    { value: "cuidado_personal", label: "Cuidado personal" },
    { value: "dermocosmetica", label: "Dermocosmetica" },
    { value: "suplementos", label: "Suplementos" },
    { value: "ortopedia", label: "Ortopedia" },
  ],
  market: [
    { value: "supermercado", label: "Supermercado" },
    { value: "minimarket", label: "Minimarket" },
    { value: "panaderia", label: "Panaderia" },
    { value: "carnes_frescos", label: "Carnes y frescos" },
    { value: "frutas_verduras", label: "Frutas y verduras" },
  ],
  beauty: [
    { value: "salon_belleza", label: "Salon de belleza" },
    { value: "barberia", label: "Barberia" },
    { value: "maquillaje", label: "Maquillaje" },
    { value: "skincare", label: "Skincare" },
    { value: "perfumeria", label: "Perfumeria" },
  ],
  home: [
    { value: "decoracion", label: "Decoracion" },
    { value: "muebles", label: "Muebles" },
    { value: "ferreteria", label: "Ferreteria" },
    { value: "bazar_hogar", label: "Bazar hogar" },
    { value: "textiles_hogar", label: "Textiles hogar" },
  ],
  electronics: [
    { value: "celulares", label: "Celulares" },
    { value: "computacion", label: "Computacion" },
    { value: "accesorios_tecnologia", label: "Accesorios tech" },
    { value: "electrohogar", label: "Electrohogar" },
    { value: "gaming", label: "Gaming" },
  ],
  services: [
    { value: "lavanderia", label: "Lavanderia" },
    { value: "imprenta", label: "Imprenta" },
    { value: "regalos", label: "Regalos" },
    { value: "papeleria", label: "Papeleria" },
    { value: "mensajeria", label: "Mensajeria" },
  ],
  other: [
    { value: "tienda_general", label: "Tienda general" },
    { value: "mascotas", label: "Mascotas" },
    { value: "libreria", label: "Libreria" },
    { value: "juguetes", label: "Juguetes" },
    { value: "otros", label: "Otros" },
  ],
};

export const restaurantCategoryOptions: CategoryOption[] = restaurantBusinessTypeValues.flatMap((businessType) =>
  categoryGroups[businessType].map((option) => ({
    ...option,
    businessType,
  })),
);

export const restaurantLocationOptions = [
  "Cochabamba",
  "La Paz",
  "Santa Cruz",
  "Sucre",
  "Tarija",
  "Oruro",
  "Potosi",
  "Trinidad",
  "Cobija",
  "El Alto",
  "Quillacollo",
];

const businessTypeMap = new Map(restaurantBusinessTypeOptions.map((option) => [option.value, option]));
const categoryMap = new Map(restaurantCategoryOptions.map((option) => [option.value, option]));

const categoryKeywords: Partial<Record<CategoryOption["value"], string[]>> = {
  hamburguesas: ["hamburg", "burger"],
  pizzas: ["pizza"],
  pollo_frito: ["pollo", "broaster"],
  sushi: ["sushi", "japo"],
  cafeteria: ["cafe", "coffee"],
  bebidas: ["bebida", "jugo", "refresco", "drink"],
  helados_postres: ["helado", "postre", "dulce"],
  saludable: ["salud", "veg", "fit", "ensalada"],
  sandwiches_combos: ["sand", "combo"],
  comida_casera: ["casera", "almuerzo", "criolla"],
  ropa_mujer: ["mujer", "dama"],
  ropa_hombre: ["hombre", "caballero"],
  ropa_infantil: ["nino", "infantil", "bebe"],
  accesorios_moda: ["accesorio", "joya", "bisuteria"],
  lenceria: ["lenceria", "ropa interior"],
  zapatillas_deportivas: ["zapatilla", "deportiva", "sneaker"],
  zapatos_casuales: ["zapato", "casual"],
  sandalias: ["sandalia"],
  botas: ["bota"],
  bolsos_mochilas: ["bolso", "mochila"],
  farmacia: ["farmacia", "medicina", "medicamento"],
  cuidado_personal: ["cuidado", "higiene"],
  dermocosmetica: ["dermo", "cosmet"],
  suplementos: ["suplemento", "vitamina"],
  ortopedia: ["ortopedia"],
  supermercado: ["supermercado", "super"],
  minimarket: ["minimarket", "market"],
  panaderia: ["panaderia", "pan"],
  carnes_frescos: ["carne", "fresco"],
  frutas_verduras: ["fruta", "verdura"],
  salon_belleza: ["salon", "belleza"],
  barberia: ["barber", "barberia"],
  maquillaje: ["maquillaje"],
  skincare: ["skin", "facial"],
  perfumeria: ["perfume"],
  decoracion: ["decoracion"],
  muebles: ["mueble"],
  ferreteria: ["ferreteria"],
  bazar_hogar: ["bazar", "hogar"],
  textiles_hogar: ["textil", "ropa de cama"],
  celulares: ["celular", "movil", "telefono"],
  computacion: ["comput", "laptop", "pc"],
  accesorios_tecnologia: ["accesorio", "cable", "tech"],
  electrohogar: ["electro", "hogar"],
  gaming: ["gaming", "game", "consola"],
  lavanderia: ["lavanderia", "lavado"],
  imprenta: ["imprenta", "impresion"],
  regalos: ["regalo"],
  papeleria: ["papeleria", "utiles"],
  mensajeria: ["mensajeria", "envio"],
  tienda_general: ["tienda", "general"],
  mascotas: ["mascota", "pet"],
  libreria: ["libro", "libreria"],
  juguetes: ["juguete"],
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeRestaurantBusinessType(value?: string | null): BusinessType {
  const normalized = normalize(value ?? "");
  return restaurantBusinessTypeValues.find((item) => item === normalized) ?? "food";
}

export function restaurantBusinessTypeLabel(value?: string | null) {
  return businessTypeMap.get(normalizeRestaurantBusinessType(value))?.label ?? "Restaurantes y comida";
}

export function restaurantBusinessTypeDescription(value?: string | null) {
  return businessTypeMap.get(normalizeRestaurantBusinessType(value))?.description ?? "";
}

export function categoriesForBusinessType(value?: string | null): CategoryOption[] {
  const businessType = normalizeRestaurantBusinessType(value);
  return restaurantCategoryOptions.filter((option) => option.businessType === businessType);
}

export function defaultRestaurantCategory(value?: string | null) {
  return categoriesForBusinessType(value)[0]?.value ?? "hamburguesas";
}

export function businessTypeForCategory(value?: string | null): BusinessType {
  return categoryMap.get(normalize(value ?? ""))?.businessType ?? "food";
}

export function normalizeRestaurantCategory(value?: string | null, businessType?: string | null) {
  const normalizedValue = normalize(value ?? "");
  const normalizedBusinessType = normalizeRestaurantBusinessType(businessType ?? businessTypeForCategory(value));
  const validOptions = categoriesForBusinessType(normalizedBusinessType);

  if (validOptions.some((option) => option.value === normalizedValue)) {
    return normalizedValue;
  }

  return defaultRestaurantCategory(normalizedBusinessType);
}

export function restaurantCategoryLabel(value?: string | null) {
  return categoryMap.get(normalize(value ?? ""))?.label ?? "";
}

export function restaurantCategoryBusinessType(value?: string | null) {
  return categoryMap.get(normalize(value ?? ""))?.businessType ?? "food";
}

export function inferRestaurantCategory(text: string, businessType?: string | null) {
  const normalizedBusinessType = normalizeRestaurantBusinessType(businessType);
  const content = normalize(text);

  for (const option of categoriesForBusinessType(normalizedBusinessType)) {
    const keywords = categoryKeywords[option.value] ?? [];
    if (keywords.some((keyword) => content.includes(keyword))) {
      return option.value;
    }
  }

  return defaultRestaurantCategory(normalizedBusinessType);
}

export function businessTypeSupportsKitchen(value?: string | null) {
  return normalizeRestaurantBusinessType(value) === "food";
}

export function businessTypeSupportsTableQr(value?: string | null) {
  return normalizeRestaurantBusinessType(value) === "food";
}

export function businessTypeUsesFoodWorkflow(value?: string | null) {
  return normalizeRestaurantBusinessType(value) === "food";
}

export function businessCatalogLabel(value?: string | null) {
  return normalizeRestaurantBusinessType(value) === "food" ? "menu" : "catalogo";
}

export function businessCatalogLabelTitle(value?: string | null) {
  return normalizeRestaurantBusinessType(value) === "food" ? "Menu" : "Catalogo";
}

export function businessCatalogItemLabel(value?: string | null) {
  return normalizeRestaurantBusinessType(value) === "food" ? "plato" : "producto";
}

export function businessCatalogItemsLabel(value?: string | null) {
  return normalizeRestaurantBusinessType(value) === "food" ? "platos" : "productos";
}

export function businessPreparationAreaLabel(value?: string | null) {
  return businessTypeSupportsKitchen(value) ? "cocina" : "preparacion";
}

export function businessPreparationAreaTitle(value?: string | null) {
  return businessTypeSupportsKitchen(value) ? "Cocina" : "Preparacion";
}

export function businessPickupReadyLabel(value?: string | null) {
  return businessTypeSupportsKitchen(value) ? "Listo para recoger" : "Listo para retirar";
}

export function businessOrderStatusLabel(status: OrderStatus, value?: string | null) {
  const commerceLabels: Record<OrderStatus, string> = {
    pending: "Pendiente",
    accepted: "Confirmado",
    preparing: "Alistando",
    ready: "Listo",
    delivered: "Entregado",
    cancelled: "Rechazado",
  };
  const foodLabels: Record<OrderStatus, string> = {
    pending: "Pendiente",
    accepted: "Aprobado",
    preparing: "Preparando",
    ready: "Preparado",
    delivered: "Entregado",
    cancelled: "Rechazado",
  };

  return businessTypeUsesFoodWorkflow(value) ? foodLabels[status] : commerceLabels[status];
}

export function businessOrderReadyLabel(orderType: OrderType, value?: string | null) {
  if (orderType === "delivery") {
    return "Listo para despacho";
  }

  if (orderType === "pickup") {
    return businessPickupReadyLabel(value);
  }

  return businessTypeUsesFoodWorkflow(value) ? "Listo para entregar" : "Listo para entrega";
}

export function businessOrderAdvanceLabel(status: OrderStatus, value?: string | null) {
  if (status === "accepted") {
    return businessTypeUsesFoodWorkflow(value) ? "Iniciar preparacion" : "Empezar alistado";
  }

  if (status === "preparing") {
    return businessTypeUsesFoodWorkflow(value) ? "Marcar preparado" : "Marcar listo";
  }

  return "Actualizar";
}

export function businessQueueLabel(value?: string | null) {
  return businessTypeUsesFoodWorkflow(value) ? "En cocina" : "En preparacion";
}

export function businessQueueEmptyLabel(value?: string | null) {
  return businessTypeUsesFoodWorkflow(value) ? "Nada enviado a cocina" : "Nada en preparacion";
}

export function businessProductImageHelp(value?: string | null) {
  return businessTypeUsesFoodWorkflow(value)
    ? "Recomendado: 1200 x 900 px. Usa foto clara del plato, sin texto pequeno."
    : "Recomendado: 1200 x 900 px. Usa foto clara del producto, con buena luz y sin texto pequeno.";
}

export function businessVariantExample(value?: string | null) {
  const businessType = normalizeRestaurantBusinessType(value);

  if (businessType === "fashion") {
    return "Ej. Talla M / Color negro";
  }

  if (businessType === "footwear") {
    return "Ej. Talla 39 / Cuero negro";
  }

  if (businessType === "electronics") {
    return "Ej. 128 GB / Negro";
  }

  if (businessType === "food") {
    return "Ej. Con papas";
  }

  return "Ej. Presentacion grande";
}

export function businessOptionGroupCopy(value?: string | null) {
  return businessTypeUsesFoodWorkflow(value)
    ? "Usa grupos para salsa, acompanamientos, tamanos, agregados o combos."
    : "Usa grupos para talla, color, presentacion, garantia, extras o combos.";
}
