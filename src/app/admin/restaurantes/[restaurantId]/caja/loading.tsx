export default function CashLoading() {
  return (
    <main className="min-h-screen bg-[var(--background)] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="h-9 w-48 animate-pulse rounded-2xl bg-[var(--color-neutral-100)]" />
        <section className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-[var(--color-neutral-100)]" />
              <div className="space-y-2">
                <div className="h-3 w-24 animate-pulse rounded-full bg-[var(--color-neutral-100)]" />
                <div className="h-6 w-48 animate-pulse rounded-full bg-[var(--color-neutral-100)]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
              {Array.from({ length: 4 }).map((_, index) => (
                <div className="h-12 min-w-28 animate-pulse rounded-2xl bg-[var(--color-neutral-100)]" key={index} />
              ))}
            </div>
          </div>
        </section>
        <div className="flex gap-2 overflow-hidden rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="h-11 w-32 shrink-0 animate-pulse rounded-full bg-[var(--color-neutral-100)]" key={index} />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)]" />
      </div>
    </main>
  );
}
