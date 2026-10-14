// Offline integration stress test. Never loads .env or connects to Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
function load(path, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require: name => {
    assert.ok(name in dependencies, `Unexpected import: ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const geo = load('src/lib/utils/geo-distance.ts');
const { planMultisiteGroupOrder } = load('src/lib/group-orders/multisite-planner.ts', { '@/lib/utils/geo-distance': geo });
const { forecastMultisiteKitchenReadyIn } = load('src/lib/group-orders/kitchen-forecast.ts');
const count = Number(process.env.STRESS_ORDERS ?? 200);
const concurrency = Number(process.env.STRESS_CONCURRENCY ?? 20);
assert.ok(Number.isInteger(count) && count >= 10 && count <= 2000, 'STRESS_ORDERS: 10..2000');
assert.ok(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 100, 'STRESS_CONCURRENCY: 1..100');
const db = new PGlite();
const restaurants = Array.from({ length: 3 }, (_, i) => ({
  id: randomUUID(), productId: randomUUID(), name: ['Carnes', 'Pizza', 'Hamburguesas'][i],
  location: { latitude: -17.38 + i * 0.003, longitude: -66.16 }, prep: [35, 20, 12][i],
}));
const timings = [], requests = [];
async function create(requestId, order, children) {
  return (await db.query('select * from create_public_multisite_order_transaction($1,$2,$3)',
    [requestId, JSON.stringify(order), JSON.stringify(children)])).rows[0];
}
try {
  console.log('Preparando base aislada...');
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.role() returns text language sql as $$select 'service_role'::text$$;
    create type app_role as enum ('restaurant_admin','cashier','kitchen','waiter');
    create type payment_method_type as enum ('cash','qr');
    create type order_status as enum ('pending','accepted','preparing','ready','delivered','cancelled');
    create function is_superadmin() returns boolean language sql as $$select true$$;
    create function has_restaurant_role(uuid,app_role[]) returns boolean language sql as $$select true$$;
    create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
    create table restaurants(id uuid primary key,status text,deleted_at timestamptz);
    create table restaurant_settings(restaurant_id uuid,delivery_enabled boolean);
    create table cash_sessions(restaurant_id uuid,status text);
    create table products(id uuid primary key,restaurant_id uuid,is_available boolean);
    create table orders(
      id uuid primary key default gen_random_uuid(), restaurant_id uuid references restaurants(id),
      order_number text, public_request_id uuid, tracking_token text default md5(gen_random_uuid()::text),
      customer_name text,customer_phone text,customer_email text,customer_address text,
      delivery_address_detail text,delivery_latitude numeric,delivery_longitude numeric,delivery_maps_url text,
      delivery_distance_km numeric,requested_fulfillment_at timestamptz,order_type text,order_origin text,
      status order_status,payment_status text,payment_method payment_method_type,
      subtotal numeric,delivery_fee numeric,discount_total numeric,total numeric,notes text,
      created_at timestamptz default clock_timestamp(),accepted_at timestamptz,ready_at timestamptz
    );
    create table order_items(order_id uuid references orders(id),product_id uuid,product_name text,
      variant_id uuid,option_ids uuid[],unit_price numeric,quantity integer,subtotal numeric,notes text);
    create table group_order_sessions(id uuid primary key,status text,submitted_order_id uuid,
      submitted_multisite_order_id uuid,public_request_id uuid);
  `);
  await db.exec(read('supabase/migrations/0112_public_multisite_orders.sql'));
  // Install actual queue tables/indexes and latest queue RPC; omit unrelated RLS setup.
  await db.exec(read('supabase/migrations/0023_virtual_order_queue.sql').split('drop trigger if exists restaurant_queue_settings_updated_at')[0]);
  await db.exec(read('supabase/migrations/0025_queue_ignores_stale_active_orders.sql'));
  // Apply later replacements of the creation RPC, if present, in migration order.
  const { readdirSync } = await import('node:fs');
  for (const file of readdirSync(new URL('supabase/migrations/', root)).sort().filter(file => file > '0112_public_multisite_orders.sql')) {
    const sql = read(`supabase/migrations/${file}`);
    const replacement = sql.match(/create or replace function create_public_multisite_order_transaction\([\s\S]*?\$\$;/i);
    if (replacement) await db.exec(replacement[0]);
  }
  for (const r of restaurants) {
    await db.query('insert into restaurants values($1,\'active\',null)', [r.id]);
    await db.query('insert into restaurant_settings values($1,true)', [r.id]);
    await db.query('insert into cash_sessions values($1,\'open\')', [r.id]);
    await db.query('insert into products values($1,$2,true)', [r.productId, r.id]);
    await db.query('insert into restaurant_queue_settings(restaurant_id,base_prep_minutes,kitchen_capacity,weekend_multiplier) values($1,$2,3,1)', [r.id, r.prep]);
  }
  const started = performance.now();
  console.log(`Creando ${count} pedidos en lotes de ${concurrency}...`);
  for (let offset = 0; offset < count; offset += concurrency) {
    await Promise.all(Array.from({ length: Math.min(concurrency, count - offset) }, async (_, j) => {
      const n = offset + j;
      const snapshot = (await db.query(`select restaurant_id,count(*)::int as active,
        count(*) filter(where status='preparing')::int as preparing from orders
        where status in ('pending','accepted','preparing') group by restaurant_id`)).rows;
      const candidates = restaurants.slice(0, n % 2 ? 3 : 2).map(r => {
        const queue = snapshot.find(row => row.restaurant_id === r.id);
        const forecast = forecastMultisiteKitchenReadyIn({ queueEnabled: true, basePrepMinutes: r.prep,
          kitchenCapacity: 3, activeOrders: queue?.active ?? 0, preparingOrders: queue?.preparing ?? 0,
          recentOrders: queue?.active ?? 0 }, r.prep);
        return { ...r, prepTimeMinutes: r.prep, queueDelayMinutes: forecast.queueDelayMinutes };
      });
      const plan = planMultisiteGroupOrder({ destination: { latitude: -17.39, longitude: -66.16 },
        candidates, maxRouteKm: 20, radiusKm: 5 });
      assert.equal(plan.feasible, true);
      assert.ok(plan.stops.every(stop => stop.orderReleaseDelayMinutes >= 0 && stop.foodWaitMinutes <= 1));
      const children = plan.stops.map((stop, i) => ({ restaurant_id: stop.id, order_number: `STRESS-${n}-${i}`,
        pickup_position: i + 1, subtotal: 20, release_delay_minutes: stop.orderReleaseDelayMinutes,
        estimated_ready_minutes: stop.estimatedReadyInMinutes,
        items: [{ product_id: stop.productId, product_name: stop.name, quantity: 2, unit_price: 10, subtotal: 20 }] }));
      const subtotal = children.length * 20;
      const order = { customer_name: 'Prueba aislada', customer_address: 'Destino ficticio',
        delivery_latitude: -17.39, delivery_longitude: -66.16, payment_method: 'cash',
        subtotal, delivery_fee: plan.deliveryFee, total: subtotal + plan.deliveryFee, route_plan: plan };
      const requestId = randomUUID();
      const before = performance.now();
      const created = await create(requestId, order, children);
      timings.push(performance.now() - before);
      requests.push({ requestId, order, children, created });
    }));
  }
  // Repeated requests must return the same master, without inserting more children.
  await Promise.all(requests.slice(0, 20).flatMap(req => Array.from({ length: 3 }, async () => {
    assert.equal((await create(req.requestId, req.order, req.children)).id, req.created.id);
  })));
  const totals = (await db.query(`select (select count(*)::int from multisite_orders) masters,
    (select count(*)::int from orders) children,(select count(*)::int from order_items) items`)).rows[0];
  assert.equal(totals.masters, count);
  assert.equal(totals.children, requests.reduce((sum, req) => sum + req.children.length, 0));
  assert.equal(totals.items, totals.children);
  // Invalid last child must roll back parent and earlier child inserts.
  const sample = requests[0];
  const invalid = structuredClone(sample.children);
  invalid.at(-1).items[0].product_id = randomUUID();
  await assert.rejects(create(randomUUID(), sample.order, invalid), /invalid-multisite-items/);
  assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n, totals.children);
  assert.equal((await db.query('select count(*)::int n from multisite_orders')).rows[0].n, count);
  await db.query("update cash_sessions set status='closed' where restaurant_id=$1", [sample.children.at(-1).restaurant_id]);
  await assert.rejects(create(randomUUID(), sample.order, sample.children), /no-open-cash/);
  await db.exec("update cash_sessions set status='open'");
  await assert.rejects(create(randomUUID(), { ...sample.order, total: sample.order.total + 1 }, sample.children), /invalid-multisite-total/);
  // Model the exact conditional submission claim used by the group action.
  const sessionId = randomUUID();
  await db.query("insert into group_order_sessions(id,status)values($1,'locked')", [sessionId]);
  const claims = await Promise.all(Array.from({ length: concurrency }, () => db.query(`update group_order_sessions
    set status='submitting' where id=$1 and status='locked'
    and submitted_order_id is null and submitted_multisite_order_id is null returning id`, [sessionId])));
  assert.equal(claims.filter(result => result.rows.length).length, 1);
  await db.query("update group_order_sessions set status='submitted',submitted_multisite_order_id=$2 where id=$1", [sessionId, sample.created.id]);
  const last = (await db.query('select id,tracking_token from orders where restaurant_id=$1 order by created_at desc limit 1', [restaurants[0].id])).rows[0];
  const queue = (await db.query('select get_public_order_queue_state($1,$2) result', [last.id, last.tracking_token])).rows[0].result;
  assert.equal(queue.active_orders, count);
  assert.equal(queue.demand_level, 'busy');
  assert.ok(queue.orders_ahead > 0);
  assert.equal((await db.query('select get_public_order_queue_state($1,$2) result', [last.id, 'wrong-token'])).rows[0].result, null);
  await db.query("update orders set status='cancelled' where restaurant_id=$1 and id<>$2", [restaurants[0].id, last.id]);
  const cleared = (await db.query('select get_public_order_queue_state($1,$2) result', [last.id, last.tracking_token])).rows[0].result;
  assert.equal(cleared.active_orders, 1);
  assert.equal(cleared.orders_ahead, 0);
  assert.ok(cleared.estimated_max_minutes <= queue.estimated_max_minutes);
  // Old unresolved tickets must not occupy the public virtual queue indefinitely.
  await db.query("insert into orders(restaurant_id,status,created_at)values($1,'pending',now()-interval '13 hours')", [restaurants[0].id]);
  const withoutStale = (await db.query('select get_public_order_queue_state($1,$2) result', [last.id, last.tracking_token])).rows[0].result;
  assert.equal(withoutStale.active_orders, 1);
  assert.equal(withoutStale.orders_ahead, 0);
  await db.query("update orders set status='ready' where id=$1", [last.id]);
  const ready = (await db.query('select get_public_order_queue_state($1,$2) result', [last.id, last.tracking_token])).rows[0].result;
  assert.equal(ready.estimated_max_minutes, 0);
  assert.equal(ready.active_orders, 0);
  timings.sort((a, b) => a - b);
  console.log(JSON.stringify({ result: 'PASS', engine: 'PGlite isolated / single connection, not server load',
    masters: count, childOrders: totals.children, concurrentCallers: concurrency,
    elapsedSeconds: Number(((performance.now() - started) / 1000).toFixed(2)),
    creationLatencyMs: { p50: Math.round(timings[Math.floor(timings.length * .5)]), p95: Math.round(timings[Math.floor(timings.length * .95)]) },
    saturatedQueue: { active: queue.active_orders, ahead: queue.orders_ahead, maxMinutes: queue.estimated_max_minutes },
    clearedQueue: { active: cleared.active_orders, ahead: cleared.orders_ahead, maxMinutes: cleared.estimated_max_minutes },
    checks: ['real SQL creation', '2/3 stores', 'queue-aware planner', 'retry deduplication', 'atomic rollback',
      'group claim: one winner', 'closed cash rejected', 'wrong total rejected',
      'queue saturation/drain', 'stale ticket excluded', 'ready ticket ETA zero', 'tracking token isolation'],
  }, null, 2));
} catch (error) {
  console.error('FAIL:', error.message);
  process.exitCode = 1;
} finally { await db.close(); }
