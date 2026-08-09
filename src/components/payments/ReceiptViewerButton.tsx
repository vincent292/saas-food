"use client";

import { Download, ExternalLink, Eye, X } from "lucide-react";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

function fileNameFromUrl(url: string, fallback: string) {
  try {
    const parsed = new URL(url, window.location.origin);
    return decodeURIComponent(parsed.pathname.split("/").pop() || fallback);
  } catch {
    return fallback;
  }
}

function isPdfUrl(url: string) {
  return /\.pdf(?:$|\?)/i.test(url);
}

function isImageUrl(url: string) {
  return /\.(?:png|jpe?g|webp|avif|gif)(?:$|\?)/i.test(url) || url.startsWith("data:image/");
}

export function ReceiptViewerButton({
  className,
  label = "Ver comprobante",
  receiptLabel = "Comprobante",
  subtitle,
  url,
}: {
  className?: string;
  label?: string;
  receiptLabel?: string;
  subtitle?: string;
  url?: string | null;
}) {
  const normalizedUrl = url?.trim() ?? "";
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!normalizedUrl) {
    return null;
  }

  async function downloadReceipt() {
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
      link.download = fileNameFromUrl(normalizedUrl, "comprobante");
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
    <>
      <button className={cn(buttonClasses("secondary", "min-h-9 px-3 text-xs"), className)} onClick={() => setOpen(true)} type="button">
        <Eye className="h-4 w-4" />
        {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[190] grid place-items-center bg-black/70 p-3 text-[var(--text)] backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label={receiptLabel}>
          <div className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-black">{receiptLabel}</h2>
                {subtitle ? <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{subtitle}</p> : null}
              </div>
              <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-neutral-100)] text-[var(--text)]" onClick={() => setOpen(false)} type="button">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-[1.25rem] border border-[var(--border)] bg-white">
              {isPdfUrl(normalizedUrl) ? (
                <iframe className="h-[70dvh] w-full" src={normalizedUrl} title={receiptLabel} />
              ) : isImageUrl(normalizedUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={receiptLabel} className="max-h-[70dvh] w-full object-contain p-3" src={normalizedUrl} />
              ) : (
                <iframe className="h-[70dvh] w-full" src={normalizedUrl} title={receiptLabel} />
              )}
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <a className={buttonClasses("secondary")} href={normalizedUrl} rel="noreferrer" target="_blank">
                <ExternalLink className="h-4 w-4" />
                Abrir
              </a>
              <button className={buttonClasses("secondary")} disabled={downloading} onClick={downloadReceipt} type="button">
                <Download className="h-4 w-4" />
                {downloading ? "Descargando..." : "Descargar"}
              </button>
              <button className={buttonClasses("primary")} onClick={() => setOpen(false)} type="button">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
