"use client";

import { Download, Maximize2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

export function QrPaymentViewer({
  alt = "QR de pago",
  className,
  downloadFileName = "qr-pago.png",
  imageClassName,
  showDownload = true,
  subtitle,
  title = "QR de pago",
  url,
}: {
  alt?: string;
  className?: string;
  downloadFileName?: string;
  imageClassName?: string;
  showDownload?: boolean;
  subtitle?: string;
  title?: string;
  url: string;
}) {
  const normalizedUrl = url.trim();
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!normalizedUrl) {
    return null;
  }

  async function downloadQr() {
    const safeFileName = downloadFileName.trim() || "qr-pago.png";
    setDownloading(true);
    try {
      const response = await fetch(normalizedUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("download-failed");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = safeFileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      window.open(normalizedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid place-items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={alt} className={cn("h-28 w-28 rounded-2xl border border-[var(--border)] bg-white object-contain p-1", imageClassName)} src={normalizedUrl} />
      </div>
      <div className="grid gap-2">
        <Button className="min-h-10 px-3 text-xs font-black" onClick={() => setOpen(true)} type="button" variant="secondary">
          <Maximize2 className="h-4 w-4" />
          Ver grande
        </Button>
        {showDownload ? (
          <Button className="min-h-10 px-3 text-xs font-black" disabled={downloading} onClick={downloadQr} type="button" variant="secondary">
            <Download className="h-4 w-4" />
            {downloading ? "Descargando..." : "Descargar"}
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="fixed inset-0 z-[180] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
          <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-[var(--text)]">{title}</h2>
                {subtitle ? <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{subtitle}</p> : null}
              </div>
              <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-neutral-100)] text-[var(--text)]" onClick={() => setOpen(false)} type="button">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 grid place-items-center rounded-[1.25rem] bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={alt} className="max-h-[68dvh] w-full max-w-[560px] object-contain" src={normalizedUrl} />
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {showDownload ? (
                <Button disabled={downloading} onClick={downloadQr} type="button" variant="secondary">
                  <Download className="h-4 w-4" />
                  {downloading ? "Descargando..." : "Descargar"}
                </Button>
              ) : null}
              <Button onClick={() => setOpen(false)} type="button">
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
