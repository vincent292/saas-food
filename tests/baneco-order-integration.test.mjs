import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const require = createRequire(import.meta.url);
function load(path,mocks={}) {
  const exports={};vm.runInNewContext(ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>name==='server-only'?{}:name in mocks?mocks[name]:require(name),process,Buffer,URL,Date,Intl,Error,console,setTimeout,clearTimeout,TextDecoder,Uint8Array});
  return exports;
}
const bank=load('src/lib/payments/baneco.ts');
const {parseBanecoNotice}=load('src/lib/payments/baneco-notification.ts');
const merchant=randomUUID(),actor=randomUUID(),other=randomUUID();
async function fixture() {
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema realtime;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
    create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('test.auth_role',true),''),'service_role')$$;
    create function realtime.topic() returns text language sql stable as $$select current_setting('test.topic',true)$$;
    create table profiles(id uuid primary key,global_role text);create table restaurants(id uuid primary key);
    insert into profiles values('${actor}','superadmin'),('${other}','cashier');insert into restaurants values('${merchant}');
    create function is_superadmin() returns boolean language sql stable security definer as $$select exists(select 1 from profiles where id=auth.uid() and global_role='superadmin')$$;
    create table support_impersonation_sessions(actor_user_id uuid,status text,expires_at timestamptz);
    create table realtime.messages(id serial,extension text);alter table realtime.messages enable row level security;
    insert into realtime.messages(extension) values('broadcast');grant usage on schema realtime,auth to authenticated,anon;
    grant select on realtime.messages to authenticated,anon;grant select on support_impersonation_sessions to authenticated;
    create table realtime_events(topic text,event text,payload jsonb,private boolean);
    create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$insert into public.realtime_events values(topic,event,payload,private)$$;
    create type order_status as enum('pending','accepted','preparing','ready','delivered','cancelled');
    create type app_role as enum('superadmin','restaurant_admin','cashier','kitchen','waiter');
    create table orders(id uuid primary key,restaurant_id uuid,tracking_token text,order_number text,order_type text default 'delivery',
      payment_status text default 'pending',payment_method text default 'qr',status order_status default 'pending',total numeric(12,2),
      group_order_session_id uuid,payment_receipt_url text,payment_receipt_reference text,payment_verified_at timestamptz,accepted_at timestamptz,
      requested_fulfillment_at timestamptz,requires_prepayment boolean default false,cancelled_at timestamptz,cancellation_reason text);
    create table restaurant_settings(restaurant_id uuid primary key,currency text default 'BOB');
    insert into restaurant_settings values('${merchant}','BOB');
    create table multisite_order_children(id uuid primary key,order_id uuid);
    create table cash_sessions(id uuid primary key,restaurant_id uuid,status text,opened_at timestamptz default now());
    create table cash_movements(id uuid primary key default gen_random_uuid(),restaurant_id uuid,cash_session_id uuid,order_id uuid,type text,payment_method text,amount numeric,description text,created_by uuid);
    create table inventory_applied(order_id uuid primary key);
    create function apply_order_inventory_usage(p_id uuid) returns void language plpgsql as $$begin
      if current_setting('test.inventory_fail',true)='yes' then raise exception 'Inventory test failure';end if;
      insert into inventory_applied values(p_id) on conflict do nothing;end$$;
    create function reverse_order_inventory_usage(p_id uuid,p_reason text) returns void language sql as $$delete from inventory_applied where order_id=p_id$$;
    create function has_restaurant_role(uuid,app_role[]) returns boolean language sql as $$select auth.uid()='${other}'::uuid$$;
    create function create_public_order_transaction(p_request_id uuid,p_order jsonb,p_items jsonb) returns table(id uuid,tracking_token text)
      language plpgsql security definer as $$begin
      if coalesce((p_order->>'requires_prepayment')::boolean,false) and coalesce(p_order->>'payment_receipt_url','')='' then raise exception 'prepayment-required';end if;
      insert into orders(id,restaurant_id,tracking_token,order_number,total,payment_method,requires_prepayment)
        values(p_request_id,(p_order->>'restaurant_id')::uuid,'tracking-token-with-at-least-20-chars','QA',(p_order->>'total')::numeric,p_order->>'payment_method',coalesce((p_order->>'requires_prepayment')::boolean,false)) on conflict do nothing;
      return query select o.id,o.tracking_token from orders o where o.id=p_request_id;end$$;`);
  for(const name of ['0120_baneco_superadmin_test_panel.sql','0121_baneco_production_pilot.sql','0122_baneco_automatic_reconciliation.sql','0125_baneco_notifications_and_realtime.sql','0126_baneco_order_payments.sql','0127_baneco_public_checkout.sql'])
    await db.exec(read('supabase/migrations/'+name));
  await db.exec(read('supabase/migrations/0052_atomic_order_refunds.sql'));
  const connection=randomUUID();
  await db.query(`insert into bank_qr_connections(id,restaurant_id,environment,label,credentials_ciphertext,encryption_mode,created_by,check_result,orders_enabled)
    values($1,$2,'production','QA','ciphertext','bank_api',$3,'ok',true)`,[connection,merchant,actor]);
  const token='tracking-token-with-at-least-20-chars';
  const create=async(options={})=>{
    const id=randomUUID();await db.query(`insert into orders(id,restaurant_id,tracking_token,order_number,total,order_type,requested_fulfillment_at,group_order_session_id)
      values($1,$2,$3,'QA',12.50,$4,$5,$6)`,[id,merchant,token,options.type??'delivery',options.scheduled?'2030-01-01T12:00:00Z':null,options.group?randomUUID():null]);return id;};
  const reserve=async id=>(await db.query('select reserve_baneco_order_qr($1,$2) result',[id,token])).rows[0].result;
  const prepare=async(options={})=>{const orderId=await create(options);const reserved=await reserve(orderId);const id=reserved.request.id;
    await db.query("update bank_qr_test_requests set qr_id=$2,status='pending' where id=$1",[id,'QR-'+id]);return {orderId,id};};
  const paid=async(id,transaction='BANK-'+id)=>{const operation=randomUUID();await db.query('select claim_baneco_reconciliation($1,$2,true)',[operation,id]);
    return db.query("select finish_baneco_reconciliation($1,$2,'paid',$3,null,'{}') result",[id,operation,transaction]);};
  return {db,connection,token,create,reserve,prepare,paid};
}

test('callback parser ignores claimed payment and personal data and bounds request size',async()=>{
  const request=body=>new Request('https://example.test',{method:'POST',body:JSON.stringify(body)});
  assert.equal(await parseBanecoNotice(request({payment:{qrId:'QR-known',amount:999,status:'paid',senderAccount:'SECRET'}})),'QR-known');
  for(const body of [{},{payment:{qrId:'../other'}},{payment:[{qrId:'QR'}]}])await assert.rejects(parseBanecoNotice(request(body)));
  await assert.rejects(parseBanecoNotice(request({payment:{qrId:'QR',description:'x'.repeat(9000)}})));
});

test('order reservation binds tenant, token and server amount exactly once; pilots cannot be remapped',async()=>{
  const f=await fixture();try{
    const id=await f.create();const reservations=await Promise.all(Array.from({length:8},()=>f.reserve(id)));
    assert.equal(reservations.filter(r=>r.claimed).length,1);assert.equal(reservations[0].request.amount,12.5);
    assert.equal(reservations[0].request.order_id,id);assert.equal(reservations[0].request.currency,'BOB');
    await assert.rejects(f.db.query('select reserve_baneco_order_qr($1,$2)',[id,'wrong-token']),/bank-connection-unavailable/);
    await f.db.query('update bank_qr_connections set active=false where id=$1',[f.connection]);
    await assert.rejects(f.reserve(await f.create()),/bank-connection-unavailable/);
  }finally{await f.db.close();}
});

test('group/multisite, non-BOB, disabled and already-paid orders cannot issue a dynamic QR',async()=>{
  const f=await fixture();try{
    await assert.rejects(f.reserve(await f.create({group:true})),/bank-order-ineligible/);
    const multi=await f.create();await f.db.query('insert into multisite_order_children values($1,$2)',[randomUUID(),multi]);
    await assert.rejects(f.reserve(multi),/bank-order-ineligible/);
    await f.db.query("update restaurant_settings set currency='USD'");await assert.rejects(f.reserve(await f.create()),/bank-order-ineligible/);
    await f.db.query("update restaurant_settings set currency='BOB'");await f.db.query('update bank_qr_connections set orders_enabled=false');
    await assert.rejects(f.reserve(await f.create()),/bank-connection-unavailable/);
  }finally{await f.db.close();}
});

test('bank confirmation posts one QR sale, consumes inventory once, and keeps preparation approval separate',async()=>{
  const f=await fixture();try{
    await f.db.query("insert into cash_sessions(id,restaurant_id,status) values($1,$2,'open')",[randomUUID(),merchant]);
    for(const options of [{},{type:'table'},{scheduled:true}]){
      const {id,orderId}=await f.prepare(options);await f.paid(id);await f.paid(id);
      const row=(await f.db.query('select status,payment_status,accepted_at from orders where id=$1',[orderId])).rows[0];
      assert.equal(row.payment_status,'paid');assert.equal(row.status,'pending');assert.equal(row.accepted_at,null);
      assert.equal((await f.db.query('select count(*)::int n from cash_movements where order_id=$1',[orderId])).rows[0].n,1);
      assert.equal((await f.db.query('select count(*)::int n from inventory_applied where order_id=$1',[orderId])).rows[0].n,1);
      assert.equal((await f.db.query('select application_state from bank_qr_test_requests where id=$1',[id])).rows[0].application_state,'applied');
    }
    const events=(await f.db.query("select * from realtime_events where topic='bank-qr:superadmin'")).rows;
    assert.ok(events.length>0);assert.ok(events.every(e=>e.private&&JSON.stringify(e.payload)==='{"changed":true}'));
  }finally{await f.db.close();}
});

test('closed cash preserves confirmed payment and posts only when another cash session opens',async()=>{
  const f=await fixture();try{
    const {id,orderId}=await f.prepare();await f.paid(id);
    assert.equal((await f.db.query('select payment_status from orders where id=$1',[orderId])).rows[0].payment_status,'paid');
    assert.equal((await f.db.query('select application_state from bank_qr_test_requests where id=$1',[id])).rows[0].application_state,'waiting_cash');
    assert.equal((await f.db.query('select post_waiting_baneco_payments() n')).rows[0].n,0);
    const session=randomUUID();await f.db.query("insert into cash_sessions(id,restaurant_id,status) values($1,$2,'open')",[session,merchant]);
    const results=await Promise.all(Array.from({length:5},()=>f.db.query('select post_waiting_baneco_payments() n')));
    assert.equal(results.reduce((n,r)=>n+r.rows[0].n,0),1);
    const movement=(await f.db.query('select * from cash_movements where order_id=$1',[orderId])).rows[0];
    assert.equal(movement.cash_session_id,session);assert.equal(movement.created_by,null);assert.equal(movement.bank_qr_request_id,id);
  }finally{await f.db.close();}
});

test('cancelled orders and inventory failures preserve bank payment for review without changing the order',async()=>{
  const f=await fixture();try{
    const first=await f.prepare();await f.db.query("update orders set status='cancelled' where id=$1",[first.orderId]);await f.paid(first.id);
    const second=await f.prepare();await f.db.exec("select set_config('test.inventory_fail','yes',false)");await f.paid(second.id);
    for(const id of [first.id,second.id]){
      const row=(await f.db.query('select status,application_state from bank_qr_test_requests where id=$1',[id])).rows[0];
      assert.equal(row.status,'paid');assert.equal(row.application_state,'review');
    }
    assert.equal((await f.db.query('select count(*)::int n from cash_movements')).rows[0].n,0);
    assert.equal((await f.db.query('select payment_status from orders where id=$1',[second.orderId])).rows[0].payment_status,'pending');
    await assert.rejects(f.db.query("update orders set payment_status='paid',payment_method='cash' where id=$1",[second.orderId]),/bank-qr-active-cancel-first/);
  }finally{await f.db.close();}
});

test('active QR blocks another cash charge or price edit until bank cancellation is verified',async()=>{
  const f=await fixture();try{
    const {id,orderId}=await f.prepare();
    await assert.rejects(f.db.query("update orders set payment_status='paid',payment_method='cash' where id=$1",[orderId]),/bank-qr-active-cancel-first/);
    await assert.rejects(f.db.query('update orders set total=15 where id=$1',[orderId]),/bank-qr-active-cancel-first/);
    await f.db.query("update bank_qr_test_requests set status='cancelled' where id=$1",[id]);
    await f.db.query("update orders set payment_status='paid',payment_method='cash' where id=$1",[orderId]);
    assert.equal((await f.db.query('select payment_method from orders where id=$1',[orderId])).rows[0].payment_method,'cash');
  }finally{await f.db.close();}
});

test('refund waits for the original sale, then existing refund records a balanced expense',async()=>{
  const f=await fixture();try{
    const {id,orderId}=await f.prepare();await f.paid(id);
    await f.db.query("insert into cash_sessions(id,restaurant_id,status) values($1,$2,'open')",[randomUUID(),merchant]);
    await f.db.query("select set_config('test.uid',$1,false)",[actor]);
    const refund=()=>f.db.query('select refund_order_atomic($1,$2,$3)',[merchant,orderId,'QA refund reason']);
    await assert.rejects(refund(),/bank-qr-posting-pending/);
    await f.db.query('select post_waiting_baneco_payments()');await refund();
    const rows=(await f.db.query('select type,amount from cash_movements where order_id=$1 order by type',[orderId])).rows;
    assert.equal(rows.length,2);assert.equal(Number(rows.find(r=>r.type==='sale').amount),12.5);assert.equal(Number(rows.find(r=>r.type==='expense').amount),12.5);
    assert.equal((await f.db.query('select status from bank_qr_test_requests where id=$1',[id])).rows[0].status,'paid');
  }finally{await f.db.close();}
});

test('local approval accepts a prepaid scheduled order without a second sale',async()=>{
  const f=await fixture();try{
    const {orderId,id}=await f.prepare({scheduled:true});await f.paid(id);
    await assert.rejects(f.db.query('select approve_prepaid_order_for_preparation($1,$2)',[merchant,orderId]),/cash access denied/);
    await f.db.query("select set_config('test.uid',$1,false)",[actor]);
    await f.db.query('select approve_prepaid_order_for_preparation($1,$2)',[merchant,orderId]);
    assert.equal((await f.db.query('select status from orders where id=$1',[orderId])).rows[0].status,'accepted');
    assert.equal((await f.db.query('select count(*)::int n from cash_movements where order_id=$1',[orderId])).rows[0].n,0);
  }finally{await f.db.close();}
});

test('notifications wake a cooling-down QR without trusting a claimed payment, and coalesce repeats',async()=>{
  const f=await fixture();try{
    const {id}=await f.prepare();await f.db.query("update bank_qr_test_requests set next_check_at=now()+interval '30 minutes' where id=$1",[id]);
    const qr='QR-'+id;
    const queue=()=>f.db.query('select queue_baneco_payment_notification($1) result',[qr]);
    assert.equal((await queue()).rows[0].result,id);assert.equal((await queue()).rows[0].result,null);
    assert.equal((await f.db.query('select status from bank_qr_test_requests where id=$1',[id])).rows[0].status,'pending');
    assert.ok((await f.db.query('select claim_baneco_reconciliation($1,$2,false) result',[randomUUID(),id])).rows[0].result);
    assert.equal((await f.db.query("select queue_baneco_payment_notification('unknown') result")).rows[0].result,null);
  }finally{await f.db.close();}
});

test('webhook queries authoritative bank status; forged amounts cannot pay or duplicate an order',async()=>{
  const f=await fixture();let answer='pending',calls=0;
  try{
    const {id,orderId}=await f.prepare();
    await f.db.query("insert into cash_sessions(id,restaurant_id,status) values($1,$2,'open')",[randomUUID(),merchant]);
    const creds={userName:'QA',password:'QA',aesKey:'QA',accountCredit:'QA',encryptionMode:'bank_api'};
    const admin={from(table){return {select(fields){this.fields=fields;return this;},eq(key,value){this.key=key;this.value=value;return this;},async maybeSingle(){return {data:(await f.db.query(`select ${this.fields} from ${table} where ${this.key}=$1`,[this.value])).rows[0],error:null};}};},
      async rpc(name,args){let result;
        if(name==='queue_baneco_payment_notification')result=await f.db.query('select queue_baneco_payment_notification($1) result',[args.p_qr_id]);
        else if(name==='claim_baneco_reconciliation')result=await f.db.query('select claim_baneco_reconciliation($1,$2,$3) result',[args.p_token,args.p_id??null,args.p_cancel??false]);
        else if(name==='finish_baneco_reconciliation')result=await f.db.query('select finish_baneco_reconciliation($1,$2,$3,$4,$5,$6) result',[args.p_id,args.p_token,args.p_status,args.p_transaction,args.p_error,args.p_details]);
        else throw Error('Unexpected RPC');return {data:result.rows[0].result,error:null};}
    };
    const service=load('src/lib/services/bank-qr.service.ts',{
      '@/lib/services/auth.service':{authService:{}},'@/lib/services/support-impersonation.service':{},
      '@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/payments/credential-vault':{openBankCredentials:()=>creds},
      '@/lib/payments/baneco':{...bank,createBanecoClient:()=>({status:async()=>{calls++;return answer==='pending'?{responseCode:0,statusQrCode:0}:{responseCode:0,statusQrCode:1,payment:{qrId:'QR-'+id,currency:'BOB',amount:answer==='wrong-amount'?1:12.5,transactionId:'BANK-verified',paymentDate:bank.boliviaDate(),paymentTime:'12:00:00'}};}})}
    });
    const qr=await parseBanecoNotice(new Request('https://example.test',{method:'POST',body:JSON.stringify({payment:{qrId:'QR-'+id,amount:12.5,status:'paid'}})}));
    const works=await Promise.all(Array.from({length:8},()=>service.acceptBanecoPaymentNotice(qr)));
    assert.equal(works.filter(Boolean).length,1);await works.find(Boolean)();
    assert.equal(calls,1);assert.equal((await f.db.query('select payment_status from orders where id=$1',[orderId])).rows[0].payment_status,'pending');
    for(const next of ['wrong-amount','paid']){
      answer=next;await f.db.query("update bank_qr_test_requests set notification_received_at=now()-interval '30 seconds' where id=$1",[id]);
      await (await service.acceptBanecoPaymentNotice(qr))();
    }
    assert.equal((await f.db.query('select payment_status from orders where id=$1',[orderId])).rows[0].payment_status,'paid');
    assert.equal((await f.db.query('select count(*)::int n from cash_movements where order_id=$1',[orderId])).rows[0].n,1);
    assert.equal(await service.acceptBanecoPaymentNotice(qr),null);
    assert.equal(calls,3);
  }finally{await f.db.close();}
});

test('an in-flight poll cannot swallow a newer payment notice behind its normal cooldown',async()=>{
  const f=await fixture();try{
    const {id}=await f.prepare();const operation=randomUUID();
    await f.db.query('select claim_baneco_reconciliation($1,$2,false)',[operation,id]);
    await f.db.query("update bank_qr_test_requests set notification_received_at=last_attempt_at+interval '1 millisecond' where id=$1",[id]);
    await f.db.query("select finish_baneco_reconciliation($1,$2,'pending',null,null,'{}')",[id,operation]);
    const claim=(await f.db.query('select claim_baneco_reconciliation($1,$2,false) result',[randomUUID(),id])).rows[0].result;
    assert.ok(claim);
  }finally{await f.db.close();}
});

test('bank Realtime is private to superadmin and all settlement RPCs deny browser roles',async()=>{
  const f=await fixture();try{
    await f.db.exec("select set_config('test.topic','bank-qr:superadmin',false)");
    await f.db.exec('set role anon');assert.equal((await f.db.query('select count(*)::int n from realtime.messages')).rows[0].n,0);await f.db.exec('reset role');
    for(const [uid,expected] of [[other,0],[actor,1]]){
      await f.db.query("select set_config('test.uid',$1,false)",[uid]);await f.db.exec('set role authenticated');
      assert.equal((await f.db.query('select count(*)::int n from realtime.messages')).rows[0].n,expected);await f.db.exec('reset role');
    }
    await f.db.query("insert into support_impersonation_sessions values($1,'active',now()+interval '1 hour')",[actor]);await f.db.exec('set role authenticated');
    assert.equal((await f.db.query('select count(*)::int n from realtime.messages')).rows[0].n,0);await f.db.exec('reset role');
    for(const role of ['anon','authenticated'])for(const fn of ['reserve_baneco_order_qr(uuid,text)','queue_baneco_payment_notification(text)','apply_baneco_order_payment(uuid)','post_waiting_baneco_payments()'])
      assert.equal((await f.db.query('select has_function_privilege($1,$2,\'execute\') allowed',[role,fn])).rows[0].allowed,false);
  }finally{await f.db.close();}
});

test('checkout defers receipt only for explicitly enabled verified BOB merchants and remains unpaid',async()=>{
  const f=await fixture();try{
    const order={restaurant_id:merchant,total:12.5,payment_method:'qr',requires_prepayment:true};
    const id=randomUUID();const call=()=>f.db.query('select * from create_public_order_transaction($1,$2,$3)',[id,order,[]]);
    await call();await call();
    const row=(await f.db.query('select requires_prepayment,payment_status from orders where id=$1',[id])).rows[0];
    assert.equal(row.requires_prepayment,true);assert.equal(row.payment_status,'pending');
    await f.db.query('update bank_qr_connections set orders_enabled=false');
    await assert.rejects(f.db.query('select * from create_public_order_transaction($1,$2,$3)',[randomUUID(),order,[]]),/prepayment-required/);
  }finally{await f.db.close();}
});
