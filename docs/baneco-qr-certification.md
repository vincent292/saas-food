# Baneco: laboratorio de QR dinámicos por comercio

## Checkout recuperable y configuración por sucursal (16/10/2026)

- Migración `0128`: nuevas columnas de recuperación y política bancaria por pedido, más una cola durable de aceptación. No aplica automáticamente esta política a pedidos antiguos ni habilita cuentas de otros comercios.
- Web individual/mesa: QR dinámico únicamente si existe una cuenta verificada/habilitada en BOB. Ya no ofrece QR estático ni carga de comprobante en este checkout. Sin cuenta habilitada, QR no está disponible; efectivo conserva su flujo si la modalidad lo permite. El receptor bancario usa un QR por pedido y monto de DB.
- Al enviar, el cliente conserva request UUID y una capacidad aleatoria de 256 bits en localStorage ANTES de la solicitud. El servidor guarda solo su SHA-256 ligado al pedido. La recuperación requiere restaurante + request UUID + capacidad; un UUID público solo no revela el seguimiento. Los QR/imágenes/credenciales y estados de pago no se guardan en caché local.
- Inicio y menú muestran «Retoma tu pedido o pago». Si la respuesta se perdió, el mismo request recupera el pedido anterior antes de revisar horarios/stock/caja. Si una emisión bancaria fue ambigua, se conserva su reserva: no se vuelve a emitir automáticamente.
- Visitar seguimiento marca esa solicitud como enviada, permitiendo otro pedido intencional sin perder el acceso al anterior. Entregado/cancelado se retira del acceso local al visitar seguimiento. Los accesos duran hasta 30 días, separados de la expiración del QR. Ocultar acceso no anula el banco ni cancela el pedido.
- Límite real: localStorage no sobrevive borrar datos, otro navegador/dominio/dispositivo o ciertas sesiones privadas. Se ofrece copiar el enlace y permanece el seguimiento por número/contacto existente. No se afirma recuperación universal ni que una copia descargada pueda ser invalidada localmente: el banco controla su uso único.
- Tras pago bancario confirmado + aplicación válida a pedido, una cola SQL acepta automáticamente los nuevos pedidos marcados `bank_auto_accept`. Con cocina pasa a aceptado, no simula preparación ni entrega. Sin cocina pasa a listo; si está programado se acepta ahora y se difiere «listo»/dispatch hasta la fecha programada. Se conservan caja/inventario idempotentes. Una falla local queda en revisión sin volver a cobrar ni aceptar a ciegas.
- La cola se procesa inmediatamente desde la notificación bancaria, y por el worker de respaldo aunque el teléfono esté cerrado. Claims con lease/fencing; la señal de notificación se reclama una sola vez (puede perderse si el proceso termina justo después del claim; no se garantiza entrega exactamente una vez de push). Dispatch utiliza el flujo existente, no otra venta bancaria.
- Dueño o superadmin: `/admin/restaurantes/[restaurantId]/configuracion/banco`, enlazado desde Configuración > Pagos. Cada acceso verifica propietario real en servidor, sucursal activa, cambio de contraseña y soporte de solo lectura. Caja/meseros/responsables no pueden cambiar estas credenciales. Tablas continúan privadas; nunca se repueblan secretos.
- Guardar -> comprobar autenticación -> habilitar cobros reales. Credenciales: usuario, contraseña, llave de cifrado y cuenta autorizada; no se infiere que sean iguales. URL se fija al host oficial de producción (no URLs arbitrarias). La cuenta se valida completamente al emitir/conciliar, no solamente con autenticar. Desvincular conserva el historial para conciliar QR anteriores.
- **Alcance pendiente:** POS, clientes Android nativos y pagos repartidos por participante/grupo/multilocal aún no migrados a este nuevo checkout. Los flujos anteriores no se presentan como confirmación bancaria. Para multi-local se acordó cuenta propia por sucursal y delivery separado; no se cobra todo en la cuenta de un solo local. Se requiere el ledger de aportes/partes y su validación real antes de eliminar esos flujos.
- Esta sección describe código. La aplicación remota/despliegue y el nuevo piloto pagado deben registrarse por separado; las pruebas automáticas no sustituyen pagar un pedido real.
- Verificación técnica: 46 pruebas dirigidas aprobadas (incluyen SQL real en PGlite, recuperación tras reiniciar el runtime, guardas de propietario y worker sin navegador), TypeScript, ESLint dirigido y build Next.js. `0128` aplicada al Supabase vinculado; cola nueva privada a anon y una sola sucursal habilitada, sin generar QR/pagos/pedidos nuevos en esta fase. Falta piloto real de pedido ligado al pago y cierre/reapertura del navegador.

Implementación inicial: 14 de octubre de 2026. Ruta: **Superadmin > QR dinámicos / Baneco**, `/admin/pagos-qr`.

## Alcance

- Guardar una conexión activa por comercio/ambiente, con versiones inmutables de credenciales. Desactivar una conexión impide nuevos QR, pero conserva la versión asociada a QR anteriores para conciliarlos.
- Comprobar autenticación, generar QR de certificación o producción de uso único e importe fijo, consultar su estado y anularlo con verificación posterior.
- Monto de pruebas entre 0.01 y 100, BOB/USD; vencimiento en el día Bolivia o hasta 30 días después.
- Solo superadmin; bloqueado en sesión de soporte de solo lectura. No hay acceso para dueño/caja/mesero desde UI ni API/tabla privada.
- Las pruebas manuales no modifican pedidos, caja, inventario ni mensualidades. Los cobros de pedidos requieren habilitar expresamente la cuenta con «Cobrar pedidos» y vinculan el QR antes de emitirlo, por el total de DB en BOB (0.01–50 000). No se asignan pruebas antiguas a pedidos por coincidencia de importe.
- Producción está habilitada para el piloto explícito del superadmin. Un QR de producción permite un pago real a la cuenta guardada. Antes de generar se exige una conexión comprobada tanto en el panel como en la reserva SQL.
- «Usar en producción» autentica las credenciales ya guardadas contra producción y crea una nueva versión cifrada con otro ID/AAD. No modifica la conexión ni los intentos históricos de certificación, ni requiere volver a ingresar secretos.

## Verificación automática y desvinculación (14/10/2026)

- Piloto real comprobado: producción generó el QR BOB 1 de referencia `YQ-b221be66b82b4a72a5ea10a7023a4f39` y una consulta autenticada al banco confirmó `paid`. No se movió dinero desde las herramientas del agente.
- Migraciones `0122` y `0123`: reservas exclusivas de 90 segundos, reloj de base de datos, token de operación y espera progresiva ante errores (hasta una hora). Estados `paid` y `cancelled` son terminales. Un resultado de un trabajador anterior no puede sobrescribir al actual. Los intentos sin `qr_id` no se regeneran.
- Supabase Cron dispara el worker aproximadamente cada minuto si hay trabajo. Con cooldown de 60 segundos tras una consulta, un pendiente se revisa cada 1–2 minutos; vencidos/revisión se consultan cada hora, sin asumir que no pagaron. Lotes de hasta 10 QR, concurrencia 3. Desde 0125 el panel recibe invalidaciones por un canal Realtime privado; solo consulta periódicamente por HTTP si el socket se desconecta.
- Vercel Hobby no permite cron por minuto. Se usa `pg_cron` + `pg_net` de Supabase, sin depender del navegador. La migración `0124` fija el destino canónico `https://www.yopido.shop/api/cron/bank-qr` para evitar la redirección 308 del dominio sin www.
- `BANK_QR_WORKER_SECRET` es una clave de infraestructura dedicada, distinta de las credenciales bancarias y de la clave del cofre. Se guarda en Vercel Production y Supabase Vault mediante `node --env-file=.env.local scripts/configure-baneco-worker.mjs` después de migrar y antes de desplegar. El script no imprime secretos ni sobrescribe una clave existente.
- El scheduler envía una firma HMAC-SHA256 válida durante 60 segundos, no la clave permanente (pg_net almacena temporalmente los encabezados en su cola). Una repetición dentro de esa ventana no salta las reservas ni el cooldown persistidos. La ruta solo consulta estados, no genera ni anula QR.
- «Desvincular cuenta» pide confirmación, impide nuevos QR y conserva credenciales cifradas e historial para conciliar los ya emitidos. No cierra la cuenta bancaria ni anula sus QR. Para anular un QR pendiente existe su acción específica.
- Todos los QR se solicitan con `singleUse=true` y `modifyAmount=false`. Al confirmar pago desaparecen la imagen y descarga del panel. El banco debe impedir reutilizar una copia descargada; todavía falta una prueba controlada de segundo intento desde una app bancaria. No se debe hacer un segundo pago real desde las herramientas del agente.
- Las pruebas siguen aisladas. El checkout individual admite cobros vinculados desde 0126/0127, con activación por cuenta; no se infieren aportes de participantes ni se reparte un cobro entre comercios/rider.

## Avisos, tiempo real y cobros de pedidos (15/10/2026)

- URL que Baneco debe registrar para cada cuenta de producción: `https://www.yopido.shop/api/qrsimple/notifyPaymentQR`. No existe una operación de registro de esa URL en el contrato proporcionado. Publicar el receptor no implica que el banco ya lo haya registrado.
- El receptor valida el tamaño/estructura, conserva solo el identificador local y adelanta una consulta autenticada a Baneco. No cree el importe, estado, identidad ni referencia que vengan en el aviso. Desconocidos/duplicados reciben el mismo acuse; límite por IP y coalescencia por QR en DB. El trabajo queda persistido antes de responder y usa `after`; el cron recupera interrupciones. Un aviso recibido durante otra consulta no desaparece detrás de su cooldown.
- El superadmin escucha `bank-qr:superadmin`, privado y con política de lectura limitada a superadmin sin soporte activo. Se emite únicamente `{changed:true}`, sin claves, imágenes ni datos personales. El seguimiento público y la tarjeta de pago usan canales separados, ligados a su token; esto evita que el SDK reutilice y desconecte una suscripción compartida.
- El checkout de un comercio habilitado permite enviar el pedido QR sin comprobante y obtener un QR de importe fijo en seguimiento. El RPC anterior conserva la validación de precios, stock, horario, caja e idempotencia. Hasta que el banco confirme, el pedido permanece sin pagar. Una solicitud interrumpida o ambigua se reutiliza, no emite otro QR a ciegas.
- Al confirmar pago se marca el pedido pagado y se registra una sola venta QR. La preparación se aprueba desde el local: el flujo existente mantiene cocina, tiendas sin cocina, programación, reparto y avisos. Una aprobación de un pedido prepagado no vuelve a cobrar. La aplicación conserva el consumo de inventario del flujo de cobro existente.
- Si no hay caja abierta, el pago queda confirmado y el pedido pagado con `waiting_cash`; el asiento se reintenta cuando abra caja. No se agrega a una sesión cerrada. Se bloquea un reembolso antes del asiento original para evitar un egreso sin ingreso.
- Mientras haya un QR vigente, no se permite cambiar el importe ni cobrar por otro medio. «Anular QR para cambiar de pago» consulta, anula y vuelve a consultar al banco; si se pagó durante esa carrera, prevalece el pago confirmado. Cancelar/cambiar un pedido oculta el QR en seguimiento. Las anomalías de asignación conservan el pago bancario y pasan a revisión; el superadmin puede reintentar el registro sin generar ni cobrar otro QR.
- Alcance: pedidos individuales y de mesa en BOB. Los grupales por participante y los multicomercio conservan sus flujos anteriores; precisan asignación explícita entre receptores/importes antes de activar QR dinámico. No se realiza un reembolso bancario automático.

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

El PDF no documenta firma/autenticación de `notifyPaymentQR`. El receptor implementado nunca aprueba con ese cuerpo: lo usa como aviso para consultar al banco y reconciliar de forma idempotente. Si Baneco aporta firma o restricciones de origen, podrán añadirse además de la verificación bancaria.

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
