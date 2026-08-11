import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils/cn";

function Pulse({ className }: { className: string }) {
  return <div className={cn("animate-pulse rounded-full bg-[var(--color-neutral-100)]", className)} />;
}

export function AdminModuleLoading({
  stats = 4,
  tabs = 0,
  rows = 6,
  actions = 2,
}: {
  stats?: number;
  tabs?: number;
  rows?: number;
  actions?: number;
}) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-5" role="status">
      <Card className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <Pulse className="h-3 w-28" />
            <Pulse className="h-8 w-full max-w-sm rounded-2xl" />
            <Pulse className="h-4 w-full max-w-2xl" />
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: actions }).map((_, index) => (
              <Pulse className="h-11 w-32 rounded-2xl" key={index} />
            ))}
          </div>
        </div>
      </Card>

      {stats > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: stats }).map((_, index) => (
            <Card className="space-y-3" key={index}>
              <Pulse className="h-3 w-24" />
              <Pulse className="h-8 w-16 rounded-2xl" />
              <Pulse className="h-3 w-full max-w-40" />
            </Card>
          ))}
        </div>
      ) : null}

      {tabs > 0 ? (
        <div className="flex gap-2 overflow-hidden rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-sm">
          {Array.from({ length: tabs }).map((_, index) => (
            <Pulse className="h-11 w-28 shrink-0 rounded-2xl" key={index} />
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Pulse className="h-6 w-44 rounded-2xl" />
            <Pulse className="h-10 w-full max-w-xs rounded-2xl" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: rows }).map((_, index) => (
              <div className="grid gap-3 rounded-[var(--radius-control)] border border-[var(--border)] p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-center" key={index}>
                <div className="space-y-2">
                  <Pulse className="h-4 w-44" />
                  <Pulse className="h-3 w-full max-w-sm" />
                </div>
                <Pulse className="h-4 w-24" />
                <Pulse className="h-4 w-20" />
                <Pulse className="h-9 w-24 rounded-2xl" />
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <Pulse className="h-6 w-36 rounded-2xl" />
          <Pulse className="h-28 w-full rounded-[var(--radius-control)]" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="flex items-center gap-3" key={index}>
                <Pulse className="h-10 w-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Pulse className="h-3 w-full" />
                  <Pulse className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
