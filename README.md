# Restaurant SaaS

Plataforma SaaS white-label para restaurantes. El proyecto está orientado a datos reales en Supabase: restaurantes, categorías, productos, mesas, pedidos, planes y módulos se guardan en PostgreSQL. En producción, los archivos se guardan en Cloudflare R2.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth, SSR y PostgreSQL
- Cloudflare R2 para archivos publicos y privados
- lucide-react, zod, clsx, tailwind-merge

## Variables de entorno

Copia `.env.example` a `.env` o `.env.local` y completa:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_PASSWORD=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PUBLIC_BUCKET=yopido-public
R2_PRIVATE_BUCKET=yopido-private
R2_PUBLIC_URL=https://assets.tu-dominio.com
```

`SUPABASE_DB_PASSWORD` es la contraseña de PostgreSQL y la usa el CLI para `supabase db push`; no es la anon key ni la publishable key.

### Buckets R2

- Publico: logos, banners, fondos del menu, imagenes de productos, categorias, comunicados y QRs de cobro que deben cargar en paginas publicas.
- Privado: comprobantes de pedidos, comprobantes de pagos de duenos/plataforma/sucursales y adjuntos de soporte.

El bucket publico debe tener dominio publico en `R2_PUBLIC_URL`. El bucket privado no debe exponerse; la app genera enlaces firmados desde `/api/storage/private/...` para usuarios autenticados.

## Comandos

```bash
npm install
npm run dev
npm run lint
npm run build
```

## Rutas principales

- `/`
- `/admin/login`
- `/admin`
- `/admin/restaurantes`
- `/admin/restaurantes/nuevo`
- `/admin/restaurantes/[restaurantId]/dashboard`
- `/admin/restaurantes/[restaurantId]/productos`
- `/admin/restaurantes/[restaurantId]/categorias`
- `/admin/restaurantes/[restaurantId]/mesas`
- `/admin/restaurantes/[restaurantId]/pedidos`
- `/admin/restaurantes/[restaurantId]/caja`
- `/admin/restaurantes/[restaurantId]/inventario`
- `/admin/restaurantes/[restaurantId]/configuracion`
- `/[restaurantSlug]`
- `/[restaurantSlug]/checkout`
- `/[restaurantSlug]/mesa/[tableCode]`
- `/[restaurantSlug]/pedido/[orderId]?token=[trackingToken]`
- `/r/[restaurantSlug]` (compatibilidad con links anteriores)
- `/cocina/[restaurantSlug]`
- `/caja/[restaurantSlug]`

## Base de datos

Las migraciones están en `supabase/migrations`:

- `0001_initial_restaurant_saas.sql`: tablas core multi-tenant, RLS, pedidos, caja e inventario.
- `0002_subscription_plans.sql`: planes Básico, Pro y Premium, módulos por plan y suscripciones.
- `0003_public_order_tracking.sql`: RPC segura para tracking público con token.
- `0004_storage_restaurant_assets.sql`: bucket publico `restaurant-assets` y policies de Storage para compatibilidad local si R2 no esta configurado.

Aplicar migraciones:

```powershell
$line = Get-Content .env | Where-Object { $_ -match '^\s*SUPABASE_DB_PASSWORD=' } | Select-Object -First 1
$env:SUPABASE_DB_PASSWORD = (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
npx supabase db push
```

## Primer superadmin

1. Crea un usuario en Supabase Auth.
2. Inserta su perfil:

```sql
insert into profiles (id, full_name, email, global_role)
values ('AUTH_USER_UUID', 'Superadmin', 'admin@tu-dominio.com', 'superadmin');
```

## Flujo real de prueba

1. Entra a `/admin/login`.
2. Inicia sesión con el usuario superadmin.
3. Crea un restaurante en `/admin/restaurantes/nuevo`.
4. Sube logo y banner; en produccion se guardan en R2 publico.
5. Crea categorías en `/admin/restaurantes/[restaurantId]/categorias`.
6. Crea productos con imagen en `/admin/restaurantes/[restaurantId]/productos`.
7. Crea mesas en `/admin/restaurantes/[restaurantId]/mesas`.
8. Abre `/[restaurantSlug]`, agrega productos al carrito y confirma en checkout.
9. Revisa pedidos en `/admin/restaurantes/[restaurantId]/pedidos`.
10. Gestiona cocina en `/cocina/[restaurantSlug]`.

## Estado actual

No hay datos ficticios en runtime. Si Supabase no tiene datos, la UI muestra listas vacías o estados vacíos. Las fases siguientes deben mantener esta regla: todo dato operativo debe almacenarse en Supabase y pertenecer a un `restaurant_id`.
