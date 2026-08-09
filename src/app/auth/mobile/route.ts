const mobileCallbackScheme = "yopido://auth/callback";

export async function GET() {
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Volviendo a Yopido</title>
  </head>
  <body style="font-family:system-ui,sans-serif;padding:32px;text-align:center">
    <p>Volviendo a Yopido...</p>
    <a id="continue" href="${mobileCallbackScheme}">Abrir la app</a>
    <script>
      const target = ${JSON.stringify(mobileCallbackScheme)} + window.location.search + window.location.hash;
      document.getElementById("continue").href = target;
      window.location.replace(target);
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
    },
  });
}
