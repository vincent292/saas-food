"use client";

import { Download, Edit3, Plus, Save, Trash2, X } from "lucide-react";
import QRCode from "qrcode";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createTableAction, deleteTableAction, updateTableAction } from "@/app/admin/actions";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import type { RestaurantTable } from "@/types/order.types";
import type { Restaurant } from "@/types/restaurant.types";

type TableStatusMessage = {
  created?: string;
  updated?: string;
  deleted?: string;
  error?: string;
};

function tableUrl(origin: string, restaurantSlug: string, tableCode: string) {
  const baseUrl = origin || "";
  return `${baseUrl}/r/${restaurantSlug}/mesa/${encodeURIComponent(tableCode)}`;
}

function subscribeToOrigin() {
  return () => undefined;
}

function getBrowserOrigin() {
  return window.location.origin;
}

function getServerOrigin() {
  return "";
}

export function TableManagementClient({
  restaurant,
  tables,
  status,
}: {
  restaurant: Restaurant;
  tables: RestaurantTable[];
  status: TableStatusMessage;
}) {
  const origin = useSyncExternalStore(subscribeToOrigin, getBrowserOrigin, getServerOrigin);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);

  const activeTables = useMemo(() => tables.filter((table) => table.isActive), [tables]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Mesas</p>
          <h1 className="text-3xl font-black text-[var(--text)]">QR por mesa</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">Cada mesa tiene una URL pública única para que los clientes hagan pedidos desde su celular.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setCreateOpen(true)} type="button">
          <Plus className="h-4 w-4" />
          Nueva mesa
        </Button>
      </section>

      <StatusBanners status={status} />

      {activeTables.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {activeTables.map((table) => {
            const url = tableUrl(origin, restaurant.slug, table.code);
            return (
              <article className="rounded-[1.25rem] border border-[var(--border)] bg-white p-4 shadow-sm" key={table.id}>
                <div className="grid gap-4 sm:grid-cols-[132px_1fr]">
                  <div className="overflow-hidden rounded-2xl bg-[var(--primary-light)] p-2">
                    <QrPreview label={`QR para ${table.name}`} url={url} />
                  </div>
                  <div className="min-w-0">
                    <div className="rounded-full bg-[var(--primary-light)] px-3 py-1 text-xs font-black text-[var(--primary-dark)]">Activa</div>
                    <h2 className="mt-2 truncate text-xl font-black text-[var(--text)]">{table.name}</h2>
                    <p className="text-sm font-semibold text-[var(--muted)]">{table.code}</p>
                    <a className="mt-2 line-clamp-3 block break-all text-sm font-semibold text-[var(--primary-dark)] underline" href={url} rel="noreferrer" target="_blank">
                      {url || `/r/${restaurant.slug}/mesa/${table.code}`}
                    </a>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-[0.55fr_1fr] gap-2">
                  <button className={buttonClasses("primary", "min-h-11 px-3")} onClick={() => downloadQr(url, table.code)} type="button">
                    <Download className="h-4 w-4" />
                    QR
                  </button>
                  <Button className="min-h-11" onClick={() => setEditingTable(table)} type="button">
                    <Edit3 className="h-4 w-4" />
                    Editar
                  </Button>
                </div>

                <form action={deleteTableAction} className="mt-2">
                  <input name="restaurantId" type="hidden" value={restaurant.id} />
                  <input name="tableId" type="hidden" value={table.id} />
                  <Button className="w-full bg-red-100 text-red-800 hover:bg-red-200 focus-visible:outline-red-300" type="submit" variant="ghost">
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </Button>
                </form>
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyState title="Todavía no hay mesas" description="Crea la primera mesa y se generará su QR automáticamente." />
      )}

      {createOpen ? (
        <TableModal eyebrow="Crear" title="Nueva mesa" onClose={() => setCreateOpen(false)}>
          <TableForm action={createTableAction} restaurantId={restaurant.id} onCancel={() => setCreateOpen(false)} />
        </TableModal>
      ) : null}

      {editingTable ? (
        <TableModal eyebrow="Editar" title={editingTable.name} onClose={() => setEditingTable(null)}>
          <TableForm action={updateTableAction} restaurantId={restaurant.id} table={editingTable} onCancel={() => setEditingTable(null)} />
        </TableModal>
      ) : null}
    </div>
  );
}

function StatusBanners({ status }: { status: TableStatusMessage }) {
  return (
    <div className="space-y-2">
      {status.created ? <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Mesa creada.</div> : null}
      {status.updated ? <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Mesa actualizada.</div> : null}
      {status.deleted ? <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Mesa eliminada del listado activo.</div> : null}
      {status.error ? <div className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">No se pudo guardar la mesa.</div> : null}
    </div>
  );
}

function TableModal({
  eyebrow,
  title,
  children,
  onClose,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <Card className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[1.5rem] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">{eyebrow}</p>
            <h2 className="text-2xl font-black text-[var(--text)]">{title}</h2>
          </div>
          <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-[var(--text)] hover:bg-slate-200" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </Card>
    </div>
  );
}

function TableForm({
  restaurantId,
  table,
  action,
  onCancel,
}: {
  restaurantId: string;
  table?: RestaurantTable;
  action: (formData: FormData) => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <form action={action} className="space-y-4">
      <input name="restaurantId" type="hidden" value={restaurantId} />
      {table ? <input name="tableId" type="hidden" value={table.id} /> : null}
      <label className="block text-sm font-black text-[var(--text)]">
        Nombre
        <Input className="mt-2" defaultValue={table?.name} name="name" placeholder="Mesa 01" required />
      </label>
      <label className="block text-sm font-black text-[var(--text)]">
        Código
        <Input className="mt-2 uppercase" defaultValue={table?.code} name="code" placeholder="MESA-01" required />
      </label>
      <label className="block text-sm font-black text-[var(--text)]">
        Capacidad
        <Input className="mt-2" defaultValue={table?.capacity ?? 4} min={1} name="capacity" type="number" />
      </label>
      <label className={cn("flex items-center justify-between rounded-2xl border border-[var(--border)] p-4 text-sm font-black text-[var(--text)]", !table && "hidden")}>
        Activa
        <input defaultChecked={table?.isActive ?? true} name="isActive" type="checkbox" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <button className={buttonClasses("secondary", "min-h-12")} type="button" onClick={onCancel}>
          <X className="h-4 w-4" />
          Cancelar
        </button>
        <Button className="min-h-12" type="submit">
          <Save className="h-4 w-4" />
          Aceptar
        </Button>
      </div>
    </form>
  );
}

async function downloadQr(url: string, tableCode: string) {
  try {
    const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 720 });
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `qr-${tableCode.toLowerCase()}.png`;
    anchor.click();
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function QrPreview({ label, url }: { label: string; url: string }) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let isMounted = true;
    QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 280 })
      .then((nextDataUrl) => {
        if (isMounted) {
          setDataUrl(nextDataUrl);
        }
      })
      .catch(() => {
        if (isMounted) {
          setDataUrl("");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [url]);

  if (!dataUrl) {
    return <div className="grid aspect-square w-full place-items-center rounded-xl bg-white text-xs font-black text-[var(--muted)]">QR</div>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={label} className="aspect-square w-full rounded-xl bg-white object-contain" src={dataUrl} />
  );
}
