"use client";

import { UsersRound, ArrowRight, X } from "lucide-react";
import { useState } from "react";
import { joinGroupByCodeAction } from "@/app/r/actions";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

export function GroupOrderEntry() {
  const [open, setOpen] = useState(false);
  return <>
    <button className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--accent)] px-3 text-xs font-black text-[var(--primary-dark)] shadow-[var(--shadow-glow)] transition hover:scale-[1.03] active:scale-95 sm:h-11 sm:px-4 sm:text-sm" onClick={() => setOpen(true)} type="button">
      <UsersRound className="h-4 w-4" /><span className="hidden sm:inline">Pedido grupal</span><span className="sm:hidden">Grupo</span>
    </button>
    {open ? <div className="fixed inset-0 z-[180] grid place-items-center bg-[rgb(8_36_65_/_0.72)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <section className="w-full max-w-md animate-in fade-in zoom-in-95 rounded-[1.5rem] bg-[var(--surface)] p-5 text-[var(--text)] shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4"><div><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]"><UsersRound className="h-6 w-6" /></span><h2 className="mt-4 text-2xl font-black">Yopido Grupal</h2><p className="mt-1 text-sm font-semibold text-[var(--muted)]">¿Tienes un código? Únete al pedido de tu grupo.</p></div><button aria-label="Cerrar" className="grid h-10 w-10 place-items-center rounded-full bg-[var(--color-surface)]" onClick={() => setOpen(false)} type="button"><X className="h-5 w-5" /></button></div>
        <form action={joinGroupByCodeAction} className="mt-5 grid gap-3"><input className="h-14 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] px-4 text-center font-mono text-2xl font-black uppercase tracking-[0.18em] outline-none focus:border-[var(--primary)]" maxLength={6} name="code" placeholder="K7M4QX" required /><button className={cn(buttonClasses("primary"), "min-h-12 w-full")} type="submit">Unirme con código <ArrowRight className="h-4 w-4" /></button></form>
      </section>
    </div> : null}
  </>;
}
