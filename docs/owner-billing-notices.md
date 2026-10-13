# Avisos de mensualidad y fechas propuestas

Implementación web en `saas-food`. No cambia la plataforma de hosting ni elimina usuarios, locales o pedidos.

## Flujo

- Recordatorio predeterminado: cinco días antes del vencimiento, configurable por superadmin. Se muestran monto, vencimiento, último día antes del corte, QR e instrucciones guardadas para la cuenta del dueño.
- Visible para dueño y miembros activos de sus locales: administrador/responsable, caja, cocina y meseros, en los paneles web correspondientes. Se revisa también cada minuto mientras la pestaña está visible.
- `/admin/pagos` permite consultar la mensualidad aun con el local suspendido. No habilita operaciones ni cambia permisos de los locales. El dueño conserva su formulario de comprobante en `/dueno/plan`.
- Todos los miembros activos pueden proponer una fecha y dejar una explicación. La solicitud pendiente no afecta el corte, la membresía ni el estado de pago.
- Superadmin revisa la propuesta en `Admin → Restaurante → Cuenta → Cobro mensual`: puede rechazarla o aprobar una fecha distinta. La fecha autorizada amplía el último día permitido del ciclo, sin reducir los días de gracia configurados.
- La prórroga aprobada pertenece al ciclo, no modifica el vencimiento de los siguientes meses ni marca el pago. Rechazar otra propuesta no elimina una prórroga anterior aún vigente.
- Al aprobar el pago, se avanza el calendario mensual con el flujo existente y desaparecen los avisos de ese ciclo. Pagar un ciclo antiguo no reactiva una cuenta cuyo ciclo actual sigue vencido.
- Reactivación por pago/prórroga limitada a locales suspendidos y sin desactivador manual. Los locales inactivos, eliminados o suspendidos manualmente no se reactivan por esta vía.
- Se conserva la regla previa: los ciclos sin pedidos no generan cobro. El aviso y la suspensión solo aplican a ciclos cobrables no pagados.

## Seguridad y fechas

- La cuenta visible se resuelve por el usuario autenticado y sus memberships activas, nunca por un owner ID proporcionado por el navegador.
- La función `resolve_owner_billing_promise` es solo para service role. Comprueba actor, vínculo al dueño, ciclo vigente y pendiente; solo un actor con rol superadmin puede aprobar/rechazar. Serializa solicitudes sobre el ciclo.
- La propuesta no puede ser anterior al día actual de Bolivia. Ni una propuesta ni un comprobante sin aprobación cuentan como pago.
- El corte respeta la gracia actual (tres días predeterminados) y la prórroga aprobada. Se suspende al día siguiente del último día permitido; no durante ese día.

## Estado de activación

Migración `0118_owner_billing_notices_and_promises.sql` aplicada el 8 de octubre de 2026 al proyecto Supabase vinculado. Añade campos de propuesta/prórroga y cambia de 4 a 5 los recordatorios que aún usaban el predeterminado, sin alterar recordatorios personalizados ni pagos/vencimientos existentes.

Falta desplegar este código web y configurar `CRON_SECRET` para el chequeo programado ya existente. Ese secreto autoriza la revisión de vencimientos; no suspende Vercel ni toda la plataforma. No se publicó el frontend ni se añadieron variables remotas en esta implementación.

La aplicación Android de caja independiente no se modificó aquí: este aviso corresponde a los paneles web de `saas-food`.

## Verificación

- TypeScript, lint de los archivos nuevos/centrales y build Next.js.
- Cuatro pruebas nuevas: inicio del aviso, pago/no cobro, fechas de gracia/prórroga, acceso de miembros suspendidos sin acceso ajeno, solicitud sin efecto de pago, aprobación exclusiva de superadmin, rechazo sin perder prórroga anterior, fechas pasadas, membresía inactiva, ciclo pagado y privilegios del RPC.
- PostgreSQL aislado con PGlite para la migración; no se crearon propuestas ni pagos de prueba en la base remota.
- Suite completa: 110 pruebas, 103 aprobadas, 5 fallidas preexistentes y 2 omitidas. No autorizar un release general ignorando esos fallos.
