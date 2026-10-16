import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
async function fixture(){
  const db=new PGlite();const admin=randomUUID(), restaurants=[randomUUID(),randomUUID(),randomUUID()], session=randomUUID();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema realtime;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function auth.role() returns text language sql as $$select 'service_role'::text$$;
    create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
    create type app_role as enum('superadmin','restaurant_admin','cashier','kitchen','waiter');
    create type order_type as enum('pos','table','delivery','pickup');create type order_status as enum('pending','accepted','preparing','ready','delivered','cancelled');
    create type payment_status as enum('pending','paid','cancelled','refunded');create type payment_method_type as enum('cash','qr','bank_transfer','card','other');
    create type order_origin as enum('pos_counter','table_qr','web_checkout','phone_whatsapp','external_platform');
    create table profiles(id uuid primary key,global_role text);insert into profiles values('${admin}','superadmin');
    create function is_superadmin() returns boolean language sql as $$select auth.uid()='${admin}'::uuid$$;
    create function has_restaurant_role(uuid,app_role[]) returns boolean language sql as $$select auth.uid()='${admin}'::uuid$$;
    create table restaurants(id uuid primary key,name text,status text default 'active',deleted_at timestamptz,business_type text default 'food');
    create table restaurant_settings(restaurant_id uuid primary key,currency text default 'BOB',delivery_enabled boolean default true,kitchen_enabled boolean default true);
    create table products(id uuid primary key,restaurant_id uuid,is_available boolean default true);create table product_variants(id uuid primary key);
    create table cash_sessions(id uuid primary key default gen_random_uuid(),restaurant_id uuid,status text,opened_at timestamptz default now());
    create table orders(id uuid primary key default gen_random_uuid(),restaurant_id uuid,table_id uuid,order_number text,public_request_id uuid,
      customer_name text,customer_phone text,customer_email text,customer_address text,delivery_address_detail text,delivery_latitude numeric,delivery_longitude numeric,delivery_maps_url text,delivery_distance_km numeric,
      requires_prepayment boolean default false,requested_fulfillment_at timestamptz,invoice_required boolean,invoice_document_type text,invoice_document_number text,invoice_name text,
      order_type order_type,status order_status default 'pending',order_origin order_origin,payment_status payment_status default 'pending',payment_method payment_method_type default 'cash',
      payment_receipt_url text,payment_receipt_uploaded_at timestamptz,payment_receipt_reference text,payment_verified_at timestamptz,subtotal numeric,delivery_fee numeric,discount_total numeric,total numeric,
      notes text,tracking_token text default md5(gen_random_uuid()::text),accepted_at timestamptz,ready_at timestamptz,cancellation_reason text,created_at timestamptz default now(),updated_at timestamptz default now(),unique(restaurant_id,public_request_id));
    create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid,product_id uuid,product_name text,variant_id uuid,option_ids uuid[],unit_price numeric,quantity integer,subtotal numeric,notes text);
    create table cash_movements(id uuid primary key default gen_random_uuid(),restaurant_id uuid,cash_session_id uuid,order_id uuid,type text,payment_method payment_method_type,amount numeric,description text,created_by uuid,created_at timestamptz default now());
    create table inventory_applied(order_id uuid primary key);
    create function apply_order_inventory_usage(uuid) returns void language plpgsql as $$begin
      if current_setting('test.stock_failure',true)='yes' then raise exception 'stock failed';end if;
      insert into inventory_applied values($1) on conflict do nothing;end$$;
    create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
    create table support_impersonation_sessions(actor_user_id uuid,status text,expires_at timestamptz);
    create table realtime.messages(extension text);alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql as $$select ''::text$$;
    create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;`);
  for(const name of ['0063_public_order_cash_and_schedule_rules.sql','0066_group_order_sessions.sql','0067_group_order_host_controls.sql','0068_group_order_multisite_planning.sql',
    '0072_group_order_submission_guard.sql','0073_group_order_payment_review_and_limits.sql','0074_group_order_structured_order_link.sql','0112_public_multisite_orders.sql','0113_group_multisite_checkout_link.sql','0119_multisite_creation_retry_guard.sql',
    '0120_baneco_superadmin_test_panel.sql','0121_baneco_production_pilot.sql','0122_baneco_automatic_reconciliation.sql','0125_baneco_notifications_and_realtime.sql','0126_baneco_order_payments.sql',
    '0127_baneco_public_checkout.sql','0128_baneco_checkout_recovery_and_acceptance.sql','0129_baneco_group_bills.sql','0130_baneco_group_submission.sql','0131_baneco_group_scheduled_release.sql','0132_baneco_collection_routing.sql'])await db.exec(read(name));
  await db.exec(`create table restaurant_memberships(user_id uuid,restaurant_id uuid,is_active boolean,role app_role);
    alter table products add column name text default 'Producto',add column price numeric default 10;
    alter table product_variants add column restaurant_id uuid,add column product_id uuid,add column name text,add column price_delta numeric,add column is_active boolean;
    create table product_option_groups(id uuid primary key,restaurant_id uuid,product_id uuid,name text,min_choices integer,max_choices integer,is_required boolean,is_active boolean);
    create table product_options(id uuid primary key,restaurant_id uuid,product_id uuid,option_group_id uuid,name text,price_delta numeric,is_active boolean,sort_order integer);`);
  await db.exec(read('0053_fix_pos_sale_rpc_signature.sql'));
  const tender=read('0107_pos_tenders_and_pickup_sales.sql');await db.exec(tender.slice(tender.indexOf('create or replace function create_pos_sale_with_tender('),tender.indexOf('create or replace function settle_table_with_tender(')));
  await db.exec(read('0133_baneco_pos_and_staff.sql'));
  await db.exec(read('0134_baneco_multisite_checkout.sql'));
  await db.exec('create table tables(id uuid primary key,restaurant_id uuid,status text);alter table orders enable row level security;grant select on orders to authenticated;create policy test_staff_orders on orders for select to authenticated using(true);');
  const queue=read('0023_virtual_order_queue.sql');await db.exec(queue.slice(0,queue.indexOf('create index')));
  await db.exec(read('0025_queue_ignores_stale_active_orders.sql'));
  await db.exec(read('0136_baneco_payment_before_submission.sql'));
  await db.exec(`alter table orders add column table_visit_id uuid;
    create table table_visits(id uuid primary key default gen_random_uuid(),restaurant_id uuid,table_id uuid,status text default 'open',opened_by uuid);
    create unique index fixture_open_visit on table_visits(table_id) where status='open';
    create table waiter_table_assignments(restaurant_id uuid,table_id uuid,waiter_user_id uuid);
    create table admin_audit_logs(id uuid default gen_random_uuid(),actor_user_id uuid,restaurant_id uuid,action text,created_at timestamptz default now());`);
  await db.exec(read('0137_public_table_bank_only_and_waiter_access.sql'));
  await db.exec(read('0138_baneco_scheduled_cash_day_and_preparation.sql'));
  const charge=read('0103_fix_table_settlement_and_payment_flow.sql');
  await db.exec(charge.slice(charge.indexOf('create or replace function charge_order_with_cash_movement('),charge.indexOf('create or replace function settle_table_with_cash_movements(')));
  const products=[];for(const [i,id] of restaurants.entries()){
    await db.query('insert into restaurants(id,name) values($1,$2)',[id,'Local '+i]);await db.query('insert into restaurant_settings(restaurant_id) values($1)',[id]);
    await db.query("insert into cash_sessions(restaurant_id,status) values($1,'open')",[id]);
    await db.query("insert into bank_qr_connections(id,restaurant_id,environment,label,credentials_ciphertext,encryption_mode,created_by,check_result,orders_enabled) values($1,$2,'production','QA','cipher','bank_api',$3,'ok',true)",[randomUUID(),id,admin]);
    const product=randomUUID();products.push(product);await db.query('insert into products(id,restaurant_id) values($1,$2)',[product,id]);
  }
  const hostSecret='host-secret-very-long-token';await db.query("insert into group_order_sessions(id,restaurant_id,public_token,host_access_token,host_name,multisite_enabled) values($1,$2,'GROUPQA',$3,'Host',true)",[session,restaurants[0],hostSecret]);
  const people=[];for(let i=0;i<3;i++){const id=randomUUID(),secret='participant-secret-'+i;people.push({id,secret});await db.query('insert into group_order_participants(id,session_id,participant_token,display_name) values($1,$2,$3,$4)',[id,session,secret,'Persona '+i]);}
  await db.query('update group_order_sessions set host_participant_id=$2 where id=$1',[session,people[0].id]);
  const item=async(person,local,amount=10)=>{const id=randomUUID();await db.query('insert into group_order_items(id,session_id,participant_id,restaurant_id,product_id,product_name,unit_price,quantity,subtotal) values($1,$2,$3,$4,$5,$6,$7,1,$7)',[id,session,people[person].id,restaurants[local],products[local],'Producto',amount]);return id;};
  const reserve=async(person,local,mode='qr',payer=person,host=false,ack=payer!==person)=>(await db.query('select reserve_baneco_group_bill($1,$2,$3,$4,$5,$6,$7) result',[session,host?hostSecret:people[payer].secret,host,people[person].id,restaurants[local],mode,ack])).rows[0].result;
  const pending=async(person,local,payer=person)=>{const result=await reserve(person,local,'qr',payer);if(result.claimed)await db.query("update bank_qr_test_requests set status='pending',qr_id=$2 where id=$1",[result.request.id,'QR-'+result.request.id]);return result;};
  const pay=async request=>{const token=randomUUID();await db.query('select claim_baneco_reconciliation($1,$2,true)',[token,request.id]);return db.query("select finish_baneco_reconciliation($1,$2,'paid',$3,null,'{}')",[request.id,token,'BANK-'+request.id]);};
  const close=async()=>{
    await db.query("update group_order_sessions set status='locked' where id=$1 and status='open'",[session]);const token=randomUUID();await db.query('select begin_bank_group_submission($1,$2,$3)',[session,hostSecret,token]);
    const bills=(await db.query("select restaurant_id,sum(amount)::float8 subtotal from bank_group_bills where session_id=$1 and voided_at is null and (paid_request_id is not null or mode='cash') group by restaurant_id order by restaurant_id",[session])).rows;
    const stops=bills.map((bill,i)=>({...bill,order_number:'QA-'+i,pickup_position:i+1,release_delay_minutes:0,estimated_ready_minutes:20}));
    return {token,run:()=>db.query('select finalize_baneco_group($1,$2,$3,$4,$5) result',[session,hostSecret,token,{customer_name:'QA host',customer_address:'Destino',customer_phone:'59170000000',delivery_latitude:-17.3,delivery_longitude:-66.1,order_type:'delivery',delivery_fee:8,rider_fee_suggested:8,rider_fee_minimum:8,rider_fee_maximum:8},stops])};
  };
  const checkout=async(overrides={})=>{
    const id=randomUUID();const payload={restaurant_id:restaurants[0],order_number:'PAY-'+id,order_type:'pickup',order_origin:'web_checkout',payment_method:'qr',customer_name:'Cliente',subtotal:10,total:10,delivery_fee:0,discount_total:0,bank_checkout:true,recovery_key_hash:'a'.repeat(64),...overrides};
    const items=[{product_id:products[0],product_name:'Producto',unit_price:10,quantity:1,subtotal:10,option_ids:[]}];
    const replay=()=>db.query('select * from create_public_order_transaction($1,$2,$3)',[id,payload,items]);
    const result=(await replay()).rows[0];return {...result,replay};
  };
  return {db,admin,restaurants,products,session,people,hostSecret,item,reserve,pending,pay,close,checkout};
}
test('group bills bind participant, branch, snapshot and payer; concurrent retries reserve a single QR',async()=>{
  const f=await fixture();try{
    const item=await f.item(1,0,12);await f.item(1,1,18);
    const attempts=await Promise.all(Array.from({length:8},()=>f.reserve(1,0)));assert.equal(attempts.filter(row=>row.claimed).length,1);
    const first=attempts[0];assert.equal(Number(first.request.amount),12);assert.equal(first.request.restaurant_id,f.restaurants[0]);assert.equal(first.request.order_id,null);
    const second=await f.reserve(1,1);assert.notEqual(first.request.connection_id,second.request.connection_id);assert.equal(Number(second.request.amount),18);
    await assert.rejects(f.db.query('update group_order_items set quantity=2,subtotal=24 where id=$1',[item]),/group-basket-frozen/);
    await assert.rejects(f.db.query('delete from group_order_items where id=$1',[item]),/group-basket-frozen/);
    await assert.rejects(f.reserve(1,0,'qr',2,false,false),/group-cover-confirmation-required/);
    await assert.rejects(f.db.query('select reserve_baneco_group_bill($1,$2,false,$3,$4,\'qr\',false)',[f.session,'WRONG',f.people[1].id,f.restaurants[0]]),/group-bank-forbidden/);
  }finally{await f.db.close();}
});
test('only bank verification funds a bill; another person can pay but a screenshot/host flag cannot',async()=>{
  const f=await fixture();try{
    await f.item(1,0);const bill=await f.pending(1,0,2);
    await assert.rejects(f.db.query("update group_order_participants set payment_status='paid_qr' where id=$1",[f.people[1].id]),/group-use-bank-bills/);
    assert.equal((await f.db.query('select paid_request_id from bank_group_bills where id=$1',[bill.billId])).rows[0].paid_request_id,null);
    await f.pay(bill.request);await f.pay(bill.request);
    const row=(await f.db.query('select * from bank_group_bills where id=$1',[bill.billId])).rows[0];
    assert.equal(row.paid_request_id,bill.request.id);assert.equal(row.requested_by,f.people[2].id);
    assert.equal((await f.db.query('select count(*)::int n from orders')).rows[0].n,0); // not sent before closing
    await assert.rejects(f.db.query("update group_order_sessions set status='cancelled' where id=$1",[f.session]),/group-payment-review-required/);
  }finally{await f.db.close();}
});
test('closing filters unpaid lines, sends only eligible branches, separates delivery and posts QR once',async()=>{
  const f=await fixture();try{
    await f.item(1,0,12);await f.item(1,1,18);await f.item(2,2,25); // never paid: third branch must disappear
    const a=await f.pending(1,0),b=await f.pending(1,1);await f.pay(a.request);await f.pay(b.request);
    const closing=await f.close();const result=(await closing.run()).rows[0].result;assert.equal(result.multisite,true);await closing.run();
    const children=(await f.db.query('select o.* from orders o order by restaurant_id')).rows;assert.equal(children.length,2);
    assert.ok(children.every(row=>row.payment_status==='paid'&&row.status==='accepted'));assert.equal(children.reduce((sum,row)=>sum+Number(row.total),0),30);
    assert.equal((await f.db.query('select count(*)::int n from cash_movements')).rows[0].n,2);
    const parent=(await f.db.query('select * from multisite_orders')).rows[0];assert.equal(Number(parent.delivery_fee),8);assert.equal(Number(parent.total),38);assert.equal(Number(parent.products_prepaid_amount),30);
    const snap=(await f.db.query('select submitted_snapshot from group_order_sessions')).rows[0].submitted_snapshot;assert.equal(snap.excludedItems,1);
  }finally{await f.db.close();}
});
test('a mixed group records only the remaining cash balance with the established cashier RPC',async()=>{
  const f=await fixture();try{
    await f.item(1,0,12);await f.item(2,0,8);const bank=await f.pending(1,0);await f.pay(bank.request);await f.reserve(2,0,'cash',0,true,true);
    const closing=await f.close();await closing.run();const order=(await f.db.query('select * from orders')).rows[0];
    assert.equal(Number(order.total),20);assert.equal(Number(order.group_prepaid_amount),12);assert.equal(Number(order.group_cash_due),8);assert.equal(order.payment_status,'pending');
    await f.db.query("select set_config('test.uid',$1,false)",[f.admin]);
    for(let i=0;i<2;i++)await f.db.query("select charge_order_with_cash_movement($1,$2,'cash',null,null)",[order.restaurant_id,order.id]);
    const sales=(await f.db.query('select payment_method,amount from cash_movements order by amount')).rows;
    assert.equal(sales.length,2);assert.deepEqual(sales.map(row=>Number(row.amount)),[8,12]);assert.equal(sales[0].payment_method,'cash');assert.equal(sales[1].payment_method,'qr');
    assert.equal((await f.db.query('select count(*)::int n from inventory_applied')).rows[0].n,1);
  }finally{await f.db.close();}
});
test('a pending/unknown generation prevents closing; stock failure rolls back orders and keeps paid bills',async()=>{
  const f=await fixture();try{
    await f.item(1,0);await f.item(2,1);const paid=await f.pending(1,0);await f.pay(paid.request);const live=await f.pending(2,1);
    const closing=await f.close();await assert.rejects(closing.run(),/group-payment-in-progress/);
    await f.db.query("update bank_qr_test_requests set status='cancelled' where id=$1",[live.request.id]);
    await f.db.exec("select set_config('test.stock_failure','yes',false)");await assert.rejects(closing.run(),/stock failed/);
    assert.equal((await f.db.query('select count(*)::int n from orders')).rows[0].n,0);
    assert.equal((await f.db.query('select count(*)::int n from cash_movements')).rows[0].n,0);
    assert.equal((await f.db.query('select paid_request_id from bank_group_bills where id=$1',[paid.billId])).rows[0].paid_request_id,paid.request.id);
  }finally{await f.db.close();}
});

test('fallback is opt-in, own active accounts take precedence, and verified central payments create one payable',async()=>{
  const f=await fixture();try{
    const central=(await f.db.query('select id from bank_qr_connections where restaurant_id=$1',[f.restaurants[0]])).rows[0].id;
    await f.db.query('update bank_qr_connections set active=false where restaurant_id=$1',[f.restaurants[1]]);
    assert.equal((await f.db.query('select resolve_baneco_collection($1) id',[f.restaurants[1]])).rows[0].id,null);
    await f.db.query('update bank_collection_settings set connection_id=$1,enabled=true,authorized_at=now(),authorized_by=$2',[central,f.admin]);
    assert.equal((await f.db.query('select resolve_baneco_collection($1) id',[f.restaurants[1]])).rows[0].id,central);
    await f.item(1,1,18);const bill=await f.pending(1,1);assert.equal(bill.request.restaurant_id,f.restaurants[1]);assert.equal(bill.request.receiver_restaurant_id,f.restaurants[0]);assert.equal(bill.request.collection_route,'platform');
    await f.pay(bill.request);await f.pay(bill.request);
    const ledger=(await f.db.query('select * from bank_collection_receivables')).rows;assert.equal(ledger.length,1);assert.equal(Number(ledger[0].amount),18);assert.equal(ledger[0].restaurant_id,f.restaurants[1]);
    await f.db.query('update bank_collection_settings set enabled=false');
    assert.equal((await f.db.query('select resolve_baneco_collection($1) id',[f.restaurants[1]])).rows[0].id,null);
    await assert.rejects(f.db.query('update bank_qr_test_requests set receiver_restaurant_id=$2 where id=$1',[bill.request.id,f.restaurants[2]]),/bank-recipient-immutable/);
    await f.db.query('update bank_qr_connections set active=true,orders_enabled=false where restaurant_id=$1',[f.restaurants[1]]);
    await f.db.query('update bank_collection_settings set enabled=true');
    assert.equal((await f.db.query('select resolve_baneco_collection($1) id',[f.restaurants[1]])).rows[0].id,null);
    await f.db.exec('set role anon');await assert.rejects(f.db.query('select * from bank_collection_receivables'),/permission denied/);await assert.rejects(f.db.query('select resolve_baneco_collection($1)',[f.restaurants[0]]),/permission denied/);
  }finally{await f.db.close();}
});

test('POS QR draft uses catalog prices, stays unpaid, replays safely, and cannot be manually approved',async()=>{
  const f=await fixture();try{
    await f.db.query("select set_config('test.uid',$1,false)",[f.admin]);
    const cart=[{productId:f.products[0],quantity:2,price:.01,optionIds:[]}];
    const sale=()=>f.db.query("select create_pos_sale_with_tender($1,'POS-RETRY','Cliente',null,'pos_counter','pickup','qr',null,null,null,$2) id",[f.restaurants[0],cart]);
    const id=(await sale()).rows[0].id;assert.equal((await sale()).rows[0].id,id);
    const order=(await f.db.query('select * from orders where id=$1',[id])).rows[0];assert.equal(Number(order.total),20);assert.equal(order.payment_status,'pending');assert.equal(order.status,'pending');assert.equal(order.bank_payment_required,true);assert.equal(order.order_type,'pickup');
    assert.equal((await f.db.query('select count(*)::int n from cash_movements')).rows[0].n,0);
    await assert.rejects(f.db.query("update orders set payment_status='paid',payment_receipt_reference='FAKE' where id=$1",[id]),/bank-payment-required/);
    await assert.rejects(f.db.query('select prepare_baneco_staff_order($1,$2,$3)',[f.restaurants[0],id,randomUUID()]),/bank-forbidden/);
    const reserved=(await f.db.query('select reserve_baneco_order_qr($1,$2) r',[id,order.tracking_token])).rows[0].r;
    await f.db.query("update bank_qr_test_requests set status='pending',qr_id=$2 where id=$1",[reserved.request.id,'POS-'+id]);
    await assert.rejects(f.db.query("update orders set payment_method='cash' where id=$1",[id]),/bank-cancel-qr-first/);
    await f.pay(reserved.request);assert.equal((await f.db.query('select payment_status from orders where id=$1',[id])).rows[0].payment_status,'paid');
    assert.equal((await f.db.query('select count(*)::int n from cash_movements where order_id=$1',[id])).rows[0].n,1);
  }finally{await f.db.close();}
});

test('standalone multi-local QR uses separate branch payments and keeps delivery outside bank amounts',async()=>{
  const f=await fixture();try{
    const request=randomUUID(), payload={customer_name:'Cliente',customer_address:'Destino',delivery_latitude:-17.3,delivery_longitude:-66.1,payment_method:'qr',subtotal:20,delivery_fee:8,total:28,rider_fee_suggested:8,rider_fee_minimum:8,rider_fee_maximum:8};
    const children=[0,1].map((index)=>({restaurant_id:f.restaurants[index],order_number:'MULTI-'+index,pickup_position:index+1,release_delay_minutes:0,estimated_ready_minutes:20,subtotal:10,items:[{product_id:f.products[index],product_name:'Producto',unit_price:10,quantity:1,subtotal:10,option_ids:[]}]}));
    const create=()=>f.db.query('select * from create_public_multisite_order_transaction($1,$2,$3)',[request,payload,children]);
    const master=(await create()).rows[0];assert.equal((await create()).rows[0].id,master.id);
    const orders=(await f.db.query('select * from orders order by order_number')).rows;assert.equal(orders.length,2);assert.ok(orders.every(o=>o.payment_method==='qr'&&o.bank_payment_required&&o.payment_status==='pending'&&o.bank_checkout_hold));
    const reservations=[];
    for(const order of orders){const reserved=(await f.db.query('select reserve_baneco_order_qr($1,$2) r',[order.id,order.tracking_token])).rows[0].r;assert.equal(Number(reserved.request.amount),10);reservations.push(reserved.request);await f.db.query("update bank_qr_test_requests set qr_id=$2,status='pending' where id=$1",[reserved.request.id,'MULTI-'+reserved.request.id]);}
    assert.notEqual(reservations[0].connection_id,reservations[1].connection_id);
    await f.pay(reservations[0]);assert.equal(Number((await f.db.query('select products_prepaid_amount from multisite_orders where id=$1',[master.id])).rows[0].products_prepaid_amount),10);
    await f.pay(reservations[1]);await f.pay(reservations[1]);
    const paid=(await f.db.query('select * from multisite_orders where id=$1',[master.id])).rows[0];assert.equal(paid.bank_payments,true);assert.equal(Number(paid.products_prepaid_amount),20);assert.equal(Number(paid.delivery_fee),8);
    assert.equal(Number((await f.db.query('select sum(amount) n from cash_movements')).rows[0].n),20);
    assert.equal((await f.db.query('select count(*)::int n from bank_order_activations')).rows[0].n,2);
  }finally{await f.db.close();}
});

test('retiring static QR references preserves a private recovery archive and blocks old clients from configuring photos',async()=>{
  const f=await fixture();try{
    await f.db.exec("alter table restaurant_settings add column qr_payment_url text;update restaurant_settings set qr_payment_url='https://example.test/previous-qr.png';");
    await f.db.exec(read('0135_retire_static_payment_qr.sql'));
    assert.equal((await f.db.query('select count(*)::int n from bank_legacy_static_qr_archive')).rows[0].n,3);
    assert.equal((await f.db.query('select count(*)::int n from restaurant_settings where qr_payment_url is not null')).rows[0].n,0);
    await assert.rejects(f.db.query("update restaurant_settings set qr_payment_url='https://example.test/new-static.png'"),/bank-qr-only/);
    await f.db.exec('set role anon');await assert.rejects(f.db.query('select * from bank_legacy_static_qr_archive'),/permission denied/);
  }finally{await f.db.close();}
});

test('web QR remains a private payment reservation, outside staff and real queue, until verified and auto-approved once',async()=>{
  const f=await fixture();try{
    const checkout=await f.checkout();assert.equal((await checkout.replay()).rows[0].id,checkout.id);
    let order=(await f.db.query('select * from orders where id=$1',[checkout.id])).rows[0];assert.equal(order.bank_checkout_hold,true);assert.equal(order.status,'pending');
    const cash=randomUUID();await f.db.query("insert into orders(id,restaurant_id,order_number,order_type,order_origin,payment_method,total) values($1,$2,'CASH','pickup','web_checkout','cash',10)",[cash,f.restaurants[0]]);
    const cashToken=(await f.db.query('select tracking_token from orders where id=$1',[cash])).rows[0].tracking_token;
    assert.equal((await f.db.query('select get_public_order_queue_state($1,$2) result',[checkout.id,checkout.tracking_token])).rows[0].result,null);
    assert.equal((await f.db.query('select get_public_order_queue_state($1,$2) result',[cash,cashToken])).rows[0].result.active_orders,1);
    await f.db.exec('set role authenticated');assert.deepEqual((await f.db.query('select id from orders')).rows.map(r=>r.id),[cash]);await f.db.exec('reset role');
    await f.db.query('update orders set bank_checkout_hold=false where id=$1',[checkout.id]);assert.equal((await f.db.query('select bank_checkout_hold from orders where id=$1',[checkout.id])).rows[0].bank_checkout_hold,true);
    const request=(await f.db.query('select reserve_baneco_order_qr($1,$2) result',[checkout.id,checkout.tracking_token])).rows[0].result.request;
    await f.db.query("update bank_qr_test_requests set qr_id=$2,status='pending' where id=$1",[request.id,'CHECKOUT-'+request.id]);
    await assert.rejects(f.db.query("update orders set status='accepted' where id=$1",[checkout.id]),/bank-payment-required/);
    assert.equal((await f.db.query('select count(*)::int n from cash_movements')).rows[0].n,0);
    await f.pay(request);await f.pay(request);
    const token=randomUUID();const job=(await f.db.query('select claim_baneco_order_activation($1) result',[token])).rows[0].result;assert.equal(job.requestId,request.id);
    await f.db.query('select activate_baneco_paid_order($1,$2,true)',[request.id,token]);await f.db.query('select finish_baneco_order_activation($1,$2,true)',[request.id,token]);
    order=(await f.db.query('select * from orders where id=$1',[checkout.id])).rows[0];assert.equal(order.bank_checkout_hold,false);assert.equal(order.payment_status,'paid');assert.equal(order.status,'accepted');
    await f.db.exec('set role authenticated');assert.equal((await f.db.query('select count(*)::int n from orders')).rows[0].n,2);await f.db.exec('reset role');
    assert.equal((await f.db.query('select count(*)::int n from cash_movements')).rows[0].n,1);assert.equal((await f.db.query('select count(*)::int n from inventory_applied')).rows[0].n,1);
  }finally{await f.db.close();}
});

test('abandoning an unpaid checkout requires bank-confirmed cancellation and does not drop a paid request',async()=>{
  const f=await fixture();try{
    const a=await f.checkout();const request=(await f.db.query('select reserve_baneco_order_qr($1,$2) result',[a.id,a.tracking_token])).rows[0].result.request;
    await f.db.query("update bank_qr_test_requests set qr_id=$2,status='pending' where id=$1",[request.id,'CANCEL-'+request.id]);
    assert.equal((await f.db.query('select abandon_baneco_checkout($1,$2) result',[a.id,a.tracking_token])).rows[0].result,false);
    const token=randomUUID();await f.db.query('select claim_baneco_reconciliation($1,$2,true)',[token,request.id]);await f.db.query("select finish_baneco_reconciliation($1,$2,'cancelled',null,null,'{}')",[request.id,token]);
    assert.equal((await f.db.query('select abandon_baneco_checkout($1,$2) result',[a.id,a.tracking_token])).rows[0].result,true);
    const b=await f.checkout();const paid=(await f.db.query('select reserve_baneco_order_qr($1,$2) result',[b.id,b.tracking_token])).rows[0].result.request;
    await f.db.query("update bank_qr_test_requests set qr_id=$2,status='pending' where id=$1",[paid.id,'PAID-'+paid.id]);await f.pay(paid);
    assert.equal((await f.db.query('select abandon_baneco_checkout($1,$2) result',[b.id,b.tracking_token])).rows[0].result,false);
  }finally{await f.db.close();}
});

test('bank payment with a local stock failure stays held for review and cannot be re-submitted or silently cancelled',async()=>{
  const f=await fixture();try{
    const a=await f.checkout();const request=(await f.db.query('select reserve_baneco_order_qr($1,$2) result',[a.id,a.tracking_token])).rows[0].result.request;
    await f.db.query("update bank_qr_test_requests set qr_id=$2,status='pending' where id=$1",[request.id,'STOCK-'+request.id]);
    await f.db.exec("set test.stock_failure='yes'");await f.pay(request);
    assert.equal((await f.db.query('select application_state from bank_qr_test_requests where id=$1',[request.id])).rows[0].application_state,'review');
    assert.equal((await f.db.query('select bank_checkout_hold from orders where id=$1',[a.id])).rows[0].bank_checkout_hold,true);
    assert.equal((await f.db.query('select count(*)::int n from bank_visible_orders')).rows[0].n,0);
    assert.equal((await f.db.query('select abandon_baneco_checkout($1,$2) result',[a.id,a.tracking_token])).rows[0].result,false);
  }finally{await f.db.close();}
});

test('public tables require bank QR, open no visit until paid, while authenticated staff-origin cash remains pending collection',async()=>{
  const f=await fixture();try{
    const table=randomUUID();await f.db.query("insert into tables values($1,$2,'available')",[table,f.restaurants[0]]);
    await assert.rejects(f.checkout({order_type:'table',order_origin:'table_qr',table_id:table,payment_method:'cash'}),/table-qr-required/);
    const order=await f.checkout({order_type:'table',order_origin:'table_qr',table_id:table});
    assert.equal((await f.db.query('select count(*)::int n from table_visits')).rows[0].n,0);
    const request=(await f.db.query('select reserve_baneco_order_qr($1,$2) r',[order.id,order.tracking_token])).rows[0].r.request;
    await f.db.query("update bank_qr_test_requests set status='pending',qr_id=$2 where id=$1",[request.id,'TABLE-'+request.id]);
    await f.pay(request);await f.pay(request);
    assert.equal((await f.db.query('select count(*)::int n from table_visits')).rows[0].n,1);
    assert.ok((await f.db.query('select table_visit_id from orders where id=$1',[order.id])).rows[0].table_visit_id);
    assert.equal((await f.db.query('select status from tables where id=$1',[table])).rows[0].status,'occupied');
    const cash=await f.checkout({order_type:'table',order_origin:'pos_counter',table_id:table,payment_method:'cash'});
    const row=(await f.db.query('select * from orders where id=$1',[cash.id])).rows[0];
    assert.equal(row.bank_checkout_hold,false);assert.equal(row.payment_status,'pending');assert.equal(row.status,'pending');
    assert.equal((await f.db.query('select count(*)::int n from table_visits')).rows[0].n,1);
    assert.equal((await f.db.query('select count(*)::int n from cash_movements where order_id=$1',[cash.id])).rows[0].n,0);
  }finally{await f.db.close();}
});

test('waiter bank access requires membership, active shift and assigned table and cannot access counter sales or another branch',async()=>{
  const f=await fixture();try{
    const waiter=randomUUID(),other=randomUUID(),table=randomUUID(),otherTable=randomUUID();
    await f.db.query("insert into profiles values($1,null),($2,null)",[waiter,other]);
    await f.db.query("insert into restaurant_memberships values($1,$2,true,'waiter')",[waiter,f.restaurants[0]]);
    const order=await f.checkout({order_type:'table',order_origin:'pos_counter',table_id:table,payment_method:'cash'});
    const check=(actor=waiter,restaurant=f.restaurants[0],id=order.id)=>f.db.query('select authorize_baneco_staff_order($1,$2,$3)',[restaurant,id,actor]);
    await assert.rejects(check(),/bank-forbidden/);
    await f.db.query("insert into admin_audit_logs(actor_user_id,restaurant_id,action) values($1,$2,'waiter_shift_opened')",[waiter,f.restaurants[0]]);
    await check();await assert.rejects(check(other),/bank-forbidden/);await assert.rejects(check(waiter,f.restaurants[1]),/bank-forbidden/);
    const sale=await f.checkout({order_origin:'pos_counter'});await assert.rejects(check(waiter,f.restaurants[0],sale.id),/bank-forbidden/);
    await f.db.query('insert into waiter_table_assignments values($1,$2,$3)',[f.restaurants[0],otherTable,waiter]);await assert.rejects(check(),/bank-forbidden/);
    await f.db.query('insert into waiter_table_assignments values($1,$2,$3)',[f.restaurants[0],table,waiter]);await check();
    await f.db.query('select prepare_baneco_staff_order($1,$2,$3)',[f.restaurants[0],order.id,waiter]);
    assert.equal((await f.db.query('select payment_method from orders where id=$1',[order.id])).rows[0].payment_method,'qr');
    await f.db.query("insert into admin_audit_logs(actor_user_id,restaurant_id,action,created_at) values($1,$2,'waiter_shift_closed',now()+interval '1 second')",[waiter,f.restaurants[0]]);await assert.rejects(check(),/bank-forbidden/);
    await f.db.exec('set role authenticated');await assert.rejects(check(),/permission denied/);
  }finally{await f.db.close();}
});

test('scheduled bank payment waits for start and correct cash day, then releases and posts exactly once without recharging',async()=>{
  const f=await fixture();try{
    const start=new Date(Date.now()+3500);
    const order=await f.checkout({requested_fulfillment_at:start.toISOString()});
    // A still-open session from a previous Bolivia day must not receive it.
    await f.db.query("update cash_sessions set opened_at=now()-interval '2 days' where restaurant_id=$1",[f.restaurants[0]]);
    const request=(await f.db.query('select reserve_baneco_order_qr($1,$2) r',[order.id,order.tracking_token])).rows[0].r.request;
    await f.db.query("update bank_qr_test_requests set status='pending',qr_id=$2 where id=$1",[request.id,'SCHEDULE-'+request.id]);await f.pay(request);
    let row=(await f.db.query('select * from orders where id=$1',[order.id])).rows[0];
    const paidAt=row.payment_verified_at;assert.equal(row.payment_status,'paid');assert.equal(row.status,'pending');assert.equal(row.bank_checkout_hold,false);assert.equal(row.bank_schedule_hold,true);
    assert.equal((await f.db.query('select application_state from bank_qr_test_requests where id=$1',[request.id])).rows[0].application_state,'waiting_cash');
    assert.equal((await f.db.query('select count(*)::int n from bank_visible_orders')).rows[0].n,0);
    await assert.rejects(f.db.query("update orders set status='accepted' where id=$1",[order.id]),/bank-schedule-not-due/);
    assert.equal((await f.db.query('select claim_baneco_order_activation($1) r',[randomUUID()])).rows[0].r,null);
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,start.getTime()-Date.now()+75)));
    assert.equal((await f.db.query('select post_waiting_baneco_payments() n')).rows[0].n,0);
    let token=randomUUID();await f.db.query('select claim_baneco_order_activation($1)',[token]);
    assert.equal((await f.db.query('select activate_baneco_paid_order($1,$2,true) r',[request.id,token])).rows[0].r.deferred,true);
    await f.db.query("update cash_sessions set status='closed' where restaurant_id=$1",[f.restaurants[0]]);
    const current=randomUUID();await f.db.query("insert into cash_sessions(id,restaurant_id,status) values($1,$2,'open')",[current,f.restaurants[0]]);
    assert.equal((await f.db.query('select post_waiting_baneco_payments() n')).rows[0].n,1);
    assert.equal((await f.db.query('select post_waiting_baneco_payments() n')).rows[0].n,0);
    await f.db.query('update bank_order_activations set next_attempt_at=now() where request_id=$1',[request.id]);token=randomUUID();await f.db.query('select claim_baneco_order_activation($1)',[token]);
    await f.db.query('select activate_baneco_paid_order($1,$2,true)',[request.id,token]);await f.db.query('select finish_baneco_order_activation($1,$2,true)',[request.id,token]);
    row=(await f.db.query('select * from orders where id=$1',[order.id])).rows[0];assert.equal(row.status,'accepted');assert.equal(row.bank_schedule_hold,false);assert.deepEqual(row.payment_verified_at,paidAt);assert.ok(new Date(row.accepted_at)>=start);
    const movements=(await f.db.query('select * from cash_movements where order_id=$1',[order.id])).rows;assert.equal(movements.length,1);assert.equal(movements[0].cash_session_id,current);
  }finally{await f.db.close();}
});
