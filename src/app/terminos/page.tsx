import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Terminos del servicio",
  description: "Terminos del servicio de yopido.shop.",
};

export default function TermsPage() {
  return (
    <LegalPageShell title="Terminos del servicio" updatedAt="16 de octubre de 2026">
      <section className="space-y-3">
        <h2>Uso de la plataforma</h2>
        <p>
          Yopido.shop es una plataforma SaaS para que restaurantes y comercios gestionen pedidos, catalogos, mesas,
          sucursales, usuarios, reportes y canales de comunicacion. Cada negocio es responsable de la informacion que
          publica, los precios, la disponibilidad de productos, la atencion a sus clientes y el cumplimiento de sus
          obligaciones comerciales.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Cuentas y accesos</h2>
        <p>
          Los usuarios deben proteger sus credenciales y asignar permisos adecuados a su equipo. El dueno o responsable de
          cuenta es responsable de los usuarios creados para su negocio y de desconectar accesos que ya no correspondan.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Integraciones externas</h2>
        <p>
          Algunas funciones dependen de servicios externos como Supabase, Meta, WhatsApp Business, proveedores de mapas,
          almacenamiento y pasarelas o metodos de pago. El uso de esas funciones tambien puede estar sujeto a las
          condiciones de esos proveedores.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Contenido y operaciones</h2>
        <p>
          No se permite usar la plataforma para actividades ilegales, abusivas, fraudulentas o que infrinjan derechos de
          terceros. Podemos limitar o suspender funciones cuando sea necesario para proteger la seguridad del servicio, de
          los usuarios o de los clientes finales.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Mensajeria de WhatsApp</h2>
        <p>
          Cada restaurante debe contar con la autorizacion de sus clientes para las comunicaciones que inicia y
          respetar las solicitudes de no recibir mas mensajes. No se permite enviar spam, listas compradas o mensajes
          enganosos, ni usar el canal para productos u operaciones prohibidos por las politicas de WhatsApp y Meta.
          La autorizacion del restaurante para conectar su numero no sustituye el consentimiento de sus clientes.
        </p>
        <p>
          La integracion actual permite respuestas y notificaciones dentro de las 24 horas del ultimo mensaje del
          cliente; fuera de esa ventana bloquea el texto libre. El negocio debe ofrecer una via de atencion humana y
          atender las solicitudes de privacidad. Los cargos de Meta y la elegibilidad de cada numero dependen de Meta.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Contacto</h2>
        <p>Para consultas sobre estos terminos: yopido.shop@gmail.com.</p>
      </section>
    </LegalPageShell>
  );
}
