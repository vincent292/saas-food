export default function RestaurantPublicLoading() {
  return (
    <main className="public-brand-theme min-h-screen bg-[var(--background)] text-[var(--text)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--color-card-elevated)] shadow-[var(--shadow-card)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 animate-pulse rounded-2xl bg-[var(--primary-light)]" />
            <div>
              <div className="h-4 w-36 animate-pulse rounded-full bg-[var(--primary-light)]" />
              <div className="mt-2 h-3 w-24 animate-pulse rounded-full bg-[var(--color-surface)]" />
            </div>
          </div>
          <div className="h-10 w-20 animate-pulse rounded-full bg-[var(--primary-light)]" />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-3 pb-28 pt-5 sm:px-6 lg:px-8">
        <section className="relative mb-5 overflow-hidden rounded-tl-[1.75rem] rounded-br-[2.5rem] border border-[var(--border)] bg-[var(--surface)] shadow-sm">
          <div className="min-h-[240px] animate-pulse bg-[linear-gradient(135deg,var(--primary-light),var(--color-surface))] sm:min-h-[320px]" />
          <div className="absolute bottom-5 left-5 right-5 max-w-xl">
            <div className="h-8 w-48 rounded-full bg-white/70" />
            <div className="mt-3 h-4 w-72 max-w-full rounded-full bg-white/55" />
          </div>
        </section>

        <div className="mb-4 flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="h-11 w-24 shrink-0 animate-pulse rounded-full bg-[var(--primary-light)]" key={index} />
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <article className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm sm:block sm:overflow-hidden sm:p-0" key={index}>
              <div className="h-24 animate-pulse rounded-2xl bg-[var(--primary-light)] sm:h-auto sm:aspect-[4/3] sm:rounded-none" />
              <div className="min-w-0 py-1 sm:p-4">
                <div className="h-4 w-32 animate-pulse rounded-full bg-[var(--primary-light)]" />
                <div className="mt-3 h-3 w-full animate-pulse rounded-full bg-[var(--color-surface)]" />
                <div className="mt-2 h-3 w-2/3 animate-pulse rounded-full bg-[var(--color-surface)]" />
                <div className="mt-4 h-10 w-full animate-pulse rounded-full bg-[var(--accent-soft)]" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
