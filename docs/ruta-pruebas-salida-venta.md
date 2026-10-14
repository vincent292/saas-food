# Yopido: ruta de pruebas para salir a la venta

Revisión del código y pruebas locales: **12 de octubre de 2026**. Alcance: SaaS web, menú público, app cliente, POS Android, riders y WhatsApp. Es una ruta de aceptación, no una certificación ni una auditoría exhaustiva de producción.

## Evidencia actual

- TypeScript del backend: aprobado en esta revisión.
- Comprobaciones estáticas de seguridad del repositorio: aprobadas; no sustituyen pruebas de autorización contra el backend real.
- Suite local: **111 pruebas, 104 aprobadas, 5 fallidas, 2 omitidas**. Las omitidas requieren entorno Supabase; no se ejecutaron comprobaciones remotas de esta suite.
- Las cinco fallidas revisan membresía de paneles, aprobación de mensualidad, disponibilidad por días, avisos ETA/WhatsApp y mensajes de estado no bloqueantes. Son comprobaciones de código/patrones: investigar si la implementación falla o si la prueba quedó desactualizada. No equivalen automáticamente a cinco errores de producción.
- Carga local multi-local: 1000 maestros / 2500 hijos, sin duplicados, con pruebas de rollback y cola. Es una conexión PGlite; no certifica capacidad Vercel/Supabase.
- Las verificaciones Android anteriores incluyen APIs simuladas. No demuestran entrega real, push real ni GPS en segundo plano.
- No se desplegó, no se instalaron APK y no se enviaron pedidos reales en esta revisión. La configuración remota y el estado de migraciones deben comprobarse de nuevo, aunque se hayan aplicado anteriormente.

## Cómo registrar cada prueba

Cada caso debe quedar **pendiente, aprobado, fallido o no aplica al alcance vendido**. Guardar versión de APK/backend, ambiente, usuario/rol, local, ID de pedido, importe esperado/obtenido, captura y hora Bolivia. Una prueba automática aprobada no marca automáticamente como aprobado el caso manual.

**Bloqueo de venta:** pérdida/duplicación de pedidos, cargos incorrectos, acceso a datos ajenos, fallos del cobro/caja o imposibilidad de completar el flujo vendido. Función opcional sin validar: no ofrecerla y verificar que quede deshabilitada de forma efectiva, no solo escondida.

## 0. Preparar un piloto aislado

- [ ] P00 Confirmar alcance vendido: POS/mesas/menú; sumar delivery, grupal, multi-local o WhatsApp solo después de aprobar sus casos. No prometer envíos grupales parciales, rutas por tráfico ni GPS multi-local de fondo que no estén validados.
- [ ] P01 Backend, Supabase y APK apuntan al mismo entorno; registrar versiones. Verificar migraciones y endpoints autenticados, no asumir que publicar una app publica el backend.
- [ ] P02 Crear dueño A con tres locales y dueño B con uno para probar aislamiento; usuarios superadmin, responsable, caja, cocina, mesero, dos clientes y dos riders. Usar identidades de prueba.
- [ ] P03 Preparar productos simples, variantes obligatorias, extras opcionales, promociones, agotados y stock; QR, caja, horarios nocturnos, mesas y tarifas de prueba.
- [ ] P04 Instalar APK firmados que funcionen sin Metro: cliente, rider y POS. Para grupo, dos clientes reales; para competencia de aceptación, dos riders simultáneos. Los restantes actores pueden usar web.
- [ ] P05 Disponer de teléfonos pequeños/grandes, Wi-Fi y datos, impresora si se vende impresión. No usar cuentas, cobros o mensajes reales sin identificar el ensayo y coordinarlo.
- [ ] P06 Resolver/documentar las cinco pruebas fallidas y repetir suite, TypeScript y build. Ejecutar las pruebas remotas relevantes únicamente contra staging autorizado.

**Puerta de salida:** entorno trazable, credenciales de prueba, build instalable y ningún fallo crítico sin resolver.

## 1. Acceso, negocios y catálogo — obligatorio para todos

- [ ] A01 Crear dueño, restaurante y sucursal; límites de capacidad y errores de aprovisionamiento no dejan usuarios/locales huérfanos.
- [ ] A02 Login, cambio obligatorio de contraseña inicial, recuperación, logout y sesión vencida. Credenciales temporales no aparecen en logs ni son reutilizables después del cambio.
- [ ] A03 Cada rol ve y ejecuta solo sus permisos. Intentar por URL y API acceder a otro local o dueño: rechazado, incluyendo archivos privados y reportes.
- [ ] A04 Crear/editar/desactivar personal; quitar membresía bloquea acciones aun con pantalla abierta. Cambiar de sucursal no mezcla carritos ni notificaciones.
- [ ] A05 Crear categorías/productos, variantes/extras y precios; reflejo consistente en web, Android, POS y WhatsApp si se vende ese canal. Validar obligatorios desde UI y servidor.
- [ ] A06 Disponibilidad por día/hora, cierre nocturno, producto agotado y local suspendido/archivado. Probar links viejos, caché, directorio y API pública: no se puede seguir comprando por un acceso alternativo.
- [ ] A07 Superadmin: sesión de soporte de solo lectura, motivo, auditoría y expiración. No debe poder cobrar/anular accidentalmente dentro de soporte.

**Puerta de salida:** cero acceso entre negocios; precios y permisos validados en servidor.

## 2. Pedido → cocina → pago → caja — núcleo comercial

- [ ] O01 Pedido desde web y Android: simple y con muchas opciones; subtotal, extras, cantidad, descuentos, delivery y total idénticos en cliente y servidor.
- [ ] O02 Doble toque, timeout y reintento: un pedido y un cobro. Actualizar precio/agotado después de abrir menú: reconfirmar o rechazar, no aceptar precio manipulable.
- [ ] O03 Abrir caja/turno, aceptar, preparar, listo y entregar. Estados coherentes en caja, cocina y cliente; no cobrar solo por aceptar.
- [ ] O04 QR: subir comprobante, pendiente de revisión, aprobar/rechazar y reenviar. Imagen adjunta no equivale a dinero recibido. Ver quién puede aprobar.
- [ ] O05 Efectivo: importe, cambio y cobro; pago dividido si está habilitado. Intentos simultáneos no duplican ingresos ni liquidan dos veces.
- [ ] O06 Mesero: abrir turno, QR/mesa correctos, agregar pedidos a mesa, cocinar antes de cobrar, liquidar todos los pedidos activos y liberar mesa solo cuando corresponde.
- [ ] O07 Anulación antes/después del pago: motivo, actor, devolución cuando corresponda y registro visible al dueño. Cancelar no debe simular reembolso efectivo.
- [ ] O08 Caja cerrada, mínimo de pedido, horario cerrado y stock insuficiente: mensaje claro y ningún pedido parcial cobrado.
- [ ] O09 Inventario y extras: consumo correcto, reposición/anulación según reglas, stock negativo/concurrencia; movimientos y reportes coinciden.
- [ ] O10 Imprimir ticket 58/80 mm y cocina; desconectar/reconectar impresora, reintento y reimpresión sin duplicar pedido ni cobro.
- [ ] O11 Cerrar caja: conciliar por método y por pedido, ingresos/egresos, anulaciones y reportes del dueño; filtros por sucursal/día Bolivia.

**Puerta de salida:** dinero conciliado y pedido trazable de principio a fin, en ambos canales.

## 3. Android y operación en vivo — obligatorio para las apps vendidas

- [ ] D01 Anchos 320/360/450 dp, texto grande, teclado y barras del sistema: botones accesibles, scroll funcional, modal de producto sin precios ni opciones tapados.
- [ ] D02 Android físico: instalar/actualizar APK sin perder sesión/pedido; permisos de cámara/QR, ubicación y push concedidos/denegados; versión mínima soportada.
- [ ] D03 Wi-Fi → datos, desconexión, timeout, reconexión y reapertura durante envío/pago/aceptación: recuperar estado real sin duplicar.
- [ ] D04 Caja/cocina/cliente sincronizan estados; pantalla suspendida y teléfono bloqueado: validar push real y recuperación del estado. No confundir polling con push.
- [ ] D05 Dos operadores cambian el mismo pedido y dos riders aceptan a la vez: una transición/una asignación ganadora, mensajes correctos para el resto.
- [ ] D06 Delivery simple: cotizar, asignar, rechazar, recoger y entregar; códigos correctos/incorrectos, intentos bloqueados y rider sin membresía.
- [ ] D07 GPS rider: app abierta, en fondo, pantalla apagada y permisos revocados. Señal antigua se marca como antigua/no disponible; nunca inventar ubicación. GPS multi-local de fondo está pendiente según la verificación anterior.

**Puerta de salida:** APK real completa el flujo en teléfonos, no solo en simulador.

## 4. Grupal y multi-local — obligatorio si se ofrecen al cliente

- [ ] M01 Individual multi-local con dos y tres locales: un maestro, un hijo por local, productos y subtotales correctos; ningún hijo recibe delivery independiente.
- [ ] M02 Grupo: crear, invitar por link/QR/código, dos participantes agregando a distintos locales, editar y quitar items, salir/reingresar y permisos del host.
- [ ] M03 Cada modalidad de pago permitida por la UI: todos al host/todos al local. Comprobante pendiente/rechazado bloquea lo que corresponda; no descuenta tarifa ya aceptada ni excluye personas automáticamente.
- [ ] M04 Bloquear/cancelar/expirar/finalizar grupo; doble envío, reintento y enlace viejo no duplican maestros. El acceso «continuar» se oculta tras 30 min sin uso, sin cancelar un pedido enviado.
- [ ] M05 Escenario inverso: carnes 45 min sin cola; hamburguesas 12 min con cola larga; pizza 20 min con cola media. Tiempo planificado debe usar el pronóstico completo, y cocina debe respetar la entrada programada.
- [ ] M06 Repetir M05 con más/menos carga, ticket viejo, local cerrando, cancelación de un hijo y cambio de estado mientras se planifica. Mostrar rango aproximado y no esconder saturación tras el límite de 75 min.
- [ ] M07 Oferta cliente: mínimo/máximo/decimales; cambiar precio mientras busca invalida la oferta anterior. Rider acepta/rechaza/contraoferta; cliente acepta/rechaza o deja vencer 15 s usando el reloj del servidor.
- [ ] M08 Dos riders aceptan la misma oferta: uno gana; rider ocupado no toma otra ruta simple o multi-local. Después de asignar no cambia unilateralmente la tarifa.
- [ ] M09 Recojos por orden/código, local sin preparar, código incorrecto/repetido y entrega anticipada: rechazo correcto. Código final solo al cliente cuando corresponda.
- [ ] M10 Volver a la app/web durante negociación y ruta: mismo maestro, importe, rider y estado. Dos clientes del grupo observan el mismo resultado.
- [ ] M11 Rider llega tarde, local tarda más o parte se cancela: procedimiento explícito de revisión; no saltar paradas ni recalcular dinero silenciosamente. Documentar qué se resuelve manualmente.

**Bloqueos conocidos:** el planificador pierde parte del ajuste de preparación bajo demanda; la hora sugerida no garantiza que cocina respete la liberación; GPS multi-local de fondo no validado. Resolver o limitar explícitamente alcance antes de vender multi-local.

## 5. WhatsApp, mensualidad y administración — según alcance

- [ ] W01 Pedido real desde número autorizado, bot → carrito → comprobante → caja → cocina → estado. Eventos duplicados no crean dos pedidos.
- [ ] W02 Origen orgánico/anuncio cuando Meta provee referencia; ausencia de referencia no se etiqueta como anuncio confirmado. Consumo/costo estimado se diferencia de factura real de Meta.
- [ ] W03 Atención humana pausa bot y devuelve control; CRM y ecos Business no responden duplicado. Fuera de ventana el mensaje libre se bloquea y muestra motivo.
- [ ] W04 Conectar/desconectar dos sucursales: cada número/historial/token permanece aislado. Revocación/expiración no usa otro número como respaldo. Validar coexistencia y permisos con Meta real.
- [ ] W05 Proveedor WhatsApp caído: pedidos/caja no se bloquean; error visible y reintento controlado. QR de pago distinto del QR de vinculación Business.
- [ ] B01 Aviso mensual D-5, QR/monto/instrucciones y roles web; propuesta de fecha no cuenta como pago ni evita corte sin aprobación.
- [ ] B02 Superadmin aprueba/rechaza fecha/pago; prórroga solo de ese ciclo; avisos desaparecen tras pago y vuelven el mes siguiente. Ciclos sin pedidos respetan regla vigente de no cobro.
- [ ] B03 Vencimiento/gracia/corte Bolivia y cron autorizado; verificar configuración remota de CRON_SECRET. Suspender solo cuentas correspondientes; no afectar Vercel ni otros comercios.
- [ ] B04 Local suspendido fuera de directorio/menú y operaciones; conserva acceso a instrucciones de pago. Reactivar por pago no reactiva locales archivados/inactivos manualmente.
- [ ] B05 Aviso mensual en POS Android independiente: no asumir que ya existe por funcionar en web; decidir/integrar si forma parte del alcance.
- [ ] B06 Mensajes/avisos de plataforma, soporte/incidencias y reportes: destinatarios y permisos correctos, evidencia accesible al superadmin sin exponer información ajena.

**Puerta de salida:** canal y corte comprobados realmente; ninguna integración opcional no validada se promete como lista.

## 6. Resistencia, recuperación y piloto comercial

- [ ] R01 Build de producción y export/build de cada app del alcance; variables revisadas sin claves privadas dentro del APK. Verificar URLs HTTPS, dominio, certificados y firma de actualización.
- [ ] R02 Staging: carga progresiva 10 → 25 → 50 usuarios concurrentes, medir p95/errores/bloqueos/DB, colas largas y múltiples conexiones. Definir umbral acordado y detener si hay errores críticos; no extrapolar PGlite.
- [ ] R03 Monitorear errores backend/Edge/apps y alertas por fallos de creación/cobro/despacho; logs con IDs, sin tokens, comprobantes ni datos sensibles innecesarios.
- [ ] R04 Copia de seguridad y restauración en entorno aislado: verificar pedidos/pagos/usuarios y recuperación de archivos privados. «Restaurar restaurante archivado» no es restaurar la base de datos.
- [ ] R05 Ensayar rollback de despliegue y compatibilidad APK/backend/migraciones. Definir quién atiende incidentes y cómo operan los comercios si falta conexión/proveedor.
- [ ] R06 Revisar privacidad, términos, consentimiento GPS/push y borrado de datos; políticas de soporte/reembolsos y condiciones comerciales. No asumir que las páginas legales equivalen a revisión profesional.
- [ ] R07 Piloto propuesto: tres locales, teléfonos reales, operación supervisada y al menos un turno pico y un cierre. Documentar pedidos simples, mesa, QR/efectivo y cada función vendida; los pedidos cuentan solo si se conciliaron completos.
- [ ] R08 Acta de salida: todos los casos críticos aprobados, fallos menores documentados, manuales para caja/cocina/rider/dueño y contacto de soporte; repetir casos afectados después de cada corrección.

**Puerta de salida:** cero fallos críticos, dinero conciliado y una recuperación ensayada. Los números de usuarios/días del piloto son una propuesta, no una garantía ni un requisito contractual.

## Orden recomendado

Primero preparar ambiente y resolver regresiones → acceso/catálogo → pedido/caja/mesa → teléfonos y entrega simple → grupal/multi-local → integraciones comerciales → pico/cierre/recuperación → venta del alcance aprobado.

Se puede vender un núcleo POS/menú aprobado sin vender multi-local o WhatsApp todavía, **solo si las funciones pendientes quedan efectivamente deshabilitadas y la oferta comercial es clara**. No basta con esconder un botón.

## Qué falta comprobar ahora mismo

1. Las cinco pruebas de regresión que fallan.
2. Coordinación real de cocina y pronóstico completo multi-local.
3. Dos teléfonos cliente/rider con oferta, contraoferta, recojos y entrega; más actores para grupo/competencia.
4. GPS/push en segundo plano en APK real.
5. Despliegue, migraciones y cron en el ambiente usado para el piloto.
6. Conciliación de caja, aislamiento real y restauración de respaldo.

Referencias internas de evidencia: `multisite-stress-tests.md`, `multisite-android-verification.md`, `piloto-android-apk.md`, `owner-billing-notices.md`, `whatsapp-business-coexistence.md`. Los documentos anteriores conservan estados del 8 de octubre; no tomar sus resultados remotos como comprobaciones hechas hoy.
