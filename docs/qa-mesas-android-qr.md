# Mesas: Android cliente, pago previo QR y llamada al mesero

Fecha: 17/10/2026. Alcance de esta entrega: pedidos individuales y de mesa en la app cliente, API compartida, bandeja de mesas web/POS Android y llamadas al personal. No certifica todos los flujos grupales nativos heredados.

## Implementado

- Escáner del inicio de la app cliente acepta los enlaces oficiales `/local/mesa/codigo` y `/r/local/mesa/codigo`, además de los QR grupales. Permite pegar el enlace si no se puede utilizar la cámara. Rechaza dominios ajenos, credenciales en URL y puertos no autorizados.
- El servidor valida sucursal, mesa activa, código y módulo. La mesa pública solo permite QR: no efectivo, comprobantes ni aceptación manual. El efectivo sigue disponible para pedidos tomados por personal autenticado.
- El checkout nativo conserva un UUID y una capacidad aleatoria de recuperación **antes** de enviar. En Android se guarda en SecureStore; en web, en almacenamiento local. La autoridad del pago sigue siendo el servidor. Un reintento recupera el mismo pedido antes de validar otra vez horario, stock y caja.
- Antes de preparar se abre una pantalla de pago, no seguimiento de comida. Recupera el QR pendiente, permite guardarlo/compartirlo o utilizar captura, consulta al volver del banco y solo pasa al seguimiento tras pago y aplicación válidos. Anular y descartar exige confirmación bancaria; un resultado desconocido no borra la recuperación ni permite cobrar de nuevo.
- Las llamadas se conservan en base de datos. Una llamada pendiente por mesa, espera global de dos minutos entre llamadas nuevas, caducidad de quince minutos e idempotencia por solicitud. Los clientes solo pueden consultar su llamada mediante capacidad; no pueden atenderla.
- El destino es el mesero asignado o, si no hay asignación, el último mesero con pedido registrado en la visita abierta. Caja recibe el aviso también. El mesero necesita turno abierto; no recibe avisos de otras mesas/sucursales. Si no hay mesero identificable, queda para caja.
- Bandeja separada en la app POS y en Mesas de caja/administración web: llamadas con confirmación «Atendida», solicitudes pendientes con productos y montos, y advertencia de no preparar. El pedido operativo conserva su estado de pago. Un pago retenido para revisión no se presenta como impago ni se cobra otra vez.
- Las solicitudes sin pagar permanecen fuera de cocina, la cola y las comandas operativas. La migración 0139 no modifica las reglas de precio ni habilita efectivo público.
- El pago programado conserva la hora de inicio de preparación y se libera con la caja del día, no en una caja anterior. La app envía la programación al backend; no es una promesa de entrega a esa hora.

## Verificado

- 86 pruebas dirigidas del backend: incluyen SQL real en PostgreSQL embebido para pagos, reintentos concurrentes, reservas, aislamiento, llamadas, turnos, sucursales y expiración.
- 11 pruebas unitarias de la app cliente: recuperación tras reinicio, almacenamiento fallido/corrupto, reintento tras desconexión y enlaces confiables, entre otras.
- 19 pruebas de interfaz del POS; la nueva bandeja y sus botones se comprueban a 320, 360 y 450 dp. La prueba antigua de cobro se actualizó para introducir efectivo recibido mediante «Pago exacto», como exige la interfaz existente.
- App cliente: pago y recuperación a 320, 360 y 450 dp; prueba adicional del carrito de mesa que comprueba `orderType=table`, QR obligatorio, capacidad persistida y ausencia de seguimiento previo al pago. Respuestas controladas: **no son pagos bancarios reales**.
- TypeScript en los tres proyectos, ESLint dirigido, comprobaciones de seguridad web, compilación Next y exportaciones Android de ambas apps.
- Migración 0139 aplicada en Supabase. Lectura anónima de la tabla de llamadas rechazada con `42501`. No se crearon llamadas reales ni se enviaron notificaciones a clientes durante estas pruebas.

## Límites y piloto pendiente

- Las exportaciones Android no son APK instalados. Hay que reconstruir las apps con los módulos nativos nuevos y probar permisos de galería, cámara, retorno desde el banco y recepción push con FCM/Expo en dispositivos reales. Se detectó un teléfono de aproximadamente 360 dp con la app cliente instalada; no se sustituyó su APK ni se realizó un pago desde él.
- El estado se actualiza por Realtime, consulta de respaldo cada cinco segundos y al volver a la app. La confirmación del banco sigue dependiendo del callback o reconciliador existente; una animación o actualización de pantalla no prueba que el banco haya confirmado instantáneamente.
- El aviso push es de mejor esfuerzo. La bandeja persistente y su sincronización siguen disponibles si Expo, permisos, ahorro de batería o conectividad impiden la notificación. Una aceptación de Expo no demuestra recepción en el teléfono.
- Un QR de mesa copiado no demuestra presencia física. Los límites y la llamada única reducen abuso, pero no sustituyen un control presencial.
- Cada local necesita una conexión bancaria habilitada o un respaldo **expresamente autorizado**. Esta entrega no cambia la cuenta central, su autorización ni el enrutamiento de cobros.
- No se implementan reembolsos automáticos ni se borra un pago retenido por stock/revisión.
- La auditoría npm de la app cliente informa 32 alertas de dependencias (12 moderadas, 19 altas y una crítica transitiva en `shell-quote`, vía herramientas de React Native). No se ejecutó una actualización masiva ni se declara el conjunto de dependencias certificado para lanzamiento.

## Prueba piloto

1. Instalar los APK actualizados de cliente y POS. Abrir caja, iniciar turno del mesero y asignarle una mesa.
2. Escanear el QR de esa mesa desde la app cliente y llamar al mesero. Comprobar recepción en POS, marcar atendida y verificar el cambio en cliente.
3. Crear un pedido de mesa: debe quedar solo en «pendiente de QR», sin comanda ni cocina. Guardar QR, salir al banco, cerrar/reabrir Yopido y recuperar el mismo pedido y QR.
4. Pagar una vez. Confirmar que aparece una única comanda pagada/aceptada, una aplicación de inventario y un movimiento de caja. Verificar que una captura anterior no permite otro pago.
5. Repetir con internet interrumpido, caja cerrada durante el pago, otro mesero y otra sucursal. No aprobar manualmente un pago desconocido ni volver a cobrar para desbloquear una pantalla.
