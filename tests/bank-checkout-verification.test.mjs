import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>name in mocks?mocks[name]:require(name),Request,Response,URL,console});return exports;}
const state=load('src/lib/payments/bank-order-state.ts');
const pending={available:true,status:'pending',paymentStatus:'pending',orderStatus:'pending',checkoutHeld:true};
const received={...pending,status:'paid',paymentStatus:'paid',applicationState:'applied'};
const accepted={...received,checkoutHeld:false,orderStatus:'accepted'};
test('only confirmed applied payments open tracking; scheduled receipts and review remain distinct',()=>{
 for(const value of [null,pending,received,{...accepted,applicationState:'review'},{...accepted,orderStatus:'cancelled'},{...accepted,paymentStatus:'pending'}])assert.equal(Boolean(state.bankCheckoutIsSubmitted(value)),false);
 assert.equal(state.bankCheckoutIsSubmitted(accepted),true);
 assert.equal(state.bankCheckoutIsSubmitted({...received,checkoutHeld:false,scheduleHeld:true}),true);
});
test('late polling cannot erase receipt or submission and a real cancellation remains visible',()=>{
 assert.equal(state.mergeBankPayment(received,pending),received);
 assert.equal(state.mergeBankPayment(accepted,received),accepted);
 assert.equal(state.mergeBankPayment(received,accepted),accepted);
 const cancelled={...accepted,orderStatus:'cancelled'};
 assert.equal(state.mergeBankPayment(accepted,cancelled),cancelled);
});
function fixture(allowed=true,paid=false){const calls=[],limits=[],background=[];
 const service=Object.fromEntries(['get','generate','verify','cancel','abandonCheckout','activateVerifiedCheckout'].map(action=>[action,async(...args)=>{calls.push({action,args});return {...(paid?received:pending),verificationPending:true};}]));
 const route=load('src/app/api/payments/baneco/order/route.ts',{
  'next/server': {...require('next/server'),after:task=>background.push(task)},
  '@/lib/services/bank-qr.service':{bankOrderPaymentService:service,safeBankError:()=> 'bank-operation-busy'},
  '@/lib/security/rate-limit':{consumeRateLimit:async input=>{limits.push(input);return {allowed};}},
 });return {route,calls,limits,background};}
const id='11111111-1111-4111-8111-111111111111',token='test-customer-tracking-token-1234567890';
const request=(action,method='POST',capability=token)=>new Request('https://yopido.test/api/payments/baneco/order?orderId='+id+(action?'&action='+action:''),{method,headers:{'x-order-tracking-token':capability}});
test('explicit verify is authenticated by the existing capability and never generates or cancels',async()=>{
 const f=fixture();const response=await f.route.POST(request('verify'));assert.equal(response.status,200);assert.equal((await response.json()).verificationPending,true);
 assert.deepEqual(f.calls.map(c=>c.action),['verify']);assert.equal(f.calls[0].args[0],id);assert.equal(f.calls[0].args[1],token);
 assert.equal(f.limits[0].scope,'baneco-order-verify');
 await f.route.GET(request('', 'GET'));await f.route.POST(request(''));
 assert.deepEqual(f.calls.map(c=>c.action),['verify','get','generate']);
});
test('invalid access and verification throttling do not reach the bank adapter',async()=>{
 const f=fixture();assert.equal((await f.route.POST(request('verify','POST','short'))).status,404);assert.equal(f.calls.length,0);assert.equal(f.limits.length,0);
 const limited=fixture(false);assert.equal((await limited.route.POST(request('verify'))).status,429);assert.equal(limited.calls.length,0);
});

test('bank receipt responds before activation and notification work runs in the background',async()=>{
 const f=fixture(true,true);const response=await f.route.POST(request('verify'));
 assert.equal(response.status,200);assert.equal((await response.json()).status,'paid');
 assert.deepEqual(f.calls.map(c=>c.action),['verify']);assert.equal(f.background.length,1);
 await f.background[0]();assert.deepEqual(f.calls.map(c=>c.action),['verify','activateVerifiedCheckout']);
});

test('automatic bank checks have an eight-second minimum and do not poll cancelled, review, or scheduled payments',()=>{
 assert.equal(state.shouldAutoVerifyBankPayment(pending,0,10000),true);
 assert.equal(state.shouldAutoVerifyBankPayment(pending,3000,10000),false);
 assert.equal(state.shouldAutoVerifyBankPayment(received,0,10000),true);
 for(const payment of [null,accepted,{...pending,orderStatus:'cancelled'},{...received,applicationState:'review'},{...received,scheduleHeld:true}])assert.equal(Boolean(state.shouldAutoVerifyBankPayment(payment,0,10000)),false);
});
test('reading an already-paid held checkout also schedules its activation without a manual button',async()=>{
 const f=fixture(true,true);const response=await f.route.GET(request('','GET'));assert.equal(response.status,200);assert.equal(f.background.length,1);await f.background[0]();assert.deepEqual(f.calls.map(c=>c.action),['get','activateVerifiedCheckout']);
});
