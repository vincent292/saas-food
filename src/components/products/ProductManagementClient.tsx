"use client";

import type { ReactNode } from "react";
import { CalendarClock, Flame, Grid2X2, LayoutList, PackageCheck, Plus, Search, Sparkles, Trash2, Utensils, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createCategoryAction, createProductAction, updateProductAction } from "@/app/admin/actions";
import { ProductCard } from "@/components/products/ProductCard";
import { ProductStats } from "@/components/products/ProductStats";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import {
  businessCatalogItemLabel,
  businessCatalogItemsLabel,
  businessCatalogLabelTitle,
  businessOptionGroupCopy,
  businessProductImageHelp,
  businessVariantExample,
} from "@/lib/restaurant-directory-options";
import { cn } from "@/lib/utils/cn";
import { defaultProductImage } from "@/lib/utils/default-images";
import { formatMoney } from "@/lib/utils/money";
import type { Category, Product, ProductConfiguration } from "@/types/product.types";
import type { InventoryItem } from "@/types/inventory.types";
import type { BusinessType } from "@/types/restaurant.types";

type ProductStatus = "all" | "active" | "inactive";
type ViewMode = "grid" | "list";
type ProductKind = Product["productKind"];
type DraftVariant = { name: string; description: string; priceDelta: number; sortOrder: number; isActive: boolean };
type DraftOption = {
  name: string;
  description: string;
  priceDelta: number;
  inventoryItemId: string;
  inventoryQuantity: number;
  inventoryWasteFactor: number;
  sortOrder: number;
  isActive: boolean;
};
type DraftOptionGroup = {
  name: string;
  description: string;
  minChoices: number;
  maxChoices: number;
  isRequired: boolean;
  sortOrder: number;
  isActive: boolean;
  options: DraftOption[];
};

const saveErrorMessages: Record<string, string> = {
  invalid: "Revisa los datos obligatorios.",
  "invalid-update": "Revisa los datos del producto.",
  "storage-upload": "La imagen no pudo subirse. Puedes guardar sin foto o probar con otra imagen.",
  "service-role-required": "Falta SUPABASE_SERVICE_ROLE_KEY para guardar sin bloqueo de RLS.",
  "42501": "Tu usuario no tiene permiso para guardar en este restaurante.",
  "23503": "La categoria seleccionada no pertenece a este restaurante.",
  "product-create": "No se pudo crear el producto.",
  "option-group": "No se pudo guardar el grupo de opciones.",
  "option-group-update": "No se pudo actualizar el grupo de opciones.",
};

const emptyVariant = (index: number): DraftVariant => ({
  name: "",
  description: "",
  priceDelta: 0,
  sortOrder: index,
  isActive: true,
});

const emptyOption = (index: number): DraftOption => ({
  name: "",
  description: "",
  priceDelta: 0,
  inventoryItemId: "",
  inventoryQuantity: 1,
  inventoryWasteFactor: 0,
  sortOrder: index,
  isActive: true,
});

const emptyOptionGroup = (index: number): DraftOptionGroup => ({
  name: "",
  description: "",
  minChoices: 0,
  maxChoices: 1,
  isRequired: false,
  sortOrder: index,
  isActive: true,
  options: [emptyOption(0)],
});

export function ProductManagementClient({
  restaurantId,
  products,
  categories,
  configuration,
  inventoryItems,
  created,
  categoryCreated,
  updated,
  error,
  businessType,
}: {
  restaurantId: string;
  products: Product[];
  categories: Category[];
  configuration: ProductConfiguration;
  inventoryItems: InventoryItem[];
  businessType: BusinessType;
  created?: string;
  categoryCreated?: string;
  updated?: string;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [status, setStatus] = useState<ProductStatus>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<DraftVariant[]>([emptyVariant(0)]);
  const [optionGroups, setOptionGroups] = useState<DraftOptionGroup[]>([]);
  const [productKind, setProductKind] = useState<ProductKind>("standard");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const productCountsByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((product) => counts.set(product.categoryId || "none", (counts.get(product.categoryId || "none") ?? 0) + 1));
    return counts;
  }, [products]);
  const variantCountByProduct = useMemo(() => {
    const counts = new Map<string, number>();
    configuration.variants.forEach((variant) => counts.set(variant.productId, (counts.get(variant.productId) ?? 0) + 1));
    return counts;
  }, [configuration.variants]);
  const optionGroupCountByProduct = useMemo(() => {
    const counts = new Map<string, number>();
    configuration.optionGroups.forEach((group) => counts.set(group.productId, (counts.get(group.productId) ?? 0) + 1));
    return counts;
  }, [configuration.optionGroups]);
  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return products
      .filter((product) => {
        const categoryMatches = categoryId === "all" || (categoryId === "none" ? !product.categoryId : product.categoryId === categoryId);
        const statusMatches = status === "all" || (status === "active" ? product.isAvailable : !product.isAvailable);
        const textMatches =
          !normalizedQuery ||
          product.name.toLowerCase().includes(normalizedQuery) ||
          product.description.toLowerCase().includes(normalizedQuery) ||
          (categoryById.get(product.categoryId)?.name.toLowerCase().includes(normalizedQuery) ?? false);

        return categoryMatches && statusMatches && textMatches;
      })
      .sort((first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name));
  }, [categoryById, categoryId, products, query, status]);
  const selectedCategoryName = categoryId !== "all" && categoryId !== "none" ? categoryById.get(categoryId)?.name : "";
  const canCreateInSelectedCategory = Boolean(selectedCategoryName);

  const variantsJson = useMemo(() => JSON.stringify(variants.filter((variant) => variant.name.trim())), [variants]);
  const optionGroupsJson = useMemo(
    () =>
      JSON.stringify(
        optionGroups
          .filter((group) => group.name.trim())
          .map((group) => ({
            ...group,
            options: group.options.filter((option) => option.name.trim()),
          })),
      ),
    [optionGroups],
  );

  const catalogTitle = businessCatalogLabelTitle(businessType);
  const itemLabel = businessCatalogItemLabel(businessType);
  const itemsLabel = businessCatalogItemsLabel(businessType);
  const variantExample = businessVariantExample(businessType);

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">{catalogTitle} operativo</p>
            <h2 className="mt-1 text-2xl font-black text-[var(--text)] sm:text-3xl">Productos</h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">Categorias, {itemsLabel}, variantes y opciones del {catalogTitle.toLowerCase()} en una sola superficie.</p>
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <button className={buttonClasses("secondary", "w-full sm:w-auto")} onClick={() => setCategoryModalOpen(true)} type="button">
              <Plus className="h-4 w-4" />
              Nueva categoria
            </button>
            <button
              className={buttonClasses(canCreateInSelectedCategory ? "primary" : "secondary", "w-full sm:w-auto")}
              disabled={!canCreateInSelectedCategory}
              onClick={() => openCreateProductModal()}
              title={canCreateInSelectedCategory ? `Crear en ${selectedCategoryName}` : "Selecciona una categoria primero"}
              type="button"
            >
              <Plus className="h-4 w-4" />
              {canCreateInSelectedCategory ? `${itemLabel[0].toUpperCase()}${itemLabel.slice(1)} en ${selectedCategoryName}` : "Selecciona categoria"}
            </button>
          </div>
        </div>
        <div className="mt-5">
          <ProductStats categories={categories} products={products} />
        </div>
      </section>

      {created ? <div className="rounded-2xl bg-[var(--color-success-soft)] p-3 text-sm font-bold text-[var(--color-success-strong)]">Producto creado correctamente.</div> : null}
      {updated ? <div className="rounded-2xl bg-[var(--color-success-soft)] p-3 text-sm font-bold text-[var(--color-success-strong)]">Producto actualizado correctamente.</div> : null}
      {categoryCreated ? <div className="rounded-2xl bg-[var(--color-success-soft)] p-3 text-sm font-bold text-[var(--color-success-strong)]">Categoria creada correctamente.</div> : null}
      {error ? (
        <div className="rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm font-bold text-[var(--color-danger-strong)]">
          No se pudo guardar. {saveErrorMessages[error] ?? `Detalle: ${error}.`}
        </div>
      ) : null}

      <Card className="sticky top-[73px] z-20 grid gap-3 bg-[var(--color-card-elevated)] p-3 backdrop-blur sm:top-[85px] lg:grid-cols-[1fr_260px_220px_auto] lg:items-center">
        <label className="relative block">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <Input className="pl-11" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto, categoria o descripcion" value={query} />
        </label>
        <Select onChange={(event) => setCategoryId(event.target.value)} value={categoryId}>
          <option value="all">Todas las categorias</option>
          <option value="none">Sin categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Select onChange={(event) => setStatus(event.target.value as ProductStatus)} value={status}>
          <option value="all">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </Select>
        <div className="flex w-full justify-self-start rounded-full bg-[var(--primary-light)] p-1 sm:w-auto lg:justify-self-end">
          <button className={cn("inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-black text-[var(--primary-dark)] sm:flex-none", viewMode === "grid" && "bg-[var(--surface)] shadow-sm")} onClick={() => setViewMode("grid")} type="button">
            <Grid2X2 className="h-4 w-4" />
            Mosaico
          </button>
          <button className={cn("inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-black text-[var(--primary-dark)] sm:flex-none", viewMode === "list" && "bg-[var(--surface)] shadow-sm")} onClick={() => setViewMode("list")} type="button">
            <LayoutList className="h-4 w-4" />
            Lista
          </button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Categorias</p>
            <h3 className="text-xl font-black text-[var(--text)]">Secciones del {catalogTitle.toLowerCase()}</h3>
          </div>
          <p className="text-sm font-semibold text-[var(--muted)]">Selecciona una categoria para crear productos ahi dentro.</p>
        </div>
        <div className="admin-scrollbar mt-4 flex gap-3 overflow-x-auto pb-1">
          <CategoryTile active={categoryId === "all"} count={products.length} label="Todas" onClick={() => setCategoryId("all")} />
          {categories.map((category) => (
            <CategoryTile
              active={categoryId === category.id}
              count={productCountsByCategory.get(category.id) ?? 0}
              imageUrl={category.imageUrl}
              key={category.id}
              label={category.name}
              onClick={() => setCategoryId(category.id)}
            />
          ))}
        </div>
      </Card>

      <section className="space-y-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Productos</p>
            <SectionTitle
              title={categoryId === "all" ? "Todos los productos" : categoryById.get(categoryId)?.name ?? "Sin categoria"}
              description={
                canCreateInSelectedCategory
                  ? `Creando y filtrando dentro de ${selectedCategoryName}.`
                  : "Selecciona una categoria para activar la creacion contextual."
              }
            />
          </div>
          <button className={buttonClasses(canCreateInSelectedCategory ? "primary" : "secondary", "w-full sm:w-auto")} disabled={!canCreateInSelectedCategory} onClick={() => openCreateProductModal()} type="button">
            <Plus className="h-4 w-4" />
            {canCreateInSelectedCategory ? `Nuevo ${itemLabel}` : "Elige categoria"}
          </button>
        </div>

        {filteredProducts.length ? (
          viewMode === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {filteredProducts.map((product) => (
                <ProductCard
                  category={categoryById.get(product.categoryId)}
                  key={product.id}
                  optionGroupCount={optionGroupCountByProduct.get(product.id) ?? 0}
                  onEdit={() => openEditProductModal(product)}
                  product={product}
                  variantCount={variantCountByProduct.get(product.id) ?? 0}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProducts.map((product) => (
                <Card className="grid gap-4 p-4 md:grid-cols-[92px_1fr_auto_auto] md:items-center" key={product.id}>
                  <ProductThumb imageUrl={product.imageUrl} name={product.name} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-[var(--text)]">{product.name}</h3>
                      <Badge className={product.isAvailable ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-neutral-100)] text-[var(--color-secondary-text)]"}>{product.isAvailable ? "Activo" : "Inactivo"}</Badge>
                      {product.isFeatured ? <Badge className="bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]">Destacado</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">{categoryById.get(product.categoryId)?.name ?? "Sin categoria"}</p>
                    <p className="mt-2 text-xs font-bold text-[var(--muted)]">
                      {variantCountByProduct.get(product.id) ?? 0} variantes · {optionGroupCountByProduct.get(product.id) ?? 0} grupos de opciones
                    </p>
                  </div>
                  <p className="text-lg font-black text-[var(--primary)]">{formatMoney(product.price)}</p>
                  <button className={buttonClasses("secondary")} onClick={() => openEditProductModal(product)} type="button">
                    Editar
                  </button>
                </Card>
              ))}
            </div>
          )
        ) : (
          <EmptyState title={products.length ? "No hay productos con esos filtros" : "Todavia no tienes productos"} description={products.length ? "Ajusta la busqueda o cambia la categoria seleccionada." : `Crea el primer ${itemLabel} real para publicarlo en el ${catalogTitle.toLowerCase()}.`} />
        )}
      </section>

      {categoryModalOpen ? (
        <ModalShell eyebrow="Crear" title="Categoria" onClose={() => setCategoryModalOpen(false)}>
          <form action={createCategoryAction} className="space-y-4">
            <input name="restaurantId" type="hidden" value={restaurantId} />
            <input name="returnTo" type="hidden" value="products" />
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--primary-light)] p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Nueva seccion</p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">La categoria organiza tus productos en el panel y en el menu. No necesita imagen.</p>
            </div>
            <Labeled label="Nombre">
              <Input name="name" required />
            </Labeled>
            <Labeled label="Descripcion">
              <Textarea name="description" />
            </Labeled>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr] sm:items-end">
              <Labeled label="Orden">
                <Input defaultValue={categories.length + 1} min={0} name="sortOrder" type="number" />
              </Labeled>
              <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-black text-[var(--text)]">
                <input defaultChecked name="isActive" type="checkbox" />
                Activa
              </label>
            </div>
            <ModalActions
              onCancel={() => setCategoryModalOpen(false)}
              pendingDescription="Estamos creando la categoria y actualizando el catalogo."
              pendingLabel="Creando..."
              pendingTitle="Creando categoria"
            />
          </form>
        </ModalShell>
      ) : null}

      {productModalOpen ? (
        <ModalShell eyebrow={editingProduct ? "Editar" : "Crear"} title="Producto" wide onClose={() => closeProductModal()}>
          <form action={editingProduct ? updateProductAction : createProductAction} className="space-y-5" key={editingProduct?.id ?? "new-product"}>
            <input name="restaurantId" type="hidden" value={restaurantId} />
            {editingProduct ? <input name="productId" type="hidden" value={editingProduct.id} /> : null}
            <input name="variantsJson" type="hidden" value={variantsJson} />
            <input name="optionGroupsJson" type="hidden" value={optionGroupsJson} />
            <input name="availableDays" type="hidden" value={selectedDays.join(",")} />

            <div className="grid grid-cols-2 gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--color-card-muted)] p-3 sm:grid-cols-4">
              <PresetButton icon={<Sparkles className="h-4 w-4" />} label="Simple" onClick={() => applyPreset("simple")} />
              <PresetButton icon={<PackageCheck className="h-4 w-4" />} label="Combo" onClick={() => applyPreset("combo")} />
              <PresetButton icon={<Flame className="h-4 w-4" />} label="Promo" onClick={() => applyPreset("promotion")} />
              <PresetButton icon={<Utensils className="h-4 w-4" />} label="Almuerzo" onClick={() => applyPreset("lunch")} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
              <PreviewBanner className="min-h-56 xl:min-h-full" imageUrl={editingProduct?.imageUrl} label={editingProduct?.name || "Nuevo producto"} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Labeled label="Nombre">
                  <Input defaultValue={editingProduct?.name} name="name" required />
                </Labeled>
                <Labeled label="Categoria">
                  <Select defaultValue={editingProduct?.categoryId || (categoryId !== "all" && categoryId !== "none" ? categoryId : "")} name="categoryId">
                    <option value="">Sin categoria</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                </Labeled>
                <Labeled className="sm:col-span-2" label="Descripcion">
                  <Textarea defaultValue={editingProduct?.description} name="description" />
                </Labeled>
                <Labeled label="Precio base">
                  <Input defaultValue={editingProduct?.price ?? 0} min={0} name="price" required step="0.01" type="number" />
                </Labeled>
                <Labeled label="Tipo">
                  <Select name="productKind" onChange={(event) => setProductKind(event.target.value as ProductKind)} value={productKind}>
                    <option value="standard">Producto normal</option>
                    <option value="promotion">Promocion</option>
                    <option value="lunch">Almuerzo mensual</option>
                  </Select>
                </Labeled>
                <Labeled label={productKind === "promotion" ? "Precio anterior" : "Precio referencia"}>
                  <Input defaultValue={editingProduct?.compareAtPrice ?? ""} min={0} name="compareAtPrice" placeholder="Opcional" step="0.01" type="number" />
                </Labeled>
                <Labeled label="Orden">
                  <Input defaultValue={editingProduct?.sortOrder ?? products.length + 1} min={0} name="sortOrder" type="number" />
                </Labeled>
                <div className="sm:col-span-2">
                  <ProductSchedulePanel
                    availableFrom={editingProduct?.availableFrom}
                    availableUntil={editingProduct?.availableUntil}
                    days={selectedDays}
                    endTime={editingProduct?.availableEndTime}
                    kind={productKind}
                    onToggleDay={toggleDay}
                    startTime={editingProduct?.availableStartTime}
                  />
                </div>
                <div className="sm:col-span-2">
                <CompressedImageInput help={businessProductImageHelp(businessType)} label="Imagen" name="imageFile" />
                </div>
                <label className="flex items-center gap-2 text-sm font-black text-[var(--text)]">
                  <input defaultChecked={editingProduct?.isAvailable ?? true} name="isAvailable" type="checkbox" />
                  Activo
                </label>
                <label className="flex items-center gap-2 text-sm font-black text-[var(--text)]">
                  <input defaultChecked={editingProduct?.isFeatured ?? false} name="isFeatured" type="checkbox" />
                  Destacado
                </label>
                <label className="flex items-center gap-2 text-sm font-black text-[var(--text)]">
                  <input defaultChecked={editingProduct?.trackStock ?? false} name="trackStock" type="checkbox" />
                  Descontar del inventario al vender
                </label>
              </div>
            </div>

            <div className="border-t border-[var(--border)] pt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-black text-[var(--text)]">Variantes</h3>
                <Button onClick={() => setVariants((current) => [...current, emptyVariant(current.length)])} type="button">
                  <Plus className="h-4 w-4" />
                  Agregar variante
                </Button>
              </div>
              <div className="mt-3 space-y-3">
                {variants.map((variant, index) => (
                  <div className="rounded-3xl border border-[var(--border)] bg-[var(--primary-light)]/40 p-4" key={index}>
                    <div className="grid gap-3 lg:grid-cols-[1fr_160px_120px_auto] lg:items-end">
                      <Labeled label="Nombre">
                        <Input onChange={(event) => updateVariant(index, { name: event.target.value })} placeholder={variantExample} value={variant.name} />
                      </Labeled>
                      <Labeled label="Precio extra">
                        <Input onChange={(event) => updateVariant(index, { priceDelta: Number(event.target.value) })} step="0.01" type="number" value={variant.priceDelta} />
                      </Labeled>
                      <Labeled label="Orden">
                        <Input onChange={(event) => updateVariant(index, { sortOrder: Number(event.target.value) })} type="number" value={variant.sortOrder} />
                      </Labeled>
                      <button className={buttonClasses("danger", "h-11")} onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <Textarea className="mt-3" onChange={(event) => updateVariant(index, { description: event.target.value })} placeholder="Descripcion de la variante" value={variant.description} />
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-[var(--border)] pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-black text-[var(--text)]">Opciones configurables</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">{businessOptionGroupCopy(businessType)}</p>
                </div>
                <Button onClick={() => setOptionGroups((current) => [...current, emptyOptionGroup(current.length)])} type="button">
                  <Plus className="h-4 w-4" />
                  Agregar grupo
                </Button>
              </div>
              <div className="mt-3 space-y-3">
                {optionGroups.length ? (
                  optionGroups.map((group, groupIndex) => (
                    <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4" key={groupIndex}>
                      <div className="grid gap-3 lg:grid-cols-[1fr_120px_120px_auto] lg:items-end">
                        <Labeled label="Grupo">
                          <Input onChange={(event) => updateOptionGroup(groupIndex, { name: event.target.value })} placeholder="Ej. Salsa" value={group.name} />
                        </Labeled>
                        <Labeled label="Min">
                          <Input min={0} onChange={(event) => updateOptionGroup(groupIndex, { minChoices: Number(event.target.value) })} type="number" value={group.minChoices} />
                        </Labeled>
                        <Labeled label="Max">
                          <Input min={1} onChange={(event) => updateOptionGroup(groupIndex, { maxChoices: Number(event.target.value) })} type="number" value={group.maxChoices} />
                        </Labeled>
                        <button className={buttonClasses("danger", "h-11")} onClick={() => setOptionGroups((current) => current.filter((_, itemIndex) => itemIndex !== groupIndex))} type="button">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                        <Input onChange={(event) => updateOptionGroup(groupIndex, { description: event.target.value })} placeholder="Descripcion interna. Ej. El cliente puede elegir hasta 3 salsas." value={group.description} />
                        <label className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--color-card-muted)] px-4 text-sm font-black text-[var(--text)]">
                          <input checked={group.isRequired} onChange={(event) => updateOptionGroup(groupIndex, { isRequired: event.target.checked, minChoices: event.target.checked ? Math.max(1, group.minChoices) : group.minChoices })} type="checkbox" />
                          Obligatorio
                        </label>
                      </div>
                      <div className="mt-3 space-y-2">
                        {group.options.map((option, optionIndex) => (
                          <div className="grid gap-2 rounded-[var(--radius-control)] bg-[var(--color-surface)] p-3 xl:grid-cols-[minmax(160px,1fr)_120px_170px_110px_auto]" key={optionIndex}>
                            <Input onChange={(event) => updateOption(groupIndex, optionIndex, { name: event.target.value })} placeholder="Ej. Aparte / Banada / Papas" value={option.name} />
                            <Input onChange={(event) => updateOption(groupIndex, optionIndex, { priceDelta: Number(event.target.value) })} step="0.01" type="number" value={option.priceDelta} />
                            <Select aria-label="Insumo ligado" onChange={(event) => updateOption(groupIndex, optionIndex, { inventoryItemId: event.target.value })} value={option.inventoryItemId}>
                              <option value="">Sin inventario</option>
                              {inventoryItems.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                            </Select>
                            <Input aria-label="Cantidad inventario" min={0.001} onChange={(event) => updateOption(groupIndex, optionIndex, { inventoryQuantity: Number(event.target.value) })} step="0.001" type="number" value={option.inventoryQuantity} />
                            <button className={buttonClasses("ghost")} onClick={() => removeOption(groupIndex, optionIndex)} type="button">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <Button className="mt-3" onClick={() => addOption(groupIndex)} type="button" variant="secondary">
                        <Plus className="h-4 w-4" />
                        Agregar opcion
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--muted)]">Sin grupos de opciones.</p>
                )}
              </div>
            </div>

            <ModalActions
              onCancel={() => closeProductModal()}
              pendingDescription={editingProduct ? "Estamos actualizando el producto y sus opciones." : "Estamos creando el producto dentro de la categoria seleccionada."}
              pendingLabel={editingProduct ? "Actualizando..." : "Creando..."}
              pendingTitle={editingProduct ? "Actualizando producto" : "Creando producto"}
            />
          </form>
        </ModalShell>
      ) : null}
    </div>
  );

  function updateVariant(index: number, patch: Partial<DraftVariant>) {
    setVariants((current) => current.map((variant, itemIndex) => (itemIndex === index ? { ...variant, ...patch } : variant)));
  }

  function updateOptionGroup(index: number, patch: Partial<DraftOptionGroup>) {
    setOptionGroups((current) => current.map((group, itemIndex) => (itemIndex === index ? { ...group, ...patch } : group)));
  }

  function updateOption(groupIndex: number, optionIndex: number, patch: Partial<DraftOption>) {
    setOptionGroups((current) =>
      current.map((group, itemIndex) =>
        itemIndex === groupIndex
          ? {
              ...group,
              options: group.options.map((option, nestedIndex) => (nestedIndex === optionIndex ? { ...option, ...patch } : option)),
            }
          : group,
      ),
    );
  }

  function addOption(groupIndex: number) {
    setOptionGroups((current) =>
      current.map((group, itemIndex) =>
        itemIndex === groupIndex
          ? {
              ...group,
              options: [...group.options, emptyOption(group.options.length)],
            }
          : group,
      ),
    );
  }

  function removeOption(groupIndex: number, optionIndex: number) {
    setOptionGroups((current) =>
      current.map((group, itemIndex) =>
        itemIndex === groupIndex
          ? {
              ...group,
              options: group.options.filter((_, nestedIndex) => nestedIndex !== optionIndex),
            }
          : group,
      ),
    );
  }

  function openCreateProductModal() {
    setEditingProduct(null);
    setVariants([emptyVariant(0)]);
    setOptionGroups([]);
    setProductKind("standard");
    setSelectedDays([]);
    setProductModalOpen(true);
  }

  function openEditProductModal(product: Product) {
    setEditingProduct(product);
    const productVariants = configuration.variants
      .filter((variant) => variant.productId === product.id)
      .map((variant) => ({
        name: variant.name,
        description: variant.description,
        priceDelta: variant.priceDelta,
        sortOrder: variant.sortOrder,
        isActive: variant.isActive,
      }));
    const productGroups = configuration.optionGroups
      .filter((group) => group.productId === product.id)
      .map((group) => ({
        name: group.name,
        description: group.description,
        minChoices: group.minChoices,
        maxChoices: group.maxChoices,
        isRequired: group.isRequired,
        sortOrder: group.sortOrder,
        isActive: group.isActive,
        options: group.options.map((option) => ({
          name: option.name,
          description: option.description,
          priceDelta: option.priceDelta,
          inventoryItemId: option.inventoryItemId ?? "",
          inventoryQuantity: option.inventoryQuantity ?? 1,
          inventoryWasteFactor: option.inventoryWasteFactor ?? 0,
          sortOrder: option.sortOrder,
          isActive: option.isActive,
        })),
      }));

    setVariants(productVariants.length ? productVariants : [emptyVariant(0)]);
    setOptionGroups(productGroups);
    setProductKind(product.productKind ?? "standard");
    setSelectedDays(product.availableDays ?? []);
    setProductModalOpen(true);
  }

  function closeProductModal() {
    setProductModalOpen(false);
    setEditingProduct(null);
    setSelectedDays([]);
    setProductKind("standard");
  }

  function toggleDay(day: number) {
    setSelectedDays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((left, right) => left - right)));
  }

  function applyPreset(preset: "simple" | "combo" | "promotion" | "lunch") {
    if (preset === "simple") {
      setProductKind("standard");
      setVariants([emptyVariant(0)]);
      setOptionGroups([]);
      setSelectedDays([]);
      return;
    }

    if (preset === "promotion") {
      setProductKind("promotion");
      setVariants([emptyVariant(0)]);
      setSelectedDays([]);
      setOptionGroups([
        {
          ...emptyOptionGroup(0),
          name: "Extras de promo",
          description: "Opcionales que aumentan el precio de la promocion.",
          maxChoices: 3,
          options: [
            { ...emptyOption(0), name: "Papas grandes", priceDelta: 5 },
            { ...emptyOption(1), name: "Refresco grande", priceDelta: 4 },
          ],
        },
      ]);
      return;
    }

    if (preset === "lunch") {
      setProductKind("lunch");
      setVariants([emptyVariant(0)]);
      setOptionGroups([
        {
          ...emptyOptionGroup(0),
          name: "Bebida",
          description: "Bebida incluida u opcional para el almuerzo.",
          minChoices: 1,
          maxChoices: 1,
          isRequired: true,
          options: [
            { ...emptyOption(0), name: "Refresco del dia" },
            { ...emptyOption(1), name: "Agua" },
            { ...emptyOption(2), name: "Jugo natural", priceDelta: 3 },
          ],
        },
      ]);
      return;
    }

    setProductKind("standard");
    setVariants([
      { name: "Simple", description: "Porcion clasica", priceDelta: 0, sortOrder: 0, isActive: true },
      { name: "Doble", description: "Mas grande", priceDelta: 10, sortOrder: 1, isActive: true },
      { name: "Triple", description: "Version completa", priceDelta: 18, sortOrder: 2, isActive: true },
    ]);
    setOptionGroups([
      {
        ...emptyOptionGroup(0),
        name: "Salsas",
        description: "Elige la cantidad permitida de salsas.",
        minChoices: 0,
        maxChoices: 3,
        options: [
          { ...emptyOption(0), name: "BBQ" },
          { ...emptyOption(1), name: "Mayonesa" },
          { ...emptyOption(2), name: "Picante" },
          { ...emptyOption(3), name: "Ketchup" },
        ],
      },
      {
        ...emptyOptionGroup(1),
        name: "Bebida",
        description: "Elige una bebida para el combo.",
        minChoices: 1,
        maxChoices: 1,
        isRequired: true,
        options: [
          { ...emptyOption(0), name: "Coca-Cola" },
          { ...emptyOption(1), name: "Sprite" },
          { ...emptyOption(2), name: "Jugo natural", priceDelta: 3 },
        ],
      },
      {
        ...emptyOptionGroup(2),
        name: "Agrandar combo",
        description: "Mejoras opcionales del combo.",
        minChoices: 0,
        maxChoices: 2,
        options: [
          { ...emptyOption(0), name: "Papas grandes", priceDelta: 5 },
          { ...emptyOption(1), name: "Refresco grande", priceDelta: 4 },
        ],
      },
    ]);
  }
}

function CategoryTile({ label, count, imageUrl, active, onClick }: { label: string; count: number; imageUrl?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className={cn(
        "min-h-20 w-[210px] shrink-0 rounded-3xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md",
        active ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--color-on-primary)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center gap-3">
        <ProductThumb imageUrl={imageUrl} name={label} small />
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{label}</p>
          <p className={cn("text-xs font-semibold", active ? "text-[var(--color-on-primary-muted)]" : "text-[var(--muted)]")}>{count} productos</p>
        </div>
      </div>
    </button>
  );
}

function ProductThumb({ imageUrl, name, small = false }: { imageUrl?: string; name: string; small?: boolean }) {
  return (
    <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--primary-light)]", small ? "h-12 w-12" : "h-24 w-24")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={name} className="h-full w-full object-cover" src={imageUrl || defaultProductImage} />
    </div>
  );
}

function PreviewBanner({ label, className, imageUrl }: { label: string; className?: string; imageUrl?: string }) {
  return (
    <div className={cn("relative flex min-h-44 items-end overflow-hidden rounded-3xl bg-[var(--primary-light)] p-3", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={label} className="absolute inset-0 h-full w-full object-cover opacity-75" src={imageUrl || defaultProductImage} />
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-image-overlay-strong)] via-[var(--color-image-overlay-medium)] to-[var(--color-image-overlay-none)]" />
      <div className="relative w-full rounded-2xl bg-[var(--color-overlay)] p-3 text-[var(--color-on-primary)]">
        <p className="text-xs font-black uppercase text-[var(--color-on-primary-muted)]">Catalogo</p>
        <p className="font-black">{label}</p>
      </div>
    </div>
  );
}

function PresetButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black text-[var(--text)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)]" onClick={onClick} type="button">
      {icon}
      {label}
    </button>
  );
}

const dayOptions = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mie" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
];

function toDateTimeLocal(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function ProductSchedulePanel({
  availableFrom,
  availableUntil,
  days,
  endTime,
  kind,
  onToggleDay,
  startTime,
}: {
  availableFrom?: string;
  availableUntil?: string;
  days: number[];
  endTime?: string;
  kind: ProductKind;
  onToggleDay: (day: number) => void;
  startTime?: string;
}) {
  const title = kind === "promotion" ? "Programacion de la promocion" : kind === "lunch" ? "Calendario de almuerzos" : "Disponibilidad opcional";
  const description =
    kind === "promotion"
      ? "Si defines fechas, dias u horas, la promo solo se vendera dentro de esa ventana."
      : kind === "lunch"
        ? "Carga almuerzos por semana o por mes y limita los dias en que apareceran."
        : "Puedes dejarlo vacio para vender este producto todos los dias.";

  return (
    <section className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--color-card-muted)] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-[var(--color-on-primary)]">
          <CalendarClock className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-black text-[var(--text)]">{title}</h3>
          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{description}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Labeled label="Desde">
          <Input defaultValue={toDateTimeLocal(availableFrom)} name="availableFrom" type="datetime-local" />
        </Labeled>
        <Labeled label="Hasta">
          <Input defaultValue={toDateTimeLocal(availableUntil)} name="availableUntil" type="datetime-local" />
        </Labeled>
        <Labeled label="Hora inicio">
          <Input defaultValue={startTime?.slice(0, 5) ?? ""} name="availableStartTime" type="time" />
        </Labeled>
        <Labeled label="Hora fin">
          <Input defaultValue={endTime?.slice(0, 5) ?? ""} name="availableEndTime" type="time" />
        </Labeled>
      </div>
      <div className="mt-4">
        <p className="text-sm font-black text-[var(--text)]">Dias activos</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {dayOptions.map((day) => {
            const active = days.includes(day.value);
            return (
              <button
                className={cn(
                  "h-10 rounded-full border px-4 text-sm font-black transition",
                  active ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--color-on-primary)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
                )}
                key={day.value}
                onClick={() => onToggleDay(day.value)}
                type="button"
              >
                {day.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs font-semibold text-[var(--muted)]">Si no eliges dias, queda disponible todos los dias dentro de las fechas configuradas.</p>
      </div>
    </section>
  );
}

function ModalShell({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--color-overlay)] p-0 backdrop-blur-sm sm:p-4">
      <div className={cn("flex h-dvh w-full flex-col overflow-hidden bg-[var(--surface)] shadow-2xl sm:my-8 sm:max-h-[92vh] sm:rounded-[1.25rem]", wide ? "sm:max-w-6xl" : "sm:max-w-3xl")}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">{eyebrow}</p>
            <h2 className="text-2xl font-black text-[var(--text)]">{title}</h2>
          </div>
          <button className="grid h-11 w-11 place-items-center rounded-full bg-[var(--color-neutral-100)] text-[var(--color-body)]" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="admin-scrollbar flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

function Labeled({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("space-y-2 text-sm font-black text-[var(--text)]", className)}>
      {label}
      {children}
    </label>
  );
}

function ModalActions({
  onCancel,
  pendingDescription,
  pendingLabel,
  pendingTitle,
}: {
  onCancel: () => void;
  pendingDescription: string;
  pendingLabel: string;
  pendingTitle: string;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
      <button className={buttonClasses("danger", "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)] hover:bg-[var(--color-danger-soft)]")} disabled={pending} onClick={onCancel} type="button">
        <X className="h-4 w-4" />
        Cancelar
      </button>
      <FormSubmitButton label="Aceptar" overlayDescription={pendingDescription} overlayTitle={pendingTitle} pendingLabel={pendingLabel} />
    </div>
  );
}
