import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { signInAction } from "@/app/admin/actions";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <Card className="w-full max-w-md">
        <div className="grid h-14 w-14 place-items-center rounded-3xl bg-[#1d8844] text-white">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-3xl font-black text-slate-950">Ingreso administrativo</h1>
        <p className="mt-2 text-sm text-slate-600">Usa Supabase Auth para entrar al panel.</p>
        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            No se pudo iniciar sesión. Revisa correo, contraseña y que el usuario exista en Supabase Auth.
          </div>
        ) : null}
        <form action={signInAction} className="mt-6 space-y-3">
          <Input name="email" placeholder="correo@restaurante.com" required type="email" />
          <Input name="password" placeholder="Contraseña" required type="password" />
          <Button className="w-full">Ingresar</Button>
          <Link className={buttonClasses("secondary", "w-full")} href="/">
            Volver al inicio
          </Link>
        </form>
      </Card>
    </main>
  );
}
