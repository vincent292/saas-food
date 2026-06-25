import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export function Tabs({ tabs, active }: { tabs: { label: string; href?: string; icon?: ReactNode }[]; active?: string }) {
  return (
    <div className="flex gap-2 overflow-x-auto rounded-full border border-[var(--border)] bg-white p-1">
      {tabs.map((tab) => {
        const className = cn(
          "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold text-[var(--muted)]",
          (active ?? tabs[0]?.label) === tab.label && "bg-[var(--primary)] text-white",
        );

        if (tab.href) {
          return (
            <Link className={className} href={tab.href} key={tab.label}>
              {tab.icon}
              {tab.label}
            </Link>
          );
        }

        return (
          <button className={className} key={tab.label} type="button">
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
