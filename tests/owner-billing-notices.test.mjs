import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const code=ts.transpileModule(readFileSync(new URL('../src/lib/billing/notice-policy.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exports={}; vm.runInNewContext(code,{exports});
const policy=exports.billingNoticePolicy;
test('billing lookup includes suspended staff accounts but never another owner or inactive membership',async()=>{
  let profile={id:'staff',globalRole:null,isCustomerAccount:false};
  const data={ restaurant_memberships:[{restaurant_id:'allowed',user_id:'staff',is_active:true},{restaurant_id:'denied',user_id:'staff',is_active:false},{restaurant_id:'foreign',user_id:'someone',is_active:true}],
    restaurants:[{id:'allowed',name:'Suspendido',owner_user_id:'owner',deleted_at:null},{id:'denied',name:'No permitido',owner_user_id:'other',deleted_at:null},{id:'foreign',name:'Ajeno',owner_user_id:'stranger',deleted_at:null}] };
  const admin={from(table){let rows=data[table];return{select(){return this},eq(key,value){rows=rows.filter(row=>row[key]===value);return this},is(key,value){rows=rows.filter(row=>row[key]===value);return this},in(key,values){rows=rows.filter(row=>values.includes(row[key]));return this},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve)}}}};
  const output=ts.transpileModule(readFileSync(new URL('../src/lib/services/billing-notice.service.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(output,{exports:module.exports,require(name){if(name==='./auth.service')return{authService:{getCurrentProfile:async()=>profile}};if(name.includes('supabase/admin'))return{createAdminClient:()=>admin};if(name==='./owner-billing.service')return{ownerBillingService:{getSnapshot:async ownerId=>({ownerId})}};throw Error(name);}});
  const accounts=await module.exports.getMyBillingAccounts();
  assert.equal(accounts.length,1);assert.equal(accounts[0].ownerId,'owner');assert.equal(accounts[0].isOwner,false);
  assert.equal((await module.exports.getMyBillingAccounts('foreign')).length,0);
  profile={...profile,isCustomerAccount:true};assert.equal((await module.exports.getMyBillingAccounts()).length,0);
});
test('billing warnings start five days before, stop when paid, and distinguish grace from cutoff',()=>{
  const cycle={dueDate:'2026-10-15',isBillable:true,status:'pending'};
  assert.equal(policy(cycle,5,3,'2026-10-09').showNotice,false);
  assert.equal(policy(cycle,5,3,'2026-10-10').showNotice,true);
  assert.equal(policy(cycle,5,3,'2026-10-18').isOverdue,false);
  assert.equal(policy(cycle,5,3,'2026-10-19').isOverdue,true);
  for(const patch of [{paidAt:'2026-10-10'},{isBillable:false},{status:'cancelled'}]) assert.equal(policy({...cycle,...patch},5,3,'2026-10-19').showNotice,false);
  assert.equal(policy({...cycle,paymentPromisedOn:'2026-10-25'},5,3,'2026-10-19').isOverdue,true);
  assert.equal(policy({...cycle,paymentExtensionUntil:'2026-10-25'},5,3,'2026-10-25').isOverdue,false);
  assert.equal(policy({...cycle,paymentExtensionUntil:'2026-10-25'},5,3,'2026-10-26').isOverdue,true);
  assert.equal(policy({...cycle,paymentExtensionUntil:'2026-10-12'},5,3,'2026-10-18').isOverdue,false);
});

const owner='11111111-1111-4111-8111-111111111111', staff='22222222-2222-4222-8222-222222222222', superadmin='33333333-3333-4333-8333-333333333333', stranger='44444444-4444-4444-8444-444444444444', cycle='55555555-5555-4555-8555-555555555555';
async function fixture(){
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table profiles(id uuid primary key,global_role text);
    create table restaurants(id uuid primary key default gen_random_uuid(),owner_user_id uuid,deleted_at timestamptz);
    create table restaurant_memberships(restaurant_id uuid,user_id uuid,is_active boolean);
    create table owner_platform_billing_settings(owner_user_id uuid,next_due_date date,reminder_days integer default 4);
    create table owner_platform_payment_cycles(id uuid primary key,owner_user_id uuid,due_date date,is_billable boolean,paid_at timestamptz,status text);
    insert into profiles values('${owner}',null),('${staff}',null),('${superadmin}','superadmin'),('${stranger}',null);
    insert into restaurants(owner_user_id)values('${owner}');
    insert into restaurant_memberships select id,'${staff}',true from restaurants;
    insert into owner_platform_billing_settings values('${owner}',current_date+5,4);
    insert into owner_platform_payment_cycles values('${cycle}','${owner}',current_date+5,true,null,'pending');`);
  await db.exec(readFileSync(new URL('../supabase/migrations/0118_owner_billing_notices_and_promises.sql',import.meta.url),'utf8'));
  const date=(await db.query("select ((clock_timestamp() at time zone 'America/La_Paz')::date+10)::text as value")).rows[0].value;
  const call=(actor,action,day=date)=>db.query('select resolve_owner_billing_promise($1,$2,$3,$4,$5)',[cycle,actor,action,day,'Solicitud de prueba']);
  return{db,call,date};
}
test('owner and staff can propose; only superadmin approves without marking paid or changing next month',async()=>{
  const {db,call,date}=await fixture();try{
    await assert.rejects(call(stranger,'request'),/billing-forbidden/);
    await call(staff,'request');
    let row=(await db.query('select * from owner_platform_payment_cycles')).rows[0];
    assert.equal(row.payment_promise_status,'pending'); assert.equal(row.payment_extension_until,null); assert.equal(row.paid_at,null);
    await assert.rejects(call(staff,'approve'),/billing-forbidden/);
    await assert.rejects(call(owner,'approve'),/billing-forbidden/);
    const before=(await db.query('select next_due_date::text from owner_platform_billing_settings')).rows[0].next_due_date;
    await call(superadmin,'approve');
    row=(await db.query('select * from owner_platform_payment_cycles')).rows[0];
    assert.equal(row.payment_extension_until.toISOString().slice(0,10),date);assert.equal(row.paid_at,null);assert.equal(row.payment_promise_reviewed_by,superadmin);
    assert.equal((await db.query('select next_due_date::text from owner_platform_billing_settings')).rows[0].next_due_date,before);
    await call(owner,'request'); await call(superadmin,'reject',null);
    assert.equal((await db.query('select payment_extension_until::text from owner_platform_payment_cycles')).rows[0].payment_extension_until,date);
  }finally{await db.close();}
});
test('inactive memberships, past dates and closed cycles are rejected; RPC is service-only',async()=>{
  const{db,call}=await fixture();try{
    await db.exec('update restaurant_memberships set is_active=false');
    await assert.rejects(call(staff,'request'),/billing-forbidden/);
    await assert.rejects(call(owner,'request','2000-01-01'),/billing-invalid-date/);
    await db.exec("update owner_platform_payment_cycles set paid_at=now(),status='paid'");
    await assert.rejects(call(owner,'request'),/billing-cycle-closed/);
    for(const role of ['anon','authenticated']) assert.equal((await db.query("select has_function_privilege($1,'resolve_owner_billing_promise(uuid,uuid,text,date,text)','execute') as allowed",[role])).rows[0].allowed,false);
    assert.equal((await db.query('select reminder_days from owner_platform_billing_settings')).rows[0].reminder_days,5);
  }finally{await db.close();}
});
