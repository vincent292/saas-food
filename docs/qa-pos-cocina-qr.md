# POS, QR y cocina — revisión del 5 de noviembre de 2026

## Comportamiento implementado

- El POS conserva el catálogo y el resumen del carrito en pantalla completa. Las imágenes son más compactas; el listado del carrito se desplaza sin ocultar total y cobro.
- El botón **Cobrar** abre una modal con efectivo, QR, tarjeta y otros métodos. Los datos del cliente son opcionales. Efectivo calcula el cambio.
- QR crea una reserva pendiente con el mismo identificador de venta, muestra automáticamente el QR bancario y espera la confirmación. La recepción de dinero y la activación del pedido son estados distintos: la modal solo muestra «Pedido enviado a cocina» después de la activación real.
- Cerrar y reabrir la modal conserva el mismo cobro durante la sesión de la pantalla. Una respuesta perdida obliga a recuperar el mismo identificador y conserva el efectivo original. No se envía el pedido a cocina desde el navegador ni se ofrece una confirmación manual de pago.
- La anulación de una venta QR sin pagar verifica primero la cancelación bancaria. Un pago recibido no puede descartarse desde este flujo.
- Cocina avisa con el sonido existente cuando un pedido entra a `accepted` o `preparing`. **Activar sonido** habilita y prueba el audio en ese navegador. El reconocimiento de alertas de recepción es independiente del de cocina.
- Cocina ofrece **+5 min** y **+10 min** por pedido activo, hasta 180 minutos acumulados. El contador conserva su hora de inicio. Los cambios actualizan el estimado del seguimiento del cliente y quedan auditados. Se rechazan cambios concurrentes con un valor anterior.

No se requieren migraciones nuevas: se reutilizan las columnas ETA de `0101_order_eta_adjustments.sql` y el flujo bancario existente. Los cambios se realizaron en el repositorio local; no se desplegó ni se hizo un cobro real.

## Validación

38 pruebas relacionadas pasaron, incluyendo las 8 nuevas pruebas de acciones, permisos, recuperación, anulación, estado bancario y tiempos:

```sh
node --use-system-ca --test tests/pos-kitchen.test.mjs tests/baneco-order-integration.test.mjs tests/baneco-recovery-and-owner.test.mjs tests/realtime-operations.test.mjs tests/table-settlement-flow.test.mjs
```

La prueba `tests/ui/pos-kitchen.e2e.cjs` pasó con Chromium temporal y servicios simulados: escritorio 1440 px, tablet 1024 px, móvil 390 px, cambio en efectivo, recuperación después de una respuesta perdida, sonido al aceptar y ampliación del tiempo. No utiliza el banco ni una sesión real de restaurante. Requiere Playwright disponible; admite `YOPIDO_QA_PLAYWRIGHT` y `YOPIDO_QA_CHROMIUM` para instalaciones externas.

ESLint de los archivos modificados y `git diff --check` pasaron. TypeScript de la aplicación pasó con `.tmp/tsconfig.pos-kitchen.json`, que excluye las copias exportadas en `outputs/` y `output/`.

El chequeo TypeScript global sigue incluyendo archivos exportados en `outputs/hackathon/`, con imports y tipos ajenos a la aplicación principal que fallan. También se confirmaron cinco pruebas generales que ya fallan en `HEAD`: cuatro en `critical-flows.test.mjs` y una en `order-action-idempotency.test.mjs`. La comparación no modifica los archivos existentes.

## Comprobación antes de publicar

En una sucursal de prueba con caja abierta y banco piloto: crear una venta QR, verificar que cocina no la muestra antes de pagar y confirmar que aparece una sola vez después de la confirmación bancaria. Activar sonido una vez en el dispositivo de cocina. Ampliar el tiempo y comprobar el seguimiento del cliente desde otro dispositivo. La prueba visual automatizada simula audio y banco; esta comprobación cubre hardware, permisos del navegador y conectividad reales.
