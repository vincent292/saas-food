"use client";

import { Bot, Check, LoaderCircle, Send, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import type { InventoryMovementType } from "@/types/inventory.types";

type BranchTarget = {
  restaurantId: string;
  restaurantName: string;
};

type MovementPreview = {
  action: "movement";
  restaurantId: string;
  originalText: string;
  type: Extract<InventoryMovementType, "in" | "out" | "adjustment" | "waste">;
  quantity: number;
  inventoryItemId: string;
  inventoryItemName: string;
  inventoryItemUnit: string;
  previousStock: number;
  newStock: number;
  reason: string;
  confidence: number;
  warnings: string[];
  alternatives: Array<{
    id: string;
    name: string;
    stock: number;
    unit: string;
  }>;
};

type CreateItemPreview = {
  action: "create_item";
  restaurantId: string;
  originalText: string;
  name: string;
  itemKind: "finished" | "ingredient" | "supply";
  unit: string;
  currentStock: number;
  minStock: number;
  unitCost: number;
  reason: string;
  confidence: number;
  warnings: string[];
  alternatives: Array<{
    id: string;
    name: string;
    stock: number;
    unit: string;
  }>;
};

type NeedsDetailsPreview = {
  action: "needs_details";
  restaurantId: string;
  originalText: string;
  draft: {
    name?: string;
    itemName?: string;
    itemKind?: "finished" | "ingredient" | "supply";
    unit?: string;
    currentStock?: number;
    minStock?: number;
    unitCost?: number;
    expiresOn?: string;
    lotCode?: string;
  };
  missingFields: string[];
  questions: string[];
  warnings: string[];
};

type CountActionPreview = {
  action: "open_count" | "close_count";
  restaurantId: string;
  originalText: string;
  reason: string;
  warnings: string[];
};

type CountLinePreview = {
  action: "count_line";
  restaurantId: string;
  originalText: string;
  inventoryItemId: string;
  inventoryItemName: string;
  inventoryItemUnit: string;
  expectedStock: number;
  countedStock: number;
  differenceStock: number;
  reason: string;
  confidence: number;
  warnings: string[];
  alternatives: Array<{
    id: string;
    name: string;
    stock: number;
    unit: string;
  }>;
};

type ExpirationPreview = {
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

type QuickAddPreview = MovementPreview | CreateItemPreview | NeedsDetailsPreview | CountActionPreview | CountLinePreview | ExpirationPreview;
type RequestState = "idle" | "previewing" | "committing" | "success" | "error";

const movementLabel: Record<MovementPreview["type"], string> = {
  in: "Entrada",
  out: "Salida",
  adjustment: "Ajuste",
  waste: "Merma",
};

const errorMessages: Record<string, string> = {
  "quick-add-text-required": "Escribe el movimiento.",
  "quick-add-inventory-only": "Solo preparo operaciones de inventario. No respondo preguntas ni codigo.",
  "quick-add-no-items": "Esta sucursal no tiene items activos.",
  "quick-add-quantity-required": "No encontre la cantidad.",
  "quick-add-item-not-found": "No encontre un item parecido.",
  "negative-stock": "El stock quedaria negativo.",
  "negative-zone-stock": "La zona no tiene stock suficiente.",
  "inventory-create-admin-required": "Solo un administrador puede crear items.",
  "inventory-item-already-exists": "Ya existe un item con ese nombre.",
  "quick-add-open-count-required": "Primero abre un conteo de inventario.",
  "quick-add-count-already-open": "Ya hay un conteo abierto.",
  "quick-add-expiration-date-required": "Indica la fecha de vencimiento.",
  "quick-add-lot-not-found": "No encontre un lote activo para ese item.",
  "quick-add-lot-required": "Indica el codigo de lote.",
  unauthorized: "Sesion vencida.",
  "inventory-access-denied": "No tienes acceso para mover inventario.",
};

export function InventoryQuickAddOrb({
  branches,
  currentRestaurantId,
}: {
  branches: BranchTarget[];
  currentRestaurantId?: string;
}) {
  const router = useRouter();
  const firstRestaurantId = currentRestaurantId ?? branches[0]?.restaurantId ?? "";
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(firstRestaurantId);
  const [preview, setPreview] = useState<QuickAddPreview | null>(null);
  const [contextText, setContextText] = useState("");
  const [state, setState] = useState<RequestState>("idle");
  const [error, setError] = useState("");

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.restaurantId === selectedRestaurantId) ?? branches[0],
    [branches, selectedRestaurantId],
  );
  const hasNegativeStock = Boolean(preview?.action === "movement" && preview.newStock < 0);

  async function requestPreview() {
    if (!selectedRestaurantId || !text.trim()) {
      setError("Escribe el movimiento.");
      setState("error");
      return;
    }

    setState("previewing");
    setError("");
    setPreview(null);

    const response = await fetch("/api/inventory/quick-add/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: selectedRestaurantId, text, contextText: contextText || undefined }),
    });
    const payload = (await response.json().catch(() => null)) as { preview?: QuickAddPreview; error?: string } | null;

    if (!response.ok || !payload?.preview) {
      setError(errorLabel(payload?.error));
      setState("error");
      return;
    }

    setPreview(payload.preview);
    if (payload.preview.action === "needs_details") {
      setContextText(payload.preview.originalText);
      setText("");
    } else {
      setContextText("");
    }
    setState("idle");
  }

  async function commitPreview() {
    if (!preview || preview.action === "needs_details" || hasNegativeStock) {
      return;
    }

    setState("committing");
    setError("");

    const response = await fetch("/api/inventory/quick-add/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: preview.action,
        ...(preview.action === "movement"
          ? {
              restaurantId: preview.restaurantId,
              inventoryItemId: preview.inventoryItemId,
              type: preview.type,
              quantity: preview.quantity,
              reason: preview.reason,
            }
          : preview.action === "create_item"
            ? {
              restaurantId: preview.restaurantId,
              name: preview.name,
              itemKind: preview.itemKind,
              unit: preview.unit,
              currentStock: preview.currentStock,
              minStock: preview.minStock,
              unitCost: preview.unitCost,
              reason: preview.reason,
            }
          : preview.action === "update_expiration"
            ? {
                restaurantId: preview.restaurantId,
                lotId: preview.lotId,
                expiresOn: preview.expiresOn,
                reason: preview.reason,
              }
          : preview.action === "count_line"
              ? {
                  restaurantId: preview.restaurantId,
                  inventoryItemId: preview.inventoryItemId,
                  countedStock: preview.countedStock,
                  reason: preview.reason,
                }
              : {
                  restaurantId: preview.restaurantId,
                  reason: preview.reason,
                }),
      }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setError(errorLabel(payload?.error));
      setState("error");
      return;
    }

    setText("");
    setPreview(null);
    setContextText("");
    setState("success");
    router.refresh();
  }

  function reset() {
    setPreview(null);
    setContextText("");
    setError("");
    setState("idle");
  }

  return (
    <div className="fixed bottom-5 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open ? (
        <div className="w-[min(calc(100vw-2rem),420px)] rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--text)] shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--primary-light)] text-[var(--primary)]">
                <Bot className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[var(--color-heading)]">Inventario IA</p>
                <p className="truncate text-xs font-semibold text-[var(--color-secondary-text)]">{selectedBranch?.restaurantName ?? "Sucursal"}</p>
              </div>
            </div>
            <button
              aria-label="Cerrar"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-neutral-100)] text-[var(--color-secondary-text)]"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {branches.length > 1 ? (
            <Select
              className="mb-3"
              onChange={(event) => {
                setSelectedRestaurantId(event.target.value);
                reset();
              }}
              value={selectedRestaurantId}
            >
              {branches.map((branch) => (
                <option key={branch.restaurantId} value={branch.restaurantId}>
                  {branch.restaurantName}
                </option>
              ))}
            </Select>
          ) : null}

          <div className="space-y-3">
            <p className="text-xs font-bold text-[var(--color-secondary-text)]">Solo inventario: entradas, salidas, mermas, ajustes, conteos y vencimientos.</p>
            <Textarea
              className="min-h-24"
              disabled={state === "previewing" || state === "committing"}
              onChange={(event) => {
                setText(event.target.value);
                if (preview && preview.action !== "needs_details") setPreview(null);
                if (error) setError("");
                if (state === "success") setState("idle");
              }}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  void requestPreview();
                }
              }}
              placeholder="Agrega 50 panes de hamburguesa"
              value={text}
            />

            {preview?.action === "needs_details" ? (
              <div className="rounded-2xl border border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] p-3">
                <p className="text-sm font-black text-[var(--color-heading)]">Faltan datos para continuar</p>
                <div className="mt-2 space-y-1">
                  {preview.questions.map((question) => (
                    <p className="text-xs font-bold text-[var(--color-warning-strong)]" key={question}>
                      {question}
                    </p>
                  ))}
                </div>
                {preview.draft.name || preview.draft.itemName ? <p className="mt-2 text-xs font-semibold text-[var(--color-secondary-text)]">Detecte: {preview.draft.name ?? preview.draft.itemName}</p> : null}
                {preview.warnings.map((warning) => (
                  <p className="mt-2 text-xs font-bold text-[var(--color-warning-strong)]" key={warning}>
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}

            {preview?.action === "update_expiration" ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[var(--color-heading)]">{preview.inventoryItemName}</p>
                    <p className="mt-1 text-xs font-bold text-[var(--color-secondary-text)]">
                      Lote {preview.lotCode || "sin codigo"} - quedan {preview.remainingQuantity}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2 py-1 text-xs font-black", preview.confidence >= 0.72 ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]")}>
                    {Math.round(preview.confidence * 100)}%
                  </span>
                </div>
                <p className="mt-3 text-lg font-black text-[var(--color-heading)]">
                  {preview.previousExpiresOn ?? "Sin fecha"} {"->"} {preview.expiresOn}
                </p>
                {preview.warnings.map((warning) => (
                  <p className="mt-2 text-xs font-bold text-[var(--color-warning-strong)]" key={warning}>
                    {warning}
                  </p>
                ))}
                {preview.alternatives.length ? (
                  <p className="mt-2 truncate text-xs font-semibold text-[var(--color-secondary-text)]">
                    Otros lotes: {preview.alternatives.map((lot) => `${lot.lotCode || "sin codigo"} (${lot.expiresOn ?? "sin fecha"})`).join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}

            {preview?.action === "movement" ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[var(--color-heading)]">{preview.inventoryItemName}</p>
                    <p className="mt-1 text-xs font-bold text-[var(--color-secondary-text)]">
                      {movementLabel[preview.type]} - {preview.quantity} {preview.inventoryItemUnit}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2 py-1 text-xs font-black", preview.confidence >= 0.72 ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]")}>
                    {Math.round(preview.confidence * 100)}%
                  </span>
                </div>
                <p className={cn("mt-3 text-lg font-black", preview.newStock < 0 ? "text-[var(--danger)]" : "text-[var(--color-heading)]")}>
                  {preview.previousStock} {"->"} {preview.newStock} {preview.inventoryItemUnit}
                </p>
                {preview.warnings.length ? (
                  <div className="mt-2 space-y-1">
                    {preview.warnings.map((warning) => (
                      <p className="text-xs font-bold text-[var(--color-warning-strong)]" key={warning}>
                        {warning}
                      </p>
                    ))}
                  </div>
                ) : null}
                {preview.alternatives.length ? (
                  <p className="mt-2 truncate text-xs font-semibold text-[var(--color-secondary-text)]">
                    Tambien: {preview.alternatives.map((item) => item.name).join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}

            {preview?.action === "count_line" ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[var(--color-heading)]">{preview.inventoryItemName}</p>
                    <p className="mt-1 text-xs font-bold text-[var(--color-secondary-text)]">
                      Conteo fisico - {preview.countedStock} {preview.inventoryItemUnit}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2 py-1 text-xs font-black", preview.confidence >= 0.72 ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]")}>
                    {Math.round(preview.confidence * 100)}%
                  </span>
                </div>
                <p className="mt-3 text-lg font-black text-[var(--color-heading)]">
                  Sistema {preview.expectedStock} {"->"} contado {preview.countedStock}
                </p>
                <p className={cn("mt-1 text-xs font-black", preview.differenceStock === 0 ? "text-[var(--color-success-strong)]" : preview.differenceStock > 0 ? "text-[var(--color-info-strong)]" : "text-[var(--danger)]")}>Diferencia {preview.differenceStock}</p>
                {preview.warnings.map((warning) => (
                  <p className="mt-2 text-xs font-bold text-[var(--color-warning-strong)]" key={warning}>
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}

            {preview?.action === "open_count" || preview?.action === "close_count" ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3">
                <p className="text-sm font-black text-[var(--color-heading)]">{preview.action === "open_count" ? "Abrir conteo de inventario" : "Cerrar conteo de inventario"}</p>
                <p className="mt-2 text-xs font-semibold text-[var(--color-secondary-text)]">{preview.reason}</p>
                {preview.warnings.map((warning) => (
                  <p className="mt-2 text-xs font-bold text-[var(--color-warning-strong)]" key={warning}>
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}

            {preview?.action === "create_item" ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[var(--color-heading)]">{preview.name}</p>
                    <p className="mt-1 text-xs font-bold text-[var(--color-secondary-text)]">
                      Nuevo item - {preview.currentStock} {preview.unit}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2 py-1 text-xs font-black", preview.confidence >= 0.72 ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]")}>
                    {Math.round(preview.confidence * 100)}%
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-bold text-[var(--color-secondary-text)]">
                  <span>Min. {preview.minStock}</span>
                  <span>Costo {preview.unitCost}</span>
                  <span>{itemKindLabel(preview.itemKind)}</span>
                </div>
                {preview.warnings.map((warning) => (
                  <p className="mt-2 text-xs font-bold text-[var(--color-warning-strong)]" key={warning}>
                    {warning}
                  </p>
                ))}
                {preview.alternatives.length ? (
                  <p className="mt-2 truncate text-xs font-semibold text-[var(--color-secondary-text)]">
                    Parecidos: {preview.alternatives.map((item) => item.name).join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}

            {state === "success" ? (
              <p className="rounded-2xl bg-[var(--color-success-soft)] p-3 text-sm font-black text-[var(--color-success-strong)]">
                Inventario actualizado.
              </p>
            ) : null}

            {error ? (
              <p className="rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm font-black text-[var(--danger)]">
                {error}
              </p>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              {preview && preview.action !== "needs_details" ? (
                <>
                  <Button disabled={state === "committing"} onClick={reset} type="button" variant="secondary">
                    <X className="h-4 w-4" />
                    Cambiar
                  </Button>
                  <Button disabled={state === "committing" || hasNegativeStock} onClick={commitPreview} type="button">
                    {state === "committing" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {preview.action === "create_item" ? "Crear" : preview.action === "open_count" ? "Abrir" : preview.action === "close_count" ? "Cerrar" : preview.action === "update_expiration" ? "Modificar" : "Confirmar"}
                  </Button>
                </>
              ) : (
                <button
                  className={buttonClasses("primary", "sm:col-span-2")}
                  disabled={state === "previewing" || state === "committing" || !selectedRestaurantId}
                  onClick={requestPreview}
                  type="button"
                >
                  {state === "previewing" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Preparar
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <button
        aria-label="Inventario IA"
        className="grid h-16 w-16 place-items-center rounded-full bg-[var(--primary)] text-[var(--color-on-primary)] shadow-2xl ring-4 ring-[var(--primary-light)] transition hover:bg-[var(--primary-dark)]"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Sparkles className="h-7 w-7" />
      </button>
    </div>
  );
}

function errorLabel(error?: string) {
  return errorMessages[error ?? ""] ?? "No pude preparar la operacion.";
}

function itemKindLabel(kind: CreateItemPreview["itemKind"]) {
  if (kind === "finished") return "Terminado";
  if (kind === "supply") return "Material";
  return "Insumo";
}
