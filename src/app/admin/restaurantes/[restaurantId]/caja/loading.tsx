export default function CashLoading() {
  return (
    <main className="min-h-screen bg-[var(--background)] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="h-9 w-48 animate-pulse rounded-2xl bg-[var(--color-neutral-100)]" />
        <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="h-64 animate-pulse rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)]" />
          <div className="h-64 animate-pulse rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)]" />
        </section>
        <div className="flex gap-2 overflow-hidden rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="h-11 w-32 shrink-0 animate-pulse rounded-full bg-[var(--color-neutral-100)]" key={index} />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)]" />
      </div>
    </main>
  );
}
