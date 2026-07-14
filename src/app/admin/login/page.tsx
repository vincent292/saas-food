import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { signInAction } from "@/app/admin/actions";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";

const errorMessages: Record<string, string> = {
  invalid: "Revisa correo y contraseña.",
  auth: "Correo o contraseña incorrectos.",
  session: "No se pudo validar la sesión.",
  "no-access": "Este usuario no tiene un restaurante activo asignado.",
  "superadmin-required": "Esta consola requiere usuario superadmin.",
};

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-surface)] px-4">
      <Card className="w-full max-w-md">
        <div className="flex items-center justify-between gap-4">
          <BrandLogo className="h-9 w-auto max-w-[210px]" priority variant="light" />
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--primary)] text-[var(--color-on-primary)]">
            <LockKeyhole className="h-5 w-5" />
          </span>
        </div>
        <h1 className="mt-6 text-3xl font-black text-[var(--color-heading)]">Ingreso administrativo</h1>
        <p className="mt-2 text-sm text-[var(--color-secondary-text)]">Superadmin entra a la consola general. El responsable entra directo a su restaurante activo.</p>
        {error ? (
          <div className="mt-4 rounded-2xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] p-3 text-sm font-semibold text-[var(--color-danger-strong)]">
            {errorMessages[error] ?? "No se pudo iniciar sesión. Revisa los datos y el estado del restaurante."}
          </div>
        ) : null}
        <form action={signInAction} className="mt-6 space-y-3">
          <Input name="email" placeholder="correo@restaurante.com" required type="email" />
          <PasswordInput name="password" placeholder="Contraseña" required />
          <Button className="w-full">Ingresar</Button>
          <Link className={buttonClasses("secondary", "w-full")} href="/">
            Volver al inicio
          </Link>
        </form>
      </Card>
    </main>
  );
}
