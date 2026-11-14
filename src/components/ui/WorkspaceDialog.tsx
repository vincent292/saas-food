"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Shared frame for auxiliary forms; callers retain their actions and close guards. */
export function WorkspaceDialog({ title, description, children, onClose, wide = false }: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    const viewport = window.visualViewport;
    const resize = () => {
      dialog.style.setProperty("--workspace-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      dialog.style.setProperty("--workspace-viewport-top", `${viewport?.offsetTop ?? 0}px`);
    };
    resize();
    document.body.style.overflow = "hidden";
    dialog.showModal();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      dialog.close();
      document.body.style.overflow = overflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  function requestClose() {
    // Preserve the existing blocking feedback while a child form is submitting.
    if (ref.current?.querySelector('[aria-busy="true"]')) return;
    onClose();
  }
  return (
    <dialog aria-labelledby={titleId} className={cn("workspace-dialog", wide && "workspace-dialog--wide")} onCancel={event => { event.preventDefault(); requestClose(); }} ref={ref}>
      <div className="workspace-dialog-layout">
        <header className="workspace-dialog-header">
          <div className="min-w-0"><h2 id={titleId}>{title}</h2>{description ? <p>{description}</p> : null}</div>
          <button aria-label="Cerrar diálogo" className="workspace-dialog-close" onClick={requestClose} type="button"><X aria-hidden="true" className="h-5 w-5" /></button>
        </header>
        <div className="workspace-dialog-content">{children}</div>
      </div>
    </dialog>
  );
}
