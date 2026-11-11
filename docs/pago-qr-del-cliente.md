# Pago QR del cliente

La pantalla muestra tres pasos: QR listo, pago confirmado y pedido enviado. La espera informa que puede abrir su banco y volver a la misma página; el pedido se envía automáticamente después de la verificación bancaria. Los pagos recibidos que aún se están aplicando muestran una confirmación en curso. Los casos que requieren revisión y los QR vencidos tienen mensajes propios.

«Ya pagué · Verificar pago» ejecuta una consulta autenticada por el enlace del pedido. Usa las mismas reservas, exclusión y pausas de reconciliación que el proceso automático; no genera otro QR, no anula el vigente ni acepta una declaración de pago del navegador. La recepción del pago se devuelve antes de continuar la activación y los avisos en segundo plano, para que el cliente vea la confirmación sin esperar a esos envíos. Una comprobación reciente o en curso puede devolver el estado existente, y la interfaz informa que seguirá verificando. La ruta de generación anterior sigue siendo compatible.

El panel mantiene una sola consulta periódica, reanuda al regresar a la página o recuperar internet y conserva los estados de pago confirmado ante respuestas antiguas. El cambio de estado no vuelve a montar el formulario. El mismo panel conserva la generación y verificación autenticadas para caja.

Validación: pruebas con PostgreSQL de comprobación bancaria, importe incorrecto, exclusión y cobro único; pruebas de autorización, límites y estados del cliente; revisión en 320, 390 y 1280 px, incluyendo espera, error, recepción, seguimiento, QR inicial, vencimiento y revisión. Se usaron respuestas ficticias; no se generaron QR bancarios ni pagos reales durante las pruebas.
