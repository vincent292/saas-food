# POS, QR y cocina — revisión del 5 de noviembre de 2026

## Comportamiento implementado

- El POS conserva el catálogo y el resumen del carrito en pantalla completa. Las imágenes son más compactas; el listado del carrito se desplaza sin ocultar total y cobro.
- El botón **Cobrar** abre una modal con efectivo, QR, tarjeta y otros métodos. Los datos del cliente son opcionales. Efectivo calcula el cambio.
- QR crea una reserva pendiente con el mismo identificador de venta, muestra automáticamente el QR bancario y espera la confirmación. La recepción de dinero y la activación del pedido son estados distintos: la modal solo muestra «Pedido enviado a cocina» después de la activación real.
- En mostrador, cerrar un QR sin pagar ofrece descartarlo: primero verifica y anula el QR con el banco, luego cancela la reserva y limpia el carrito. Una respuesta perdida obliga a recuperar el mismo identificador. Los pagos recibidos y las verificaciones inciertas conservan su acceso para revisión. No se envía el pedido a cocina desde el navegador ni se ofrece una confirmación manual de pago.
- La anulación de una venta QR sin pagar verifica primero la cancelación bancaria. Un pago recibido no puede descartarse desde este flujo.
- Cocina avisa con el sonido existente cuando un pedido entra a `accepted` o `preparing`. **Activar sonido** habilita y prueba el audio en ese navegador. El reconocimiento de alertas de recepción es independiente del de cocina.
- Cocina ofrece **+5 min** y **+10 min** por pedido activo, hasta 180 minutos acumulados. El contador conserva su hora de inicio. Los cambios actualizan el estimado del seguimiento del cliente y quedan auditados. Se rechazan cambios concurrentes con un valor anterior.

La revisión inicial reutilizó las columnas ETA de `0101_order_eta_adjustments.sql` y el flujo bancario existente. La corrección posterior del 7 de noviembre sí requiere la migración indicada a continuación. No se realizaron cobros reales en las pruebas.

## Corrección del 7 de noviembre: pagar antes de enviar

Se reprodujo una brecha en `guard_bank_checkout_hold`: excluía `pos_counter`, el origen que también utilizan las comandas autenticadas de meseros. La migración `0141_pos_qr_payment_before_kitchen.sql` protege las reservas bancarias individuales de cualquier origen y conserva el bloqueo hasta que el pago verificado se active como pedido operativo. Una recepción bancaria pendiente de aplicación sigue fuera de caja, pedidos, cola y cocina. Si no se paga, no se envía.

La mesa y su visita se abren durante la activación, sin ocuparlas al generar un QR. El mesero puede recuperar un QR de origen POS con turno abierto y dentro de sus mesas autorizadas; los borradores públicos continúan privados. La API recupera el mismo identificador mediante una consulta privada después de validar los permisos, aunque RLS lo oculte del listado operativo. El flujo de efectivo del personal se conserva.

La modal web y la app solo completan un QR cuando el banco y el pedido están pagados, el pedido está activado y no quedan bloqueos ni revisión. La app muestra «Generar QR y esperar pago». No se imprimen comandas nuevas ni se notifican pedidos QR antes de la confirmación.

La migración 0141 se aplicó al Supabase de producción. La migración complementaria `0142_preserve_paid_scheduled_qr_tracking.sql` conserva el seguimiento del cliente después de pagar un pedido futuro: el bloqueo independiente de programación lo mantiene fuera de cocina, cola y visitas de mesa hasta su activación a la hora prevista. No adelanta la preparación ni la ocupación de la mesa.

Las comprobaciones automáticas incluyeron 19 pruebas SQL con las migraciones reales (la prueba POS falló antes de la corrección), 31 pruebas de API/acciones/recuperación, 20 pruebas de interfaz de la app y 7 unitarias de la app. También pasó la prueba visual web en 1440, 1024 y 390 px, TypeScript y ESLint de los archivos cambiados. Banco y respuestas de servidor se simularon en las pruebas de interfaz; no certifican un pago bancario real.

## Validación

### Descarte de cobros sin finalizar

La app ya no presenta una lista fija de «Retomar cobro QR». El cobro de mostrador se descarta al salir, previa confirmación y verificación bancaria. Las mesas pueden mantener sus cuentas. El botón de basurero abre los pendientes identificados por número, destino e importe, y permite descartar individualmente los que siguen sin pagar. El rechazo o la incertidumbre bancaria conserva el cobro para revisión; no declara que se eliminó. Los accesos de pagos completados y anulaciones confirmadas se limpian automáticamente.

`POST /api/mobile/pos/bank-qr` admite `action: discard` con los mismos permisos de sucursal, turno y asignación de mesa del resto del flujo bancario. Reutiliza `abandon_baneco_checkout` después de la anulación bancaria y tolera una respuesta perdida de una anulación ya completada. No descarta comandas operativas ni pagos recibidos. No requiere migración nueva.

Se validó el descarte con 17 pruebas de servicio/API/acciones/permisos, dos pruebas SQL sobre cancelación y carreras con pagos, y pruebas visuales de la web que conservan el QR si el banco rechaza la anulación. Las pruebas no efectúan pagos ni anulaciones bancarias reales.

38 pruebas relacionadas pasaron, incluyendo las 8 nuevas pruebas de acciones, permisos, recuperación, anulación, estado bancario y tiempos:

```sh
node --use-system-ca --test tests/pos-kitchen.test.mjs tests/baneco-order-integration.test.mjs tests/baneco-recovery-and-owner.test.mjs tests/realtime-operations.test.mjs tests/table-settlement-flow.test.mjs
```

La prueba `tests/ui/pos-kitchen.e2e.cjs` pasó con Chromium temporal y servicios simulados: escritorio 1440 px, tablet 1024 px, móvil 390 px, cambio en efectivo, recuperación después de una respuesta perdida, sonido al aceptar y ampliación del tiempo. No utiliza el banco ni una sesión real de restaurante. Requiere Playwright disponible; admite `YOPIDO_QA_PLAYWRIGHT` y `YOPIDO_QA_CHROMIUM` para instalaciones externas.

ESLint de los archivos modificados y `git diff --check` pasaron. TypeScript de la aplicación pasó con `.tmp/tsconfig.pos-kitchen.json`, que excluye las copias exportadas en `outputs/` y `output/`.

El chequeo TypeScript global sigue incluyendo archivos exportados en `outputs/hackathon/`, con imports y tipos ajenos a la aplicación principal que fallan. También se confirmaron cinco pruebas generales que ya fallan en `HEAD`: cuatro en `critical-flows.test.mjs` y una en `order-action-idempotency.test.mjs`. La comparación no modifica los archivos existentes.

## Comprobación antes de publicar

En una sucursal de prueba con caja abierta y banco piloto: crear una venta QR, verificar que cocina no la muestra antes de pagar y confirmar que aparece una sola vez después de la confirmación bancaria. Activar sonido una vez en el dispositivo de cocina. Ampliar el tiempo y comprobar el seguimiento del cliente desde otro dispositivo. La prueba visual automatizada simula audio y banco; esta comprobación cubre hardware, permisos del navegador y conectividad reales.
