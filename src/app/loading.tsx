export default function HomeLoading() {
  return (
    <main className="public-brand-theme min-h-screen bg-white text-[var(--color-heading)]">
      <header className="sticky top-0 z-40 border-b border-[var(--color-on-primary-border)] bg-[linear-gradient(90deg,#082441_0%,#12355B_62%,#082441_100%)] shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 animate-pulse rounded-2xl bg-white/20" />
            <div className="h-4 w-36 animate-pulse rounded-full bg-white/20" />
          </div>
          <div className="h-10 w-24 animate-pulse rounded-full bg-white/20" />
        </div>
      </header>

      <section className="bg-[linear-gradient(180deg,#082441_0%,#12355B_58%,#F8FAFC_58%,#FFFFFF_100%)] px-4 pb-6 pt-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[2rem] bg-white p-4 shadow-[0_26px_80px_rgb(8_36_65_/_0.18)] sm:p-6 lg:grid lg:grid-cols-[minmax(0,1fr)_430px] lg:gap-8 lg:p-8">
            <div>
              <div className="h-9 w-40 animate-pulse rounded-full bg-[var(--accent-soft)]" />
              <div className="mt-5 h-12 w-full max-w-xl animate-pulse rounded-2xl bg-[var(--primary-light)] sm:h-16" />
              <div className="mt-3 h-12 w-3/4 animate-pulse rounded-2xl bg-[var(--primary-light)] sm:h-16" />
              <div className="mt-5 h-5 w-full max-w-lg animate-pulse rounded-full bg-[var(--color-surface)]" />
              <div className="mt-2 h-5 w-2/3 animate-pulse rounded-full bg-[var(--color-surface)]" />
              <div className="mt-6 rounded-[1.65rem] border border-[var(--border)] bg-white p-2 shadow-[0_24px_70px_rgb(18_53_91_/_0.16)]">
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_190px_auto]">
                  <div className="h-14 animate-pulse rounded-[1.25rem] bg-[var(--color-surface)]" />
                  <div className="h-14 animate-pulse rounded-[1.25rem] bg-[var(--color-surface)]" />
                  <div className="h-14 animate-pulse rounded-[1.25rem] bg-[var(--accent-soft)]" />
                </div>
              </div>
            </div>
            <div className="mt-6 min-h-[320px] animate-pulse rounded-[1.75rem] bg-[linear-gradient(135deg,var(--primary),#0f304f)] lg:mt-0 lg:min-h-[430px]" />
          </div>

          <div className="mt-4 grid gap-3 rounded-[1.5rem] border border-[var(--border)] bg-white/95 p-3 shadow-[var(--shadow-card)] sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="flex items-center gap-3 rounded-[1.15rem] bg-white p-3 ring-1 ring-[var(--border)]" key={index}>
                <div className="h-10 w-10 animate-pulse rounded-2xl bg-[var(--primary-light)]" />
                <div className="flex-1">
                  <div className="h-3 w-24 animate-pulse rounded-full bg-[var(--primary-light)]" />
                  <div className="mt-2 h-3 w-16 animate-pulse rounded-full bg-[var(--color-surface)]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
