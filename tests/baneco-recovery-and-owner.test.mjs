import assert from 'node:assert/strict';
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function load(path,mocks={},globals={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>name==='server-only'?{}:name in mocks?mocks[name]:require(name),process,Buffer,URL,Date,Intl,Error,console,setTimeout,clearTimeout,...globals});
  return exports;
}
const bank=load('src/lib/payments/baneco.ts');
test('browser restart recovers the same request, no images/credentials or claimed payment status are persisted',async()=>{
  const values=new Map();const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const globals={localStorage:storage,crypto:webcrypto,Event:class{},window:{dispatchEvent(){}},fetch:async()=>({ok:true,json:async()=>({path:'/pruebas/pedido/order?token=opaque',terminal:false})})};
  const first=load('src/lib/client/order-recovery.ts',{},globals);
  const merchant=randomUUID();const attempt=first.prepareOrderRecovery(merchant,'pruebas');
  // New JS runtime, same persistent storage: no state from the original page.
  const reopened=load('src/lib/client/order-recovery.ts',{},globals);
  const retry=reopened.prepareOrderRecovery(merchant,'pruebas');
  assert.equal(retry.requestId,attempt.requestId);assert.equal(retry.recoveryKey,attempt.recoveryKey);
  assert.equal((await reopened.recoverOrder(retry)).path,'/pruebas/pedido/order?token=opaque');
  const raw=[...values.values()][0];
  assert.doesNotMatch(raw,/qr_image|paid|password|accountCredit|customer|tracking_token/);
  reopened.markOrderRecovered(retry.requestId,false);
  const next=reopened.prepareOrderRecovery(merchant,'pruebas');assert.notEqual(next.requestId,retry.requestId);
  assert.equal(reopened.readRecoverableOrders().length,2); // old tracking remains accessible
  reopened.markOrderRecovered(retry.requestId,true);assert.equal(reopened.readRecoverableOrders().length,1);
  values.set('yopido:order-recovery:v1','{broken');assert.equal(reopened.readRecoverableOrders().length,0);
});
test('blocked local storage fails before an unrecoverable submission and server hashes the recovery capability',()=>{
  const client=load('src/lib/client/order-recovery.ts',{}, {localStorage:{getItem:()=>null,setItem:()=>{throw Error('blocked');}},crypto:webcrypto});
  assert.throws(()=>client.prepareOrderRecovery(randomUUID(),'pruebas'),/blocked/);
  const server=load('src/lib/payments/order-recovery.ts',{'@/lib/supabase/admin':{},'@/lib/payments/baneco':bank});
  const key='a'.repeat(64);assert.equal(server.orderRecoveryHash(key),createHash('sha256').update('yopido-order-recovery-v1:'+key).digest('hex'));
  assert.notEqual(server.orderRecoveryHash(key),key);assert.throws(()=>server.orderRecoveryHash('short'),/bank-invalid-input/);
});
test('reopening an unpaid checkout returns to payment, not received tracking, and rejects unrelated recovery paths',async()=>{
  const values=new Map();let path='/pruebas/pago/reservation?token=opaque';
  const client=load('src/lib/client/order-recovery.ts',{}, {localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},
    crypto:webcrypto,Event:class{},window:{dispatchEvent(){}},fetch:async()=>({ok:true,json:async()=>({path,terminal:false})})});
  const row=client.prepareOrderRecovery(randomUUID(),'pruebas');
  assert.equal((await client.recoverOrder(row)).path,path);
  assert.equal(client.prepareOrderRecovery(row.restaurantId,'pruebas').requestId,row.requestId);
  for(const unsafe of ['https://example.test/pruebas/pago/id','/otro/pago/id','/pruebas/pagofalso/id']){
    path=unsafe;await assert.rejects(client.recoverOrder(row),/recovery-unavailable/);
  }
});
test('payment has a separate route, tracking redirects before querying the queue, and only paid submission opens tracking',()=>{
  const action=read('src/app/r/actions.ts');
  assert.match(action,/dynamicQr \? "pago" : "pedido"/);
  assert.match(read('src/app/api/mobile/orders/route.ts'),/pago\/\$\{order\.id\}/);
  const tracking=read('src/app/r/[restaurantSlug]/pedido/[orderId]/page.tsx');
  assert.ok(tracking.indexOf('`pago/${orderId}`')<tracking.indexOf('orderService.getPublicQueueState'));
  const page=read('src/app/r/[restaurantSlug]/pago/[orderId]/page.tsx');
  assert.match(page,/eq\("tracking_token", token\)/);assert.match(page,/Paga para enviar tu pedido/);
  assert.doesNotMatch(page,/VirtualQueue|ClearCartOnMount|RememberOrder/);
  const ui=read('src/components/orders/BankCheckoutPayment.tsx');
  assert.match(ui,/next.paymentStatus === "paid" && !next.checkoutHeld/);
  assert.match(ui,/!\["pending", "cancelled"\]\.includes\(next.orderStatus\)/);
  assert.match(ui,/visibilitychange/);assert.match(ui,/"online"/);
  assert.ok(read('src/components/customer/PublicBottomNavigation.tsx').includes('\\/pago(?:\\/|$)'));
  assert.match(read('src/lib/services/mobile-push.service.ts'),/eq\("bank_checkout_hold", false\)/);
});
test('owner access is branch-scoped, denies staff and support before decryption or bank calls',async()=>{
  const owner=randomUUID(),merchant=randomUUID();let profile={id:owner,globalRole:null},support=null,dbCalls=0,opened=0;
  const row={id:merchant,owner_user_id:owner,status:'active',deleted_at:null};
  const admin={from(table){dbCalls++;return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:table==='restaurants'?row:null,error:null})};}};
  const service=load('src/lib/services/bank-qr.service.ts',{
    '@/lib/services/auth.service':{authService:{getCurrentProfile:async()=>profile}},
    '@/lib/services/support-impersonation.service':{getActiveSupportSession:async()=>support},
    '@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/payments/credential-vault':{openBankCredentials:()=>{opened++;throw Error('must not open');}},
    '@/lib/payments/baneco':bank,'@/lib/restaurant-directory-options':{},'@/lib/services/mobile-push.service':{},
    '@/lib/services/order-whatsapp-notification.service':{},'@/lib/services/rider-dispatch.service':{},
  });
  await service.requireBankOwner(merchant);
  profile={id:randomUUID(),globalRole:'cashier'};await assert.rejects(service.requireBankOwner(merchant),/bank-forbidden/);
  profile={id:randomUUID(),globalRole:'restaurant_admin'};await assert.rejects(service.requireBankOwner(merchant),/bank-forbidden/);
  profile={id:owner,globalRole:null};
  await assert.rejects(service.bankBranchConnectionService.operate(merchant,randomUUID(),'check'),/bank-connection-unavailable/);
  assert.equal(opened,0);
  support={id:'support'};const before=dbCalls;await assert.rejects(service.requireBankOwner(merchant),/bank-forbidden/);assert.equal(dbCalls,before);
  support=null;profile={id:owner,mustChangePassword:true};await assert.rejects(service.requireBankOwner(merchant),/bank-forbidden/);
});
