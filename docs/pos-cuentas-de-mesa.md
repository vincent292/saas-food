# Cuentas de mesa y llamados

La cuenta corresponde a una visita abierta (`table_visits`), no al estado de cocina. Los pedidos entregados siguen formando parte del consumo hasta que caja cierre esa visita. Se muestran sus productos, autor, pagos confirmados y saldo; las visitas anteriores y los pedidos cancelados no se suman.

Web y POS usan `close_table_account` con el identificador de la visita mostrada. El cierre bloquea la visita, cobra únicamente el saldo y libera la mesa en una transacción. Repetir el cierre no vuelve a cobrar ni cierra una visita posterior. Los QR requieren confirmación bancaria; los comprobantes no sustituyen al banco. También se puede cobrar por QR una comanda de personal que ya fue entregada, conservando su estado de cocina.

El cliente del QR de mesa solo puede pagar mediante QR bancario. Una solicitud sin pagar se mantiene fuera de cocina y del consumo activo. «Llamar al mesero» está disponible en el menú, la revisión y el pago. El primer mesero con un pedido auditado en la visita tiene prioridad sobre ayudantes posteriores o la asignación estática de la mesa. Sin ese historial se usa la asignación de mesa; caja conserva la atención de respaldo. La asignación usa auditorías autenticadas, nunca las notas del cliente.

La bandeja de llamadas es persistente. La app emite una alerta mientras está abierta y abre esa bandeja al tocar la notificación. Las notificaciones con la app cerrada dependen de las credenciales push de cada plataforma: Firebase/EAS en Android y una firma con APNs en iOS. Una instalación iOS con Personal Team sin APNs no permite validar ese envío remoto.

Validación: pruebas de PostgreSQL para saldo entregado, cobros repetidos, nueva visita, QR verificado y primer mesero; pruebas de API y autoría; modal web y POS en 320, 390 y 1280 px. Las pruebas usan datos ficticios y no cobran pedidos reales.
