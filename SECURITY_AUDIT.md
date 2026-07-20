# Security Audit

Fecha: 2026-07-20  
Alcance: Next.js App Router, React, TypeScript, Supabase Auth/DB/Storage, Server Actions, Route Handlers, migraciones SQL y configuracion de produccion.

## Modelo De Amenazas

Activos sensibles:
- Credenciales Supabase: `SUPABASE_SERVICE_ROLE_KEY`, password DB, publishable key, cookies de sesion.
- Datos multi-tenant: restaurantes, membresias, perfiles, pedidos, facturas, caja, inventario, tickets, incidentes, auditoria.
- Datos personales: nombre, telefono, direccion, ubicacion, NIT/CI, comprobantes QR, datos de delivery.
- Integridad financiera: precios, totales, estado de pago, movimientos de caja, sesiones de caja, facturacion.
- Assets y documentos: logos/productos publicos, comprobantes de pago, adjuntos de soporte.

Niveles de confianza:
- Navegador anonimo: menu publico, checkout, seguimiento, delivery token.
- Navegador autenticado: usuarios admin/caja/cocina/mesero/superadmin.
- Server Actions/Route Handlers: trusted server, pero reciben entrada manipulable desde DevTools.
- Supabase anon/authenticated: sujeto a RLS.
- Supabase service role: privilegio total, debe ser minimizado.
- Storage actual Supabase: bucket publico compartido.

Roles:
- `anon`: cliente publico.
- `authenticated`: cualquier usuario autenticado Supabase.
- `waiter`, `kitchen`, `cashier`, `restaurant_admin`: roles por restaurante.
- `superadmin`: rol global.

Puntos de entrada:
- Publico: `/`, `/{restaurantSlug}`, `/r/{restaurantSlug}`, checkout, mesa QR, seguimiento, delivery token.
- Admin: `/admin/**`, Server Actions en `src/app/admin/actions.ts`.
- Route Handler: `src/app/r/[restaurantSlug]/pedido/[orderId]/status/route.ts`.
- RPC: funciones `security definer` en `supabase/migrations/**`.
- Storage: `restaurant-assets`.
- Persistencia navegador: carritos en `localStorage`, tema publico, cookies Supabase.

Rutas de ataque principales:
- Manipular `FormData` en Server Actions para cambiar IDs, tenant, mesa, estado, precio o rol.
- Abusar de `service_role` desde rutas publicas si falta validacion de propiedad.
- Leer o sobrescribir objetos de Storage entre tenants.
- Filtrar datos personales por bucket publico, query string o payloads excesivos.
- Explotar race conditions en pedidos/caja/inventario por acciones no idempotentes.
- Fuerza bruta sobre login, seguimiento de pedido o delivery token.

## Vulnerabilidades Confirmadas

### 1. Bucket unico publico con politicas de escritura demasiado amplias

Severidad: Critica  
CWE: CWE-284 Improper Access Control, CWE-200 Exposure of Sensitive Information  
OWASP: A01 Broken Access Control, A02 Cryptographic Failures/Data Exposure  
Archivos:
- `supabase/migrations/0004_storage_restaurant_assets.sql:1`
- `supabase/migrations/0004_storage_restaurant_assets.sql:15`
- `supabase/migrations/0004_storage_restaurant_assets.sql:20`
- `supabase/migrations/0004_storage_restaurant_assets.sql:26`
- `supabase/migrations/0004_storage_restaurant_assets.sql:33`
- `src/lib/supabase/storage.ts:14`

Flujo vulnerable:
1. Un usuario autenticado cualquiera obtiene sesion.
2. Las politicas `authenticated uploads/updates/deletes restaurant assets` permiten operar sobre cualquier objeto del bucket si `bucket_id = 'restaurant-assets'`.
3. La aplicacion guarda ahi imagenes publicas y evidencias operativas como comprobantes QR, soportes y proofs.
4. El bucket es publico, por lo que `getPublicUrl` entrega URLs accesibles sin autenticacion.

Condiciones:
- Usuario autenticado en Supabase.
- Conocer o inferir rutas del bucket.

Impacto:
- Lectura publica de comprobantes/adjuntos.
- Borrado o sustitucion de assets de otro restaurante.
- Posible defacement de menu y perdida de evidencia financiera.

Evidencia no destructiva:
- SQL policy actual solo comprueba `bucket_id = 'restaurant-assets'`; no valida tenant ni rol.
- `uploadPublicImage` siempre retorna `getPublicUrl`.

Correccion recomendada:
- Migrar a Cloudflare R2 con dos clases de bucket: publico para logos/banners/productos y privado para comprobantes/soporte.
- Mientras se use Supabase, restringir `insert/update/delete` por prefijo `restaurants/{restaurantId}` y rol `restaurant_admin`.
- No generar URLs publicas para documentos privados; usar signed URLs de corta vida.

Parche concreto:
```sql
create policy "restaurant admins upload own public assets"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'restaurant-public-assets'
  and (storage.foldername(name))[1] = 'restaurants'
  and has_restaurant_role(((storage.foldername(name))[2])::uuid, array['restaurant_admin']::app_role[])
);
```

Prueba automatizada:
- Pendiente de la migracion R2: test de integracion que intente subir en `restaurants/{otroRestaurantId}` con rol no miembro y espere 403.

Riesgo residual:
- Alto hasta separar publico/privado y restringir escrituras por tenant.

### 2. Checkout publico usaba `service_role` para crear o resetear settings operativos

Severidad: Critica  
CWE: CWE-266 Incorrect Privilege Assignment, CWE-639 IDOR/BOLA  
OWASP: A01 Broken Access Control, A04 Insecure Design  
Archivos:
- `src/app/r/actions.ts:112`
- `src/app/r/actions.ts:128`
- `src/app/r/actions.ts:339`
- `src/app/r/actions.ts:361`

Flujo vulnerable:
1. Cliente anonimo envia `FormData` a `createPublicOrderAction`.
2. La action intenta leer `restaurant_settings`.
3. Si RLS no permite lectura anonima, el flujo anterior creaba settings con `service_role` y valores default.
4. Esto podia modificar configuracion real desde una accion publica.

Condiciones:
- Restaurante sin settings legibles por anon o RLS bloqueando lectura.
- Cliente publico dispara checkout.

Impacto:
- Cambio no autorizado de reglas operativas: delivery, pickup, table orders, inventario, caja, cocina, minimo y factura.
- Inconsistencia de negocio y posible aceptacion de pedidos cuando deberian estar deshabilitados.

Evidencia no destructiva:
- Version anterior de `getOrCreatePublicOrderSettings` hacia `.upsert(...)` con `createAdminClient`.
- RLS de `restaurant_settings` solo permite lectura a miembros (`supabase/migrations/0001_initial_restaurant_saas.sql:374`).

Correccion recomendada:
- No mutar settings desde flujos publicos.
- Crear RPC publica de solo lectura con columnas estrictamente necesarias, o leer con server privilege sin escribir.

Parche concreto:
- Aplicado en `src/app/r/actions.ts`: la funcion ahora es `getPublicOrderSettings`; elimina el `upsert` y solo hace `select`.

Prueba automatizada:
- `npm run security:check` debe verificar que `src/app/r/actions.ts` no contenga `upsert` dentro de `getPublicOrderSettings`.

Riesgo residual:
- Medio: la creacion de pedidos publicos aun usa `service_role`; debe migrarse a RPC transaccional.

### 3. Checkout publico aceptaba parametros tenant/mesa manipulables sin comprobacion previa de pertenencia

Severidad: Alta  
CWE: CWE-639 Authorization Bypass Through User-Controlled Key  
OWASP: A01 Broken Access Control  
Archivos:
- `src/app/r/actions.ts:22`
- `src/app/r/actions.ts:143`
- `src/app/r/actions.ts:158`
- `src/app/r/actions.ts:339`

Flujo vulnerable:
1. Cliente modifica `restaurantId`, `restaurantSlug`, `tableId` o `tableCode` desde DevTools.
2. La action calcula pedido y escribe con `service_role`.
3. Antes de la mitigacion, no habia una validacion explicita de que el ID correspondiera al slug activo ni de que la mesa perteneciera al restaurante.

Condiciones:
- Conocer UUIDs o capturarlos desde HTML/Network.
- Enviar FormData manipulado.

Impacto:
- Pedidos inconsistentes entre slug visible y tenant real.
- Asociacion de mesa ajena.
- Base para IDOR en flujos multi-tenant.

Evidencia no destructiva:
- Los IDs viajan en inputs ocultos y pueden ser modificados en DevTools.

Correccion recomendada:
- Validar server-side que restaurante activo coincide con slug.
- Validar que mesa activa pertenece al restaurante.
- A futuro, mover todo a RPC `create_public_order` con validacion atomica.

Parche concreto:
- Aplicado en `src/app/r/actions.ts` con `validatePublicRestaurant` y `validatePublicTable`.

Prueba automatizada:
- `npm run security:check` debe encontrar validadores y errores `invalid-restaurant` / `invalid-table`.

Riesgo residual:
- Medio: falta transaccion unica en DB para pedido + items.

### 4. Falta de headers defensivos en produccion

Severidad: Alta  
CWE: CWE-693 Protection Mechanism Failure  
OWASP: A05 Security Misconfiguration  
Archivo:
- `next.config.ts:5`

Flujo vulnerable:
1. El navegador carga la app sin politica anti-embedding, sin `nosniff`, sin referrer policy ni permissions policy.
2. Una vulnerabilidad futura de XSS/clickjacking tendria menor contencion.

Condiciones:
- Despliegue sin protecciones equivalentes a nivel Vercel/proxy.

Impacto:
- Clickjacking de panel administrativo.
- Mayor filtracion de URLs de seguimiento por referrer.
- Superficie mas amplia para APIs del navegador.

Evidencia no destructiva:
- Antes no existia `headers()` en `next.config.ts`.

Correccion recomendada:
- Agregar headers base y evolucionar a CSP completa con nonces.

Parche concreto:
- Aplicado en `next.config.ts`: CSP minima, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.

Prueba automatizada:
- `npm run security:check` debe verificar presencia de los headers.

Riesgo residual:
- Medio: CSP actual es minima para no romper Next inline scripts; falta `script-src` con nonce.

### 5. Datos sensibles en URLs de seguimiento

Severidad: Alta  
CWE: CWE-598 Use of GET Request Method With Sensitive Query Strings  
OWASP: A02 Sensitive Data Exposure  
Archivos:
- `src/app/r/actions.ts:501`
- `src/app/r/[restaurantSlug]/pedido/[orderId]/page.tsx:26`
- `src/app/r/[restaurantSlug]/pedido/[orderId]/status/route.ts:14`

Flujo vulnerable:
1. El pedido publico redirige a `/pedido/{orderId}?token={tracking_token}`.
2. El token puede quedar en historial, referers, screenshots, logs de proxy o soporte.
3. El status endpoint tambien recibe `token` por query string.

Condiciones:
- Usuario comparte URL, navegador con historial sincronizado, proxy/logs de request.

Impacto:
- Quien tenga URL puede consultar el pedido publico.
- Exposicion de estado, direccion, telefono y datos de pedido.

Evidencia no destructiva:
- `new URL(request.url).searchParams.get("token")`.

Correccion recomendada:
- Usar token en cookie `HttpOnly`/`SameSite=Lax` de corta vida para seguimiento, o token en fragment `#` combinado con POST/session exchange.
- Minimizar payload publico y redaccion de datos personales.

Parche concreto:
```ts
cookies().set("order_tracking", token, {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  maxAge: 60 * 60 * 24,
});
redirect(publicRestaurantPath(slug, `pedido/${order.id}`));
```

Prueba automatizada:
- Test de route handler que rechace token ausente de cookie/header cuando se migre.

Riesgo residual:
- Alto hasta cambiar el mecanismo de transporte del token.

### 6. Falta rate limiting visible en login y flujos publicos

Severidad: Alta  
CWE: CWE-307 Improper Restriction of Excessive Authentication Attempts  
OWASP: A07 Identification and Authentication Failures  
Archivos:
- `src/app/admin/actions.ts:993`
- `src/app/r/actions.ts:490`
- `src/app/delivery/actions.ts:16`
- `src/app/delivery/actions.ts:44`

Flujo vulnerable:
1. Atacante automatiza login, tracking lookup o delivery token actions.
2. No se observa rate limiting en capa app.

Condiciones:
- Endpoint publico accesible.
- Sin proteccion equivalente en WAF/Vercel/Supabase.

Impacto:
- Fuerza bruta de credenciales o enumeracion de pedidos.
- Abuso de acciones de delivery si el token se filtra.

Evidencia no destructiva:
- No hay uso de limiter por IP/user/action en las actions revisadas.

Correccion recomendada:
- Agregar rate limiting por IP + user/email + action con Upstash, Vercel KV o Supabase table.
- Respuestas genericas y delay exponencial.

Parche concreto:
```ts
await assertRateLimit({ key: `login:${ip}:${emailHash}`, limit: 5, windowSeconds: 300 });
```

Prueba automatizada:
- Unit test de helper que bloquee el intento N+1.

Riesgo residual:
- Medio si Vercel/WAF aplica limites externos; alto si no.

## Vulnerabilidades Posibles

### 7. Cookies Supabase pueden no ser HttpOnly en flujos con browser client

Severidad: Media  
CWE: CWE-1004 Sensitive Cookie Without HttpOnly Flag  
OWASP: A05 Security Misconfiguration  
Archivos:
- `src/lib/supabase/server.ts:6`
- `src/lib/supabase/client.ts:4`
- `src/lib/supabase/middleware.ts:5`

Evidencia:
- Se usa `@supabase/ssr` tanto en server como browser. La configuracion exacta de cookies depende de la libreria y entorno.

Verificacion manual:
- DevTools > Application > Cookies: revisar `HttpOnly`, `Secure`, `SameSite`, expiracion y borrado al logout.

Riesgo residual:
- Si tokens quedan accesibles a JS, un XSS futuro extrae sesion.

### 8. CSRF hardening no es explicito para Server Actions sensibles

Severidad: Media  
CWE: CWE-352 Cross-Site Request Forgery  
OWASP: A01 Broken Access Control  
Archivo:
- `src/app/admin/actions.ts`

Evidencia:
- No hay helper comun que valide `Origin`/`Host` antes de mutaciones sensibles.

Correccion recomendada:
- Implementar `assertSameOrigin()` para acciones admin y caja, compatible con despliegue Vercel.

Riesgo residual:
- Depende de protecciones internas de Next Server Actions y SameSite de cookies.

### 9. Realtime + polling duplicado aumenta exposicion operativa

Severidad: Media  
CWE: CWE-400 Uncontrolled Resource Consumption  
OWASP: A04 Insecure Design  
Archivos:
- `src/components/orders/OrdersReceptionClient.tsx:115`
- `src/components/orders/OrdersReceptionClient.tsx:137`
- `src/components/kitchen/KitchenBoardClient.tsx:62`
- `src/components/kitchen/KitchenBoardClient.tsx:84`
- `src/components/cash/CashWorkspaceClient.tsx:155`
- `src/components/cash/CashWorkspaceClient.tsx:176`

Impacto:
- Carga elevada en SSR y Supabase; posibilidad de degradacion con pocos clientes abiertos.

Correccion:
- Usar realtime principal y polling con backoff solo como fallback.

### 10. Selectores `select("*")` y payloads extensos

Severidad: Media  
CWE: CWE-200 Excessive Data Exposure  
OWASP: A01/A05  
Archivos representativos:
- `src/lib/services/restaurant.service.ts:250`
- `src/lib/services/order.service.ts:335`
- `src/lib/services/inventory.service.ts:333`
- `src/lib/services/superadmin.service.ts:378`

Impacto:
- Mayor riesgo de entregar columnas nuevas sensibles por accidente.

Correccion:
- Columnas explicitas por caso de uso.

## Vulnerabilidades Descartadas

- SQL Injection directa: no se observaron queries SQL concatenadas desde input en TypeScript; Supabase query builder y RPC parametrizadas reducen riesgo.
- XSS directo por HTML no sanitizado: no hay `dangerouslySetInnerHTML`; `printOrder.ts` usa `escapeHtml` antes de `document.write`.
- SSRF server-side: no se observaron `fetch` server-side hacia URLs controladas por usuario.
- Path traversal de filesystem: no hay lectura/escritura de archivos locales a partir de input usuario.
- Command injection: no hay ejecucion de comandos con input usuario en runtime app.
- Open redirect global: `adminReturnTo` y `acceso-bloqueado` restringen a rutas `/admin`; no se observo redirect externo directo.

## Exposicion En Navegador

- `localStorage`: `src/lib/utils/cart.ts` persiste carrito por restaurante. No contiene JWT, pero si productos, precios, imagenes, cantidades y posiblemente notas del cliente. Riesgo bajo/medio si notas contienen datos personales.
- `localStorage`: `src/components/public-theme/PublicThemeToggle.tsx` guarda preferencia de tema; no sensible.
- Query strings: tokens de seguimiento en pedido son sensibles y deben migrarse.
- Variables `NEXT_PUBLIC_*`: Supabase URL/publishable key son publicas por diseno. Google Maps key debe restringirse por dominio/API.
- Source maps: no se observo `productionBrowserSourceMaps` activado.
- Logs: existen logs locales trackeados (`.next-dev*.log`, `.next-start.log`) que deberian salir del repo.

## Inventario De Superficie HTTP

- `fetch`: `src/components/orders/OrderTrackingLiveRefresh.tsx:384`.
- Route Handler: `src/app/r/[restaurantSlug]/pedido/[orderId]/status/route.ts`.
- Public Server Actions: `src/app/r/actions.ts`, `src/app/delivery/actions.ts`.
- Admin Server Actions: `src/app/admin/actions.ts`.
- RPC anon: `get_public_order`, `get_public_order_lookup`, `get_public_order_queue_state`, `get_delivery_order`, `mark_delivery_order_arrived`, `mark_delivery_order_delivered`, `has_open_cash_session_public`.
- RPC authenticated/admin: cash, inventory, billing, access sessions, restaurant lifecycle.

## Dependencias

Resultado observado:
- `npm audit --omit=dev` reporta 2 vulnerabilidades moderadas por PostCSS via Next `16.2.9`.
- `npm audit fix --force` no debe aplicarse a ciegas porque propone cambio breaking/downgrade.

Recomendacion:
- Actualizar Next a version parcheada cuando exista fuera del rango vulnerable.
- Revisar necesidad de `es-abstract`; no se observo uso directo en `src`.

