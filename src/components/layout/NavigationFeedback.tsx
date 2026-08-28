"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PendingFeedback = {
  kind: "route" | "submit";
  label: string;
};

const ROUTE_FEEDBACK_TIMEOUT_MS = 9000;
const FORM_FEEDBACK_TIMEOUT_MS = 12000;

function pendingLabel(kind: PendingFeedback["kind"]) {
  return kind === "route" ? "Cargando vista" : "Procesando solicitud";
}

function targetAnchor(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest("a[href]") as HTMLAnchorElement | null;
}

function shouldHandleAnchor(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute("href")?.trim();
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
    return false;
  }
  if (anchor.dataset.navigationFeedback === "off" || anchor.closest('[data-navigation-feedback="off"]')) {
    return false;
  }
  if (anchor.target && anchor.target !== "_self") {
    return false;
  }
  if (anchor.hasAttribute("download")) {
    return false;
  }

  const nextUrl = new URL(anchor.href, window.location.href);
  if (nextUrl.origin !== window.location.origin) {
    return false;
  }

  const currentUrl = new URL(window.location.href);
  const onlyHashChanged = nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search && nextUrl.hash !== currentUrl.hash;
  return !onlyHashChanged && nextUrl.href !== currentUrl.href;
}

function shouldHandleForm(form: HTMLFormElement) {
  if (form.dataset.navigationFeedback !== "on") {
    return false;
  }
  if (form.target && form.target !== "_self") {
    return false;
  }

  return true;
}

export function NavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = useMemo(() => `${pathname}?${searchParams.toString()}`, [pathname, searchParams]);
  const [pending, setPending] = useState<PendingFeedback | null>(null);
  const pendingRef = useRef<PendingFeedback | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const clearPending = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
    document.documentElement.dataset.yopidoBusy = "false";
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    document.querySelectorAll<HTMLFormElement>("form[data-yopido-submitting='true']").forEach((form) => {
      delete form.dataset.yopidoSubmitting;
    });
  }, []);

  const showPending = useCallback((kind: PendingFeedback["kind"]) => {
    const nextPending = { kind, label: pendingLabel(kind) };
    pendingRef.current = nextPending;
    setPending(nextPending);
    document.documentElement.dataset.yopidoBusy = "true";

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(clearPending, kind === "submit" ? FORM_FEEDBACK_TIMEOUT_MS : ROUTE_FEEDBACK_TIMEOUT_MS);
  }, [clearPending]);

  useEffect(() => {
    const timeoutId = window.setTimeout(clearPending, 0);
    return () => window.clearTimeout(timeoutId);
  }, [clearPending, routeKey]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = targetAnchor(event.target);
      if (!anchor || !shouldHandleAnchor(anchor)) {
        return;
      }

      if (pendingRef.current) {
        event.preventDefault();
        return;
      }

      showPending("route");
    }

    function handleSubmit(event: Event) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !shouldHandleForm(form)) {
        return;
      }

      if (form.dataset.yopidoSubmitting === "true") {
        event.preventDefault();
        event.stopImmediatePropagation();
        showPending("submit");
        return;
      }

      form.dataset.yopidoSubmitting = "true";
      showPending("submit");
    }

    function handlePageShow() {
      clearPending();
    }

    document.addEventListener("click", handleClick);
    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener("pageshow", handlePageShow);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [clearPending, showPending]);

  if (!pending) return null;

  return (
    <div aria-busy="true" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[150]" role="status">
      <div className="h-1 overflow-hidden bg-[var(--primary-light)]">
        <div className="h-full w-2/3 animate-pulse rounded-r-full bg-[var(--accent)]" />
      </div>
      <div className="absolute left-1/2 top-[calc(0.65rem+env(safe-area-inset-top))] flex min-h-10 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--primary)] px-3 text-xs font-black text-white shadow-[0_12px_32px_rgb(8_36_65_/_0.22)] ring-1 ring-white/14">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" />
        <span className="truncate">{pending.label}</span>
      </div>
    </div>
  );
}
