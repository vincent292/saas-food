# Piloto Android: cliente y rider

## Estado al 8 de octubre de 2026

Se aplicaron `0116` y `0117` con `supabase db push --linked`, tras comprobar que eran las únicas pendientes. El proyecto vinculado es `pqtsiajwijcehiuwiupd` y coincide con la configuración del backend. Verificación remota: ambas funciones presentes, siete protecciones instaladas y código final inaccesible por SELECT para authenticated.

Todavía falta publicar el backend actualizado. La comprobación sin sesión de `https://www.yopido.shop/api/mobile/riders/multisite-orders` devolvió 404, mientras que `/api/mobile/riders/multisite-offers` devolvió 401. Construir APK no publica el backend.

## Qué empaquetado usar

Para el piloto usar `preview`: ambos proyectos ya tienen distribución interna y Android `buildType: apk`. No necesita Metro ni Expo Go. Un development build sí requiere servidor de desarrollo. No se iniciaron builds remotos en esta revisión; los siguientes comandos son para ejecutarlos manualmente.

## Variables de Expo

Revisar el entorno **preview** de cada proyecto EAS por separado. Ambos deben apuntar al mismo backend y al mismo Supabase:

- `EXPO_PUBLIC_API_BASE_URL`: `https://www.yopido.shop` una vez desplegado el backend actualizado, o la URL HTTPS del entorno de piloto.
- `EXPO_PUBLIC_SUPABASE_URL`.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (clave pública, nunca service role).
- `GOOGLE_MAPS_ANDROID_API_KEY`, configurada para el paquete Android y el certificado de firma del APK EAS. Sin ella la configuración rider detiene el build; con restricciones de firma incorrectas el mapa puede quedar vacío.
- Cliente: conservar `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` si se usa para funciones web de mapas, y `EXPO_PUBLIC_EAS_PROJECT_ID` con el proyecto cliente.
- Rider: conservar `EXPO_PUBLIC_AUTH_REDIRECT_URI` si se utiliza para Google.

No copiar todo `.env` al servidor de Expo. No subir claves R2, claves privadas de Supabase, credenciales de WhatsApp ni cuentas de servicio como variables públicas.

En la app cliente `google-services.json` está incluido para EAS. En rider está ignorado por Git y su configuración soporta un archivo secreto `GOOGLE_SERVICES_JSON`. Ejecutar desde la carpeta rider para provisionarlo, si no está ya configurado (actualiza el valor existente):

```sh
npx eas-cli env:set preview --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --scope project
```

El JSON debe pertenecer al paquete `shop.yopido.riders`; el del cliente pertenece a `shop.yopido.app`. Esto no sustituye las credenciales FCM del servidor necesarias para notificaciones push.

## APK cliente

```sh
cd "/Users/vincentariassaavedra/Desktop/app mobile/yopiod-mobile"
npx eas-cli whoami
npx eas-cli build --platform android --profile preview
```

Proyecto EAS cliente: `ec07ea77-ce7e-4a51-9aa5-7adcf1181776`.

## APK rider

```sh
cd "/Users/vincentariassaavedra/Desktop/carpeta sin título 2/riders-mobile"
npx eas-cli whoami
npx eas-cli build --platform android --profile preview
```

Proyecto EAS rider: `2c53159d-980c-4c1d-b408-a32a94c01699`. Se usa esta copia porque contiene la integración multi-local. No compilar la copia antigua de `Desktop/riders-mobile`.

Si `whoami` no muestra la cuenta correcta, ejecutar `npx eas-cli login` antes de construir. Elegir las credenciales de firma existentes; no regenerar keystores para reemplazar una app ya instalada.

## Instalación

Al terminar cada build, abrir el enlace EAS en el teléfono correspondiente, descargar el APK y autorizar instalar desde ese navegador. También puede instalarse por USB:

```sh
/Users/vincentariassaavedra/Library/Android/sdk/platform-tools/adb devices
/Users/vincentariassaavedra/Library/Android/sdk/platform-tools/adb -s SERIAL_DEL_TELEFONO install -r "/ruta/real/al/apk-descargado.apk"
```

Sustituir SERIAL_DEL_TELEFONO y la ruta por valores reales. Si Android rechaza por firma diferente, no desinstalar automáticamente: confirmar primero, porque se perderían los datos locales. Un APK EAS firmado para preview puede diferir del APK debug previamente instalado.

## Prueba antes de salir a la calle

1. Desplegar el backend y comprobar que el endpoint nuevo responde 401 sin sesión, no 404.
2. Iniciar sesión con cliente y rider activos; revisar permisos GPS y notificaciones.
3. Verificar primero un pedido simple; después ruta con dos locales y luego grupal multi-local.
4. Confirmar tarifas/contraofertas, aprobación de comprobantes, orden y códigos de recojos, GPS y código de entrega final.
5. Probar pérdida de conexión y reapertura sin duplicar acciones.

Limitaciones vigentes: GPS multi-local solo con app abierta; falta integración en segundo plano y prueba nativa en teléfono rider. No se autoriza una publicación general por generar estos APK; siguen pendientes la prueba real y los fallos generales registrados en `multisite-android-verification.md`.

Referencias: https://docs.expo.dev/build-reference/apk/ y https://docs.expo.dev/eas/environment-variables/usage/.
