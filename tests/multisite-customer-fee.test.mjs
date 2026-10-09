import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const orderId = '11111111-1111-4111-8111-111111111111';
const riderId = '22222222-2222-4222-8222-222222222222';
const token = 'a'.repeat(32);

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table multisite_orders (id uuid primary key,tracking_token text,status text,delivery_fee numeric,subtotal numeric,total numeric,rider_fee_minimum numeric,rider_fee_maximum numeric);
    create table multisite_rider_offers (id uuid primary key default gen_random_uuid(),multisite_order_id uuid,restaurant_rider_id uuid,rider_user_id uuid,status text,offered_fee numeric,counter_fee numeric,expires_at timestamptz,responded_at timestamptz,response_reason text);
    create table multisite_delivery_dispatches (id uuid primary key default gen_random_uuid(),multisite_order_id uuid unique,rider_offer_id uuid,restaurant_rider_id uuid,rider_user_id uuid,accepted_fee numeric,status text);
    insert into multisite_orders values ('${orderId}','${token}','rider_searching',10,100,110,7,15);
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/0116_multisite_customer_fee.sql', import.meta.url), 'utf8'));
  const change = (price, trackingToken = token) => db.query('select update_multisite_customer_fee($1,$2,$3)', [orderId, trackingToken, price]);
  const offer = async (fee = 10) => (await db.query(`insert into multisite_rider_offers (multisite_order_id,restaurant_rider_id,status,offered_fee,expires_at) values ($1,$2,'pending',$3,now()+interval '15 seconds') returning id`, [orderId,riderId,fee])).rows[0].id;
  const accept = (offerId, fee) => db.query(`insert into multisite_delivery_dispatches (multisite_order_id,rider_offer_id,restaurant_rider_id,accepted_fee,status) values ($1,$2,$3,$4,'active')`, [orderId,offerId,riderId,fee]);
  return { db, change, offer, accept };
}

test('changing price updates total atomically and invalidates the old rider offer', async () => {
  const { db, change, offer, accept } = await fixture();
  try {
    const old = await offer();
    await change(12);
    const row = (await db.query('select * from multisite_orders')).rows[0];
    assert.equal(Number(row.delivery_fee),12); assert.equal(Number(row.total),112);
    assert.equal((await db.query('select status from multisite_rider_offers')).rows[0].status,'cancelled');
    await assert.rejects(accept(old,10), /not-available/);
    await assert.rejects(offer(10), /price-stale/);
    await accept(await offer(12),12);
    await assert.rejects(change(13), /fee-locked/);
    assert.equal(Number((await db.query('select delivery_fee from multisite_orders')).rows[0].delivery_fee),12);
  } finally { await db.close(); }
});

test('unauthorized, out-of-range and malformed prices preserve current offers', async () => {
  const { db, change, offer } = await fixture();
  try {
    await offer();
    await assert.rejects(change(11,'wrong-token'), /not-found/);
    for (const fee of [6,16,10.001,'NaN','Infinity',null]) await assert.rejects(change(fee), /out-of-range/);
    assert.equal((await db.query('select status from multisite_rider_offers')).rows[0].status,'pending');
    await change(10);
    assert.equal((await db.query('select status from multisite_rider_offers')).rows[0].status,'pending');
  } finally { await db.close(); }
});

test('expired offers cannot create a dispatch; counteroffer must match exactly', async () => {
  const { db, offer, accept } = await fixture();
  try {
    const expired = await offer();
    await db.query("update multisite_rider_offers set expires_at=now()-interval '1 second' where id=$1",[expired]);
    await assert.rejects(accept(expired,10), /not-available/);
    await db.query("update multisite_rider_offers set status='countered',counter_fee=12,expires_at=now()+interval '15 seconds' where id=$1",[expired]);
    await assert.rejects(accept(expired,10), /not-available/);
    await accept(expired,12);
    await assert.rejects(offer(10), /price-stale/);
  } finally { await db.close(); }
});
