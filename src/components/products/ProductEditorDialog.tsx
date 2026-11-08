"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import { cn } from "@/lib/utils/cn";

export function ProductEditorDialog({ action, children, editing, onClose }: {
  action: (data: FormData) => void | Promise<void>;
  children: ReactNode;
  editing: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();

    // Keep the actions above the on-screen keyboard on mobile browsers.
    const viewport = window.visualViewport;
    const updateViewport = () => {
      dialog.style.setProperty("--product-editor-height", `${viewport?.height ?? window.innerHeight}px`);
      dialog.style.setProperty("--product-editor-top", `${viewport?.offsetTop ?? 0}px`);
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      document.body.style.overflow = previousOverflow;
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog
      aria-labelledby={titleId}
      className="fixed inset-x-0 top-[var(--product-editor-top,0px)] m-0 h-[var(--product-editor-height,100dvh)] max-h-none w-full max-w-none overflow-hidden border-0 bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-[var(--color-overlay)] backdrop:backdrop-blur-sm sm:inset-0 sm:m-auto sm:h-[min(900px,calc(var(--product-editor-height,100dvh)_-_2rem))] sm:w-[calc(100%_-_2rem)] sm:max-w-6xl sm:rounded-3xl"
      onCancel={(event) => {
        event.preventDefault();
        // The close button is disabled while the form is saving.
        dialogRef.current?.querySelector<HTMLButtonElement>("[data-product-editor-close]")?.click();
      }}
      ref={dialogRef}
    >
      <form
        action={action}
        className="flex h-full min-h-0 flex-col [&_input]:min-w-0 [&_select]:min-w-0 [&_textarea]:min-w-0"
        onInvalidCapture={(event) => {
          const input = event.target as HTMLInputElement;
          let section = input.closest("details");
          while (section) {
            section.open = true;
            section = section.parentElement?.closest("details") ?? null;
          }
          if (input === event.currentTarget.querySelector("input:invalid, select:invalid, textarea:invalid")) {
            requestAnimationFrame(() => {
              input.focus();
              input.scrollIntoView({ block: "center" });
            });
          }
        }}
      >
        <ProductEditorFrame editing={editing} onClose={onClose} titleId={titleId}>
          {children}
        </ProductEditorFrame>
      </form>
    </dialog>
  );
}

function ProductEditorFrame({ children, editing, onClose, titleId }: {
  children: ReactNode;
  editing: boolean;
  onClose: () => void;
  titleId: string;
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <h2 className="text-xl font-black sm:text-2xl" id={titleId}>{editing ? "Editar producto" : "Crear producto"}</h2>
          <p className="mt-1 hidden text-sm text-[var(--muted)] sm:block">Completa los datos principales y personaliza lo que necesites.</p>
        </div>
        <button aria-label="Cerrar editor de producto" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-neutral-100)] disabled:opacity-50" data-product-editor-close disabled={pending} onClick={onClose} type="button">
          <X className="h-5 w-5" />
        </button>
      </header>
      <div aria-busy={pending} className="admin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [scroll-padding-block:1rem] sm:p-6">
        <fieldset className="min-w-0 space-y-4" disabled={pending}>{children}</fieldset>
      </div>
      <footer className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)] gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:justify-end sm:px-6 sm:py-4">
        <Button disabled={pending} onClick={onClose} type="button" variant="secondary">Cancelar</Button>
        <FormSubmitButton
          className="min-w-0 sm:min-w-48"
          label={editing ? "Guardar cambios" : "Crear producto"}
          overlayDescription={editing ? "Estamos actualizando el producto y sus opciones." : "Estamos creando el producto dentro de la categoría seleccionada."}
          overlayTitle={editing ? "Actualizando producto" : "Creando producto"}
          pendingLabel={editing ? "Actualizando..." : "Creando..."}
        />
      </footer>
    </>
  );
}

export function ProductEditorSection({ children, className, description, open = false, title }: {
  children: ReactNode;
  className?: string;
  description: string;
  open?: boolean;
  title: string;
}) {
  return (
    <details className={cn("group min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)]", className)} open={open}>
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-black">{title}</span>
          <span className="mt-1 block text-xs leading-relaxed text-[var(--muted)]">{description}</span>
        </span>
        <ChevronDown className="h-5 w-5 shrink-0 text-[var(--muted)] transition group-open:rotate-180" />
      </summary>
      <div className="min-w-0 space-y-4 border-t border-[var(--border)] p-4">{children}</div>
    </details>
  );
}
