import { NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/seo/site-url";

export const dynamic = "force-dynamic";

const CONTACT_EMAIL = "yopido.shop@gmail.com";

function deletionUrl() {
  return `${getSiteUrl()}/meta/data-deletion`;
}

function htmlPage() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Eliminacion de datos | yopido.shop</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:40px 20px;line-height:1.6;color:#1c1c1c}
    h1{color:#12355b}
    a{color:#12355b;font-weight:700}
  </style>
</head>
<body>
  <h1>Solicitud de eliminacion de datos</h1>
  <p>Para solicitar la eliminacion de datos asociados a yopido.shop, escribe a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> indicando el correo de tu cuenta, restaurante o sucursal relacionada.</p>
  <p>No envies contrasenas, tokens, documentos de identidad ni datos de tarjetas. Usaremos la informacion de tu solicitud solo para verificar que eres titular de los datos y atenderla.</p>
  <p>Desconectar WhatsApp detiene el bot y elimina la autorizacion guardada en Yopido; no borra el historial de pedidos o conversaciones. Puedes solicitar su eliminacion por el mismo correo. Te informaremos si algun dato debe conservarse por una obligacion legal.</p>
</body>
</html>`;
}

export async function GET() {
  return new NextResponse(htmlPage(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

export async function POST() {
  // Configure this URL as "Data deletion instructions URL" in Meta, not as
  // a callback. Never acknowledge a deletion that has not been processed.
  return NextResponse.json({
    error: "manual_deletion_only",
    instructions_url: deletionUrl(),
  }, { status: 405, headers: { Allow: "GET" } });
}
