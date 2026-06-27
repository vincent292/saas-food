"use client";

import { Boxes, ClipboardCheck, FileText, Scale, Truck, Utensils, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  createInventoryCategoryAction,
  closeInventoryCountAction,
  createInventoryItemAction,
  createInventorySupplierAction,
  createInventoryZoneAction,
  linkProductIngredientAction,
  linkProductSupplierAction,
  openInventoryCountAction,
  recordInventoryCountLineAction,
  registerInventoryMovementAction,
  transferInventoryZoneAction,
} from "@/app/admin/actions";
import { InventoryItemRow } from "@/components/inventory/InventoryItemRow";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SearchableSelect, type SearchOption } from "@/components/ui/SearchableSelect";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { cn } from "@/lib/utils/cn";
import { formatShortDate, formatShortTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import type { InventoryCategory, InventoryCountReport, InventoryItem, InventoryItemZone, InventoryMovement, InventorySupplier, InventoryZone, ProductIngredient, ProductSupplier } from "@/types/inventory.types";
import type { Product } from "@/types/product.types";

type InventoryTab = "resumen" | "catalogo" | "kardex" | "zonas" | "recetas" | "conteo" | "proveedores";
type ModalKey = "item" | "category" | "movement" | "transfer" | "recipe" | "countLine" | "supplier" | "productSupplier" | "zone" | null;

const unitOptions = [
  ["unidad", "Unidad"],
  ["kg", "Kg"],
  ["g", "g"],
  ["lb", "Libra"],
  ["oz", "Onza"],
  ["litro", "Litro"],
  ["ml", "ml"],
  ["caja", "Caja"],
  ["paquete", "Paquete"],
] as const;

const movementLabels: Record<InventoryMovement["type"], string> = {
  in: "Entrada",
  out: "Salida",
  adjustment: "Ajuste",
  waste: "Merma",
  sale_usage: "Uso por venta",
};

export function InventoryWorkspaceClient({
  restaurantId,
  items,
  categories,
  suppliers,
  ingredients,
  productSuppliers,
  movements,
  openCount,
  countReports,
  products,
  zones,
  itemZones,
  initialTab,
}: {
  restaurantId: string;
  items: InventoryItem[];
  categories: InventoryCategory[];
  suppliers: InventorySupplier[];
  ingredients: ProductIngredient[];
  productSuppliers: ProductSupplier[];
  movements: InventoryMovement[];
  openCount: InventoryCountReport | null;
  countReports: InventoryCountReport[];
  products: Product[];
  zones: InventoryZone[];
  itemZones: InventoryItemZone[];
  initialTab?: string;
}) {
  const [activeTab, setActiveTab] = useState<InventoryTab>(isTab(initialTab) ? initialTab : "resumen");
  const [modal, setModal] = useState<ModalKey>(null);
  const lowStock = items.filter((item) => item.currentStock <= item.minStock);
  const inventoryValue = items.reduce((sum, item) => sum + item.currentStock * item.unitCost, 0);
  const itemOptions = toItemOptions(items);
  const productOptions = products.map((product) => ({ value: product.id, label: product.name, detail: formatMoney(product.price) }));
  const supplierOptions = suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name, detail: supplier.phone }));
  const categoryOptions = categories.map((category) => ({ value: category.id, label: category.name, detail: category.description }));
  const zoneOptions = zones.map((zone) => ({ value: zone.id, label: zone.name, detail: zone.description }));
  const tabs: { key: InventoryTab; label: string; icon: LucideIcon; count?: number }[] = [
    { key: "resumen", label: "Resumen", icon: Boxes },
    { key: "catalogo", label: "Catálogo", icon: Scale, count: categories.length },
    { key: "kardex", label: "Kardex", icon: FileText, count: movements.length },
    { key: "zonas", label: "Zonas", icon: Boxes, count: zones.length },
    { key: "recetas", label: "Recetas", icon: Utensils, count: ingredients.length },
    { key: "conteo", label: "Conteo", icon: ClipboardCheck, count: openCount?.lines.length },
    { key: "proveedores", label: "Proveedores", icon: Truck, count: suppliers.length },
  ];

  function switchTab(nextTab: InventoryTab) {
    setActiveTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.replaceState({}, "", url.toString());
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Valor inventario" value={formatMoney(inventoryValue)} />
        <MetricCard label="Insumos activos" value={String(items.length)} />
        <MetricCard danger={lowStock.length > 0} label="Bajo mínimo" value={String(lowStock.length)} />
        <MetricCard label="Recetas ligadas" value={String(ingredients.length)} />
      </section>

      <div className="flex gap-2 overflow-x-auto rounded-[1.25rem] border border-[var(--border)] bg-white p-2 shadow-sm">
        {tabs.map((tab) => (
          <button
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-black transition",
              activeTab === tab.key ? "bg-[var(--primary)] text-white" : "text-[var(--muted)] hover:bg-[var(--primary-light)]",
            )}
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            type="button"
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.count !== undefined ? <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", activeTab === tab.key ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600")}>{tab.count}</span> : null}
          </button>
        ))}
      </div>

      {activeTab === "resumen" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setModal("item")} type="button">
              Nuevo insumo
            </Button>
            <Button onClick={() => setModal("movement")} type="button" variant="secondary">
              Movimiento
            </Button>
            <Button onClick={() => setActiveTab("recetas")} type="button" variant="secondary">
              Ver recetas
            </Button>
          </div>
          <Card>
            <SectionTitle title="Insumos" description="Stock actual, unidad base, mínimo y costo." />
            <div className="mt-4">
              {items.length ? items.map((item) => <InventoryItemRow item={item} key={item.id} />) : <EmptyState title="Sin insumos" description="Crea los ingredientes o materiales que controla el negocio." />}
            </div>
          </Card>
        </section>
      ) : null}

      {activeTab === "catalogo" ? (
        <section className="grid gap-6 xl:grid-cols-2">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <SectionTitle title="Categorías" description="Organiza insumos por familia: carnes, lácteos, secos, empaques." />
              <Button onClick={() => setModal("category")} type="button" variant="secondary">
                Nueva
              </Button>
            </div>
            <ListGrid items={categories.map((category) => ({ title: category.name, detail: category.description ?? "Categoría activa" }))} empty="Sin categorías" />
          </Card>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <SectionTitle title="Zonas" description="Controla stock por barra, cocina, depósito o sucursal." />
              <Button onClick={() => setModal("zone")} type="button" variant="secondary">
                Nueva
              </Button>
            </div>
            <ListGrid items={zones.map((zone) => ({ title: zone.name, detail: zone.description ?? "Zona activa" }))} empty="Sin zonas" />
          </Card>
        </section>
      ) : null}

      {activeTab === "kardex" ? (
        <section className="space-y-4">
          <Button onClick={() => setModal("movement")} type="button">
            Registrar movimiento
          </Button>
          <Card>
            <SectionTitle title="Kardex" description="Historial de entradas, salidas, mermas y consumo automático." />
            <div className="mt-4 space-y-3 print:space-y-1">
              {movements.length ? (
                movements.map((movement) => {
                  const item = items.find((inventoryItem) => inventoryItem.id === movement.inventoryItemId);
                  return (
                    <div className="grid gap-2 rounded-2xl bg-slate-50 p-3 sm:grid-cols-[1fr_auto] sm:items-center print:border print:bg-white" key={movement.id}>
                      <div>
                        <p className="font-bold text-slate-950">
                        {item?.name ?? "Insumo"} · {movementLabels[movement.type]}
                        </p>
                        <p className="text-sm text-slate-500">{movement.reason}</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-700">
                        {movement.previousStock} → {movement.newStock} {item?.unit ?? ""} · {formatShortDate(movement.createdAt)} {formatShortTime(movement.createdAt)}
                      </p>
                    </div>
                  );
                })
              ) : (
                <EmptyState title="Sin movimientos" description="El kardex aparecerá cuando registres entradas, ventas, mermas o conteos." />
              )}
            </div>
            <Button className="mt-4 print:hidden" onClick={() => window.print()} type="button" variant="secondary">
              Imprimir kardex
            </Button>
          </Card>
        </section>
      ) : null}

      {activeTab === "zonas" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setModal("transfer")} type="button">
              Mover zona a zona
            </Button>
            <Button onClick={() => setModal("zone")} type="button" variant="secondary">
              Nueva zona
            </Button>
          </div>
          <Card>
            <SectionTitle title="Stock por zona" description="Ubicación física del stock para depósito, cocina, barra o sucursal." />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {itemZones.length ? (
                itemZones.map((stock) => {
                  const item = items.find((inventoryItem) => inventoryItem.id === stock.inventoryItemId);
                  const zone = zones.find((inventoryZone) => inventoryZone.id === stock.zoneId);
                  return (
                    <div className="rounded-2xl bg-slate-50 p-4" key={stock.id}>
                      <p className="font-black text-slate-950">{item?.name ?? "Insumo"}</p>
                      <p className="text-sm font-semibold text-slate-600">
                        {zone?.name ?? "Zona"} · {stock.stock} {item?.unit ?? ""}
                      </p>
                    </div>
                  );
                })
              ) : (
                <EmptyState title="Sin stock por zona" description="Registra entradas o crea una zona para empezar a distribuir stock." />
              )}
            </div>
          </Card>
        </section>
      ) : null}

      {activeTab === "recetas" ? (
        <section className="space-y-4">
          <Button onClick={() => setModal("recipe")} type="button">
            Ligar insumo a producto
          </Button>
          <Card>
            <SectionTitle title="Recetas activas" description="Al cobrar un pedido, estos insumos se descuentan automáticamente." />
            <div className="mt-4 space-y-3">
              {ingredients.length ? (
                ingredients.map((ingredient) => (
                  <div className="rounded-2xl bg-slate-50 p-3" key={ingredient.id}>
                    <p className="font-black text-slate-950">{ingredient.productName}</p>
                    <p className="text-sm font-semibold text-slate-600">
                      {ingredient.quantity} {ingredient.inventoryItemUnit} de {ingredient.inventoryItemName}
                      {ingredient.wasteFactor ? ` · merma ${ingredient.wasteFactor}%` : ""}
                    </p>
                    {ingredient.notes ? <p className="mt-1 text-sm text-slate-500">{ingredient.notes}</p> : null}
                  </div>
                ))
              ) : (
                <EmptyState title="Sin recetas" description="Liga insumos a productos para descontar stock al vender." />
              )}
            </div>
          </Card>
        </section>
      ) : null}

      {activeTab === "conteo" ? (
        <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <Card>
            <SectionTitle title={openCount ? "Conteo abierto" : "Abrir conteo"} description="Registra apertura y cierre del conteo físico." />
            {openCount ? (
              <div className="mt-4 space-y-3">
                <p className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                  Abierto el {formatShortDate(openCount.openedAt)} a las {formatShortTime(openCount.openedAt)}
                </p>
                <Button className="w-full" onClick={() => setModal("countLine")} type="button" variant="secondary">
                  Agregar línea contada
                </Button>
                <form action={closeInventoryCountAction} className="space-y-3 border-t border-slate-200 pt-3">
                  <input name="restaurantId" type="hidden" value={restaurantId} />
                  <Textarea name="notes" placeholder="Notas de cierre" />
                  <Button className="w-full" type="submit" variant="danger">
                    Cerrar conteo y ajustar stock
                  </Button>
                </form>
              </div>
            ) : (
              <form action={openInventoryCountAction} className="mt-4 space-y-3">
                <input name="restaurantId" type="hidden" value={restaurantId} />
                <Textarea name="notes" placeholder="Notas de apertura" />
                <Button className="w-full" type="submit">
                  Abrir conteo
                </Button>
              </form>
            )}
          </Card>

          <Card>
            <SectionTitle title="Reporte de conteo" description="Diferencias entre sistema y conteo físico." />
            {openCount?.lines.length ? <CountLines lines={openCount.lines} /> : <EmptyState title="Sin líneas contadas" description="Agrega cada insumo contado para ver diferencias." />}
            {countReports.length ? (
              <div className="mt-6 space-y-3">
                <h3 className="text-sm font-black uppercase tracking-[0.12em] text-slate-500">Últimos conteos</h3>
                {countReports.map((count) => (
                  <div className="rounded-2xl bg-slate-50 p-3" key={count.id}>
                    <p className="font-black text-slate-950">
                      {formatShortDate(count.openedAt)} · {count.status === "closed" ? "Cerrado" : "Abierto"}
                    </p>
                    <p className="text-sm text-slate-500">
                      {count.lines.length} líneas · diferencia total {count.lines.reduce((sum, line) => sum + Math.abs(line.differenceStock), 0)}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
        </section>
      ) : null}

      {activeTab === "proveedores" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setModal("supplier")} type="button">
              Nuevo proveedor
            </Button>
            <Button onClick={() => setModal("productSupplier")} type="button" variant="secondary">
              Ligar a producto
            </Button>
          </div>
          <Card>
            <SectionTitle title="Proveedores" description="Contactos activos para compras de insumos." />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {suppliers.length ? (
                suppliers.map((supplier) => (
                  <div className="rounded-2xl bg-slate-50 p-4" key={supplier.id}>
                    <p className="font-black text-slate-950">{supplier.name}</p>
                    {supplier.phone ? <p className="text-sm font-semibold text-slate-600">{supplier.phone}</p> : null}
                    {supplier.notes ? <p className="mt-2 text-sm text-slate-500">{supplier.notes}</p> : null}
                  </div>
                ))
              ) : (
                <EmptyState title="Sin proveedores" description="Agrega proveedores para ordenar mejor compras y reposición." />
              )}
            </div>
          </Card>
          <Card>
            <SectionTitle title="Proveedores por producto" description="Útil para productos comprados hechos o reposición directa." />
            <ListGrid items={productSuppliers.map((link) => ({ title: link.productName, detail: `${link.supplierName}${link.notes ? ` · ${link.notes}` : ""}` }))} empty="Sin productos ligados" />
          </Card>
        </section>
      ) : null}

      <ActionModal onClose={() => setModal(null)} open={modal === "item"} title="Nuevo insumo">
        <InventoryItemForm categories={categoryOptions} restaurantId={restaurantId} suppliers={supplierOptions} />
      </ActionModal>
      <ActionModal onClose={() => setModal(null)} open={modal === "category"} title="Nueva categoría">
        <SimpleNamedForm action={createInventoryCategoryAction} descriptionName="description" descriptionPlaceholder="Descripción" namePlaceholder="Nombre de la categoría" restaurantId={restaurantId} />
      </ActionModal>
      <ActionModal onClose={() => setModal(null)} open={modal === "zone"} title="Nueva zona">
        <SimpleNamedForm action={createInventoryZoneAction} descriptionName="description" descriptionPlaceholder="Descripción o ubicación" namePlaceholder="Nombre de la zona" restaurantId={restaurantId} />
      </ActionModal>
      <ActionModal onClose={() => setModal(null)} open={modal === "movement"} title="Registrar movimiento">
        <MovementForm items={itemOptions} restaurantId={restaurantId} suppliers={supplierOptions} zones={zoneOptions} />
      </ActionModal>
      <ActionModal onClose={() => setModal(null)} open={modal === "transfer"} title="Mover entre zonas">
        <TransferForm items={itemOptions} restaurantId={restaurantId} zones={zoneOptions} />
      </ActionModal>
      <ActionModal onClose={() => setModal(null)} open={modal === "recipe"} title="Ligar receta">
        <RecipeForm items={itemOptions} products={productOptions} restaurantId={restaurantId} />
      </ActionModal>
      <ActionModal onClose={() => setModal(null)} open={modal === "countLine"} title="Agregar conteo">
        <CountLineForm items={itemOptions} restaurantId={restaurantId} />
      </ActionModal>
      <ActionModal onClose={() => setModal(null)} open={modal === "supplier"} title="Nuevo proveedor">
        <SupplierForm restaurantId={restaurantId} />
      </ActionModal>
      <ActionModal onClose={() => setModal(null)} open={modal === "productSupplier"} title="Proveedor por producto">
        <ProductSupplierForm products={productOptions} restaurantId={restaurantId} suppliers={supplierOptions} />
      </ActionModal>
    </div>
  );
}

function isTab(value: string | undefined): value is InventoryTab {
  return value === "resumen" || value === "catalogo" || value === "kardex" || value === "zonas" || value === "recetas" || value === "conteo" || value === "proveedores";
}

function MetricCard({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <span className={cn("grid h-10 w-10 place-items-center rounded-full", danger ? "bg-amber-50 text-amber-700" : "bg-[var(--primary-light)] text-[var(--primary)]")}>
          <Scale className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className={cn("text-2xl font-black", danger ? "text-amber-700" : "text-slate-950")}>{value}</p>
        </div>
      </div>
    </Card>
  );
}

function toItemOptions(items: InventoryItem[]): SearchOption[] {
  return items.map((item) => ({
    value: item.id,
    label: item.name,
    detail: `${item.currentStock} ${item.unit} · mín. ${item.minStock}`,
  }));
}

function ActionModal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/50 p-0 backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[1.5rem] bg-white p-4 shadow-2xl sm:max-w-lg sm:rounded-[1.5rem]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          <button className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black text-slate-600" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InventoryItemForm({ restaurantId, suppliers, categories }: { restaurantId: string; suppliers: SearchOption[]; categories: SearchOption[] }) {
  return (
    <form action={createInventoryItemAction} className="space-y-3">
      <input name="restaurantId" type="hidden" value={restaurantId} />
      <Input name="name" placeholder="Nombre del insumo" required />
      <SearchableSelect name="categoryId" options={categories} placeholder="Buscar categoría" />
      <Input name="category" placeholder="Categoría rápida si no está creada" />
      <Select name="unit" defaultValue="unidad">
        {unitOptions.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Input min={0} name="currentStock" placeholder="Stock actual" step="0.001" type="number" />
        <Input min={0} name="minStock" placeholder="Stock mínimo" step="0.001" type="number" />
      </div>
      <Input min={0} name="unitCost" placeholder="Costo por unidad base" step="0.01" type="number" />
      <SearchableSelect name="supplierId" options={suppliers} placeholder="Buscar proveedor" />
      <Input name="purchaseUnit" placeholder="Compra típica, ej. caja x 24" />
      <Input min={0.0001} name="purchaseToStockFactor" placeholder="Factor a unidad base" step="0.0001" type="number" />
      <Button className="w-full" type="submit">
        Crear insumo
      </Button>
    </form>
  );
}

function MovementForm({ restaurantId, items, zones, suppliers }: { restaurantId: string; items: SearchOption[]; zones: SearchOption[]; suppliers: SearchOption[] }) {
  return (
    <form action={registerInventoryMovementAction} className="space-y-3">
      <input name="restaurantId" type="hidden" value={restaurantId} />
      <SearchableSelect name="inventoryItemId" options={items} placeholder="Buscar insumo" required />
      <Select name="type" defaultValue="in">
        <option value="in">Entrada</option>
        <option value="out">Salida</option>
        <option value="adjustment">Ajuste a stock final</option>
        <option value="waste">Merma</option>
        <option value="sale_usage">Uso por venta</option>
      </Select>
      <SearchableSelect name="fromZoneId" options={zones} placeholder="Zona origen si aplica" />
      <SearchableSelect name="toZoneId" options={zones} placeholder="Zona destino si aplica" />
      <SearchableSelect name="supplierId" options={suppliers} placeholder="Proveedor si aplica" />
      <Input min={0} name="quantity" placeholder="Cantidad" required step="0.001" type="number" />
      <Input name="reason" placeholder="Motivo" required />
      <Button className="w-full" type="submit">
        Registrar movimiento
      </Button>
    </form>
  );
}

function TransferForm({ restaurantId, items, zones }: { restaurantId: string; items: SearchOption[]; zones: SearchOption[] }) {
  return (
    <form action={transferInventoryZoneAction} className="space-y-3">
      <input name="restaurantId" type="hidden" value={restaurantId} />
      <SearchableSelect name="inventoryItemId" options={items} placeholder="Buscar insumo" required />
      <SearchableSelect name="fromZoneId" options={zones} placeholder="Zona origen" required />
      <SearchableSelect name="toZoneId" options={zones} placeholder="Zona destino" required />
      <Input min={0.001} name="quantity" placeholder="Cantidad" required step="0.001" type="number" />
      <Input name="reason" placeholder="Motivo del traslado" required />
      <Button className="w-full" type="submit">
        Mover stock
      </Button>
    </form>
  );
}

function RecipeForm({ restaurantId, products, items }: { restaurantId: string; products: SearchOption[]; items: SearchOption[] }) {
  return (
    <form action={linkProductIngredientAction} className="space-y-3">
      <input name="restaurantId" type="hidden" value={restaurantId} />
      <SearchableSelect name="productId" options={products} placeholder="Buscar producto" required />
      <SearchableSelect name="inventoryItemId" options={items} placeholder="Buscar insumo" required />
      <Input min={0.001} name="quantity" placeholder="Cantidad por unidad vendida" required step="0.001" type="number" />
      <Input min={0} name="wasteFactor" placeholder="% merma opcional" step="0.01" type="number" />
      <Input name="notes" placeholder="Nota opcional" />
      <Button className="w-full" type="submit">
        Guardar receta
      </Button>
    </form>
  );
}

function CountLineForm({ restaurantId, items }: { restaurantId: string; items: SearchOption[] }) {
  return (
    <form action={recordInventoryCountLineAction} className="space-y-3">
      <input name="restaurantId" type="hidden" value={restaurantId} />
      <SearchableSelect name="inventoryItemId" options={items} placeholder="Buscar insumo contado" required />
      <Input min={0} name="countedStock" placeholder="Cantidad contada" required step="0.001" type="number" />
      <Input name="notes" placeholder="Nota opcional" />
      <Button className="w-full" type="submit">
        Guardar línea
      </Button>
    </form>
  );
}

function SupplierForm({ restaurantId }: { restaurantId: string }) {
  return (
    <form action={createInventorySupplierAction} className="space-y-3">
      <input name="restaurantId" type="hidden" value={restaurantId} />
      <Input name="name" placeholder="Nombre del proveedor" required />
      <Input name="phone" placeholder="Teléfono o WhatsApp" />
      <Textarea name="notes" placeholder="Notas" />
      <Button className="w-full" type="submit">
        Guardar proveedor
      </Button>
    </form>
  );
}

function ProductSupplierForm({ restaurantId, products, suppliers }: { restaurantId: string; products: SearchOption[]; suppliers: SearchOption[] }) {
  return (
    <form action={linkProductSupplierAction} className="space-y-3">
      <input name="restaurantId" type="hidden" value={restaurantId} />
      <SearchableSelect name="productId" options={products} placeholder="Buscar producto" required />
      <SearchableSelect name="supplierId" options={suppliers} placeholder="Buscar proveedor" required />
      <Input name="notes" placeholder="Nota opcional" />
      <Button className="w-full" type="submit">
        Ligar proveedor
      </Button>
    </form>
  );
}

function SimpleNamedForm({
  restaurantId,
  action,
  namePlaceholder,
  descriptionName,
  descriptionPlaceholder,
}: {
  restaurantId: string;
  action: (formData: FormData) => void;
  namePlaceholder: string;
  descriptionName: string;
  descriptionPlaceholder: string;
}) {
  return (
    <form action={action} className="space-y-3">
      <input name="restaurantId" type="hidden" value={restaurantId} />
      <Input name="name" placeholder={namePlaceholder} required />
      <Textarea name={descriptionName} placeholder={descriptionPlaceholder} />
      <Button className="w-full" type="submit">
        Guardar
      </Button>
    </form>
  );
}

function ListGrid({ items, empty }: { items: { title: string; detail: string }[]; empty: string }) {
  if (!items.length) {
    return <EmptyState title={empty} description="Crea el primer registro para ordenar mejor la operación." />;
  }

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <div className="rounded-2xl bg-slate-50 p-4" key={`${item.title}-${item.detail}`}>
          <p className="font-black text-slate-950">{item.title}</p>
          <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

function CountLines({ lines }: { lines: InventoryCountReport["lines"] }) {
  return (
    <div className="mt-4 space-y-3">
      {lines.map((line) => (
        <div className="grid gap-2 rounded-2xl bg-slate-50 p-3 sm:grid-cols-[1fr_auto] sm:items-center" key={line.id}>
          <div>
            <p className="font-black text-slate-950">{line.inventoryItemName}</p>
            <p className="text-sm text-slate-500">
              Sistema {line.expectedStock} · contado {line.countedStock}
            </p>
          </div>
          <p className={cn("text-sm font-black", line.differenceStock === 0 ? "text-emerald-700" : line.differenceStock > 0 ? "text-blue-700" : "text-red-600")}>{line.differenceStock}</p>
        </div>
      ))}
    </div>
  );
}
