import { BadgePercent } from "lucide-react";
import { IllustrationAsset } from "@/components/ui/IllustrationAsset";

export function PromoBanner() {
  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-[var(--primary)] p-5 text-[var(--color-on-primary)] shadow-sm">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[var(--accent)]/20 blur-2xl" />
      <div className="relative flex items-center gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--color-on-primary-soft)]">
          <BadgePercent className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-on-primary-muted)]">Promoción activa</p>
          <p className="text-lg font-bold">Combos destacados y envío gratis según monto mínimo.</p>
        </div>
        <IllustrationAsset className="hidden max-w-[112px] sm:block" name="promoCoupon" sizes="112px" />
      </div>
    </div>
  );
}
