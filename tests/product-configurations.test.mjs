import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Execute the real public/table/group cart resolver with an in-memory catalog.
const ast=ts.createSourceFile('actions.ts',readFileSync(new URL('../src/app/r/actions.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const helpers=new Set(['boliviaScheduleParts','timeToMinutes','isWithinProductSchedule','isProductCurrentlyOrderable','resolvePublicCartItems']);
const source=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&helpers.has(node.name?.text)).map(node=>node.getText(ast)).join('\n')+'\nexports.resolveCart=resolvePublicCartItems;';
const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,Intl});
function fixture(){
  const rows={products:[{id:'product',restaurant_id:'local',name:'Producto',price:.50,is_available:true}],product_variants:[{id:'variant',product_id:'product',restaurant_id:'local',name:'Agrandado',price_delta:.10,is_active:true}],product_option_groups:[],product_options:[]};
  const client={from(table){let found=rows[table]??[];const query={select(){return query},eq(key,value){found=found.filter(row=>row[key]===value);return query},in(key,values){found=found.filter(row=>values.includes(row[key]));return query},then(resolve){return Promise.resolve({data:found,error:null}).then(resolve)}};return query}};
  return {rows,resolve:cart=>exports.resolveCart(client,'local',cart)};
}
const base={productId:'product',quantity:1,optionIds:[]};
test('public and table orders allow the base product or an optional ten-cent variant',async()=>{
  const f=fixture();const [plain]=await f.resolve([{...base,price:.01}]);assert.equal(plain.price,.50);assert.equal(plain.variantId,undefined);assert.equal(plain.name,'Producto');
  const [extra]=await f.resolve([{...base,variantId:'variant',quantity:2}]);assert.equal(extra.price,.60);assert.equal(extra.subtotal,1.20);assert.equal(extra.variantId,'variant');
  f.rows.products[0].price=.10;f.rows.product_variants[0].price_delta=.20;
  const [rounded]=await f.resolve([{...base,variantId:'variant',quantity:3}]);assert.equal(rounded.price,.30);assert.equal(rounded.subtotal,.90);
});
test('public resolver still rejects variants from another product, inactive variants and missing IDs',async()=>{
  for(const variant of [null,{product_id:'other'},{is_active:false}]){
    const f=fixture();if(variant)Object.assign(f.rows.product_variants[0],variant);else f.rows.product_variants=[];
    await assert.rejects(f.resolve([{...base,variantId:'variant'}]),/product-configuration/);
  }
});
test('optional variants do not bypass required groups or minimum/maximum choices',async()=>{
  const f=fixture();f.rows.product_option_groups.push({id:'group',product_id:'product',restaurant_id:'local',min_choices:0,max_choices:1,is_required:true,is_active:true});
  f.rows.product_options.push({id:'drink',product_id:'product',restaurant_id:'local',option_group_id:'group',price_delta:.20,is_active:true,name:'Refresco'});
  await assert.rejects(f.resolve([base]),/product-configuration/);
  const [withDrink]=await f.resolve([{...base,optionIds:['drink']}]);assert.equal(withDrink.price,.70);assert.equal(withDrink.variantId,undefined);
  f.rows.product_option_groups[0].is_required=false;f.rows.product_option_groups[0].min_choices=1;
  await assert.rejects(f.resolve([base]),/product-configuration/);
  f.rows.product_option_groups[0].max_choices=0;await assert.rejects(f.resolve([{...base,optionIds:['drink']}]),/product-configuration/);
});
