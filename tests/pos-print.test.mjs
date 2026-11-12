import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
async function fixture(){const db=new PGlite(),user=randomUUID(),restaurant=randomUUID(),other=randomUUID();await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create type app_role as enum('restaurant_admin','cashier','waiter');
create function is_superadmin() returns boolean language sql as $$select false$$;
create function has_restaurant_role(uuid,app_role[]) returns boolean language sql as $$select $1='${restaurant}'::uuid and auth.uid()='${user}'::uuid$$;
create table support_impersonation_sessions(actor_user_id uuid,status text,expires_at timestamptz);
create table restaurant_print_connectors(restaurant_id uuid,linked_at timestamptz,revoked_at timestamptz);
create table orders(id uuid primary key,restaurant_id uuid,status text default 'pending',payment_status text default 'pending',payment_method text default 'cash',bank_payment_required boolean default false,bank_checkout_hold boolean default false,bank_schedule_hold boolean default false,printed_at timestamptz,print_requested_at timestamptz,created_at timestamptz default now(),accepted_at timestamptz,total numeric default 12.50);`);
await db.exec(readFileSync(new URL('../supabase/migrations/0145_pos_print_delivery.sql',import.meta.url),'utf8'));await db.query("select set_config('test.uid',$1,false)",[user]);
const create=async(patch={})=>{const id=randomUUID();await db.query('insert into orders(id,restaurant_id) values($1,$2)',[id,restaurant]);for(const [key,value]of Object.entries(patch))await db.query(`update orders set ${key}=$2 where id=$1`,[id,value]);return id;};
const device=randomUUID(),token=randomUUID();const claim=(id,options={})=>db.query('select claim_pos_order_print($1,$2,$3,$4,$5,$6) result',[options.restaurant??restaurant,id,options.device??device,options.token??randomUUID(),options.since??null,options.reprint??false]);
const finish=(id,claimToken,result='printed',claimDevice=device)=>db.query('select finish_pos_order_print($1,$2,$3,$4,$5) result',[restaurant,id,claimDevice,claimToken,result]);
return {db,user,restaurant,other,device,token,create,claim,finish};}
test('cash waits for approval and QR additionally requires payment, with no private or scheduled reservations printed',async()=>{const f=await fixture();try{
 for(const patch of [{},{status:'cancelled'},{status:'pending',payment_method:'qr',payment_status:'paid'},{status:'accepted',payment_method:'qr'},{status:'accepted',payment_status:'paid',bank_checkout_hold:true},{status:'accepted',payment_status:'paid',bank_schedule_hold:true},{status:'accepted',payment_status:'refunded'},{status:'delivered',payment_status:'paid'}]){const id=await f.create(patch);assert.equal((await f.claim(id)).rows[0].result.claimed,false,JSON.stringify(patch));}
 for(const patch of [{status:'accepted'},{status:'accepted',payment_method:'qr',payment_status:'paid'},{status:'ready',payment_method:'qr',payment_status:'paid'}])assert.equal((await f.claim(await f.create(patch))).rows[0].result.claimed,true);
}finally{await f.db.close();}});
test('only one device claims a ticket; completion and retries cannot print a duplicate or change payment',async()=>{const f=await fixture();try{
 const id=await f.create({status:'accepted',payment_method:'qr',payment_status:'paid'});const tokens=Array.from({length:8},()=>randomUUID());const results=await Promise.all(tokens.map(token=>f.claim(id,{token})));assert.equal(results.filter(r=>r.rows[0].result.claimed).length,1);const token=tokens[results.findIndex(r=>r.rows[0].result.claimed)];
 assert.equal((await f.claim(id,{token})).rows[0].result.claimed,false);
 assert.equal((await f.finish(id,token,'printed',randomUUID())).rows[0].result,false);assert.equal((await f.finish(id,randomUUID())).rows[0].result,false);
 assert.equal((await f.finish(id,token)).rows[0].result,true);assert.equal((await f.finish(id,token)).rows[0].result,true);
 assert.equal((await f.claim(id)).rows[0].result.reason,'already-printed');
 const row=(await f.db.query('select * from orders where id=$1',[id])).rows[0];assert.equal(row.payment_status,'paid');assert.equal(row.status,'accepted');assert.equal(Number(row.total),12.5);assert.ok(row.printed_at);
 assert.equal((await f.claim(id,{reprint:true})).rows[0].result.claimed,true);
}finally{await f.db.close();}});
test('failed connections may retry, while interrupted writes require deliberate paper review and reprint',async()=>{const f=await fixture();try{
 const id=await f.create({status:'accepted'}),token=randomUUID();await f.claim(id,{token});await f.finish(id,token,'failed');assert.equal((await f.claim(id)).rows[0].result.reason,'retry-later');
 await f.db.query("update orders set pos_print_retry_at=now()-interval '1 second' where id=$1",[id]);const next=randomUUID();assert.equal((await f.claim(id,{token:next})).rows[0].result.claimed,true);await f.finish(id,next,'uncertain');assert.equal((await f.claim(id)).rows[0].result.reason,'uncertain');
 const manual=randomUUID();assert.equal((await f.claim(id,{token:manual,reprint:true})).rows[0].result.claimed,true);
 await f.db.query("update orders set pos_print_claimed_at=now()-interval '3 minutes' where id=$1",[id]);assert.equal((await f.claim(id)).rows[0].result.reason,'uncertain');
}finally{await f.db.close();}});
test('old tickets, another branch, support impersonation and an existing desktop station are excluded',async()=>{const f=await fixture();try{
 const id=await f.create({status:'accepted',accepted_at:'2020-01-01'});assert.equal((await f.claim(id,{since:new Date().toISOString()})).rows[0].result.reason,'before-station');
 await f.db.query('insert into restaurant_print_connectors values($1,now(),null)',[f.restaurant]);await f.db.query('update orders set print_requested_at=now() where id=$1',[id]);assert.equal((await f.claim(id)).rows[0].result.reason,'desktop-station');
 await assert.rejects(f.claim(id,{restaurant:f.other}),/print-forbidden/);
 await f.db.query("insert into support_impersonation_sessions values($1,'active',now()+interval '1 hour')",[f.user]);await assert.rejects(f.claim(id),/print-forbidden/);
 await f.db.query('delete from support_impersonation_sessions');await f.db.query("select set_config('test.uid','',false)");await assert.rejects(f.claim(id),/print-forbidden/);
 await f.db.exec('set role anon');await assert.rejects(f.claim(id),/permission denied/);
}finally{await f.db.close();}});
