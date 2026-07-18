"use client";

import { Download, ExternalLink, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { supportManuals, type SupportManual } from "@/lib/support/manuals";
import { cn } from "@/lib/utils/cn";

export function SupportManualsPanel() {
  const [selectedId, setSelectedId] = useState<SupportManual["id"]>("inventario");
  const selectedManual = useMemo(() => supportManuals.find((manual) => manual.id === selectedId) ?? supportManuals[0], [selectedId]);

  return (
    <section className="space-y-4">
      <SectionTitle description="Guias internas para operar sin depender de soporte en cada paso." title="Manuales operativos" />

      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-3 lg:overflow-visible lg:pb-0">
          {supportManuals.map((manual) => (
            <button
              className={cn(
                "min-w-[230px] rounded-[1.1rem] border p-4 text-left shadow-sm transition lg:min-w-0 lg:w-full",
                selectedManual.id === manual.id
                  ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary-dark)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--color-heading)] hover:border-[var(--primary-light)]",
              )}
              key={manual.id}
              onClick={() => setSelectedId(manual.id)}
              type="button"
            >
              <span className="flex items-center gap-2 text-sm font-black">
                <FileText className="h-4 w-4 shrink-0" />
                {manual.title}
              </span>
              <span className="mt-2 block text-xs font-bold leading-5 text-[var(--color-secondary-text)]">{manual.updatedLabel}</span>
            </button>
          ))}
        </div>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-[var(--border)] p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">Lector PDF</p>
                <h3 className="mt-1 text-xl font-black text-[var(--color-heading)]">{selectedManual.title}</h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">{selectedManual.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a className={buttonClasses("secondary", "min-h-10 text-xs")} href={selectedManual.href} rel="noreferrer" target="_blank">
                  <ExternalLink className="h-4 w-4" />
                  Abrir
                </a>
                <a className={buttonClasses("primary", "min-h-10 text-xs")} download href={selectedManual.href}>
                  <Download className="h-4 w-4" />
                  Descargar
                </a>
              </div>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {selectedManual.highlights.map((highlight) => (
                <span className="shrink-0 rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-black text-[var(--color-secondary-text)]" key={highlight}>
                  {highlight}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-[var(--color-surface)] p-2 sm:p-4">
            <iframe className="h-[68vh] min-h-[430px] w-full rounded-[1rem] border border-[var(--border)] bg-white lg:h-[76vh]" src={`${selectedManual.href}#toolbar=1&navpanes=0&view=FitH`} title={selectedManual.title} />
          </div>
        </Card>
      </div>
    </section>
  );
}
