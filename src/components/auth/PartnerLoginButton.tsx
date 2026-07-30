import Link from "next/link";
import { Store } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type PartnerLoginButtonProps = {
  compact?: boolean;
  tone?: "onPrimary" | "surface";
};

export function PartnerLoginButton({ compact = false, tone = "surface" }: PartnerLoginButtonProps) {
  return (
    <Link
      aria-label="Entrar al panel de negocios"
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-sm font-black shadow-sm transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]",
        tone === "surface" && "border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] hover:bg-[var(--primary-light)]",
        tone === "onPrimary" && "border border-white/22 bg-white/8 text-white backdrop-blur hover:bg-white/14",
        compact && "h-10 w-10 px-0",
      )}
      href="/admin"
    >
      <Store className="h-4 w-4" />
      {compact ? null : <span>Panel</span>}
    </Link>
  );
}
