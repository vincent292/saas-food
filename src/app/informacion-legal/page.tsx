import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Información legal",
  description: "Información legal y datos de identificación de Yopido.",
};

export default function LegalInformationPage() {
  return (
    <LegalPageShell title="Información legal" updatedAt="18 de septiembre de 2026">
      <section className="space-y-3">
        <h2>Datos de identificación</h2>
        <dl className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <dt className="font-black text-[var(--primary)]">Nombre comercial/legal</dt>
          <dd>Yopido</dd>
          <dt className="font-black text-[var(--primary)]">NIT</dt>
          <dd>8039368352</dd>
          <dt className="font-black text-[var(--primary)]">Domicilio</dt>
          <dd>Avenida América, Cochabamba, Cochabamba 2500, Bolivia</dd>
          <dt className="font-black text-[var(--primary)]">Actividad</dt>
          <dd>Proveedor de servicios tecnológicos</dd>
        </dl>
      </section>
    </LegalPageShell>
  );
}
