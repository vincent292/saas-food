import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Politica de privacidad",
  description: "Politica de privacidad de yopido.shop.",
};

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Politica de privacidad" updatedAt="17 de septiembre de 2026">
      <section className="space-y-3">
        <h2>Informacion que tratamos</h2>
        <p>
          Yopido.shop permite a restaurantes y comercios gestionar catalogos, pedidos, mesas, sucursales, usuarios
          internos, clientes y conversaciones operativas. Segun el uso de la plataforma, podemos tratar datos de cuenta,
          contacto, direccion de entrega, historial de pedidos, comprobantes, mensajes de soporte y datos tecnicos de
          seguridad.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Uso de WhatsApp y Meta</h2>
        <p>
          Cuando una sucursal enlaza su numero de WhatsApp Business mediante Meta, guardamos los identificadores
          necesarios para operar la conexion y enviar o recibir mensajes relacionados con pedidos, atencion al cliente y
          gestion del restaurante. Los tokens se almacenan cifrados y se usan solo para prestar el servicio solicitado por
          la sucursal.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Finalidades</h2>
        <ul>
          <li>Procesar pedidos, cobros, mesas, entregas y reportes operativos.</li>
          <li>Permitir a restaurantes administrar usuarios, sucursales, productos y conversaciones.</li>
          <li>Enviar notificaciones transaccionales y responder consultas relacionadas con el servicio.</li>
          <li>Proteger la plataforma contra abuso, errores, accesos no autorizados y fraude.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>Conservacion y eliminacion</h2>
        <p>
          Conservamos la informacion mientras sea necesaria para operar la cuenta, cumplir obligaciones legales o resolver
          incidencias. Los responsables de cuenta pueden solicitar la eliminacion o desconexion de sus datos escribiendo a
          yopido.shop@gmail.com o usando la URL publica de eliminacion de datos.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Contacto</h2>
        <p>Para solicitudes de privacidad, eliminacion o soporte de datos: yopido.shop@gmail.com.</p>
      </section>
    </LegalPageShell>
  );
}
