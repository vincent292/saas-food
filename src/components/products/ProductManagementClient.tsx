"use client";

import type { ReactNode } from "react";
import { Grid2X2, LayoutList, Plus, Save, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createCategoryAction, createProductAction, updateProductAction } from "@/app/admin/actions";
import { ProductCard } from "@/components/products/ProductCard";
import { ProductStats } from "@/components/products/ProductStats";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import type { Category, Product, ProductConfiguration } from "@/types/product.types";

type ProductStatus = "all" | "active" | "inactive";
type ViewMode = "grid" | "list";
type DraftVariant = { name: string; description: string; priceDelta: number; sortOrder: number; isActive: boolean };
type DraftOption = { name: string; description: string; priceDelta: number; sortOrder: number; isActive: boolean };
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
  created,
  categoryCreated,
  updated,
  error,
}: {
  restaurantId: string;
  products: Product[];
  categories: Category[];
  configuration: ProductConfiguration;
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

  return (
    <div className="space-y-4">
      <section className="rounded-[1.5rem] border border-[var(--border)] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Catalogo operativo</p>
            <h2 className="mt-1 text-3xl font-black text-[var(--text)]">Productos</h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">Categorias, productos, variantes y opciones del menu en una sola superficie.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={buttonClasses("secondary")} onClick={() => setCategoryModalOpen(true)} type="button">
              <Plus className="h-4 w-4" />
              Nueva categoria
            </button>
            <button
              className={buttonClasses(canCreateInSelectedCategory ? "primary" : "secondary")}
              disabled={!canCreateInSelectedCategory}
              onClick={() => openCreateProductModal()}
              title={canCreateInSelectedCategory ? `Crear en ${selectedCategoryName}` : "Selecciona una categoria primero"}
              type="button"
            >
              <Plus className="h-4 w-4" />
              {canCreateInSelectedCategory ? `Producto en ${selectedCategoryName}` : "Selecciona categoria"}
            </button>
          </div>
        </div>
        <div className="mt-5">
          <ProductStats categories={categories} products={products} />
        </div>
      </section>

      {created ? <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">Producto creado correctamente.</div> : null}
      {updated ? <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">Producto actualizado correctamente.</div> : null}
      {categoryCreated ? <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">Categoria creada correctamente.</div> : null}
      {error ? <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">No se pudo guardar: {error}.</div> : null}

      <Card className="sticky top-[88px] z-10 grid gap-3 bg-white/95 p-3 backdrop-blur lg:grid-cols-[1fr_260px_220px_auto] lg:items-center">
        <label className="relative block">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <Input className="rounded-2xl pl-11" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto, categoria o descripcion" value={query} />
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
        <div className="flex justify-self-start rounded-full bg-[var(--primary-light)] p-1 lg:justify-self-end">
          <button className={cn("inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-black text-[var(--primary-dark)]", viewMode === "grid" && "bg-white shadow-sm")} onClick={() => setViewMode("grid")} type="button">
            <Grid2X2 className="h-4 w-4" />
            Mosaico
          </button>
          <button className={cn("inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-black text-[var(--primary-dark)]", viewMode === "list" && "bg-white shadow-sm")} onClick={() => setViewMode("list")} type="button">
            <LayoutList className="h-4 w-4" />
            Lista
          </button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Categorias</p>
            <h3 className="text-xl font-black text-[var(--text)]">Secciones del menu</h3>
          </div>
          <p className="text-sm font-semibold text-[var(--muted)]">Selecciona una categoria para crear productos ahi dentro.</p>
        </div>
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
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

      <section className="space-y-4 rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
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
          <button className={buttonClasses(canCreateInSelectedCategory ? "primary" : "secondary")} disabled={!canCreateInSelectedCategory} onClick={() => openCreateProductModal()} type="button">
            <Plus className="h-4 w-4" />
            {canCreateInSelectedCategory ? "Nuevo producto" : "Elige categoria"}
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
                      <Badge className={product.isAvailable ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}>{product.isAvailable ? "Activo" : "Inactivo"}</Badge>
                      {product.isFeatured ? <Badge className="bg-amber-50 text-amber-700">Destacado</Badge> : null}
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
          <EmptyState title={products.length ? "No hay productos con esos filtros" : "Todavia no tienes productos"} description={products.length ? "Ajusta la busqueda o cambia la categoria seleccionada." : "Crea el primer producto real para publicarlo en el menu."} />
        )}
      </section>

      {categoryModalOpen ? (
        <ModalShell eyebrow="Crear" title="Categoria" onClose={() => setCategoryModalOpen(false)}>
          <form action={createCategoryAction} className="space-y-4">
            <input name="restaurantId" type="hidden" value={restaurantId} />
            <input name="returnTo" type="hidden" value="products" />
            <PreviewBanner label="Nueva categoria" />
            <Labeled label="Nombre">
              <Input name="name" required />
            </Labeled>
            <Labeled label="Descripcion">
              <Textarea name="description" />
            </Labeled>
            <Labeled label="Imagen">
              <Input accept="image/*" name="imageFile" type="file" />
            </Labeled>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr] sm:items-end">
              <Labeled label="Orden">
                <Input defaultValue={categories.length + 1} min={0} name="sortOrder" type="number" />
              </Labeled>
              <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 text-sm font-black text-[var(--text)]">
                <input defaultChecked name="isActive" type="checkbox" />
                Activa
              </label>
            </div>
            <ModalActions onCancel={() => setCategoryModalOpen(false)} />
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
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <PreviewBanner className="min-h-80 lg:min-h-full" imageUrl={editingProduct?.imageUrl} label={editingProduct?.name || "Nuevo producto"} />
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
                <Labeled label="Orden">
                  <Input defaultValue={editingProduct?.sortOrder ?? products.length + 1} min={0} name="sortOrder" type="number" />
                </Labeled>
                <Labeled className="sm:col-span-2" label="Imagen">
                  <Input accept="image/*" name="imageFile" type="file" />
                </Labeled>
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
                    <div className="grid gap-3 md:grid-cols-[1fr_160px_120px_auto] md:items-end">
                      <Labeled label="Nombre">
                        <Input onChange={(event) => updateVariant(index, { name: event.target.value })} placeholder="Ej. Con papas" value={variant.name} />
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
                  <p className="mt-1 text-sm text-[var(--muted)]">Usa grupos para salsa, acompanamientos, tamanos, agregados o combos.</p>
                </div>
                <Button onClick={() => setOptionGroups((current) => [...current, emptyOptionGroup(current.length)])} type="button">
                  <Plus className="h-4 w-4" />
                  Agregar grupo
                </Button>
              </div>
              <div className="mt-3 space-y-3">
                {optionGroups.length ? (
                  optionGroups.map((group, groupIndex) => (
                    <div className="rounded-3xl border border-[var(--border)] bg-white p-4" key={groupIndex}>
                      <div className="grid gap-3 md:grid-cols-[1fr_120px_120px_auto] md:items-end">
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
                      <div className="mt-3 space-y-2">
                        {group.options.map((option, optionIndex) => (
                          <div className="grid gap-2 rounded-2xl bg-slate-50 p-3 md:grid-cols-[1fr_140px_120px_auto]" key={optionIndex}>
                            <Input onChange={(event) => updateOption(groupIndex, optionIndex, { name: event.target.value })} placeholder="Ej. Aparte / Banada / Papas" value={option.name} />
                            <Input onChange={(event) => updateOption(groupIndex, optionIndex, { priceDelta: Number(event.target.value) })} step="0.01" type="number" value={option.priceDelta} />
                            <Input onChange={(event) => updateOption(groupIndex, optionIndex, { sortOrder: Number(event.target.value) })} type="number" value={option.sortOrder} />
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
                  <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-[var(--muted)]">Sin grupos de opciones.</p>
                )}
              </div>
            </div>

            <ModalActions onCancel={() => closeProductModal()} />
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
          sortOrder: option.sortOrder,
          isActive: option.isActive,
        })),
      }));

    setVariants(productVariants.length ? productVariants : [emptyVariant(0)]);
    setOptionGroups(productGroups);
    setProductModalOpen(true);
  }

  function closeProductModal() {
    setProductModalOpen(false);
    setEditingProduct(null);
  }
}

function CategoryTile({ label, count, imageUrl, active, onClick }: { label: string; count: number; imageUrl?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className={cn(
        "min-h-20 w-[210px] shrink-0 rounded-3xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md",
        active ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)] bg-white text-[var(--text)]",
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center gap-3">
        <ProductThumb imageUrl={imageUrl} name={label} small />
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{label}</p>
          <p className={cn("text-xs font-semibold", active ? "text-white/75" : "text-[var(--muted)]")}>{count} productos</p>
        </div>
      </div>
    </button>
  );
}

function ProductThumb({ imageUrl, name, small = false }: { imageUrl?: string; name: string; small?: boolean }) {
  return (
    <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--primary-light)]", small ? "h-12 w-12" : "h-24 w-24")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={name} className="h-full w-full object-cover" src={imageUrl || "/imagendefault.jpeg"} />
    </div>
  );
}

function PreviewBanner({ label, className, imageUrl }: { label: string; className?: string; imageUrl?: string }) {
  return (
    <div className={cn("relative flex min-h-44 items-end overflow-hidden rounded-3xl bg-[var(--primary-light)] p-3", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={label} className="absolute inset-0 h-full w-full object-cover opacity-75" src={imageUrl || "/imagendefault.jpeg"} />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent" />
      <div className="relative w-full rounded-2xl bg-slate-950/75 p-3 text-white">
        <p className="text-xs font-black uppercase text-white/60">Catalogo</p>
        <p className="font-black">{label}</p>
      </div>
    </div>
  );
}

function ModalShell({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className={cn("my-8 max-h-[92vh] w-full overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl", wide ? "max-w-4xl" : "max-w-3xl")}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">{eyebrow}</p>
            <h2 className="text-2xl font-black text-[var(--text)]">{title}</h2>
          </div>
          <button className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-700" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
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

function ModalActions({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
      <button className={buttonClasses("danger", "bg-red-50 text-red-700 hover:bg-red-100")} onClick={onCancel} type="button">
        <X className="h-4 w-4" />
        Cancelar
      </button>
      <Button type="submit">
        <Save className="h-4 w-4" />
        Aceptar
      </Button>
    </div>
  );
}
