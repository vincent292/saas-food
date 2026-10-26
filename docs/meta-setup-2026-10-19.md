# Preparación de la nueva app de Meta — 19 de octubre de 2026

## Identificadores públicos

- App: `1662509072328237` (nombre visible actual: `singup`).
- Portfolio: `1666620831732403`.
- Configuración de Embedded Signup: `886199784484387`, **Yopido WhatsApp restaurantes**.
- Dominio de la app: `yopido.shop`.
- Origen permitido para el SDK: `https://www.yopido.shop`.
- Privacidad: `https://www.yopido.shop/privacidad`.
- Términos: `https://www.yopido.shop/terminos`.
- Instrucciones de eliminación: `https://www.yopido.shop/meta/data-deletion`.

El registro como proveedor de tecnología independiente se inició con autorización del titular para aceptar las condiciones de Meta. El panel muestra la verificación del negocio aprobada. Esto no acredita aprobación de App Review ni verificación de acceso: Meta indica que ambas deben completarse antes del uso en producción por otros negocios.

La nueva configuración solicita `whatsapp_business_management` y `whatsapp_business_messaging`. Según el diálogo de Meta, genera autorizaciones de usuario del sistema sin fecha de caducidad fija; siguen sujetas a revocación y a las comprobaciones de validez del servidor.

## Compatibilidad del flujo

El comprobador del administrador de Embedded Signup evaluó los extras actuales del SaaS como v4, Cloud API, incorporación de WhatsApp Business activada y datos de sesión versión 3, tanto en el resultado actual como en el resultado para el cambio del 15 de octubre. El frontend ahora declara explícitamente `version: 'v4'` y mantiene el flujo de coexistencia y `sessionInfoVersion: '3'`.

## Comprobación del servidor antes del cambio

El proyecto sigue siendo `pqtsiajwijcehiuwiupd`. Antes de migrar las credenciales:

- No había conexiones de sucursales en `restaurant_whatsapp_connections`.
- El webhook devolvió correctamente el desafío de verificación (HTTP 200).
- Un evento vacío sin firma fue rechazado (HTTP 401).
- Un evento vacío firmado con el secreto anterior fue aceptado (HTTP 200).
- Estas comprobaciones no enviaron mensajes a personas ni completan las pruebas de permisos que muestra Meta.

## Migración guardada y desplegada

- El secreto existente de la nueva app se validó con Graph API: HTTP 200 y el identificador de app esperado. No se restableció ni se publicó su valor.
- `.env.local` contiene los identificadores nuevos y el secreto validado. Se eliminó la entrada duplicada de `META_APP_SECRET`; el archivo conserva permisos restringidos y está fuera de Git.
- Vercel confirmó la actualización de `META_APP_ID`, `META_WHATSAPP_CONFIG_ID` y `META_APP_SECRET` para **Production y Preview**.
- Supabase guardó el secreto de firma nuevo. El webhook acepta un evento vacío firmado por la app nueva (HTTP 200) y rechaza la firma anterior (HTTP 401).
- Se comprobó por digest que el secreto nuevo y el verify token coinciden entre Next.js y Supabase. La clave `WHATSAPP_CREDENTIALS_KEY` se conservó y su digest coincide con el remoto.
- Facebook Login for Business: SDK activado para `https://www.yopido.shop/`, redirección exacta `https://www.yopido.shop/`, HTTPS obligatorio y modo estricto activos.
- La suscripción de la app a `whatsapp_business_account` está activa, con callback `https://pqtsiajwijcehiuwiupd.supabase.co/functions/v1/whatsapp-webhook` y campos `messages` y `smb_message_echoes`, ambos en Graph API v26.0. Se verificó por lectura posterior de Graph API.
- Meta confirmó pruebas de entrega correctas desde su propio panel para `messages` y `smb_message_echoes`. Son pruebas del transporte del webhook, no pruebas de envío real ni de coexistencia con un negocio enlazado.
- Producción desplegada: `dpl_7DAeM6H1bE7JturbLmt1gAtuiAoU`, publicada en `https://www.yopido.shop`. Inicio y las tres URLs legales respondieron HTTP 200 después del despliegue.
- Verificación local: 37 pruebas de WhatsApp aprobadas, TypeScript y compilación de producción correctos, ESLint del componente modificado correcto. El lint global presenta cuatro errores previos fuera del cambio: `MultisiteDeliverySearchRadar.tsx`, `owner-billing-notices.test.mjs` y `tests/ui/pending-activity.e2e.cjs`.

## Pendientes de aceptación y revisión de Meta

La autorización temporal de pruebas se completó con la cuenta **Test WhatsApp Business Account** (`1640665837602833`) y el emisor de prueba `1461479100371276`. No se guardó ese token en la configuración de producción. El titular verificó al destinatario directamente en Chrome. Se envió una sola plantilla `hello_world` desde el panel oficial: Meta confirmó el envío y el titular confirmó su recepción por WhatsApp. Esto acredita el envío real de prueba, pero no una conexión de sucursal ni la recepción de eventos de producción en el SaaS.

La consulta real `GET /v26.0/1640665837602833/phone_numbers?fields=id,display_phone_number,verified_name` devolvió HTTP 200 y el teléfono de prueba esperado (`1461479100371276`, `Test Number`). Esto comprueba el permiso `whatsapp_business_management`. El archivo temporal utilizado para esa consulta fue eliminado al finalizar. Los contadores de pruebas del panel pueden tardar hasta 24 horas en actualizarse; no se repiten envíos para acelerar su actualización.

Se abrió Embedded Signup desde Configuración → WhatsApp Business del restaurante **Pruebas** (`a9b24a2e-17ba-4f94-a3e1-30b7778324fd`). El diálogo confirmó app `1662509072328237`, configuración `886199784484387`, v4 y `whatsapp_business_app_onboarding`, con origen `www.yopido.shop`. En el perfil Chrome Vincent, Meta respondió **App not active**: no se completó el enlace ni se guardó una conexión. La siguiente prueba debe realizarse con el administrador existente de la app, Micole Click, y una sesión autorizada de Yopido en el mismo perfil de Chrome. El titular eligió otro número ya activo en WhatsApp Business para esta prueba de coexistencia. El restaurante está suspendido en Yopido y debe activarse antes de verificar pedidos; esto es independiente de cualquier estado de Meta.

1. Comprobar el enlace desde una sesión autorizada del SaaS y completar Embedded Signup con un negocio/número elegible de prueba.
2. Confirmar la actualización de los contadores de Meta de administración y mensajería; ambas llamadas reales de prueba se realizaron y la recepción del mensaje fue confirmada por el titular.
3. Preparar la evidencia de App Review: mensaje enviado y recibido, y creación de una plantilla, según las instrucciones que muestra el panel. No marcar pruebas como completadas sin evidencia.
4. Completar App Review y verificación de acceso antes de incorporar negocios externos. El panel advierte que, mientras la app esté sin publicar, solo entregará webhooks de prueba del panel y no datos de producción, incluidos los de usuarios con roles de la app.
5. Si se utiliza el número central del SaaS, obtener una autorización de la nueva app para el número correcto. Los valores anteriores de `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` no se han migrado ni deben confundirse con los tokens cifrados por sucursal.

La migración de app y configuración está desplegada. Esto no equivale a aprobación de Meta ni acredita una prueba completa de pedidos o del número central.

## Intento de coexistencia — 20 de octubre de 2026

El titular autorizó expresamente las condiciones adicionales mostradas por Embedded Signup, incluidas Cloud API, Meta para WhatsApp Business, herramientas empresariales y marketing con intercambio de datos de actividad. Ambas sesiones (superadmin de Yopido y Micole Click de Meta) quedaron disponibles en el perfil micole. Se confirmó que **Pruebas** está activo.

Al introducir el número de WhatsApp Business elegido por el titular y pulsar Siguiente, Meta rechazó continuar con **2655111**: «La app de socio no tiene los permisos avanzados de mensajes y administración de WhatsApp Business necesarios para el registro. Solicita estos permisos a través del proceso de revisión de apps». No se completó el registro del número. Se requiere aprobación de acceso avanzado a `whatsapp_business_management` y `whatsapp_business_messaging` antes de repetir este enlace.

Se abrió el borrador existente de revisión `1662742975638180`, sin enviarlo. Meta muestra verificación y configuración al 100%, y deja pendientes uso permitido, tratamiento de datos e instrucciones para revisores. El permiso de mensajería pide justificación, grabación real, llamadas de prueba y confirmación del uso permitido. Se preparó una descripción fiel del negocio y de su implementación, que declara expresamente el bloqueo 2655111 y la demostración completa pendiente. El material de preparación se conserva en el documento de revisión de esta conversación; no se fabricó evidencia de video.

Actualización posterior: el titular grabó una toma de 26 segundos que incluye el SaaS, el formulario de número de Meta y el rechazo 2655111. Se revisó y convirtió a MP4 sin cambiar su contenido; se subió y guardó en los apartados de mensajería y administración. Meta marca **Uso permitido al 100 %**, y ambas llamadas de prueba como completadas. Se agregó Website como plataforma y se guardó `https://www.yopido.shop/`, junto con instrucciones web que explican el bloqueo real.

Con autorización del titular se creó una cuenta de revisión sin rol global, con una única membresía `restaurant_admin` en Pruebas. Sus credenciales aún no se entregaron a Meta: la prueba detectó que el restaurante vuelve a quedar suspendido por facturación del dueño. El titular eligió regularizar el restaurante original. Se debe comprobar nuevamente el acceso antes de compartir las credenciales. La solicitud global sigue sin enviar; también falta confirmar todos los países de procesamiento de los proveedores (incluido acceso remoto). Ubicaciones comprobadas: Supabase `us-west-2`, Vercel `pdx1`, Cloudflare R2 privado `ENAM`.
