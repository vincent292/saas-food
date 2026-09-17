import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
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
  <p>Si la solicitud llega desde Meta, esta URL tambien responde al callback tecnico con un codigo de confirmacion.</p>
</body>
</html>`;
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

function isValidSignedRequest(signedRequest: string) {
  const appSecret = process.env.META_APP_SECRET;
  const [encodedSignature, payload] = signedRequest.split(".");

  if (!appSecret || !encodedSignature || !payload) {
    return false;
  }

  const expected = createHmac("sha256", appSecret).update(payload).digest();
  const signature = base64UrlDecode(encodedSignature);

  return expected.length === signature.length && timingSafeEqual(expected, signature);
}

export async function GET() {
  return new NextResponse(htmlPage(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const signedRequest = formData?.get("signed_request");

  if (typeof signedRequest === "string" && signedRequest && !isValidSignedRequest(signedRequest)) {
    return NextResponse.json({ error: "Invalid signed_request" }, { status: 400 });
  }

  return NextResponse.json({
    url: deletionUrl(),
    confirmation_code: `yopido-${Date.now()}`,
  });
}
