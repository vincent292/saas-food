# Baneco: laboratorio de QR dinámicos por comercio

Implementación inicial: 14 de octubre de 2026. Ruta: **Superadmin > QR dinámicos / Baneco**, `/admin/pagos-qr`.

## Alcance

- Guardar una conexión activa por comercio/ambiente, con versiones inmutables de credenciales. Desactivar una conexión impide nuevos QR, pero conserva la versión asociada a QR anteriores para conciliarlos.
- Comprobar autenticación, generar QR de certificación o producción de uso único e importe fijo, consultar su estado y anularlo con verificación posterior.
- Monto de pruebas entre 0.01 y 100, BOB/USD; vencimiento en el día Bolivia o hasta 30 días después.
- Solo superadmin; bloqueado en sesión de soporte de solo lectura. No hay acceso para dueño/caja/mesero desde UI ni API/tabla privada.
- No modifica pedidos, caja, inventario ni mensualidades. No hay aprobación automática de pedidos ni asiento bancario/contable por generar o verificar estas pruebas.
- Producción está habilitada para el piloto explícito del superadmin. Un QR de producción permite un pago real a la cuenta guardada. Antes de generar se exige una conexión comprobada tanto en el panel como en la reserva SQL.
- «Usar en producción» autentica las credenciales ya guardadas contra producción y crea una nueva versión cifrada con otro ID/AAD. No modifica la conexión ni los intentos históricos de certificación, ni requiere volver a ingresar secretos.

## Credenciales y clave maestra

Cada comercio puede ingresar usuario, contraseña, llave de cifrado Baneco y cuenta desde el formulario. Ninguna se devuelve a la interfaz después de guardar; tampoco se registran respuestas bancarias sensibles o tokens.

Las cuatro credenciales se guardan dentro de un único sobre AES-256-GCM con IV aleatorio y autenticación que vincula el contenido a conexión + comercio + ambiente. Copiar el ciphertext a otro comercio no permite descifrarlo. Las tablas privadas no tienen políticas ni grants para anon/authenticated, incluso superadmin; la operación se realiza exclusivamente desde el servidor con service role.

**Excepción necesaria:** `BANK_CREDENTIALS_KEY` es una clave maestra del servidor, no una credencial de comercio. Debe estar fuera de la base de datos y fuera de `NEXT_PUBLIC_*`. Se creó una clave aleatoria local en `.env.local`, ignorado por Git, sin mostrar el valor. No se reemplaza una clave existente. Antes de desplegar, guardar la misma clave de forma privada en el gestor de secretos del servidor y conservar respaldo. Cambiarla sin recifrar deja las credenciales anteriores ilegibles; no regenerarla por cada instancia/deploy.

Si no existe una clave maestra válida, el panel deshabilita guardar/generar. Nunca guarda en texto plano como respaldo.

## Protocolo documentado

Fuente: PDF proporcionado `Api Market Baneco v1.3.0.pdf`, v1.3.0 del 28/04/2025, especialmente páginas PDF 4-11 y 16.

- Certificación: `https://apimktdesa.baneco.com.bo/ApiGateway/`.
- Producción informada por el usuario: `https://apimkt.baneco.com.bo/ApiGateway/`.
- `POST api/authentication/authenticate`: userName, password cifrada; responseCode=0 y token.
- `POST api/qrsimple/generateQR`: transactionId propio, accountCredit cifrada, currency, amount, dueDate, singleUse=true y modifyAmount=false.
- `GET api/qrsimple/v2/statusQR/{id}`: estados 0 pendiente, 1 pagado, 9 anulado. Se admiten `statusQrCode` y `statusQRCode`, porque la tabla y el ejemplo del PDF difieren.
- `DELETE api/qrsimple/cancelQR`: qrId. Después se vuelve a consultar: una anulación exitosa no prueba por sí sola que no se haya pagado concurrentemente.

### Cifrado de campos enviados al banco

El PDF especifica AES/256 bits, pero **no** modo, IV, padding ni representación exacta de la llave. No se inventó un AES-CBC/ECB compatible.

Dos opciones en el formulario:

1. Contraseña/cuenta ya cifradas por Baneco en base64: se envían sin recifrarlas para el protocolo, pero permanecen cifradas en reposo en nuestra base.
2. Contraseña/cuenta sin cifrar: el servidor usa el endpoint HTTPS de cifrado documentado por Baneco. Este endpoint recibe texto y llave Baneco en query parameters; puede quedar en logs del propio proveedor. Nuestra implementación usa transporte HTTPS directo, no el fetch instrumentado de Next, no sigue redirects y no registra URL/cuerpo/token ni errores sin depurar. Solo acepta los hosts fijos de Baneco.

Para evitar el endpoint de cifrado con secretos en URL, pedir al banco valores precifrados o una especificación completa de cifrado local y vectores de prueba. No se llama este endpoint al guardar: solo al comprobar/generar/consultar explícitamente.

## Verificación del pago

El panel acepta “pago verificado en certificación” solo tras consultar el banco con el token de la conexión correspondiente. Valida qrId, importe a centavos, moneda, branchCode si fue configurado, ID de transacción bancaria y fecha/hora del pago. Datos incompletos, varias transacciones o monto diferente quedan en **revisión**.

El anexo define PaymentQR.transactionId como ID de transacción del banco, mientras el request de generación lo describe como ID del comercio. No se presume igualdad: se vincula por qrId y los demás datos, y se guarda por separado el ID bancario. Confirmar con Baneco la semántica final durante certificación.

El PDF no documenta firma/autenticación de `notifyPaymentQR`. **No hay un webhook público de aprobación confiado solo en ese cuerpo.** Esta fase usa consultas manuales. Para integración automática, acordar firma/seguridad con Baneco; incluso con webhook, usarlo como aviso para consultar al banco y reconciliar de forma idempotente.

“Vencido” se estima según dueDate y día Bolivia solo cuando el banco retorna pendiente; no es un nuevo código de estado documentado por Baneco. Un pago tardío verificado prevalece sobre esa estimación.

## Reintentos y cambios concurrentes

- La reserva SQL bloquea por conexión/solicitud. Diez envíos del mismo requestId reservan una sola operación; cambiar sus datos se rechaza.
- No se presupone que Baneco haga generación idempotente por transactionId. Un timeout queda **desconocido** y nunca regenera automáticamente.
- Solo un fallo identificado en cifrado de acceso, autenticación o cifrado de cuenta queda **failed**: en esas etapas todavía no se envió generateQR. Un error durante/después de generar sigue **unknown**. Los históricos sin etapa no se reclasifican.
- Se guardan únicamente etapa enumerada, estado HTTP y código numérico del banco. HTTP 200 con responseCode 404 se distingue de HTTP 404. No se registran mensajes crudos, tokens ni URL/query bancaria.
- Si el banco devuelve un qrId válido pero falla la imagen o el primer guardado, se conserva ese ID cuando el almacenamiento lo permite para poder consultar/anular; no se vuelve a generar.
- Reenviar una reserva existente muestra «Solicitud ya registrada», sin afirmar que se generó un QR ni repetir la operación.
- Si el proceso termina después de reservar, puede quedar “generación en curso” sin QR. Debe investigarse con el banco; no hay recuperación automática por transactionId porque el PDF no documenta ese endpoint.
- Consultar/anular adquiere un lease por QR; estados pagado/anulado no se degradan por una operación concurrente. Un resultado recibido después de perder el lease no sobrescribe el nuevo estado.
- Desactivar/conectar de nuevo no modifica en sitio los secretos de QR anteriores. No borrar versiones que todavía se necesiten para conciliar.

## Checklist de certificación con Baneco

1. Confirmar usuario, **contraseña**, llave y cuenta de **certificación**. Los datos de producción no garantizan acceso a certificación. Confirmar si hay simulador bancario para acreditar el pago sin dinero real.
2. Entrar como superadmin; seleccionar comercio, formato y ambiente; guardar. El formulario no repuebla las credenciales.
3. Comprobar la conexión; rechazo controlado con credencial incorrecta, revocada o ambiente equivocado.
4. Generar QR por 1.00 BOB, uso único y fijo; comprobar la imagen y referencia en la cuenta de certificación.
5. Simular pago con el mecanismo autorizado por el banco; consultar: pendiente -> pagado verificado, con importe y moneda correctos. No escanear con una app bancaria real salvo que Baneco confirme expresamente que es un ensayo sin fondos reales.
6. Consultar nuevamente: mismo resultado. Intentar pagar importe distinto, dos veces o QR anulado/vencido según mecanismos de certificación del banco.
7. Anular QR pendiente y volver a consultar; probar competencia pago/anulación. No marcar anulado solo por recibir un HTTP exitoso.
8. Dos solicitudes simultáneas del mismo formulario; timeout o corte de red: una reserva, sin generación automática repetida.
9. Otro comercio, usuario y cuenta: no mezclar tokens, secretos, QR ni historial.
10. Desactivar conexión, crear otra y consultar QR anterior: usa su versión anterior de credenciales.

## Verificación técnica y estado

Actualización de producción, 14/10/2026: el cifrado y la autenticación con las credenciales guardadas fueron aceptados en producción (HTTP 200, responseCode 0). En certificación la autenticación devolvió HTTP 200, responseCode 404. Eso prueba el acceso en producción, no todavía la validez de la cuenta para generar/cobrar. Un GET incompleto que devolvía 502 no reproducía una solicitud válida; no se atribuye a eso la causa del intento histórico.

La migración 0121 agrega diagnóstico seguro, estado `failed` para errores previos a generación y ambiente inmutable en cada intento; mantiene permisos privados, límites y reserva idempotente. Los datos históricos conservan estado y ambiente originales.

Las verificaciones y limitaciones siguientes describen la implementación inicial de certificación; las comprobaciones de producción se documentan arriba.

- 10 pruebas nuevas aisladas, sin llamadas al banco: cifrado y tenant binding, adaptador/documentación, bloqueo producción/hosts, validación de respuestas y pagos, montos/fechas, permisos de tablas/RPC, idempotencia y versiones, autorización en servidor y ausencia de cobro automático.
- TypeScript, ESLint dirigido y build Next.js aprobados. Suite general: 130 pruebas, 123 aprobadas, 5 fallidas previas, 2 omitidas. No son diez pruebas reales de certificación bancaria.
- Migración `0120_baneco_superadmin_test_panel.sql` aplicada el 14/10/2026 al proyecto Supabase vinculado, tras dry-run que mostró solo esa migración pendiente. No modifica flujos de pedidos existentes.
- Verificación remota de solo lectura: ambas tablas disponibles para el servidor; consultas anónimas rechazadas con código 42501. No se crearon conexiones ni QR remotos de prueba.
- No se desplegó el frontend ni se ingresaron credenciales bancarias reales en esta implementación. Tampoco se enviaron solicitudes de cifrado, autenticación, QR, pago o anulación a Baneco.
- La inspección de UI autenticada en navegador/teléfonos no está certificada por build/lint; requiere el piloto. Layout usa controles existentes, grids que apilan en móvil y QR que se adapta al ancho.

## Próxima fase (no incluida)

Tras certificación y revisión de seguridad: permisos por dueño, asociación transaccional a pedidos, aprobación/caja idempotente mediante RPC, conciliación en segundo plano, webhooks auténticos, métricas/auditoría de banco, recuperación de fallos y política de devolución. Multi-local exige definir quién recibe cada parte; no desviar el total a la cuenta de un comercio sin acuerdo.

No se incluyen transferencia de fondos, planillas de pagos, sueldos ni consulta de movimientos completos de cuentas aunque aparezcan en el PDF.
