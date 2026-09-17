# WhatsApp Business por sucursal

La sucursal conecta su propio número desde **Configuración → WhatsApp Business**. Se reutilizan el webhook, menú, botones, carrito, checkout, comprobantes, pedidos y bandeja actuales. No se usa WhatsApp Web ni se fabrica un QR: la ventana oficial de Meta muestra el QR cuando el negocio/número es elegible para coexistencia.

## Antes de habilitar a clientes

- Configurar la app de Meta como proveedor tecnológico para incorporar negocios de terceros, con Facebook Login for Business y una configuración de WhatsApp Embedded Signup que admita coexistencia.
- Completar las verificaciones, revisión y acceso avanzado que Meta exija. Tener una cuenta de anuncios no garantiza elegibilidad para coexistencia ni acceso API.
- Autorizar `whatsapp_business_management` y `whatsapp_business_messaging`. Confirmar en el panel/documentación de Meta los permisos adicionales de administración comercial exigidos para tu modalidad de proveedor.
- Registrar el dominio HTTPS del SaaS en la app y en la configuración de inicio de sesión. Configurar las URLs de privacidad y eliminación de datos solicitadas por Meta.
- Seleccionar la facturación del negocio en Meta. El enlace no implica que la API sea gratuita ni que el SaaS asuma los cargos del cliente.
- Probar primero con un negocio/número autorizado de prueba; no conectar el número central del SaaS a una sucursal.

Referencias oficiales: [Embedded Signup, colección de Meta](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup), [coexistencia](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users). La página de coexistencia respondió HTTP 429 durante esta implementación: la elegibilidad y el comportamiento final del popup requieren validación con la app real de Meta.

## Variables

| Variable | Next.js | Edge Function |
| --- | --- | --- |
| `META_APP_ID` | Sí | No |
| `META_WHATSAPP_CONFIG_ID` | Sí | No |
| `META_APP_SECRET` | Sí | Sí, exactamente igual |
| `WHATSAPP_CREDENTIALS_KEY` | Sí | Sí, exactamente igual |
| `META_GRAPH_API_VERSION` | Sí, por defecto `v26.0` | Misma versión |
| `VERIFY_TOKEN` | No | Sí |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Si se conserva el canal central | Si se conserva el canal central |

Generar una clave aleatoria de 32 bytes, una sola vez: `openssl rand -base64 32`. Guardarla en los gestores de secretos, no en Git ni en documentación. Los tokens de cada negocio se cifran con AES-256-GCM y se vinculan criptográficamente al ID de sucursal. Si se pierde/cambia la clave sin recifrar, es necesario reconectar los números.

## Despliegue

1. Revisar las migraciones pendientes y sus versiones con `npx supabase migration list`. Aplicar `0105_branch_whatsapp_connections.sql` después de las migraciones anteriores; no renumerar ni reparar versiones remotas sin revisarlas.
2. Configurar secretos y desplegar Next.js junto con `npx supabase functions deploy whatsapp-webhook`. La migración debe estar aplicada antes del webhook nuevo. La función usa `node:async_hooks` y Web Crypto; verificar el despliegue en el runtime Edge vigente.
3. En Meta configurar este callback: `https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook`. En este repositorio el project-ref configurado es `pqtsiajwijcehiuwiupd`. El verify token debe coincidir con `VERIFY_TOKEN` del servidor.
4. Suscribir los campos `messages` y `smb_message_echoes` de WhatsApp Business Account. El segundo es imprescindible para detectar las respuestas humanas de la app. El servidor además ejecuta `POST /<WABA_ID>/subscribed_apps` por cada cuenta enlazada; no reemplaza la configuración de campos de la app.
5. Mantener `verify_jwt = false` para este webhook externo. La autenticación de Meta es `X-Hub-Signature-256` con `META_APP_SECRET`, no un JWT de usuario.
6. Realizar todas las pruebas manuales de abajo antes de habilitar a clientes generales. La configuración local por sí sola no demuestra que Meta haya aprobado coexistencia.

## Funcionamiento y seguridad

- Solo dueño, responsable `restaurant_admin` activo o superadmin puede enlazar/desconectar. No un cajero o mesero.
- El código OAuth se intercambia en servidor. Se valida app, permisos y pertenencia del número al WABA; no se confía solamente en el evento del navegador.
- Se requiere `is_on_biz_app=true`. Este flujo no migra ni desregistra números para forzar coexistencia.
- Cada número pertenece a una sola sucursal. La conversación se identifica por número receptor y cliente; el canal central conserva su identificador `platform`.
- Los mensajes manuales y avisos de pedidos usan su canal original. Un canal desconectado **no** usa el número central como alternativa.
- El bot de sucursal no ofrece otros restaurantes ni cambia de sucursal. Conserva los filtros de menú, pedidos, pagos y seguimiento del negocio.
- Un evento `smb_message_echoes` se guarda como respuesta saliente y pasa a atención humana. El bot permanece pausado hasta **Devolver al bot** en la bandeja. Estos eventos no amplían la ventana de atención del cliente.
- **Desconectar bot** elimina el token local y detiene el bot de esa sucursal; no elimina historial, no desregistra el número y no desuscribe un WABA compartido con otras sucursales. Para retirar también la autorización comercial, hacerlo en Meta Business Settings.
- La comprobación de conexión verifica el número y la suscripción de la app. Los tokens vencidos requieren reconexión.
- Mensajes libres del CRM y avisos de pedidos solo se envían dentro de las 24 horas desde el último mensaje del cliente. Fuera de esa ventana se omiten/bloquean; esta entrega no agrega envío de plantillas aprobadas.

## Alcance y límites explícitos

Se sincronizan mensajes nuevos entrantes, respuestas del bot/CRM y ecos nuevos de la app. No se importa el historial anterior ni la agenda del teléfono; los eventos de historial/contactos no disparan pedidos. No se incluyen campañas, administración de anuncios ni plantillas de marketing. Tampoco se genera un nuevo bot de IA: se reutiliza el flujo de pedidos existente.

La primera asociación de número a sucursal queda protegida contra cambios para no mezclar historiales. Se puede desconectar y reconectar **ese mismo número**. Cambiarlo por otro requiere un procedimiento de migración de canal que todavía no se ofrece en la interfaz; no editar el número directamente en la tabla.

## Prueba de aceptación con Meta

1. Entrar como dueño: conectar, autorizar, escanear el QR desde WhatsApp Business y comprobar el número mostrado. Cancelar y reintentar también debe funcionar.
2. Repetir con otra sucursal y otro número. Un mismo número no debe poder asociarse a ambas.
3. Escribir desde un tercer teléfono a ambos números: cada uno debe mostrar únicamente su menú, carrito y pedidos; el CRM no debe compartir historiales entre sucursales.
4. Completar un pedido en cada sucursal; comprobar el número emisor de la confirmación y de los avisos al aprobar/preparar/entregar.
5. Responder desde la app Business: debe aparecer en la bandeja y detener las respuestas automáticas. Devolver al bot desde el CRM y volver a escribir.
   Revisar/desactivar mensajes automáticos de bienvenida y ausencia que dupliquen la atención del bot; comprobar cómo los notifica Meta para ese número.
6. Probar QR de pago/comprobante en un pedido: es distinto del QR de conexión de Meta. La descarga de medios debe usar el token de esa sucursal.
7. Desconectar: la app móvil sigue funcionando; el bot y avisos por ese canal dejan de enviar. Las demás sucursales y el canal central siguen intactos.
8. Revocar permisos en Meta y usar **Comprobar conexión**; debe solicitar reconexión, sin cambiar a otro número.
9. Probar una conversación fuera de 24 horas: el CRM debe mostrar la restricción y no enviar texto libre.

Pruebas automatizadas locales: `node --test tests/whatsapp-connections.test.mjs tests/whatsapp-webhook.test.mjs`, `npm run typecheck` y `npm run lint`. No hacen llamadas a Meta ni alteran la base remota.
