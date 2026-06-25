import { BadgePercent } from "lucide-react";

export function PromoBanner() {
  return (
    <div className="rounded-[2rem] bg-[var(--primary)] p-5 text-white shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15">
          <BadgePercent className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-white/75">Promoción activa</p>
          <p className="text-lg font-bold">Combos destacados y envío gratis según monto mínimo.</p>
        </div>
      </div>
    </div>
  );
}
