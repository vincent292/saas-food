import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const master='11111111-1111-4111-8111-111111111111', rider='22222222-2222-4222-8222-222222222222', user='33333333-3333-4333-8333-333333333333', other='44444444-4444-4444-8444-444444444444';
async function fixture() {
  const db=new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create function generate_delivery_confirmation_code() returns text language sql volatile as $$select lpad(floor(random()*10000)::integer::text,4,'0')$$;
    create table multisite_orders(id uuid primary key,status text,tracking_token text,delivery_fee numeric,subtotal numeric,total numeric,rider_fee_minimum numeric,rider_fee_maximum numeric);
    create table multisite_rider_offers(id uuid primary key default gen_random_uuid(),multisite_order_id uuid,restaurant_rider_id uuid,rider_user_id uuid,status text,offered_fee numeric,counter_fee numeric,expires_at timestamptz,responded_at timestamptz,response_reason text);
    create table restaurant_riders(id uuid primary key,rider_user_id uuid,status text,membership_valid_until date);
    create table orders(id uuid primary key default gen_random_uuid(),status text,delivered_at timestamptz,payment_status text default 'pending');
    create table multisite_order_children(id uuid primary key default gen_random_uuid(),multisite_order_id uuid,order_id uuid,pickup_position integer,status text);
    create table multisite_delivery_dispatches(id uuid primary key default gen_random_uuid(),multisite_order_id uuid,rider_offer_id uuid,rider_user_id uuid,restaurant_rider_id uuid,accepted_fee numeric,status text,arrived_at timestamptz,delivered_at timestamptz);
    grant select on multisite_delivery_dispatches to authenticated;
    create table order_delivery_links(id uuid default gen_random_uuid(),order_id uuid,restaurant_rider_id uuid,status text,expires_at timestamptz);
    create table rider_delivery_offers(id uuid default gen_random_uuid(),order_id uuid);
    insert into multisite_orders values ('${master}','rider_searching','${'a'.repeat(32)}',10,100,110,7,15);
    insert into restaurant_riders values ('${rider}','${user}','active',current_date+30);
    with o as(insert into orders(status) values('ready'),('ready') returning id) insert into multisite_order_children(multisite_order_id,order_id,pickup_position,status) select '${master}',id,row_number()over(),'ready' from o;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/0116_multisite_customer_fee.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/0117_multisite_delivery_lifecycle.sql',import.meta.url),'utf8'));
  const offer=(await db.query("insert into multisite_rider_offers(multisite_order_id,restaurant_rider_id,rider_user_id,status,offered_fee,expires_at)values($1,$2,$3,'pending',10,now()+interval '15 seconds')returning id",[master,rider,user])).rows[0].id;
  await db.query("insert into multisite_delivery_dispatches(multisite_order_id,rider_offer_id,rider_user_id,restaurant_rider_id,accepted_fee,status)values($1,$2,$3,$4,10,'active')",[master,offer,user,rider]);
  await db.query("update multisite_orders set status='rider_assigned' where id=$1",[master]);
  const pickups=(await db.query('select * from multisite_order_children order by pickup_position')).rows;
  const dispatch=(await db.query('select * from multisite_delivery_dispatches')).rows[0];
  const advance=async(action,child=null,code=dispatch.delivery_confirmation_code,who=user)=>(await db.query('select advance_multisite_delivery($1,$2,$3,$4,$5) as result',[master,who,action,child,code])).rows[0].result;
  return {db,pickups,dispatch,advance};
}

test('ordered pickups, final customer code and idempotent completion keep payments unchanged',async()=>{
  const {db,pickups,dispatch,advance}=await fixture();
  try {
    assert.equal((await advance('delivered')).error,'multisite-pickups-incomplete');
    assert.equal((await advance('pickup',pickups[1].id,pickups[1].pickup_confirmation_code)).error,'multisite-pickup-out-of-order');
    assert.deepEqual(await advance('pickup',pickups[0].id,pickups[0].pickup_confirmation_code),{ok:true,status:'rider_assigned',changed:true});
    assert.equal((await advance('pickup',pickups[0].id,pickups[0].pickup_confirmation_code)).changed,false);
    assert.equal((await advance('pickup',pickups[1].id,pickups[1].pickup_confirmation_code)).status,'in_delivery');
    assert.equal((await db.query('select status from multisite_delivery_dispatches')).rows[0].status,'arrived');
    assert.equal((await advance('delivered')).status,'delivered');
    assert.equal((await advance('delivered')).changed,false);
    assert.equal((await db.query('select status from multisite_orders')).rows[0].status,'delivered');
    assert.ok((await db.query('select * from orders')).rows.every(order=>order.status==='delivered'&&order.delivered_at&&order.payment_status==='pending'));
    assert.ok(pickups.every(pickup=>pickup.pickup_confirmation_code!==dispatch.delivery_confirmation_code));
  } finally {await db.close();}
});

test('foreign riders, inactive membership, unready pickups and cancelled routes cannot advance',async()=>{
  const {db,pickups,advance}=await fixture(); const p=pickups[0];
  try {
    assert.equal((await advance('pickup',p.id,p.pickup_confirmation_code,other)).error,'multisite-dispatch-not-found');
    await db.exec("update restaurant_riders set status='suspended'");
    assert.equal((await advance('pickup',p.id,p.pickup_confirmation_code)).error,'rider-membership-inactive');
    await db.exec("update restaurant_riders set status='active'; update orders set status='preparing'");
    assert.equal((await advance('pickup',p.id,p.pickup_confirmation_code)).error,'multisite-pickup-not-ready');
    await db.exec("update orders set status='ready'; update multisite_order_children set status='cancelled' where pickup_position=2");
    assert.equal((await advance('pickup',p.id,p.pickup_confirmation_code)).error,'multisite-route-needs-review');
    assert.equal((await db.query('select count(*) from multisite_order_children where picked_up_at is not null')).rows[0].count,0);
  } finally {await db.close();}
});

test('invalid-code attempts persist and lock after five; only service role can call RPC',async()=>{
  const {db,pickups,advance}=await fixture(); const p=pickups[0], wrong=p.pickup_confirmation_code==='0000'?'9999':'0000';
  try {
    for(let i=0;i<5;i++) assert.equal((await advance('pickup',p.id,wrong)).error,'invalid-confirmation-code');
    assert.equal((await db.query('select pickup_code_attempts from multisite_order_children where id=$1',[p.id])).rows[0].pickup_code_attempts,5);
    assert.equal((await advance('pickup',p.id,p.pickup_confirmation_code)).error,'confirmation-code-locked');
    for(const role of ['anon','authenticated']) assert.equal((await db.query("select has_function_privilege($1,'advance_multisite_delivery(uuid,uuid,text,uuid,text)','execute') as allowed",[role])).rows[0].allowed,false);
    assert.equal((await db.query("select has_column_privilege('authenticated','multisite_delivery_dispatches','delivery_confirmation_code','select') as allowed")).rows[0].allowed,false);
    assert.equal((await db.query("select has_column_privilege('authenticated','multisite_delivery_dispatches','status','select') as allowed")).rows[0].allowed,true);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select delivery_confirmation_code from multisite_delivery_dispatches'),/permission denied/);
    await db.query('select status from multisite_delivery_dispatches');
    await db.exec('reset role');
  } finally {await db.close();}
});

test('multi-local children cannot be dispatched or offered as separate deliveries',async()=>{
  const {db,pickups}=await fixture();
  try {
    for(const table of ['order_delivery_links','rider_delivery_offers']) await assert.rejects(db.query(`insert into ${table}(order_id)values($1)`,[pickups[0].order_id]),/multisite-route-dispatch-required/);
    const ordinary=(await db.query("insert into orders(status)values('ready')returning id")).rows[0].id;
    await db.query('insert into order_delivery_links(order_id)values($1)',[ordinary]);
  } finally {await db.close();}
});

test('one rider cannot accept simultaneous ordinary and multi-local routes',async()=>{
  const {db}=await fixture();
  try {
    const ordinary=(await db.query("insert into orders(status)values('ready')returning id")).rows[0].id;
    await assert.rejects(db.query("insert into order_delivery_links(order_id,restaurant_rider_id,status,expires_at)values($1,$2,'active',now()+interval '1 hour')",[ordinary,rider]),/rider-busy/);
    await db.exec("update multisite_delivery_dispatches set status='delivered'");
    await db.query("insert into order_delivery_links(order_id,restaurant_rider_id,status,expires_at)values($1,$2,'active',now()+interval '1 hour')",[ordinary,rider]);
    await assert.rejects(db.query("insert into multisite_delivery_dispatches(multisite_order_id,rider_user_id,restaurant_rider_id,status)values($1,$2,$3,'active')",[master,user,rider]),/rider-busy/);
  } finally {await db.close();}
});
