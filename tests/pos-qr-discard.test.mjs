import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function load(path,mocks={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>name==='server-only'?{}:name in mocks?mocks[name]:require(name),process,Buffer,URL,Request,Response,Date,Intl,Error,console,setTimeout,clearTimeout});
  return exports;
}
const restaurantId='11111111-1111-4111-8111-111111111111',orderId='22222222-2222-4222-8222-222222222222',actor='33333333-3333-4333-8333-333333333333';
const bank=load('src/lib/payments/baneco.ts');
function serviceFixture() {
  const order={id:orderId,restaurant_id:restaurantId,bank_checkout_hold:true,status:'pending',payment_status:'pending'};
  const events=[];let cancellation='not_created',abandoned=true;
  const query={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:order,error:null})};
  const admin={from:()=>query,rpc:async(name)=>{events.push(name);return{data:abandoned,error:null};}};
  const {bankOrderPaymentService:service}=load('src/lib/services/bank-qr.service.ts',{
    '@/lib/services/auth.service':{},'@/lib/services/support-impersonation.service':{},'@/lib/supabase/admin':{createAdminClient:()=>admin},
    '@/lib/payments/credential-vault':{},'@/lib/payments/baneco':bank,'@/lib/restaurant-directory-options':{},
    '@/lib/services/mobile-push.service':{},'@/lib/services/order-whatsapp-notification.service':{},'@/lib/services/rider-dispatch.service':{},
  });
  service.cancel=async()=>{events.push('verify-bank-and-cancel');return{status:cancellation};};
  service.get=async()=>({status:cancellation});
  return{order,events,service,cancellation:value=>{cancellation=value;},abandoned:value=>{abandoned=value;}};
}
test('discard verifies and cancels the bank QR before cancelling the private reservation',async()=>{
  const f=serviceFixture();
  assert.equal((await f.service.abandonCheckout(orderId,'private-token')).abandoned,true);
  assert.deepEqual(f.events,['verify-bank-and-cancel','abandon_baneco_checkout']);
});
test('paid, pending, unknown and busy QR results cannot be discarded; a raced DB rejection remains recoverable',async()=>{
  for(const status of ['paid','pending','unknown','generating','review','expired']) {
    const f=serviceFixture();f.cancellation(status);
    await assert.rejects(f.service.abandonCheckout(orderId,'private-token'),/bank-operation-busy/);
    assert.deepEqual(f.events,['verify-bank-and-cancel']);
  }
  const f=serviceFixture();f.abandoned(false);
  await assert.rejects(f.service.abandonCheckout(orderId,'private-token'),/bank-operation-busy/);
});
test('discard retries recover a confirmed cancellation and never cancel an operational or paid order',async()=>{
  const f=serviceFixture();f.order.status='cancelled';f.order.payment_status='cancelled';f.cancellation('unavailable');
  assert.equal((await f.service.abandonCheckout(orderId,'private-token')).abandoned,true);assert.deepEqual(f.events,[]);
  f.cancellation('paid');await assert.rejects(f.service.abandonCheckout(orderId,'private-token'),/bank-operation-busy/);
  for(const patch of [{bank_checkout_hold:false,status:'accepted',payment_status:'pending'},{status:'pending',payment_status:'paid'}]){
    const g=serviceFixture();Object.assign(g.order,patch);
    await assert.rejects(g.service.abandonCheckout(orderId,'private-token'),/bank-order-ineligible/);assert.deepEqual(g.events,[]);
  }
});
function routeFixture() {
  const events=[];let forbidden=false,paid=false;
  class PosError extends Error {constructor(message,status=409){super(message);this.status=status;}}
  const order={id:orderId,restaurant_id:restaurantId,tracking_token:'private-capability',bank_group_session_id:null,order_number:'POS-7',order_type:'table',table_id:actor,total:30,created_at:'2026-11-07T12:00:00Z'};
  const auth={profile:{id:actor},admin:{
    rpc:async(name)=>{events.push(name);return{data:null,error:forbidden?{message:'bank-forbidden'}:null};},
    from(table){return{select(){return this;},eq(){return this;},gt(){return this;},limit(){return this;},maybeSingle:async()=>({data:table==='orders'?order:null,error:null})};},
  }};
  const route=load('src/app/api/mobile/pos/bank-qr/route.ts',{
    '@/lib/supabase/server':{},'@/lib/security/rate-limit':{consumeRateLimit:async()=>({allowed:true})},
    '../_shared':{PosError,session:async request=>{if(!request.headers.has('authorization'))throw new PosError('bank-forbidden',401);return auth;},restaurantAccess:(_auth,id)=>{if(id!==restaurantId)throw new PosError('bank-forbidden',403);},checked:result=>{if(result.error)throw new PosError(result.error.message,403);return result.data;},json:(body,status=200)=>Response.json(body,{status})},
    '@/lib/services/bank-qr.service':{safeBankError:error=>error.message,bankOrderPaymentService:{
      get:async()=>({status:'pending',amount:30,checkoutHeld:true,paymentStatus:'pending',orderStatus:'pending'}),
      abandonCheckout:async(id,token)=>{events.push(['discard',id,token]);if(paid)throw new PosError('bank-operation-busy');return{abandoned:true};},
    }},
  });
  return{route,events,forbid:()=>{forbidden=true;},paid:()=>{paid=true;}};
}
const discardRequest=()=>new Request('https://pos.test/api/mobile/pos/bank-qr',{method:'POST',headers:{authorization:'Bearer session','content-type':'application/json'},body:JSON.stringify({restaurantId,orderId,action:'discard'})});
test('authenticated staff discard uses existing authorization, skips QR generation and returns confirmation',async()=>{
  const f=routeFixture(),response=await f.route.POST(discardRequest());
  assert.equal(response.status,200);assert.equal((await response.json()).abandoned,true);
  assert.equal(f.events[0],'authorize_baneco_staff_order');assert.deepEqual(f.events[1],['discard',orderId,'private-capability']);
  assert.equal(f.events.includes('prepare_baneco_staff_order'),false);
});
test('forbidden staff cannot discard and a confirmed payment cannot report successful discard',async()=>{
  const f=routeFixture();f.forbid();assert.equal((await f.route.POST(discardRequest())).status,403);assert.equal(f.events.length,1);
  const g=routeFixture();g.paid();assert.equal((await g.route.POST(discardRequest())).status,409);
});
test('pending drawer receives authorized order number, destination and amount without customer data',async()=>{
  const f=routeFixture(),response=await f.route.GET(new Request(`https://pos.test/api/mobile/pos/bank-qr?restaurantId=${restaurantId}&orderId=${orderId}`,{headers:{authorization:'Bearer session'}}));
  const data=await response.json();assert.equal(response.status,200);assert.equal(data.orderNumber,'POS-7');assert.equal(data.orderType,'table');assert.equal(data.tableId,actor);assert.equal(data.amount,30);
  assert.equal('customer_name' in data,false);assert.equal('customer_phone' in data,false);
});
