# Security Fix Plan

## Prioridad 0 - Ya mitigado en esta rama/worktree

1. Eliminar mutacion publica de `restaurant_settings`.
   - Archivo: `src/app/r/actions.ts`.
   - Estado: aplicado.
   - Verificacion: `npm run security:check`, `npm run lint`, `npm run build`.

2. Validar `restaurantId` + `restaurantSlug` y pertenencia de mesa en checkout publico.
   - Archivo: `src/app/r/actions.ts`.
   - Estado: aplicado.
   - Verificacion: `npm run security:check`.

3. Agregar headers defensivos base.
   - Archivo: `next.config.ts`.
   - Estado: aplicado.
   - Verificacion: `npm run security:check`.

## Prioridad 1 - Critico / Alto pendiente

1. Migrar Storage a Cloudflare R2 publico/privado.
   - Publico: logos, banners, productos, categorias, anuncios publicos.
   - Privado: comprobantes QR, comprobantes plataforma, adjuntos soporte.
   - Entregables:
     - Abstraccion `storageProvider`.
     - Signed URLs para privados.
     - Validacion de MIME real y tamano.
     - Politicas de acceso por restaurante/rol.
   - Bloqueo actual: decision de buckets R2 pendiente por producto.

2. Reemplazar creacion publica de pedidos con RPC transaccional.
   - Crear `create_public_order(...) security definer`.
   - Validar restaurante activo, mesa, caja abierta, settings, horario, productos, variantes, opciones, totales y comprobante.
   - Insertar `orders` y `order_items` en una sola transaccion.
   - Devolver solo `order_id` y `tracking_token`.

3. Cambiar token de seguimiento fuera de query string.
   - Opcion recomendada: cookie HttpOnly/SameSite/secure con expiracion corta para seguimiento.
   - Alternativa: exchange POST para convertir token una vez en sesion de seguimiento.
   - Redactar payload publico para minimizar PII.

4. Rate limiting.
   - Login: por IP + email hash.
   - Tracking lookup: por IP + restaurantId + telefono hash.
   - Delivery actions: por IP + token hash.
   - Checkout publico: por IP + restaurantId.

## Prioridad 2 - Medio

1. CSRF hardening explicito.
   - Helper `assertSameOrigin()` en actions sensibles.
   - Configurar origenes permitidos: produccion, preview si aplica, localhost.

2. Reducir polling duplicado.
   - Realtime como principal.
   - Polling con backoff y solo cuando canal no confirme suscripcion.

3. Reducir `select("*")`.
   - Definir columnas por DTO.
   - Empezar por pedidos, perfiles, settings, inventory, support.

4. Limpiar persistencia del navegador.
   - Borrar carritos al completar pedido y ofrecer limpiar al logout.
   - Evitar notas personales extensas en localStorage.

## Prioridad 3 - Bajo / Higiene

1. Quitar logs del repo y agregar `*.log` a `.gitignore`.
2. Corregir encoding mojibake en textos.
3. Eliminar barrels `src/features/*/index.ts` si no se usan.
4. Revisar dependencia `es-abstract`.

## Checks De CI Recomendados

```bash
npm run lint
npm run typecheck
npm run security:check
npm run build
npm audit --omit=dev
```

## Verificaciones Manuales DevTools

Application:
- Cookies Supabase: confirmar `Secure`, `SameSite`, expiracion y comportamiento al logout.
- Local Storage: revisar que no haya JWT, tokens de seguimiento, NIT/CI, direccion o comprobantes.
- Cache/Service Workers: confirmar que no exista SW cacheando rutas privadas.

Network:
- Login: confirmar errores genericos y rate limit cuando se implemente.
- Checkout: modificar `restaurantId`, `restaurantSlug`, `tableId`, `tableCode`; debe fallar con `invalid-restaurant` o `invalid-table`.
- Pedido: confirmar que no se devuelven campos innecesarios.
- Delivery token: probar token invalido y expirado sin revelar detalles excesivos.

Storage:
- Intentar subir/borrar asset de otro restaurante con rol no autorizado en entorno de pruebas.
- Confirmar que comprobantes/soporte no tengan URL publica al migrar a R2.

Cookies:
- Despues de logout, usar boton Atras y refrescar rutas admin; debe redirigir a login.
- Confirmar que acciones admin no funcionen despues del logout.

