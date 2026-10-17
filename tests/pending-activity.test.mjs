import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto, randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function load(path,mocks={},globals={}){
  const exports={};
  vm.runInNewContext(ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>name in mocks?mocks[name]:require(name),Date,URL,Request,Response,TextDecoder,Error,Intl,console,setTimeout,clearTimeout,...globals});
  return exports;
}
function fixture(){
  let now=Date.parse('2026-10-17T12:00:00-04:00');const values=new Map();
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const globals={Date:Clock,localStorage:storage,window:{localStorage:storage,dispatchEvent(){}},Event:class{},crypto:webcrypto};
  const policy=load('src/lib/client/pending-activity-policy.ts',{},globals);
  const recovery=load('src/lib/client/order-recovery.ts',{'./pending-activity-policy':policy},globals);
  const cart=load('src/lib/utils/cart.ts',{'../client/pending-activity-policy':policy},globals);
  return {values,policy,recovery,cart,globals,now:()=>now,advance:ms=>{now+=ms;}};
}
const metadata={restaurantId:'branch',restaurantSlug:'pizza-brava',restaurantName:'Pizza Brava'};
const product={cartId:'pizza',productId:'product',name:'Pizza',price:45,quantity:1,imageUrl:''};
test('home shortcuts stop exactly at thirty minutes and reject future or malformed clocks',()=>{
  const f=fixture(),start=f.now();
  assert.equal(f.policy.activityIsVisible(start,start+30*60000-1),true);
  assert.equal(f.policy.activityIsVisible(start,start+30*60000),false);
  assert.equal(f.policy.activityIsVisible(start+1,start),false);
  assert.equal(f.policy.activityIsVisible(NaN,start),false);
  assert.equal(f.policy.activityMinutesRemaining(start,start),30);
  assert.equal(f.policy.activityMinutesRemaining(start,start+29*60000+1),1);
  assert.equal(f.policy.readableRestaurantName('pizza-brava'),'Pizza Brava');
});
test('expiry and hiding remove visibility, never the pending payment capability or idempotency key',()=>{
  const f=fixture(),branch=randomUUID(),row=f.recovery.prepareOrderRecovery(branch,'pruebas');
  f.advance(29*60000+59999);assert.equal(f.recovery.visibleRecoverableOrders().length,1);
  f.advance(1);assert.equal(f.recovery.visibleRecoverableOrders().length,0);
  assert.equal(f.recovery.prepareOrderRecovery(branch,'pruebas').requestId,row.requestId);
  assert.equal(f.recovery.readRecoverableOrders()[0].recoveryKey,row.recoveryKey);
  const second=f.recovery.prepareOrderRecovery(randomUUID(),'pizza-brava');
  f.recovery.hideOrderRecovery(second.requestId);
  assert.equal(f.recovery.visibleRecoverableOrders().length,0);
  const retained=f.recovery.prepareOrderRecovery(second.restaurantId,'pizza-brava');
  assert.equal(retained.requestId,second.requestId);assert.notEqual(retained.submitted,true);
});
test('a cart expires after thirty minutes without extending its life on reads',()=>{
  const f=fixture(),start=f.now();f.cart.writeCart([product],metadata);
  assert.equal(Date.parse(f.cart.listPendingCarts()[0].expiresAt),start+30*60000);
  f.advance(29*60000+59999);assert.equal(f.cart.readCart('pizza-brava').length,1);
  assert.equal(Date.parse(f.cart.listPendingCarts()[0].updatedAt),start);
  f.advance(1);assert.equal(f.cart.listPendingCarts().length,0);
  assert.equal(f.cart.readCart('pizza-brava').length,0);
});
test('existing end-of-day carts are shortened from their original timestamp, not renewed on deployment',()=>{
  const f=fixture();const updated=f.now()-20*60000;
  f.values.set(f.cart.cartStorageKey,JSON.stringify({'pizza-brava':{...metadata,items:[product],updatedAt:new Date(updated).toISOString(),expiresAt:new Date(f.now()+8*3600000).toISOString()}}));
  assert.equal(Date.parse(f.cart.listActiveCarts()[0].expiresAt),updated+30*60000);
  f.advance(10*60000);assert.equal(f.cart.listPendingCarts().length,0);
});
test('expired in-memory carts cannot be resurrected by adding or editing another item',()=>{
  const f=fixture();
  const zustand={create:initialize=>{let state;const set=value=>{state={...state,...(typeof value==='function'?value(state):value)};};state=initialize(set,()=>state);return {getState:()=>state};}};
  const {usePublicOrderStore}=load('src/stores/public-order-store.ts',{'zustand':zustand,'@/lib/utils/cart':f.cart},f.globals);
  const store=usePublicOrderStore.getState();store.addCartItem(metadata,product);
  f.advance(30*60000);store.addCartItem(metadata,{...product,cartId:'new',productId:'new',name:'Nueva pizza'});
  assert.equal(usePublicOrderStore.getState().carts['pizza-brava'].length,1);
  assert.equal(usePublicOrderStore.getState().carts['pizza-brava'][0].cartId,'new');
});
test('recovery routes unpaid and held requests to payment, and only valid paid requests to tracking',async()=>{
  let order;const id=randomUUID(),restaurantId=randomUUID();
  const route=load('src/app/api/payments/baneco/recover/route.ts',{
    'next/server':{NextResponse:{json:(data,init)=>new Response(JSON.stringify(data),init)}},
    '@/lib/payments/order-recovery':{findRecoverableOrder:async()=>order},
    '@/lib/security/rate-limit':{consumeRateLimit:async()=>({allowed:true})},
    '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{slug:'pruebas',name:'Pruebas',logo_url:null}})})})},
  });
  const request=()=>new Request('https://yopido.test/api/payments/baneco/recover',{method:'POST',body:JSON.stringify({restaurantId,requestId:randomUUID(),recoveryKey:'a'.repeat(64)})});
  const base={id,restaurant_id:restaurantId,order_number:'QA',tracking_token:'capability',status:'pending',total:45,bank_payment_required:true,bank_auto_accept:true,bank_checkout_hold:false,bank_schedule_hold:false,payment_status:'pending'};
  for(const state of [base,{...base,payment_status:'paid',bank_checkout_hold:true},{...base,payment_status:'paid'}]){
    order=state;const result=await (await route.POST(request())).json();assert.equal(result.stage,'payment');assert.match(result.path,/\/pago\//);assert.equal(result.restaurantName,'Pruebas');assert.equal(result.paymentStatus,state.payment_status);
  }
  for(const state of [{...base,status:'accepted',payment_status:'paid'},{...base,payment_status:'paid',bank_schedule_hold:true}]){
    order=state;const result=await (await route.POST(request())).json();assert.equal(result.stage,'tracking');assert.match(result.path,/\/pedido\//);
  }
});
