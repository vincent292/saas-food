import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const path='src/app/admin/actions.ts',source=fs.readFileSync(path,'utf8'),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='approvePendingOrderAction');
function fixture(mode){const calls=[],previous={status:'pending',order_type:'pos',payment_status:'pending',payment_method:'cash'},q={select(){return q},eq(){return q},maybeSingle:async()=>({data:previous})};const exports={};
vm.runInNewContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,console,
 chargeOrderSchema:{safeParse:data=>({success:true,data})},requireUser:async()=>({supabase:{from:()=>q,rpc:async(name,args)=>{calls.push({name,args});return{data:[{resulting_status:'accepted'}],error:null}}}}),requireRestaurantAccess:async()=>{calls.push({name:'authorization'})},orderDecisionRedirectPath:()=>'/caja',restaurantUsesKitchenFlow:async()=>true,scheduleOrderStatusSideEffects:()=>{},after:()=>{},cashErrorKey:e=>e.message});
const form=new FormData();form.set('restaurantId','restaurant');form.set('orderId','order');form.set('paymentMethod','cash');if(mode)form.set('approvalMode',mode);
return{calls,run:()=>exports.approvePendingOrderAction(form)};}
test('web preparation approval preserves pending cash and collection remains an explicit separate action',async()=>{
 const prepare=fixture('prepare'),p=await prepare.run();assert.equal(p.ok,true);assert.equal(p.status,'accepted');assert.equal(p.paymentStatus,'pending');assert.deepEqual(prepare.calls.map(c=>c.name),['authorization','approve_cash_order_for_preparation']);
 const collect=fixture(),c=await collect.run();assert.equal(c.ok,true);assert.equal(c.paymentStatus,'paid');assert.deepEqual(collect.calls.map(c=>c.name),['authorization','charge_order_with_cash_movement']);
});
