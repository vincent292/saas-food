"use client";

import { ImagePlus } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";

const MAX_IMAGE_BYTES = 2.8 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1800;

export function CompressedImageInput({
  name,
  label,
  help,
  previewClassName,
  acceptPdf,
  required,
  className,
  inputRef,
  multiple,
  onPreviewUrlChange,
}: {
  name: string;
  label: string;
  help?: string;
  previewClassName?: string;
  acceptPdf?: boolean;
  required?: boolean;
  className?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  multiple?: boolean;
  onPreviewUrlChange?: (url: string) => void;
}) {
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const resolvedInputRef = inputRef ?? fallbackInputRef;
  const [message, setMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function handleChange(files: FileList | null | undefined) {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) {
      setMessage("");
      setPreviewUrl("");
      onPreviewUrlChange?.("");
      return;
    }

    try {
      const dataTransfer = new DataTransfer();
      let originalBytes = 0;
      let optimizedBytes = 0;
      let imageCount = 0;
      let documentCount = 0;
      let firstPreviewFile: File | null = null;

      for (const file of selectedFiles) {
        originalBytes += file.size;

        if (file.type.startsWith("image/")) {
          const compressed = await compressImage(file);
          dataTransfer.items.add(compressed);
          optimizedBytes += compressed.size;
          imageCount += 1;
          firstPreviewFile ??= compressed;
          continue;
        }

        if (acceptPdf && file.type === "application/pdf") {
          dataTransfer.items.add(file);
          optimizedBytes += file.size;
          documentCount += 1;
          continue;
        }
      }

      if (!dataTransfer.files.length) {
        setMessage("");
        setPreviewUrl("");
        onPreviewUrlChange?.("");
        return;
      }

      if (resolvedInputRef.current) {
        resolvedInputRef.current.files = dataTransfer.files;
      }

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      const nextPreviewUrl = firstPreviewFile ? URL.createObjectURL(firstPreviewFile) : "";
      setPreviewUrl(nextPreviewUrl);
      onPreviewUrlChange?.(nextPreviewUrl);
      const originalMb = originalBytes / 1024 / 1024;
      const optimizedMb = optimizedBytes / 1024 / 1024;
      const suffix = documentCount ? ` + ${documentCount} PDF` : "";
      setMessage(`${imageCount > 1 ? `${imageCount} imagenes WebP` : imageCount === 1 ? "WebP listo" : "Archivo listo"}${suffix}: ${originalMb.toFixed(1)} MB -> ${optimizedMb.toFixed(1)} MB`);
    } catch {
      setMessage("No se pudo optimizar la imagen. Intenta con imagenes menores a 3 MB.");
    }
  }

  return (
    <label className={cn("block space-y-2 text-sm font-semibold text-[var(--color-body)]", className)}>
      <span>{label}</span>
      <div className="grid gap-3 sm:grid-cols-[120px_1fr] sm:items-center">
        <div className={cn("grid aspect-[4/3] min-h-24 place-items-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] text-[var(--muted)]", previewClassName)}>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={label} className="h-full w-full object-cover" src={previewUrl} />
          ) : (
            <ImagePlus className="h-6 w-6" />
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <Input accept={acceptPdf ? "image/*,.pdf" : "image/*"} multiple={multiple} name={name} onChange={(event) => handleChange(event.currentTarget.files)} ref={resolvedInputRef} required={required} type="file" />
          <p className="text-xs font-semibold leading-5 text-[var(--muted)]">
            {help ?? (acceptPdf ? "Sube imagen o PDF. Las imagenes se convierten a WebP y se reducen hasta 1800 px." : "Sube JPG, PNG o WebP. Se convierte a WebP y se reduce hasta 1800 px para cargar mas rapido.")}
          </p>
          {message ? <span className="block text-xs font-black text-[var(--color-success-strong)]">{message}</span> : null}
        </div>
      </div>
    </label>
  );
}

async function compressImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas no disponible");
  }

  context.drawImage(bitmap, 0, 0, width, height);

  let quality = 0.86;
  let blob = await canvasToBlob(canvas, quality);

  while (blob.size > MAX_IMAGE_BYTES && quality > 0.48) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, quality);
  }

  return new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
    type: "image/webp",
    lastModified: Date.now(),
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("No se pudo crear WebP"));
        }
      },
      "image/webp",
      quality,
    );
  });
}
