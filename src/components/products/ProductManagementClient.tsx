"use client";

import type { ReactNode } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Clock3, FileUp, Flame, Grid2X2, LayoutList, LockKeyhole, PackageCheck, Plus, Search, Sparkles, Trash2, Utensils, WandSparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { analyzeMenuImportAction, createCategoryAction, createProductAction, importMenuDraftAction, updateProductAction } from "@/app/admin/actions";
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
import { defaultProductImageFit, productImageFitStyle } from "@/lib/utils/product-image-fit";
import type { MenuImportDraft } from "@/types/menu-import.types";
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
  "owner-required": "Solo el dueno de la cuenta puede cambiar catalogo, precios y promociones.",
  "42501": "Tu usuario no tiene permiso para guardar en este restaurante.",
  "23503": "La categoria seleccionada no pertenece a este restaurante.",
  "schedule-past": "La fecha de programacion no puede ser anterior a hoy.",
  "schedule-order": "La fecha y hora de fin debe ser posterior al inicio.",
  "time-order": "Revisa las horas de disponibilidad del producto.",
  "product-create": "No se pudo crear el producto.",
  "option-group": "No se pudo guardar el grupo de opciones.",
  "option-group-update": "No se pudo actualizar el grupo de opciones.",
};

const menuImportErrorMessages: Record<string, string> = {
  invalid: "Restaurante invalido.",
  "file-required": "Selecciona una imagen o PDF del menu.",
  "unsupported-file": "Usa PDF, JPG, PNG o WEBP.",
  "file-too-large": "El archivo debe pesar hasta 10 MB.",
  "gemini-not-configured": "Falta GEMINI_API_KEY en el entorno del servidor.",
  "gemini-empty-response": "La IA no devolvio productos legibles.",
  "invalid-json": "El borrador no se pudo leer.",
  "invalid-draft": "Revisa categorias, productos y precios antes de guardar.",
  "no-products": "No pude detectar un menu con productos y precios. Mejora la foto o sube el menu en PDF.",
  "menu-import-daily-limit": "Se agotaron los intentos de importacion IA de hoy. Carga el menu manualmente o intenta manana.",
  "service-role-required": "Falta SUPABASE_SERVICE_ROLE_KEY para guardar el catalogo.",
  "menu-import-failed": "No se pudo importar el menu.",
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

const emptyImportProduct = () => ({
  name: "",
  description: "",
  price: 0,
  prepMinutes: 15,
  isFeatured: false,
});

const emptyImportCategory = () => ({
  name: "Nueva categoria",
  description: "",
  products: [emptyImportProduct()],
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
  canManageProducts,
}: {
  restaurantId: string;
  products: Product[];
  categories: Category[];
  configuration: ProductConfiguration;
  inventoryItems: InventoryItem[];
  businessType: BusinessType;
  canManageProducts: boolean;
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
  const [productImagePreviewUrl, setProductImagePreviewUrl] = useState("");
  const [imagePositionX, setImagePositionX] = useState(defaultProductImageFit.imagePositionX);
  const [imagePositionY, setImagePositionY] = useState(defaultProductImageFit.imagePositionY);
  const [imageZoom, setImageZoom] = useState(defaultProductImageFit.imageZoom);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importNotes, setImportNotes] = useState("");
  const [importDraft, setImportDraft] = useState<MenuImportDraft | null>(null);
  const [importError, setImportError] = useState("");
  const [importSummary, setImportSummary] = useState("");
  const [importIsAnalyzing, setImportIsAnalyzing] = useState(false);
  const [importIsSaving, setImportIsSaving] = useState(false);

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
  const hasSelectedCategory = Boolean(selectedCategoryName);
  const canCreateInSelectedCategory = canManageProducts && hasSelectedCategory;

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
            <button
              className={buttonClasses(canManageProducts ? "primary" : "secondary", "w-full sm:w-auto")}
              disabled={!canManageProducts}
              onClick={() => openMenuImportModal()}
              title={canManageProducts ? "Importar menu desde imagen o PDF" : "Solo el dueno puede importar menus"}
              type="button"
            >
              <FileUp className="h-4 w-4" />
              Importar menu
            </button>
            <button
              className={buttonClasses("secondary", "w-full sm:w-auto")}
              disabled={!canManageProducts}
              onClick={() => setCategoryModalOpen(true)}
              title={canManageProducts ? "Crear categoria" : "Solo el dueno puede crear categorias"}
              type="button"
            >
              <Plus className="h-4 w-4" />
              {canManageProducts ? "Nueva categoria" : "Solo lectura"}
            </button>
            <button
              className={buttonClasses(canCreateInSelectedCategory ? "primary" : "secondary", "w-full sm:w-auto")}
              disabled={!canCreateInSelectedCategory}
              onClick={() => openCreateProductModal()}
              title={!canManageProducts ? "Solo el dueno puede cambiar productos y precios" : canCreateInSelectedCategory ? `Crear en ${selectedCategoryName}` : "Selecciona una categoria primero"}
              type="button"
            >
              <Plus className="h-4 w-4" />
              {!canManageProducts
                ? "Solo el dueno"
                : canCreateInSelectedCategory
                  ? `${itemLabel[0].toUpperCase()}${itemLabel.slice(1)} en ${selectedCategoryName}`
                  : "Selecciona categoria"}
            </button>
            {canManageProducts ? (
              <button
                className={buttonClasses("secondary", "w-full sm:w-auto")}
                disabled={!canCreateInSelectedCategory}
                onClick={() => openCreateProductModal("promotion")}
                title={canCreateInSelectedCategory ? `Crear promo en ${selectedCategoryName}` : "Selecciona una categoria primero"}
                type="button"
              >
                <Flame className="h-4 w-4" />
                Nueva promo
              </button>
            ) : null}
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
      {!canManageProducts ? (
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--color-card-muted)] p-4 sm:flex-row sm:items-start">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--primary-light)] text-[var(--primary)]">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div>
            <p className="font-black text-[var(--text)]">Catalogo en modo consulta</p>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
              El dueno de la cuenta controla productos, precios, promociones, variantes y categorias. Desde esta sucursal puedes revisar el catalogo operativo sin modificarlo.
            </p>
          </div>
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
          <p className="text-sm font-semibold text-[var(--muted)]">
            {canManageProducts ? "Selecciona una categoria para crear productos ahi dentro." : "Filtra por categoria para revisar el catalogo de esta sucursal."}
          </p>
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
                !canManageProducts
                  ? "Catalogo visible para operacion. Los cambios los realiza el dueno de la cuenta."
                  : canCreateInSelectedCategory
                  ? `Creando y filtrando dentro de ${selectedCategoryName}.`
                  : "Selecciona una categoria para activar la creacion contextual."
              }
            />
          </div>
          <button
            className={buttonClasses(canCreateInSelectedCategory ? "primary" : "secondary", "w-full sm:w-auto")}
            disabled={!canCreateInSelectedCategory}
            onClick={() => openCreateProductModal()}
            title={!canManageProducts ? "Solo el dueno puede cambiar productos y precios" : canCreateInSelectedCategory ? `Crear en ${selectedCategoryName}` : "Elige una categoria"}
            type="button"
          >
            <Plus className="h-4 w-4" />
            {!canManageProducts ? "Solo lectura" : canCreateInSelectedCategory ? `Nuevo ${itemLabel}` : "Elige categoria"}
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
                  onEdit={canManageProducts ? () => openEditProductModal(product) : undefined}
                  product={product}
                  variantCount={variantCountByProduct.get(product.id) ?? 0}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProducts.map((product) => (
                <Card className="grid gap-4 p-4 md:grid-cols-[92px_1fr_auto_auto] md:items-center" key={product.id}>
                  <ProductThumb fit={product} imageUrl={product.imageUrl} name={product.name} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-[var(--text)]">{product.name}</h3>
                      <Badge className={product.isAvailable ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-neutral-100)] text-[var(--color-secondary-text)]"}>{product.isAvailable ? "Activo" : "Inactivo"}</Badge>
                      {product.isFeatured ? <Badge className="bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]">Destacado</Badge> : null}
                      <Badge className="bg-[var(--color-info-soft)] text-[var(--color-info-strong)]">
                        <Clock3 className="mr-1 h-3 w-3" />
                        {product.prepMinutes} min
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">{categoryById.get(product.categoryId)?.name ?? "Sin categoria"}</p>
                    <p className="mt-2 text-xs font-bold text-[var(--muted)]">
                      {variantCountByProduct.get(product.id) ?? 0} variantes · {optionGroupCountByProduct.get(product.id) ?? 0} grupos de opciones
                    </p>
                  </div>
                  <p className="text-lg font-black text-[var(--primary)]">{formatMoney(product.price)}</p>
                  {canManageProducts ? (
                    <button className={buttonClasses("secondary")} onClick={() => openEditProductModal(product)} type="button">
                      Editar
                    </button>
                  ) : (
                    <span className="inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--color-card-muted)] px-4 text-sm font-black text-[var(--muted)]">
                      Solo lectura
                    </span>
                  )}
                </Card>
              ))}
            </div>
          )
        ) : (
          <EmptyState
            title={products.length ? "No hay productos con esos filtros" : "Todavia no hay productos"}
            description={
              products.length
                ? "Ajusta la busqueda o cambia la categoria seleccionada."
                : canManageProducts
                  ? `Crea el primer ${itemLabel} real para publicarlo en el ${catalogTitle.toLowerCase()}.`
                  : "El dueno todavia no cargo productos para este catalogo."
            }
          />
        )}
      </section>

      {canManageProducts && categoryModalOpen ? (
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

      {canManageProducts && importModalOpen ? (
        <MenuImportModal
          draft={importDraft}
          error={importError}
          file={importFile}
          isAnalyzing={importIsAnalyzing}
          isSaving={importIsSaving}
          notes={importNotes}
          onAnalyze={analyzeMenuImport}
          onClose={() => closeMenuImportModal()}
          onDraftChange={setImportDraft}
          onFileChange={(file) => {
            setImportFile(file);
            setImportDraft(null);
            setImportSummary("");
            setImportError("");
          }}
          onNotesChange={setImportNotes}
          onSave={saveMenuImport}
          summary={importSummary}
        />
      ) : null}

      {canManageProducts && productModalOpen ? (
        <ModalShell eyebrow={editingProduct ? "Editar" : "Crear"} title="Producto" wide onClose={() => closeProductModal()}>
          <form action={editingProduct ? updateProductAction : createProductAction} className="space-y-5" key={editingProduct?.id ?? "new-product"}>
            <input name="restaurantId" type="hidden" value={restaurantId} />
            {editingProduct ? <input name="productId" type="hidden" value={editingProduct.id} /> : null}
            <input name="variantsJson" type="hidden" value={variantsJson} />
            <input name="optionGroupsJson" type="hidden" value={optionGroupsJson} />
            <input name="availableDays" type="hidden" value={selectedDays.join(",")} />
            <input name="imagePositionX" type="hidden" value={imagePositionX} />
            <input name="imagePositionY" type="hidden" value={imagePositionY} />
            <input name="imageZoom" type="hidden" value={imageZoom} />

            <div className="grid grid-cols-2 gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--color-card-muted)] p-3 sm:grid-cols-4">
              <PresetButton icon={<Sparkles className="h-4 w-4" />} label="Simple" onClick={() => applyPreset("simple")} />
              <PresetButton icon={<PackageCheck className="h-4 w-4" />} label="Combo" onClick={() => applyPreset("combo")} />
              <PresetButton icon={<Flame className="h-4 w-4" />} label="Promo" onClick={() => applyPreset("promotion")} />
              <PresetButton icon={<Utensils className="h-4 w-4" />} label="Almuerzo" onClick={() => applyPreset("lunch")} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
              <PreviewBanner className="min-h-56 xl:min-h-full" fit={{ imagePositionX, imagePositionY, imageZoom }} imageUrl={productImagePreviewUrl || editingProduct?.imageUrl} label={editingProduct?.name || "Nuevo producto"} />
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
                <Labeled label="Tiempo cocina">
                  <div className="relative">
                    <Clock3 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--primary)]" />
                    <Input className="pl-11" defaultValue={editingProduct?.prepMinutes ?? 15} min={1} max={240} name="prepMinutes" required step={1} type="number" />
                  </div>
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
                    onClearDays={() => setSelectedDays([])}
                    onToggleDay={toggleDay}
                    startTime={editingProduct?.availableStartTime}
                  />
                </div>
                <div className="sm:col-span-2">
                  <CompressedImageInput help={businessProductImageHelp(businessType)} label="Imagen" name="imageFile" onPreviewUrlChange={setProductImagePreviewUrl} />
                  <ProductImageFrameEditor
                    fit={{ imagePositionX, imagePositionY, imageZoom }}
                    imageUrl={productImagePreviewUrl || editingProduct?.imageUrl || defaultProductImage}
                    label={editingProduct?.name || "Producto"}
                    onChange={(nextFit) => {
                      setImagePositionX(nextFit.imagePositionX);
                      setImagePositionY(nextFit.imagePositionY);
                      setImageZoom(nextFit.imageZoom);
                    }}
                  />
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

  function openMenuImportModal() {
    if (!canManageProducts) {
      return;
    }

    setImportModalOpen(true);
    setImportError("");
    setImportSummary("");
  }

  function closeMenuImportModal() {
    if (importIsAnalyzing || importIsSaving) {
      return;
    }

    setImportModalOpen(false);
    setImportFile(null);
    setImportNotes("");
    setImportDraft(null);
    setImportError("");
    setImportSummary("");
  }

  async function analyzeMenuImport() {
    if (!importFile) {
      setImportError("file-required");
      return;
    }

    setImportIsAnalyzing(true);
    setImportError("");
    setImportSummary("");

    const formData = new FormData();
    formData.append("restaurantId", restaurantId);
    formData.append("menuFile", importFile);
    formData.append("menuNotes", importNotes);

    const result = await analyzeMenuImportAction(formData);
    if (result.ok) {
      setImportDraft(result.draft);
      const productCount = result.draft.categories.reduce((total, category) => total + category.products.length, 0);
      setImportSummary(`${result.draft.categories.length} categorias y ${productCount} productos detectados.`);
    } else {
      setImportError(result.error);
    }

    setImportIsAnalyzing(false);
  }

  async function saveMenuImport() {
    if (!importDraft?.categories.length) {
      setImportError("no-products");
      return;
    }

    setImportIsSaving(true);
    setImportError("");
    setImportSummary("");

    const formData = new FormData();
    formData.append("restaurantId", restaurantId);
    formData.append("draftJson", JSON.stringify(importDraft));

    const result = await importMenuDraftAction(formData);
    if (!result.ok) {
      setImportError(result.error);
      setImportIsSaving(false);
      return;
    }

    setImportSummary(
      `Guardado: ${result.categoriesCreated} categorias nuevas, ${result.categoriesUpdated} actualizadas, ${result.productsCreated} productos nuevos y ${result.productsUpdated} actualizados.`,
    );
    window.location.href = `/admin/restaurantes/${restaurantId}/productos?updated=1`;
  }

  function openCreateProductModal(preset: "simple" | "combo" | "promotion" | "lunch" = "simple") {
    if (!canManageProducts || !hasSelectedCategory) {
      return;
    }
    setEditingProduct(null);
    setProductImagePreviewUrl("");
    setImagePositionX(defaultProductImageFit.imagePositionX);
    setImagePositionY(defaultProductImageFit.imagePositionY);
    setImageZoom(defaultProductImageFit.imageZoom);
    applyPreset(preset);
    setProductModalOpen(true);
  }

  function openEditProductModal(product: Product) {
    if (!canManageProducts) {
      return;
    }
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
    setProductImagePreviewUrl("");
    setImagePositionX(product.imagePositionX ?? defaultProductImageFit.imagePositionX);
    setImagePositionY(product.imagePositionY ?? defaultProductImageFit.imagePositionY);
    setImageZoom(product.imageZoom ?? defaultProductImageFit.imageZoom);
    setProductModalOpen(true);
  }

  function closeProductModal() {
    setProductModalOpen(false);
    setEditingProduct(null);
    setSelectedDays([]);
    setProductKind("standard");
    setProductImagePreviewUrl("");
    setImagePositionX(defaultProductImageFit.imagePositionX);
    setImagePositionY(defaultProductImageFit.imagePositionY);
    setImageZoom(defaultProductImageFit.imageZoom);
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

function MenuImportModal({
  draft,
  error,
  file,
  isAnalyzing,
  isSaving,
  notes,
  onAnalyze,
  onClose,
  onDraftChange,
  onFileChange,
  onNotesChange,
  onSave,
  summary,
}: {
  draft: MenuImportDraft | null;
  error: string;
  file: File | null;
  isAnalyzing: boolean;
  isSaving: boolean;
  notes: string;
  onAnalyze: () => void;
  onClose: () => void;
  onDraftChange: (draft: MenuImportDraft | null) => void;
  onFileChange: (file: File | null) => void;
  onNotesChange: (notes: string) => void;
  onSave: () => void;
  summary: string;
}) {
  const productCount = draft?.categories.reduce((total, category) => total + category.products.length, 0) ?? 0;
  const busy = isAnalyzing || isSaving;

  function updateCategory(categoryIndex: number, patch: Partial<MenuImportDraft["categories"][number]>) {
    if (!draft) return;
    onDraftChange({
      ...draft,
      categories: draft.categories.map((category, index) => (index === categoryIndex ? { ...category, ...patch } : category)),
    });
  }

  function updateProduct(categoryIndex: number, productIndex: number, patch: Partial<MenuImportDraft["categories"][number]["products"][number]>) {
    if (!draft) return;
    onDraftChange({
      ...draft,
      categories: draft.categories.map((category, index) =>
        index === categoryIndex
          ? {
              ...category,
              products: category.products.map((product, nestedIndex) => (nestedIndex === productIndex ? { ...product, ...patch } : product)),
            }
          : category,
      ),
    });
  }

  function removeCategory(categoryIndex: number) {
    if (!draft) return;
    onDraftChange({ ...draft, categories: draft.categories.filter((_, index) => index !== categoryIndex) });
  }

  function addCategory() {
    onDraftChange({ ...(draft ?? { categories: [] }), categories: [...(draft?.categories ?? []), emptyImportCategory()] });
  }

  function addProduct(categoryIndex: number) {
    if (!draft) return;
    onDraftChange({
      ...draft,
      categories: draft.categories.map((category, index) =>
        index === categoryIndex ? { ...category, products: [...category.products, emptyImportProduct()] } : category,
      ),
    });
  }

  function removeProduct(categoryIndex: number, productIndex: number) {
    if (!draft) return;
    onDraftChange({
      ...draft,
      categories: draft.categories.map((category, index) =>
        index === categoryIndex ? { ...category, products: category.products.filter((_, nestedIndex) => nestedIndex !== productIndex) } : category,
      ),
    });
  }

  return (
    <ModalShell eyebrow="IA" title="Importar menu" wide onClose={onClose}>
      <div className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Labeled label="Archivo">
            <Input accept="application/pdf,image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} type="file" />
          </Labeled>
          <button className={buttonClasses("primary", "min-h-11")} disabled={!file || busy} onClick={onAnalyze} type="button">
            <WandSparkles className="h-4 w-4" />
            {isAnalyzing ? "Leyendo..." : "Leer menu"}
          </button>
        </div>

        <Labeled label="Aclaraciones para IA">
          <Textarea
            disabled={busy}
            maxLength={500}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Ej. Promo 2 incluye refresco y papas; precio final Bs 40."
            value={notes}
          />
          <span className="block text-xs font-semibold text-[var(--muted)]">{notes.length}/500 caracteres</span>
        </Labeled>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--color-card-muted)] p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Archivo</p>
            <p className="mt-1 truncate text-sm font-black text-[var(--text)]">{file?.name ?? "Sin archivo"}</p>
          </div>
          <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Categorias</p>
            <p className="mt-1 text-2xl font-black text-[var(--text)]">{draft?.categories.length ?? 0}</p>
          </div>
          <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Productos</p>
            <p className="mt-1 text-2xl font-black text-[var(--text)]">{productCount}</p>
          </div>
        </div>

        {error ? (
          <div className="rounded-[var(--radius-card)] bg-[var(--color-danger-soft)] p-3 text-sm font-bold text-[var(--color-danger-strong)]">
            {menuImportErrorMessages[error] ?? `No se pudo importar. Detalle: ${error}.`}
          </div>
        ) : null}
        {busy ? <AiImportProgress mode={isSaving ? "saving" : "analyzing"} /> : null}
        {summary ? <div className="rounded-[var(--radius-card)] bg-[var(--color-success-soft)] p-3 text-sm font-bold text-[var(--color-success-strong)]">{summary}</div> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
          <div>
            <p className="font-black text-[var(--text)]">Borrador editable</p>
            <p className="text-sm font-semibold text-[var(--muted)]">Revisa nombres, precios y tiempos antes de guardar.</p>
          </div>
          <button className={buttonClasses("secondary")} disabled={busy} onClick={addCategory} type="button">
            <Plus className="h-4 w-4" />
            Categoria
          </button>
        </div>

        {draft?.categories.length ? (
          <div className="space-y-4">
            {draft.categories.map((category, categoryIndex) => (
              <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4" key={`${category.name}-${categoryIndex}`}>
                <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                  <Labeled label="Categoria">
                    <Input disabled={busy} onChange={(event) => updateCategory(categoryIndex, { name: event.target.value })} value={category.name} />
                  </Labeled>
                  <Labeled label="Descripcion">
                    <Input disabled={busy} onChange={(event) => updateCategory(categoryIndex, { description: event.target.value })} value={category.description} />
                  </Labeled>
                  <button className={buttonClasses("danger", "min-h-11")} disabled={busy} onClick={() => removeCategory(categoryIndex)} type="button">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="hidden gap-2 px-3 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--muted)] xl:grid xl:grid-cols-[minmax(180px,1.2fr)_minmax(180px,1fr)_120px_120px_120px_auto]">
                    <span>Producto</span>
                    <span>Descripcion</span>
                    <span>Precio Bs</span>
                    <span>Cocina min</span>
                    <span>Destacado</span>
                    <span />
                  </div>
                  {category.products.map((product, productIndex) => (
                    <div className="grid gap-2 rounded-[var(--radius-control)] bg-[var(--color-card-muted)] p-3 xl:grid-cols-[minmax(180px,1.2fr)_minmax(180px,1fr)_120px_120px_120px_auto]" key={`${product.name}-${productIndex}`}>
                      <MiniImportField label="Producto">
                        <Input disabled={busy} onChange={(event) => updateProduct(categoryIndex, productIndex, { name: event.target.value })} placeholder="Producto" value={product.name} />
                      </MiniImportField>
                      <MiniImportField label="Descripcion">
                        <Input disabled={busy} onChange={(event) => updateProduct(categoryIndex, productIndex, { description: event.target.value })} placeholder="Descripcion" value={product.description} />
                      </MiniImportField>
                      <MiniImportField label="Precio Bs">
                        <div className="relative">
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-[var(--muted)]">Bs</span>
                          <Input className="pr-10" disabled={busy} min={0} onChange={(event) => updateProduct(categoryIndex, productIndex, { price: Number(event.target.value || 0) })} step="0.01" type="number" value={Number.isFinite(product.price) ? product.price : ""} />
                        </div>
                      </MiniImportField>
                      <MiniImportField label="Cocina">
                        <div className="relative">
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-[var(--muted)]">min</span>
                          <Input className="pr-12" disabled={busy} max={240} min={1} onChange={(event) => updateProduct(categoryIndex, productIndex, { prepMinutes: Number(event.target.value || 15) })} step={1} type="number" value={Number.isFinite(product.prepMinutes) ? product.prepMinutes : ""} />
                        </div>
                      </MiniImportField>
                      <label className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black text-[var(--text)]">
                        <input checked={product.isFeatured} disabled={busy} onChange={(event) => updateProduct(categoryIndex, productIndex, { isFeatured: event.target.checked })} type="checkbox" />
                        Destacado
                      </label>
                      <button className={buttonClasses("ghost", "min-h-11 self-end px-3")} disabled={busy} onClick={() => removeProduct(categoryIndex, productIndex)} type="button">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-[var(--primary)]">{formatMoney(category.products.reduce((total, product) => total + product.price, 0))} en esta seccion</p>
                  <button className={buttonClasses("secondary")} disabled={busy} onClick={() => addProduct(categoryIndex)} type="button">
                    <Plus className="h-4 w-4" />
                    Producto
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Sin borrador" description="Sube una imagen o PDF para generar productos editables." />
        )}

        <div className="grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
          <button className={buttonClasses("danger", "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)] hover:bg-[var(--color-danger-soft)]")} disabled={busy} onClick={onClose} type="button">
            <X className="h-4 w-4" />
            Cancelar
          </button>
          <button className={buttonClasses("primary")} disabled={!draft?.categories.length || busy} onClick={onSave} type="button">
            <PackageCheck className="h-4 w-4" />
            {isSaving ? "Guardando..." : "Guardar productos"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function MiniImportField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--muted)] xl:text-transparent">
      {label}
      {children}
    </label>
  );
}

function AiImportProgress({ mode }: { mode: "analyzing" | "saving" }) {
  const copy =
    mode === "saving"
      ? {
          eyebrow: "Guardando con IA",
          title: "Creando productos y categorias",
          body: "Estamos aplicando el borrador revisado al catalogo.",
        }
      : {
          eyebrow: "Importando con IA",
          title: "Leyendo imagen o PDF",
          body: "Gemini esta detectando secciones, precios y tiempos de cocina.",
        };

  return (
    <div aria-live="polite" className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--primary-light)] bg-[var(--primary-light)] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[var(--surface)] text-[var(--primary)] shadow-sm">
          <WandSparkles className="h-7 w-7 animate-pulse" />
          <Sparkles className="absolute -right-1 -top-1 h-4 w-4 animate-bounce text-[var(--primary)]" />
          <Sparkles className="absolute -bottom-1 left-1 h-3 w-3 animate-pulse text-[var(--primary-dark)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">{copy.eyebrow}</p>
          <p className="mt-1 text-lg font-black text-[var(--text)]">{copy.title}</p>
          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{copy.body}</p>
        </div>
        <div className="flex h-8 items-center gap-1 self-start sm:self-center" aria-hidden="true">
          <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--primary)]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--primary)] [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--primary)] [animation-delay:240ms]" />
        </div>
      </div>
    </div>
  );
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

function ProductThumb({ fit, imageUrl, name, small = false }: { fit?: { imagePositionX?: number; imagePositionY?: number; imageZoom?: number }; imageUrl?: string; name: string; small?: boolean }) {
  return (
    <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--primary-light)]", small ? "h-12 w-12" : "h-24 w-24")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={name} className="h-full w-full object-cover" src={imageUrl || defaultProductImage} style={productImageFitStyle(fit)} />
    </div>
  );
}

function ProductImageFrameEditor({
  fit,
  imageUrl,
  label,
  onChange,
}: {
  fit: { imagePositionX: number; imagePositionY: number; imageZoom: number };
  imageUrl: string;
  label: string;
  onChange: (fit: { imagePositionX: number; imagePositionY: number; imageZoom: number }) => void;
}) {
  return (
    <div className="mt-3 grid gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--color-card-muted)] p-3 lg:grid-cols-[minmax(0,1fr)_220px]">
      <div className="grid gap-3 sm:grid-cols-2">
        <FramePreview aspectClassName="aspect-[4/3]" imageUrl={imageUrl} label={label} title="Tarjeta" fit={fit} />
        <FramePreview aspectClassName="aspect-[16/10]" imageUrl={imageUrl} label={label} title="Detalle movil" fit={fit} />
      </div>
      <div className="grid content-center gap-3">
        <RangeField
          label="Horizontal"
          max={100}
          min={0}
          onChange={(value) => onChange({ ...fit, imagePositionX: value })}
          value={fit.imagePositionX}
        />
        <RangeField
          label="Vertical"
          max={100}
          min={0}
          onChange={(value) => onChange({ ...fit, imagePositionY: value })}
          value={fit.imagePositionY}
        />
        <RangeField
          label="Zoom"
          max={2}
          min={1}
          onChange={(value) => onChange({ ...fit, imageZoom: value })}
          step={0.05}
          value={fit.imageZoom}
        />
      </div>
    </div>
  );
}

function FramePreview({ aspectClassName, fit, imageUrl, label, title }: { aspectClassName: string; fit: { imagePositionX: number; imagePositionY: number; imageZoom: number }; imageUrl: string; label: string; title: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">{title}</p>
      <div className={cn("overflow-hidden rounded-2xl bg-[var(--primary-light)]", aspectClassName)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={label} className="h-full w-full object-cover" src={imageUrl} style={productImageFitStyle(fit)} />
      </div>
    </div>
  );
}

function RangeField({ label, max, min, onChange, step = 1, value }: { label: string; max: number; min: number; onChange: (value: number) => void; step?: number; value: number }) {
  return (
    <label className="grid gap-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">
      <span className="flex items-center justify-between gap-2">
        {label}
        <span className="text-[var(--text)]">{step < 1 ? value.toFixed(2) : Math.round(value)}</span>
      </span>
      <input
        className="accent-[var(--primary)]"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

function PreviewBanner({ label, className, fit, imageUrl }: { label: string; className?: string; fit: { imagePositionX: number; imagePositionY: number; imageZoom: number }; imageUrl?: string }) {
  return (
    <div className={cn("relative flex min-h-44 items-end overflow-hidden rounded-3xl bg-[var(--primary-light)] p-3", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={label} className="absolute inset-0 h-full w-full object-cover opacity-75" src={imageUrl || defaultProductImage} style={productImageFitStyle(fit)} />
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

const timeOptions = Array.from({ length: 24 * 12 }, (_, index) => {
  const totalMinutes = index * 5;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
});

function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localTimeValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toDateTimeLocal(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function splitDateTimeLocal(value?: string) {
  const normalized = toDateTimeLocal(value);
  const [date = "", time = ""] = normalized.split("T");
  return { date, time: time.slice(0, 5) };
}

function normalizeTimeValue(value?: string) {
  const normalized = value?.slice(0, 5) ?? "";
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : "";
}

function isTimeBefore(time: string, minTime: string) {
  return Boolean(minTime && time < minTime);
}

function isTimeAfter(time: string, maxTime: string) {
  return Boolean(maxTime && time <= maxTime);
}

function isOvernightTimeRange(startTime: string, endTime: string) {
  return Boolean(startTime && endTime && endTime < startTime);
}

function firstSelectableTime(minTime = "") {
  return timeOptions.find((time) => !isTimeBefore(time, minTime)) ?? "";
}

function firstSelectableScheduleTime(minTime = "", requireTimeAfter = "") {
  return timeOptions.find((time) => !isTimeBefore(time, minTime) && !isTimeAfter(time, requireTimeAfter)) ?? "";
}

function dateFromLocalValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return new Date();
  }
  return new Date(year, month - 1, day);
}

function localValueFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function formatScheduleDate(value: string) {
  if (!value) return "Elegir fecha";
  return new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "short", year: "numeric" }).format(dateFromLocalValue(value));
}

function calendarDaysForMonth(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  return [
    ...Array.from({ length: firstWeekday }, () => ""),
    ...Array.from({ length: daysInMonth }, (_, index) => localValueFromDate(new Date(monthDate.getFullYear(), monthDate.getMonth(), index + 1))),
  ];
}

function ProductSchedulePanel({
  availableFrom,
  availableUntil,
  days,
  endTime,
  kind,
  onClearDays,
  onToggleDay,
  startTime,
}: {
  availableFrom?: string;
  availableUntil?: string;
  days: number[];
  endTime?: string;
  kind: ProductKind;
  onClearDays: () => void;
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
  const initialFrom = splitDateTimeLocal(availableFrom);
  const initialUntil = splitDateTimeLocal(availableUntil);
  const [fromDate, setFromDate] = useState(initialFrom.date);
  const [fromTime, setFromTime] = useState(initialFrom.time);
  const [untilDate, setUntilDate] = useState(initialUntil.date);
  const [untilTime, setUntilTime] = useState(initialUntil.time);
  const [dailyStartTime, setDailyStartTime] = useState(normalizeTimeValue(startTime));
  const [dailyEndTime, setDailyEndTime] = useState(normalizeTimeValue(endTime));
  const todayDate = localDateValue();
  const nowTime = localTimeValue();
  const minFromTime = fromDate === todayDate ? nowTime : "";
  const minUntilTime = untilDate === todayDate ? nowTime : untilDate && fromDate && untilDate === fromDate ? fromTime : "";
  const availableFromValue = fromDate && fromTime ? `${fromDate}T${fromTime}` : "";
  const availableUntilValue = untilDate && untilTime ? `${untilDate}T${untilTime}` : "";

  function handleFromDateChange(value: string) {
    setFromDate(value);
    if (!value) {
      setFromTime("");
      return;
    }

    const minTime = value === todayDate ? nowTime : "";
    const nextFromTime = fromTime && !isTimeBefore(fromTime, minTime) ? fromTime : firstSelectableTime(minTime);
    const nextUntilDate = untilDate && untilDate < value ? value : untilDate;
    setFromTime(nextFromTime);
    setUntilDate(nextUntilDate);
    if (nextUntilDate === value && nextFromTime && untilTime && isTimeAfter(untilTime, nextFromTime)) {
      setUntilTime(firstSelectableScheduleTime("", nextFromTime));
    }
  }

  function handleFromTimeChange(value: string) {
    setFromTime(value);
    if (untilDate && fromDate && untilDate === fromDate && value && untilTime && isTimeAfter(untilTime, value)) {
      setUntilTime("");
    }
  }

  function handleUntilDateChange(value: string) {
    setUntilDate(value);
    if (!value) {
      setUntilTime("");
      return;
    }

    const minTime = value === todayDate ? nowTime : "";
    const requiredAfter = value && fromDate && value === fromDate ? fromTime : "";
    setUntilTime((current) => (current && !isTimeBefore(current, minTime) && !isTimeAfter(current, requiredAfter) ? current : firstSelectableScheduleTime(minTime, requiredAfter)));
  }

  function handleDailyStartTimeChange(value: string) {
    setDailyStartTime(value);
  }

  return (
    <section className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--color-card-muted)] p-4">
      <input name="availableFrom" type="hidden" value={availableFromValue} />
      <input name="availableUntil" type="hidden" value={availableUntilValue} />
      <input name="availableStartTime" type="hidden" value={dailyStartTime} />
      <input name="availableEndTime" type="hidden" value={dailyEndTime} />
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-[var(--color-on-primary)]">
          <CalendarClock className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-black text-[var(--text)]">{title}</h3>
          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{description}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ScheduleDateTimeField
          dateValue={fromDate}
          label="Desde"
          minDate={todayDate}
          minTime={minFromTime}
          onDateChange={handleFromDateChange}
          onTimeChange={handleFromTimeChange}
          timeValue={fromTime}
        />
        <ScheduleDateTimeField
          dateValue={untilDate}
          label="Hasta"
          minDate={fromDate || todayDate}
          minTime={minUntilTime}
          onDateChange={handleUntilDateChange}
          onTimeChange={setUntilTime}
          requireTimeAfter={untilDate && fromDate && untilDate === fromDate ? fromTime : ""}
          timeValue={untilTime}
        />
        <ScheduleTimeSelect label="Hora inicio diaria (24h)" onChange={handleDailyStartTimeChange} value={dailyStartTime} />
        <ScheduleTimeSelect label="Hora fin diaria (24h)" onChange={setDailyEndTime} value={dailyEndTime} />
      </div>
      {isOvernightTimeRange(dailyStartTime, dailyEndTime) ? (
        <div className="mt-4 rounded-2xl border border-[var(--color-warning-border)] bg-[var(--color-warning-soft)] p-3 text-sm font-bold text-[var(--color-warning-strong)]">
          Esta disponibilidad cruza medianoche: termina al dia siguiente.
        </div>
      ) : null}
      <div className="mt-4">
        <p className="text-sm font-black text-[var(--text)]">Dias activos</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            className={cn(
              "h-10 rounded-full border px-4 text-sm font-black transition",
              days.length === 0 ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--color-on-primary)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
            )}
            onClick={onClearDays}
            type="button"
          >
            Todos
          </button>
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

function ScheduleDateTimeField({
  dateValue,
  label,
  minDate,
  minTime = "",
  onDateChange,
  onTimeChange,
  requireTimeAfter = "",
  timeValue,
}: {
  dateValue: string;
  label: string;
  minDate: string;
  minTime?: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  requireTimeAfter?: string;
  timeValue: string;
}) {
  return (
    <div className="space-y-2 text-sm font-black text-[var(--text)]">
      <div className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="rounded-full bg-[var(--surface)] px-2 py-1 text-[10px] font-black text-[var(--muted)]">24h</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
        <ScheduleCalendarDropdown label={label} minDate={minDate} onChange={onDateChange} value={dateValue} />
        <Select aria-label={`${label} hora en formato 24 horas`} disabled={!dateValue} onChange={(event) => onTimeChange(event.target.value)} value={timeValue}>
          <option value="">Hora</option>
          {timeOptions.map((time) => (
            <option disabled={isTimeBefore(time, minTime) || isTimeAfter(time, requireTimeAfter)} key={time} value={time}>
              {time}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

function ScheduleCalendarDropdown({
  label,
  minDate,
  onChange,
  value,
}: {
  label: string;
  minDate: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => dateFromLocalValue(value || minDate || localDateValue()));
  const minMonthKey = minDate.slice(0, 7);
  const rawVisibleMonthKey = localValueFromDate(visibleMonth).slice(0, 7);
  const renderedMonth = rawVisibleMonthKey < minMonthKey ? dateFromLocalValue(minDate) : visibleMonth;
  const monthLabel = new Intl.DateTimeFormat("es-BO", { month: "long", year: "numeric" }).format(renderedMonth);
  const days = calendarDaysForMonth(renderedMonth);
  const visibleMonthKey = localValueFromDate(renderedMonth).slice(0, 7);
  const previousDisabled = visibleMonthKey <= minMonthKey;

  function chooseDate(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
  }

  function clearDate() {
    onChange("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--color-input)] px-4 text-left text-sm text-[var(--text)] outline-none transition hover:border-[var(--primary-light)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:ring-4 focus:ring-[var(--primary-light)]",
          !value && "text-[var(--color-placeholder)]",
        )}
        aria-label={`${label} fecha`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="min-w-0 truncate">{formatScheduleDate(value)}</span>
        <CalendarClock className="h-4 w-4 shrink-0 text-[var(--primary)]" />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[70] rounded-[1.1rem] border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--text)] shadow-2xl sm:right-auto sm:w-[320px]">
          <div className="flex items-center justify-between gap-2">
            <button className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-neutral-100)] text-[var(--primary)] disabled:text-[var(--color-disabled)]" disabled={previousDisabled} onClick={() => setVisibleMonth(addMonths(renderedMonth, -1))} type="button" aria-label="Mes anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-black capitalize">{monthLabel}</p>
            <button className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-neutral-100)] text-[var(--primary)]" onClick={() => setVisibleMonth(addMonths(renderedMonth, 1))} type="button" aria-label="Mes siguiente">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase text-[var(--muted)]">
            {["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              const disabled = !day || day < minDate;
              const active = day === value;
              return day ? (
                <button
                  className={cn(
                    "grid h-9 place-items-center rounded-full text-sm font-black transition",
                    active ? "bg-[var(--primary)] text-[var(--color-on-primary)]" : "bg-[var(--color-surface)] text-[var(--text)] hover:bg-[var(--primary-light)]",
                    disabled && "cursor-not-allowed bg-transparent text-[var(--color-disabled)] hover:bg-transparent",
                  )}
                  disabled={disabled}
                  key={day}
                  onClick={() => chooseDate(day)}
                  type="button"
                >
                  {Number(day.slice(-2))}
                </button>
              ) : (
                <span key={`blank-${index}`} />
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button className={buttonClasses("ghost", "min-h-9 px-3 text-xs")} onClick={clearDate} type="button">
              Limpiar
            </button>
            <button className={buttonClasses("secondary", "min-h-9 px-3 text-xs")} onClick={() => setOpen(false)} type="button">
              Listo
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScheduleTimeSelect({
  label,
  onChange,
  requireTimeAfter = "",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  requireTimeAfter?: string;
  value: string;
}) {
  return (
    <div className="space-y-2 text-sm font-black text-[var(--text)]">
      <div className="flex items-center justify-between gap-3">
        <span>{label}</span>
        {requireTimeAfter ? <span className="rounded-full bg-[var(--surface)] px-2 py-1 text-[10px] font-black text-[var(--muted)]">Despues de {requireTimeAfter}</span> : null}
      </div>
      <Select aria-label={label} onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">Sin limite</option>
        {timeOptions.map((time) => (
          <option disabled={isTimeAfter(time, requireTimeAfter)} key={time} value={time}>
            {time}
          </option>
        ))}
      </Select>
    </div>
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
