# Pruebas de carga de pedidos multi-locales y cola virtual

## Ejecutar sin afectar restaurantes

```sh
npm run test:stress:multisite
STRESS_ORDERS=1000 STRESS_CONCURRENCY=50 npm run test:stress:multisite
node --test tests/multisite-stress.test.mjs tests/multisite-planner.test.mjs tests/multisite-delivery-lifecycle.test.mjs
```

El script utiliza PostgreSQL embebido PGlite en memoria. No carga `.env`, no conecta con Supabase, no envía WhatsApp ni pedidos reales. Se destruye la base al terminar. Permite de 10 a 2000 pedidos y de 1 a 100 llamadas concurrentes. La concurrencia son promesas en una única conexión; **no reproduce múltiples conexiones PostgreSQL ni mide la capacidad de producción**.

Carga el planificador y el pronóstico TypeScript reales, la migración SQL 0112 y sus reemplazos posteriores de la RPC de creación, y la RPC de cola 0025. El esquema de dependencias y las funciones de identidad/permisos son fixtures mínimos: esto no sustituye las pruebas de RLS, autenticación o la cadena completa de migraciones.

## Resultado local del 12 de octubre de 2026

- 1000 pedidos maestros / 2500 hijos entre tres locales ficticios, alternando compras de dos y tres locales.
- Lotes de 50 llamadas; sin duplicados tras 60 reintentos.
- Rollback completo al invalidar el último hijo; se conserva el número de maestros e hijos.
- Caja cerrada y total inconsistente rechazados.
- Un ganador entre solicitudes simultáneas del bloqueo condicional de envío grupal.
- Cola saturada: 1000 activos / 999 por delante. Tras cancelar los anteriores: 1 activo / 0 por delante.
- Pedidos viejos de más de 12 horas no cuentan en la RPC pública; al pasar a listo el ETA es cero.
- Token de seguimiento incorrecto no revela la cola.
- 13 pruebas específicas pasaron, incluyendo el ciclo de entrega y el planificador existentes.

La carga medida tardó 1,78 s en esta máquina, p50 37 ms / p95 75 ms de llamada SQL incluyendo espera en la conexión local. **No extrapolar estos valores a usuarios/segundo de producción.**

## Fallo detectado y corrección

La creación fallaba con `column reference "id" is ambiguous`: las columnas de salida de la función PL/pgSQL coincidían con las referencias no calificadas de las tablas. La migración `0119_multisite_creation_retry_guard.sql` califica esas referencias y añade un bloqueo transaccional por `public_request_id` antes de comprobar reintentos.

La nueva migración está probada localmente, **no aplicada a Supabase en esta tarea**. El bloqueo entre conexiones debe verificarse en PostgreSQL de staging antes del piloto.

## Límites y próximos pasos del piloto

1. Preparar una base y restaurantes de staging con productos, caja abierta, horarios y riders de prueba; no dirigir la carga a comercios reales.
2. Aplicar las migraciones y probar el bloqueo con conexiones independientes: misma solicitud simultánea debe devolver el mismo maestro; solicitudes distintas no deben bloquearse entre sí.
3. Prueba web/Android del grupo completo: crear/unirse, varios participantes agregando productos, bloquear, enviar y recuperar ante error. Aquí se prueba el SQL del bloqueo y la creación compartida, **no la acción HTTP grupal completa, comprobantes ni revisión de pagos**.
4. Carga HTTP progresiva: 10 → 25 → 50 usuarios, medir errores, p95, bloqueos, conexiones y consumo; detener si hay errores o degradación sostenida. Establecer límites de aprobación antes de empezar.
5. Simular cocinas preparando/liberando pedidos y rider recogiendo/entregando; verificar que los cambios se reflejen en teléfonos y paneles.

Alertas para revisar antes de prometer tiempos:

- La RPC de cola limita los tiempos visibles a `max_estimate_minutes` (75 por defecto). Con 1000 pendientes sigue mostrando 75: debe distinguirse saturación de una promesa de entrega.
- El pronóstico previo multi-local y la RPC pública de cola son estimaciones distintas; no tienen por qué coincidir. Las consultas actuales del pronóstico previo no excluyen tickets antiguos como la RPC de cola y deben revisarse.
- Los lotes que consultan la cola antes de insertar pueden ver el mismo estado: no hay reserva de capacidad de cocina ni replanteamiento automático probado bajo múltiples conexiones.
- El SDK/PostgREST puede paginar/truncar consultas de filas; esta carga local no valida ese comportamiento.

No se han publicado cambios ni modificado pedidos, pagos o restaurantes de producción.
