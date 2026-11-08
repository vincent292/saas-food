"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function TableAccountDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const focus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (focus instanceof HTMLElement && focus.isConnected) focus.focus();
    };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_1rem)] max-w-5xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-black/50">
    <div className="flex max-h-[calc(100dvh_-_2rem)] flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] p-4">
        <h2 id={titleId} className="text-xl font-black">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Cerrar cuenta de mesa" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-[var(--color-neutral-100)]"><X className="h-5 w-5" /></button>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-2 sm:p-4">{children}</div>
    </div>
  </dialog>;
}
