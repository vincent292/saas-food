"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/Input";

const MAX_IMAGE_BYTES = 2.8 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1800;

export function CompressedImageInput({
  name,
  label,
}: {
  name: string;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");

  async function handleChange(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) {
      setMessage("");
      return;
    }

    try {
      const compressed = await compressImage(file);
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(compressed);

      if (inputRef.current) {
        inputRef.current.files = dataTransfer.files;
      }

      const originalMb = file.size / 1024 / 1024;
      const compressedMb = compressed.size / 1024 / 1024;
      setMessage(`Optimizada a WebP: ${originalMb.toFixed(1)} MB -> ${compressedMb.toFixed(1)} MB`);
    } catch {
      setMessage("No se pudo optimizar la imagen. Intenta con una imagen menor a 3 MB.");
    }
  }

  return (
    <label className="space-y-2 text-sm font-semibold text-slate-700">
      {label}
      <Input accept="image/*" name={name} onChange={(event) => handleChange(event.currentTarget.files?.[0])} ref={inputRef} type="file" />
      {message ? <span className="block text-xs font-semibold text-[var(--muted)]">{message}</span> : null}
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
