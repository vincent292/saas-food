import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { InitialPasswordChangeFormClient } from "@/components/auth/InitialPasswordChangeFormClient";
import { Card } from "@/components/ui/Card";
import { authService } from "@/lib/services/auth.service";

export default async function ChangeInitialPasswordPage() {
  const profile = await authService.getCurrentProfile();

  if (!profile) {
    redirect("/admin/login?error=session");
  }

  if (!profile.mustChangePassword) {
    redirect("/admin");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-surface)] px-4">
      <Card className="w-full max-w-md">
        <div className="flex items-center justify-between gap-4">
          <BrandLogo className="h-9 w-auto max-w-[210px]" priority variant="light" />
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--primary)] text-[var(--color-on-primary)]">
            <KeyRound className="h-5 w-5" />
          </span>
        </div>
        <h1 className="mt-6 text-3xl font-black text-[var(--color-heading)]">Cambia tu contrasena</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
          Por seguridad, antes de entrar al panel debes crear una contrasena propia. Esta pantalla solo aparece en el primer ingreso.
        </p>
        <InitialPasswordChangeFormClient />
      </Card>
    </main>
  );
}
