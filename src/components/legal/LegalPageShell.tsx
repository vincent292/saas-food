import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";

type LegalPageShellProps = {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
};

export function LegalPageShell({ title, updatedAt, children }: LegalPageShellProps) {
  return (
    <main className="min-h-screen bg-[var(--color-background)] px-4 py-8 text-[var(--color-body)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between gap-4 border-b border-[var(--color-border)] pb-5">
          <Link aria-label="Ir al inicio" className="inline-flex items-center" href="/">
            <BrandLogo className="h-10 w-auto" priority={false} variant="light" />
          </Link>
          <Link className="text-sm font-bold text-[var(--primary)] hover:underline" href="/">
            Volver
          </Link>
        </header>

        <article className="space-y-7">
          <div className="space-y-3">
            <p className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--color-secondary-text)]">
              Yopido.shop
            </p>
            <h1 className="text-3xl font-black tracking-tight text-[var(--primary)] sm:text-4xl">{title}</h1>
            <p className="text-sm font-semibold text-[var(--color-secondary-text)]">Ultima actualizacion: {updatedAt}</p>
          </div>
          <div className="space-y-6 text-base leading-7 text-[var(--color-body)] [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-[var(--primary)] [&_p]:text-[var(--color-body)] [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
            {children}
          </div>
        </article>
      </div>
    </main>
  );
}
