# Multi-local: integración Android y web

## Implementado

- Inicio Android: locales destacados antes del acceso compacto a QR/código. Un código resuelve su restaurante en el servidor.
- El acceso a continuar un grupo expira a los 30 minutos sin uso. El polling no renueva esa actividad. No borra ni cancela pedidos.
- Android distingue `qr_uploaded` (en revisión) de `paid_qr` (aprobado). El host puede aprobar o devolver a pendiente, sin excluir automáticamente a la persona.
- Seguimiento multi-local nativo con mapa, recojos numerados, destino, búsqueda animada, contraoferta con vencimiento del servidor, precio editable antes de asignación, detalles y total. Se conserva el pedido en Mi Yopido.
- Web y Android comparten el endpoint `/api/multisite-orders/:id/dispatch`. Cambiar precio invalida la oferta anterior. Un despacho existente bloquea cambios.
- Los candidatos son anónimos y aproximados; solo se devuelve la señal de ubicación del rider asignado. Android oculta señales de más de dos minutos.
- Segunda integración: tarjeta grupal verde, endpoints autenticados de rutas/recojos/GPS/cierre para riders, confirmación ordenada por códigos y presentación del código de entrega al cliente únicamente cuando todos los recojos se completan.
- El panel web de caja muestra el código de cada recojo; un pedido hijo no se ofrece como delivery independiente. La capacidad del rider se bloquea en base de datos tanto para rutas como para pedidos simples, compartiendo el bloqueo ya existente.

## Verificación

- TypeScript en ambos proyectos, build Next.js y export Android.
- Rider: TypeScript, lint y 9 pruebas unitarias. 45 pruebas E2E con APIs simuladas, en 320/360/412/450 px y escritorio: entregas simples existentes, oferta multi-local, límites de contraoferta, espera de decisión del cliente, códigos incorrectos, recojos ordenados y entrega final. Export Android a `/tmp/yopido-riders-multisite-export`; no equivale a APK instalado.
- Pruebas PostgreSQL aisladas (PGlite) de la migración 0116: token incorrecto, límites, decimales, ofertas vencidas, contraoferta exacta, invalidación de oferta anterior y bloqueo después de asignar.
- Pruebas del planificador/colas y disponibilidad; pruebas Android de expiración, enlaces y presentación del seguimiento.
- Teléfono conectado: 320, 360 y 450 dp; búsqueda y contraoferta. Se verificó aceptar una contraoferta en 320 dp y editar el precio por pantalla en 360 dp. La barra de navegación ya no tapa controles de seguimiento.
- Estas pruebas visuales usan exclusivamente `yopiod-mobile/tests/fixtures/multisite-api.mjs`. No crean órdenes ni notifican restaurantes/riders. No equivalen a una prueba de entrega real.

## Pendiente antes de liberar

1. Las migraciones `0116_multisite_customer_fee.sql` y `0117_multisite_delivery_lifecycle.sql` se aplicaron el 8 de octubre de 2026 al proyecto vinculado `pqtsiajwijcehiuwiupd`, que coincide con la URL Supabase del backend. Verificados el historial, ambas funciones, siete triggers y la prohibición de SELECT del código final para authenticated. Falta desplegar el backend: `/api/mobile/riders/multisite-orders` en `https://www.yopido.shop` aún devuelve 404. El endpoint anterior de ofertas sí devuelve 401 sin sesión. Android usa ese dominio por defecto, no el servidor local.
2. La integración rider se implementó en `Desktop/carpeta sin título 2/riders-mobile`, la copia de septiembre con ofertas en tiempo real, conservando cambios previos de mapas/configuración. Ofertas con aceptar/rechazar/contraoferta, ruta asignada, recojos por código, mapa del siguiente destino y cierre por código del cliente. Falta instalar/probar esa app en un teléfono y una ruta real tras actualizar el backend. El teléfono conectado solo tiene `shop.yopido.app` (cliente), no la app rider. No hay ETA de llegada por tráfico.
3. La señal multi-local prioriza el GPS del despacho; usa `rider_availability` como respaldo. El rider envía GPS al endpoint del despacho con la app abierta. El seguimiento multi-local en segundo plano queda pendiente: no se reutiliza el task de pedidos simples con IDs de pedidos maestros. No se inventa ubicación si falta señal.
4. El grupo se envía consolidado. Pagos pendientes/en revisión siguen bloqueando el envío; el host puede resolverlos o excluir explícitamente una parte antes de finalizar. **No hay envío automático por tandas ni se descuenta una tarifa ya aceptada si alguien cambia su pago.** Eso requiere una nueva lógica transaccional de envíos parciales, no solo UI.
5. La suite general también falla en cinco comprobaciones de otras áreas (membresía, facturación, disponibilidad de catálogo, ETA/WhatsApp y mensajes de estado). No ignorarlas para autorizar un release general.

El mapa Android reutiliza el componente existente con Leaflet/OpenStreetMap. Esta entrega no cambia el proveedor a Google Maps ni dibuja una ruta vial/ETA ficticia.

La migración 0117 se prueba con PostgreSQL aislado: orden de recojos, entrega prematura, códigos inválidos y bloqueo tras cinco intentos, autorización, membresía, ruta cancelada, idempotencia, bloqueo de doble despacho y ausencia de cambios de pagos al confirmar entrega. Si se bloquea un código o se cancela una parte después de asignar, la ruta necesita revisión operativa; no se modifica unilateralmente la tarifa ni se salta esa parada.

El código final y el contador de intentos del despacho no tienen permiso SELECT para `authenticated`/`anon`: el rider no puede obtenerlo consultando directamente PostgREST. Los campos no secretos conservan SELECT por columna y RLS. El backend con service role lo presenta al cliente por su token de seguimiento cuando corresponde. La app rider no muestra ni recibe los códigos correctos; debe introducirlos.
