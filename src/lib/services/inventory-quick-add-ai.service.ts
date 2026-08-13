import "server-only";

import type { InventoryCountReport, InventoryItem, InventoryItemKind, InventoryLot, InventoryMovementType } from "@/types/inventory.types";

const defaultModel = "gemini-3.6-flash";
const units = ["unidad", "kg", "g", "lb", "oz", "litro", "ml", "caja", "paquete"] as const;
const createIntentWords = ["crea", "crear", "nuevo", "nueva", "registra", "registrar", "alta"];
const inventoryIntentWords = [
  ...createIntentWords,
  "agrega",
  "agregar",
  "anade",
  "anadir",
  "ingresa",
  "ingresar",
  "entrada",
  "compra",
  "comprar",
  "repone",
  "reponer",
  "suma",
  "sumar",
  "stock",
  "inventario",
  "insumo",
  "item",
  "producto terminado",
  "saca",
  "sacar",
  "quita",
  "quitar",
  "descuenta",
  "descontar",
  "retira",
  "retirar",
  "merma",
  "vencido",
  "vencida",
  "roto",
  "rota",
  "perdido",
  "perdida",
  "ajusta",
  "ajustar",
  "abre conteo",
  "abrir conteo",
  "apertura conteo",
  "inicia conteo",
  "iniciar conteo",
  "conteo",
  "conte",
  "contado",
  "contar",
  "cierra conteo",
  "cerrar conteo",
  "cierre conteo",
  "vencimiento",
  "vence",
  "vencera",
  "fecha",
  "lote",
  "modifica",
  "modificar",
  "modificalo",
  "actualiza",
  "actualizar",
];
const blockedNonInventoryWords = [
  "pedido",
  "pedidos",
  "orden",
  "ordenes",
  "mesa",
  "mesas",
  "caja",
  "cajero",
  "cliente",
  "clientes",
  "usuario",
  "usuarios",
  "contrasena",
  "password",
  "api",
  "apikey",
  "api key",
  "token",
  "secret",
  "code",
  "programa",
  "programar",
  "script",
  "sql",
  "base de datos",
  "supabase",
  "gemini",
  "javascript",
  "typescript",
  "html",
  "css",
  "react",
  "next",
  "nextjs",
  "bug",
  "error",
  "arregla",
  "editar",
  "edita",
  "crear pagina",
  "pagina",
  "menu",
  "categoria",
  "categorias",
  "delivery",
  "envio",
  "factura",
  "facturas",
  "qr",
  "plan",
  "planes",
  "soporte",
  "reporte",
  "reportes",
  "horario",
  "configuracion",
];

const quickAddSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["movement", "create_item", "open_count", "count_line", "close_count", "update_expiration"] },
    type: { type: "string", enum: ["in", "out", "adjustment", "waste"] },
    quantity: { type: "number" },
    itemId: { type: "string" },
    itemName: { type: "string" },
    itemKind: { type: "string", enum: ["finished", "ingredient", "supply"] },
    unit: { type: "string", enum: [...units] },
    minStock: { type: "number" },
    unitCost: { type: "number" },
    expiresOn: { type: "string" },
    lotCode: { type: "string" },
    reason: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["action", "type", "quantity", "itemId", "itemName", "itemKind", "unit", "minStock", "unitCost", "expiresOn", "lotCode", "reason", "confidence"],
};

type GeminiInteractionResponse = {
  output_text?: string;
  outputText?: string;
  steps?: Array<{
    content?: Array<{ text?: string }>;
  }>;
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type QuickAddAiDraft = {
  action?: string;
  type?: string;
  quantity?: unknown;
  itemId?: unknown;
  itemName?: unknown;
  itemKind?: unknown;
  unit?: unknown;
  minStock?: unknown;
  unitCost?: unknown;
  expiresOn?: unknown;
  lotCode?: unknown;
  reason?: unknown;
  confidence?: unknown;
};

type InventoryMovementPreview = {
  action: "movement";
  restaurantId: string;
  originalText: string;
  type: Extract<InventoryMovementType, "in" | "out" | "adjustment" | "waste">;
  quantity: number;
  inventoryItemId: string;
  inventoryItemName: string;
  inventoryItemUnit: InventoryItem["unit"];
  previousStock: number;
  newStock: number;
  reason: string;
  confidence: number;
  warnings: string[];
  alternatives: Array<InventoryAlternative>;
};

type InventoryCreateItemPreview = {
  action: "create_item";
  restaurantId: string;
  originalText: string;
  name: string;
  itemKind: InventoryItemKind;
  unit: InventoryItem["unit"];
  currentStock: number;
  minStock: number;
  unitCost: number;
  reason: string;
  confidence: number;
  warnings: string[];
  alternatives: Array<InventoryAlternative>;
};

type InventoryNeedsDetailsPreview = {
  action: "needs_details";
  restaurantId: string;
  originalText: string;
  draft: Partial<Pick<InventoryCreateItemPreview, "name" | "itemKind" | "unit" | "currentStock" | "minStock" | "unitCost">> & {
    itemName?: string;
    expiresOn?: string;
    lotCode?: string;
  };
  missingFields: Array<"name" | "currentStock" | "minStock" | "unitCost" | "lotCode">;
  questions: string[];
  warnings: string[];
};

type InventoryAlternative = {
  id: string;
  name: string;
  stock: number;
  unit: InventoryItem["unit"];
};

type InventoryCountActionPreview = {
  action: "open_count" | "close_count";
  restaurantId: string;
  originalText: string;
  reason: string;
  warnings: string[];
};

type InventoryCountLinePreview = {
  action: "count_line";
  restaurantId: string;
  originalText: string;
  inventoryItemId: string;
  inventoryItemName: string;
  inventoryItemUnit: InventoryItem["unit"];
  expectedStock: number;
  countedStock: number;
  differenceStock: number;
  reason: string;
  confidence: number;
  warnings: string[];
  alternatives: Array<InventoryAlternative>;
};

type InventoryExpirationPreview = {
  action: "update_expiration";
  restaurantId: string;
  originalText: string;
  lotId: string;
  inventoryItemName: string;
  lotCode?: string;
  previousExpiresOn?: string;
  expiresOn: string;
  remainingQuantity: number;
  reason: string;
  confidence: number;
  warnings: string[];
  alternatives: Array<{
    lotId: string;
    lotCode?: string;
    inventoryItemName: string;
    expiresOn?: string;
    remainingQuantity: number;
  }>;
};

export type InventoryQuickAddPreview = InventoryMovementPreview | InventoryCreateItemPreview | InventoryNeedsDetailsPreview | InventoryCountActionPreview | InventoryCountLinePreview | InventoryExpirationPreview;

export async function prepareInventoryQuickAdd({
  restaurantId,
  text,
  items,
  lots,
  openCount,
}: {
  restaurantId: string;
  text: string;
  items: InventoryItem[];
  lots?: InventoryLot[];
  openCount?: InventoryCountReport | null;
}): Promise<InventoryQuickAddPreview> {
  const originalText = normalizeText(text, 220);
  if (!originalText) {
    throw new Error("quick-add-text-required");
  }

  assertInventoryOnlyText(originalText);

  const aiDraft = await askGeminiForQuickAdd(originalText, items).catch(() => null);
  const localDraft = inferQuickAddLocally(originalText);
  const action = normalizeAction(aiDraft?.action) ?? localDraft.action;
  const type = normalizeMovementType(aiDraft?.type) ?? localDraft.type;
  const quantity = clampPositiveNumber(aiDraft?.quantity) ?? localDraft.quantity;
  const countedQuantity = clampNonNegativeNumber(aiDraft?.quantity) ?? localDraft.countedQuantity ?? localDraft.quantity;
  const itemName = normalizeItemName(typeof aiDraft?.itemName === "string" ? aiDraft.itemName : localDraft.itemName);
  const itemKind = normalizeItemKind(aiDraft?.itemKind) ?? localDraft.itemKind;
  const unit = normalizeUnit(aiDraft?.unit) ?? localDraft.unit;
  const minStock = clampNonNegativeNumber(aiDraft?.minStock) ?? localDraft.minStock;
  const unitCost = clampNonNegativeNumber(aiDraft?.unitCost) ?? localDraft.unitCost;
  const expiresOn = normalizeDate(aiDraft?.expiresOn) ?? localDraft.expiresOn;
  const lotCode = normalizeOptionalText(aiDraft?.lotCode) ?? localDraft.lotCode;

  if (action === "update_expiration") {
    return prepareExpirationPreview({
      restaurantId,
      originalText,
      items,
      lots: lots ?? [],
      itemId: typeof aiDraft?.itemId === "string" ? aiDraft.itemId : "",
      itemName,
      lotCode,
      expiresOn,
      reason: normalizeReason(aiDraft?.reason, originalText),
      aiConfidence: clampConfidence(aiDraft?.confidence),
    });
  }

  if (action === "open_count") {
    return {
      action,
      restaurantId,
      originalText,
      reason: normalizeReason(aiDraft?.reason, originalText),
      warnings: openCount ? ["Ya hay un conteo abierto. Si confirmas, la base puede rechazar otro conteo abierto."] : ["Agregado con IA: se abrira un conteo de inventario."],
    };
  }

  if (action === "close_count") {
    return {
      action,
      restaurantId,
      originalText,
      reason: normalizeReason(aiDraft?.reason, originalText),
      warnings: openCount ? ["Agregado con IA: se cerrara el conteo abierto y se ajustara stock segun lineas contadas."] : ["No hay conteo abierto para cerrar."],
    };
  }

  if (action === "count_line") {
    if (!openCount) {
      throw new Error("quick-add-open-count-required");
    }

    if (countedQuantity === undefined || countedQuantity === null) {
      throw new Error("quick-add-quantity-required");
    }

    return prepareCountLinePreview({
      restaurantId,
      originalText,
      items,
      countedStock: countedQuantity,
      itemId: typeof aiDraft?.itemId === "string" ? aiDraft.itemId : "",
      itemName,
      reason: normalizeReason(aiDraft?.reason, originalText),
      aiConfidence: clampConfidence(aiDraft?.confidence),
    });
  }

  if (action === "create_item") {
    return prepareCreateItemPreview({
      restaurantId,
      originalText,
      items,
      draft: {
        name: itemName,
        itemKind,
        unit,
        currentStock: quantity ?? undefined,
        minStock,
        unitCost,
        reason: normalizeReason(aiDraft?.reason, originalText),
        confidence: clampConfidence(aiDraft?.confidence) ?? 0,
      },
    });
  }

  if (!items.length) {
    throw new Error("quick-add-no-items");
  }

  if (!quantity || quantity <= 0) {
    throw new Error("quick-add-quantity-required");
  }

  return prepareMovementPreview({
    restaurantId,
    originalText,
    items,
    type,
    quantity,
    itemId: typeof aiDraft?.itemId === "string" ? aiDraft.itemId : "",
    itemName,
    reason: normalizeReason(aiDraft?.reason, originalText),
    aiConfidence: clampConfidence(aiDraft?.confidence),
  });
}

function prepareCreateItemPreview({
  restaurantId,
  originalText,
  items,
  draft,
}: {
  restaurantId: string;
  originalText: string;
  items: InventoryItem[];
  draft: {
    name: string;
    itemKind: InventoryItemKind;
    unit: InventoryItem["unit"];
    currentStock?: number;
    minStock?: number;
    unitCost?: number;
    reason: string;
    confidence: number;
  };
}): InventoryQuickAddPreview {
  const match = findBestItem({ items, itemId: "", itemName: draft.name, text: originalText });
  if (match.item && match.score >= 0.72 && draft.currentStock) {
    const quantity = draft.currentStock;
    const newStock = calculateNewStock(match.item.currentStock, "in", quantity);
    return {
      action: "movement",
      restaurantId,
      originalText,
      type: "in",
      quantity,
      inventoryItemId: match.item.id,
      inventoryItemName: match.item.name,
      inventoryItemUnit: match.item.unit,
      previousStock: match.item.currentStock,
      newStock,
      reason: `Entrada rapida: ${draft.reason}`,
      confidence: Math.max(match.score, draft.confidence),
      warnings: ["Ya existe un item parecido. Puedes confirmar una entrada sobre ese item en vez de crear otro."],
      alternatives: match.alternatives.map(toAlternative),
    };
  }

  const missingFields: InventoryNeedsDetailsPreview["missingFields"] = [];
  if (!draft.name) missingFields.push("name");
  if (!draft.currentStock || draft.currentStock <= 0) missingFields.push("currentStock");
  if (draft.minStock === undefined) missingFields.push("minStock");
  if (draft.unitCost === undefined) missingFields.push("unitCost");

  if (missingFields.length) {
    return {
      action: "needs_details",
      restaurantId,
      originalText,
      draft: {
        name: draft.name || undefined,
        itemKind: draft.itemKind,
        unit: draft.unit,
        currentStock: draft.currentStock,
        minStock: draft.minStock,
        unitCost: draft.unitCost,
      },
      missingFields,
      questions: missingFields.map(questionForMissingField),
      warnings: priceWarning(originalText),
    };
  }

  const currentStock = draft.currentStock ?? 0;
  const minStock = draft.minStock ?? 0;
  const unitCost = draft.unitCost ?? 0;

  return {
    action: "create_item",
    restaurantId,
    originalText,
    name: draft.name,
    itemKind: draft.itemKind,
    unit: draft.unit,
    currentStock,
    minStock,
    unitCost,
    reason: draft.reason,
    confidence: Math.max(match.score, draft.confidence, 0.68),
    warnings: priceWarning(originalText),
    alternatives: match.alternatives.map(toAlternative),
  };
}

function prepareMovementPreview({
  restaurantId,
  originalText,
  items,
  type,
  quantity,
  itemId,
  itemName,
  reason,
  aiConfidence,
}: {
  restaurantId: string;
  originalText: string;
  items: InventoryItem[];
  type: InventoryMovementPreview["type"];
  quantity: number;
  itemId: string;
  itemName: string;
  reason: string;
  aiConfidence: number | null;
}): InventoryMovementPreview {
  const match = findBestItem({ items, itemId, itemName, text: originalText });
  if (!match.item) {
    throw new Error("quick-add-item-not-found");
  }

  const newStock = calculateNewStock(match.item.currentStock, type, quantity);
  const warnings: string[] = [];
  const confidence = Math.max(match.score, aiConfidence ?? 0);

  if (confidence < 0.62) {
    warnings.push("Coincidencia baja. Revisa que el item sea correcto.");
  }

  if (newStock < 0) {
    warnings.push("Este movimiento dejaria stock negativo.");
  }

  return {
    action: "movement",
    restaurantId,
    originalText,
    type,
    quantity,
    inventoryItemId: match.item.id,
    inventoryItemName: match.item.name,
    inventoryItemUnit: match.item.unit,
    previousStock: match.item.currentStock,
    newStock,
    reason,
    confidence,
    warnings,
    alternatives: match.alternatives.map(toAlternative),
  };
}

async function askGeminiForQuickAdd(text: string, items: InventoryItem[]): Promise<QuickAddAiDraft | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const model = process.env.GEMINI_MODEL?.trim() || defaultModel;
  const catalog = items
    .slice(0, 160)
    .map((item) => `${item.id} | ${item.name} | ${item.currentStock} ${item.unit}`)
    .join("\n");

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
          text: [
            "Interpreta una orden corta de inventario para un restaurante.",
            "Tu unica tarea es preparar operaciones de inventario: movimientos, creacion de items, conteos y vencimientos. No respondas preguntas generales ni expliques nada.",
            "No respondas codigo, programacion, soporte, caja, pedidos, menu, usuarios, delivery, facturas, reportes, bugs ni configuracion.",
            "Nunca crees productos de menu, categorias, proveedores, pedidos, usuarios ni cambios de precio publico.",
            "Nunca escribas codigo, SQL, scripts, instrucciones tecnicas, secretos, tokens ni llaves API.",
            "Si el usuario pide crear un nuevo insumo/item de inventario, usa action=create_item.",
            "Si pide abrir o iniciar conteo fisico, usa action=open_count.",
            "Si pide cerrar conteo fisico, usa action=close_count.",
            "Si informa una cantidad contada de un item dentro de conteo, usa action=count_line.",
            "Si pide modificar vencimiento, fecha de vencimiento o fecha de lote, usa action=update_expiration.",
            "Si el usuario pide entrada, salida, merma o ajuste de un item existente, usa action=movement.",
            "Para action=movement, itemId debe venir del catalogo. No inventes ids.",
            "Para action=create_item, itemId puede ser string vacio. itemName es el nombre limpio del item.",
            "Si el usuario dice precio/costo en una creacion de inventario, guardalo como unitCost, nunca como precio de venta de menu.",
            "Usa type=in cuando el usuario quiera agregar, ingresar, comprar o reponer stock.",
            "Usa type=out cuando quiera sacar, descontar o retirar stock.",
            "Usa type=waste para merma, vencido, roto o perdido.",
            "Usa type=adjustment solo si pide dejar el stock final en una cantidad.",
            "quantity es la cantidad numerica en la unidad base del item.",
            "minStock es el stock minimo; unitCost es costo unitario de inventario.",
            "expiresOn debe ser YYYY-MM-DD cuando action=update_expiration. Si el usuario usa DD/MM/YYYY conviertelo.",
            "lotCode es el codigo de lote si el usuario lo menciona.",
            "confidence va de 0 a 1.",
            "",
            `Orden: ${text}`,
            "",
            "Catalogo:",
            catalog || "Sin items activos",
          ].join("\n"),
        },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: quickAddSchema,
      },
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as GeminiInteractionResponse;
  const output = extractGeminiText(payload);
  if (!output) {
    return null;
  }

  return JSON.parse(output) as QuickAddAiDraft;
}

function assertInventoryOnlyText(text: string) {
  const normalized = normalizeForMatch(text);
  const hasQuantity = /(^|\s)\d+(?:[.,]\d+)?(\s|$)/.test(normalized);
  const hasInventoryIntent = inventoryIntentWords.some((word) => normalized.includes(word));
  const hasBlockedNonInventoryIntent = blockedNonInventoryWords.some((word) => normalized.includes(word));

  if (hasBlockedNonInventoryIntent || !hasInventoryIntent) {
    throw new Error("quick-add-inventory-only");
  }

  const countActionWithoutQuantity =
    normalized.includes("abrir conteo") ||
    normalized.includes("abre conteo") ||
    normalized.includes("iniciar conteo") ||
    normalized.includes("inicia conteo") ||
    normalized.includes("cerrar conteo") ||
    normalized.includes("cierra conteo") ||
    normalized.includes("cierre conteo");

  if (!hasQuantity && !createIntentWords.some((word) => normalized.includes(word)) && !countActionWithoutQuantity) {
    throw new Error("quick-add-quantity-required");
  }
}

function inferQuickAddLocally(text: string) {
  const normalized = normalizeForMatch(text);
  const action =
    normalized.includes("abrir conteo") || normalized.includes("abre conteo") || normalized.includes("iniciar conteo") || normalized.includes("inicia conteo") || normalized.includes("apertura conteo")
      ? "open_count"
      : normalized.includes("cerrar conteo") || normalized.includes("cierra conteo") || normalized.includes("cierre conteo")
        ? "close_count"
        : normalized.includes("vencimiento") || normalized.includes("vence") || normalized.includes("vencera") || normalized.includes("fecha de lote")
          ? "update_expiration"
          : normalized.includes("conteo") || normalized.includes("conte ") || normalized.includes("contado") || normalized.includes("contar")
            ? "count_line"
            : createIntentWords.some((word) => normalized.includes(word))
              ? "create_item"
              : "movement";
  const type = normalized.includes("merma") || normalized.includes("vencid") || normalized.includes("roto") || normalized.includes("perdid")
    ? "waste"
    : normalized.includes("ajusta") || normalized.includes("deja en") || normalized.includes("stock final")
      ? "adjustment"
      : normalized.includes("saca") || normalized.includes("quita") || normalized.includes("descuenta") || normalized.includes("retira")
        ? "out"
        : "in";
  const quantity = extractQuantity(text);
  const countedQuantity = extractCountedQuantity(text);
  const minStock = extractNumberAfter(normalized, ["stock minimo", "minimo", "min"]);
  const unitCost = extractNumberAfter(normalized, ["costo", "precio"]);
  const unit = inferUnit(normalized);
  const itemKind = inferItemKind(normalized);
  const expiresOn = extractDate(text);
  const lotCode = extractLotCode(text);
  const itemName = normalizeItemName(cleanItemNameFromText(text, action));

  return { action, type: type as InventoryMovementPreview["type"], quantity, countedQuantity, itemName, itemKind, unit, minStock, unitCost, expiresOn, lotCode };
}

function prepareExpirationPreview({
  restaurantId,
  originalText,
  items,
  lots,
  itemId,
  itemName,
  lotCode,
  expiresOn,
  reason,
  aiConfidence,
}: {
  restaurantId: string;
  originalText: string;
  items: InventoryItem[];
  lots: InventoryLot[];
  itemId: string;
  itemName: string;
  lotCode?: string;
  expiresOn?: string;
  reason: string;
  aiConfidence: number | null;
}): InventoryQuickAddPreview {
  if (!expiresOn) {
    throw new Error("quick-add-expiration-date-required");
  }

  const match = findBestItem({ items, itemId, itemName, text: originalText });
  if (!match.item) {
    throw new Error("quick-add-item-not-found");
  }

  const matchingLots = lots.filter((lot) => lot.inventoryItemId === match.item?.id);
  if (!matchingLots.length) {
    throw new Error("quick-add-lot-not-found");
  }

  const normalizedLotCode = lotCode ? normalizeForMatch(lotCode) : "";
  const exactLot = normalizedLotCode
    ? matchingLots.find((lot) => normalizeForMatch(lot.lotCode ?? "") === normalizedLotCode || normalizeForMatch(lot.id).includes(normalizedLotCode))
    : undefined;
  const lot = exactLot ?? (matchingLots.length === 1 ? matchingLots[0] : undefined);

  if (!lot) {
    return {
      action: "needs_details",
      restaurantId,
      originalText,
      draft: {
        itemName: match.item.name,
        expiresOn,
      },
      missingFields: ["lotCode"],
      questions: ["Hay varios lotes activos. Indica el codigo de lote o identificalo desde vencimientos."],
      warnings: matchingLots.slice(0, 4).map((candidate) => `${candidate.lotCode ? `Lote ${candidate.lotCode}` : "Sin codigo"} - vence ${candidate.expiresOn ?? "sin fecha"} - quedan ${candidate.remainingQuantity}`),
    };
  }

  const confidence = Math.max(match.score, aiConfidence ?? 0);
  const alternatives = matchingLots
    .filter((candidate) => candidate.id !== lot.id)
    .slice(0, 3)
    .map((candidate) => ({
      lotId: candidate.id,
      lotCode: candidate.lotCode,
      inventoryItemName: candidate.inventoryItemName,
      expiresOn: candidate.expiresOn,
      remainingQuantity: candidate.remainingQuantity,
    }));

  return {
    action: "update_expiration",
    restaurantId,
    originalText,
    lotId: lot.id,
    inventoryItemName: lot.inventoryItemName,
    lotCode: lot.lotCode,
    previousExpiresOn: lot.expiresOn,
    expiresOn,
    remainingQuantity: lot.remainingQuantity,
    reason,
    confidence,
    warnings: ["Agregado con IA: se modificara solo el vencimiento del lote."],
    alternatives,
  };
}

function prepareCountLinePreview({
  restaurantId,
  originalText,
  items,
  countedStock,
  itemId,
  itemName,
  reason,
  aiConfidence,
}: {
  restaurantId: string;
  originalText: string;
  items: InventoryItem[];
  countedStock: number;
  itemId: string;
  itemName: string;
  reason: string;
  aiConfidence: number | null;
}): InventoryCountLinePreview {
  const match = findBestItem({ items, itemId, itemName, text: originalText });
  if (!match.item) {
    throw new Error("quick-add-item-not-found");
  }

  const differenceStock = Number((countedStock - match.item.currentStock).toFixed(3));
  const confidence = Math.max(match.score, aiConfidence ?? 0);
  const warnings: string[] = ["Agregado con IA: se registrara una linea de conteo fisico."];
  if (confidence < 0.62) {
    warnings.push("Coincidencia baja. Revisa que el item sea correcto.");
  }

  return {
    action: "count_line",
    restaurantId,
    originalText,
    inventoryItemId: match.item.id,
    inventoryItemName: match.item.name,
    inventoryItemUnit: match.item.unit,
    expectedStock: match.item.currentStock,
    countedStock,
    differenceStock,
    reason,
    confidence,
    warnings,
    alternatives: match.alternatives.map(toAlternative),
  };
}

function findBestItem({
  items,
  itemId,
  itemName,
  text,
}: {
  items: InventoryItem[];
  itemId: string;
  itemName: string;
  text: string;
}) {
  const direct = itemId ? items.find((item) => item.id === itemId) : undefined;
  if (direct) {
    return {
      item: direct,
      score: 0.95,
      alternatives: items.filter((item) => item.id !== direct.id).slice(0, 3),
    };
  }

  const query = normalizeForMatch(itemName || text);
  const scored = items
    .map((item) => ({ item, score: scoreItemMatch(query, normalizeForMatch(item.name)) }))
    .sort((a, b) => b.score - a.score);

  return {
    item: scored[0]?.score > 0.25 ? scored[0].item : null,
    score: scored[0]?.score ?? 0,
    alternatives: scored.slice(1, 4).map((entry) => entry.item),
  };
}

function scoreItemMatch(query: string, candidate: string) {
  if (!query || !candidate) {
    return 0;
  }

  if (query.includes(candidate) || candidate.includes(query)) {
    return 0.9;
  }

  const queryTokens = tokenize(query);
  const candidateTokens = tokenize(candidate);
  if (!queryTokens.length || !candidateTokens.length) {
    return 0;
  }

  const tokenScores = candidateTokens.map((candidateToken) => Math.max(...queryTokens.map((queryToken) => tokenSimilarity(queryToken, candidateToken))));
  const average = tokenScores.reduce((sum, score) => sum + score, 0) / candidateTokens.length;
  const coverage = tokenScores.filter((score) => score >= 0.72).length / candidateTokens.length;
  return average * 0.55 + coverage * 0.45;
}

function tokenSimilarity(a: string, b: string) {
  const left = singularize(a);
  const right = singularize(b);
  if (left === right) {
    return 1;
  }

  if (left.includes(right) || right.includes(left)) {
    return 0.86;
  }

  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length, 1);
}

function tokenize(value: string) {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !["de", "del", "la", "el", "los", "las", "un", "una", "para", "por"].includes(token));
}

function singularize(token: string) {
  if (token.endsWith("es") && token.length > 4) {
    return token.slice(0, -2);
  }

  if (token.endsWith("s") && token.length > 3) {
    return token.slice(0, -1);
  }

  return token;
}

function levenshtein(a: string, b: string) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = previous.slice();

  for (let i = 1; i <= a.length; i += 1) {
    current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length] ?? 0;
}

function extractQuantity(text: string) {
  const match = text.match(/[-+]?\d+(?:[.,]\d+)?/);
  if (!match) {
    return null;
  }

  return clampPositiveNumber(match[0]);
}

function extractCountedQuantity(text: string) {
  const match = text.match(/[-+]?\d+(?:[.,]\d+)?/);
  if (!match) {
    return null;
  }

  return clampNonNegativeNumber(match[0]);
}

function extractNumberAfter(text: string, labels: string[]) {
  for (const label of labels) {
    const index = text.indexOf(label);
    if (index === -1) continue;
    const match = text.slice(index + label.length).match(/[-+]?\d+(?:[.,]\d+)?/);
    const value = match ? clampNonNegativeNumber(match[0]) : null;
    if (value !== null) return value;
  }

  return undefined;
}

function extractDate(text: string) {
  const match = text.match(/\b(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})\b/);
  if (!match) {
    return undefined;
  }

  return normalizeDate(match[0]) ?? undefined;
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return isValidDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3])) ? trimmed : null;
  }

  const slash = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!slash) {
    return null;
  }

  const day = Number(slash[1]);
  const month = Number(slash[2]);
  const year = Number(slash[3]);
  if (!isValidDateParts(year, month, day)) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isValidDateParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function extractLotCode(text: string) {
  const match = text.match(/\blote\s+([a-zA-Z0-9._-]+)/i) ?? text.match(/\bcodigo\s+([a-zA-Z0-9._-]+)/i);
  return match?.[1]?.trim();
}

function cleanItemNameFromText(text: string, action: ReturnType<typeof inferQuickAddLocally>["action"]) {
  const withoutDates = text.replace(/\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/g, " ");
  const withoutNumbers = action === "update_expiration" ? withoutDates : withoutDates.replace(/[-+]?\d+(?:[.,]\d+)?/g, " ");
  const wordsToRemove =
    action === "update_expiration"
      ? "vencimiento|vence|vencera|fecha|lote|codigo|modifica|modificar|modificalo|actualiza|actualizar|es|en|de|del|la|el|los|las|un|una|unos|unas"
      : "crea|crear|nuevo|nueva|registra|registrar|alta|insumo|item|producto|terminado|agrega|agregar|ingresa|ingresar|suma|sumar|compra|compre|comprar|repone|reponer|saca|sacar|quita|quitar|descuenta|descontar|retira|retirar|merma|ajusta|ajustar|deja|stock|actual|final|minimo|minima|costo|precio|venta|vencimiento|vence|vencera|fecha|lote|codigo|modifica|modificar|modificalo|actualiza|actualizar|es|en|de|del|la|el|los|las|un|una|unos|unas|unidades|unidad|kg|g|litro|litros|lt|ml|caja|cajas|paquete|paquetes";

  return withoutNumbers.replace(new RegExp(`\\b(${wordsToRemove})\\b`, "gi"), " ");
}

function inferUnit(text: string): InventoryItem["unit"] {
  if (/\bkg|kilo|kilos\b/.test(text)) return "kg";
  if (/\bg|gramo|gramos\b/.test(text)) return "g";
  if (/\blitro|litros|lt\b/.test(text)) return "litro";
  if (/\bml\b/.test(text)) return "ml";
  if (/\bcaja|cajas\b/.test(text)) return "caja";
  if (/\bpaquete|paquetes\b/.test(text)) return "paquete";
  return "unidad";
}

function inferItemKind(text: string): InventoryItemKind {
  if (text.includes("empaque") || text.includes("material")) return "supply";
  if (text.includes("producto terminado") || text.includes("bebida") || text.includes("coca") || text.includes("cocacola")) return "finished";
  return "ingredient";
}

function normalizeAction(value: unknown): "movement" | "create_item" | "open_count" | "count_line" | "close_count" | "update_expiration" | null {
  return value === "movement" || value === "create_item" || value === "open_count" || value === "count_line" || value === "close_count" || value === "update_expiration" ? value : null;
}

function normalizeMovementType(value: unknown): InventoryMovementPreview["type"] | null {
  return value === "in" || value === "out" || value === "adjustment" || value === "waste" ? value : null;
}

function normalizeItemKind(value: unknown): InventoryItemKind | null {
  return value === "finished" || value === "ingredient" || value === "supply" ? value : null;
}

function normalizeUnit(value: unknown): InventoryItem["unit"] | null {
  return units.includes(value as InventoryItem["unit"]) ? (value as InventoryItem["unit"]) : null;
}

function clampPositiveNumber(value: unknown) {
  const number = toNumber(value);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return Number(Math.min(999999, number).toFixed(3));
}

function clampNonNegativeNumber(value: unknown) {
  const number = toNumber(value);
  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return Number(Math.min(999999, number).toFixed(3));
}

function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number(String(value ?? "").replace(",", ".").replace(/bs\.?$/i, ""));
}

function clampConfidence(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.min(1, Math.max(0, number));
}

function calculateNewStock(previousStock: number, type: InventoryMovementPreview["type"], quantity: number) {
  if (type === "adjustment") {
    return quantity;
  }

  return Number((type === "in" ? previousStock + quantity : previousStock - quantity).toFixed(3));
}

function questionForMissingField(field: InventoryNeedsDetailsPreview["missingFields"][number]) {
  if (field === "name") return "Nombre del item o insumo.";
  if (field === "currentStock") return "Cantidad inicial a ingresar.";
  if (field === "minStock") return "Stock minimo.";
  if (field === "lotCode") return "Codigo de lote para modificar el vencimiento.";
  return "Costo unitario de inventario.";
}

function priceWarning(text: string) {
  return normalizeForMatch(text).includes("precio") || normalizeForMatch(text).includes("venta")
    ? ["El precio se guardara como costo unitario de inventario; no cambia el precio de venta del menu."]
    : [];
}

function toAlternative(item: InventoryItem): InventoryAlternative {
  return {
    id: item.id,
    name: item.name,
    stock: item.currentStock,
    unit: item.unit,
  };
}

function normalizeReason(value: unknown, originalText: string) {
  const reason = normalizeText(typeof value === "string" ? value : originalText, 100);
  return reason || "Registro rapido con IA";
}

function normalizeOptionalText(value: unknown) {
  const text = typeof value === "string" ? normalizeText(value, 80) : "";
  return text || undefined;
}

function normalizeItemName(value: string) {
  return normalizeText(value, 100)
    .replace(/\s+/g, " ")
    .replace(/^\b(de|del|la|el|los|las)\b\s+/i, "")
    .trim();
}

function normalizeText(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeForMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractGeminiText(payload: GeminiInteractionResponse) {
  const directText = payload.output_text ?? payload.outputText;
  if (directText?.trim()) {
    return directText.trim();
  }

  const stepText = payload.steps?.at(-1)?.content?.map((part) => part.text ?? "").join("").trim();
  if (stepText) {
    return stepText;
  }

  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
}
