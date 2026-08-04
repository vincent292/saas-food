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
  if (form.dataset.navigationFeedback === "off") {
    return false;
  }
  if (form.target && form.target !== "_self") {
    return false;
  }

  return form.dataset.navigationFeedback === "on" || Boolean(form.getAttribute("action"));
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
    const frameId = window.requestAnimationFrame(clearPending);
    return () => window.cancelAnimationFrame(frameId);
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
    <div aria-busy="true" aria-live="polite" className="fixed inset-0 z-[150] cursor-wait bg-[rgb(8_36_65_/_0.24)] backdrop-blur-[1px]" role="status">
      <div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-[var(--primary-light)]">
        <div className="h-full w-full animate-pulse bg-[var(--accent)]" />
      </div>
      <div className="absolute left-1/2 top-[calc(0.9rem+env(safe-area-inset-top))] flex min-h-12 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-full bg-[var(--primary)] px-4 text-sm font-black text-white shadow-[0_18px_48px_rgb(8_36_65_/_0.28)] ring-1 ring-white/14">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" />
        <span className="truncate">{pending.label}</span>
      </div>
    </div>
  );
}
