import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/table-account.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
const {belongsToOpenTableAccount:open,tableOrderSource:source}=exports;
test('served food stays in its open account, while closed visits and cancelled payments stay out',()=>{
 const base={orderType:'table',status:'delivered',paymentStatus:'pending',tableAccountOpen:true};
 assert.equal(open(base),true);assert.equal(open({...base,paymentStatus:'paid'}),true);
 assert.equal(open({...base,tableAccountOpen:false}),false);
 assert.equal(open({...base,status:'cancelled'}),false);
 assert.equal(open({...base,paymentStatus:'refunded'}),false);
 assert.equal(open({...base,orderType:'pos'}),false);
});
test('account attribution distinguishes direct customers, waiters and cashiers',()=>{
 assert.equal(source({orderOrigin:'table_qr',customerName:'Julia',notes:'Mesero: Falso'}),'Cliente por QR · Julia');
 assert.equal(source({orderOrigin:'pos_counter',notes:'Mesa 1 | Mesero: Ana | Sin sal'}),'Mesero · Ana');
 assert.equal(source({orderOrigin:'pos_counter',notes:'Mesa 1 | Caja: Steve | Usuario: id'}),'Caja · Steve');
 assert.equal(source({orderOrigin:'pos_counter',notes:'Mesa 1 | Mesero: Steve',takenBy:'Caja · Steve'}),'Caja · Steve');
});
