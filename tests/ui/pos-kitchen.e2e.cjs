// Local UI fixtures use real POS/kitchen components and mock all server/bank I/O.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require(process.env.YOPIDO_QA_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '../..'), dir = path.join(root, '.tmp/pos-kitchen-ui');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'loader.cjs'), `const ts=require(${JSON.stringify(require.resolve('typescript'))}); module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText};`);
fs.writeFileSync(path.join(dir, 'actions.js'), `
export async function createPosSaleInPlaceAction(data) {
  window.__qa.actions.push({id:data.get('posRequestId'),method:data.get('paymentMethod'),cash:data.get('cashReceived')});
  if(window.__qa.loseResponse && window.__qa.actions.length===1) throw Error('lost response');
  return {ok:true,order:{id:'33333333-3333-4333-8333-333333333333',order_number:'POS-1042',tracking_token:'qa-token',payment_method:data.get('paymentMethod')}};
}
export async function cancelPosQrSaleAction(){window.__qa.cancelled++;return {ok:window.__qa.cancelAllowed};}
export async function extendKitchenOrderTimeAction(input){window.__qa.extensions.push(input);return {ok:true,minutes:input.expectedMinutes+input.extraMinutes};}
export async function approvePendingOrderAction(){return {ok:false};}
export async function updateOperationalOrderStatusAction(){return {ok:false};}
`);
fs.writeFileSync(path.join(dir, 'realtime.js'), `
import {useEffect,useRef} from 'react';
export function useRestaurantRealtimeRefresh(){}
export function useRealtimeBroadcast({onChange}){const ref=useRef(onChange); ref.current=onChange;useEffect(()=>{const change=()=>ref.current();window.addEventListener('qa-bank',change);return()=>window.removeEventListener('qa-bank',change)},[])}
`);
fs.writeFileSync(path.join(dir, 'entry.jsx'), `
import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import {POSProductGrid} from '@/components/cash/POSProductGrid'; import {KitchenBoardClient} from '@/components/kitchen/KitchenBoardClient';
window.__qa={actions:[],extensions:[],sounds:0,cancelled:0,cancelAllowed:true};
HTMLMediaElement.prototype.play=function(){window.__qa.sounds++;return Promise.resolve()}; HTMLMediaElement.prototype.pause=function(){};
const restaurant={id:'11111111-1111-4111-8111-111111111111',slug:'qa-local',name:'Pizza de prueba',businessType:'food'};
const products=['Jamón y queso','Hawaiana','Jamón y choclitos','Salame','Champiñones','Especial'].map((name,i)=>({id:'44444444-4444-4444-8444-'+String(i+1).padStart(12,'0'),categoryId:'pizza',name,description:'Salsa de tomate, queso mozzarella y jamón',price:60,imageUrl:'',isAvailable:true}));
function App(){const [orders,setOrders]=useState([]);window.__qa.setOrders=setOrders;return location.search.includes('kitchen')?<KitchenBoardClient restaurant={restaurant} orders={orders}/>:<main className="mx-auto max-w-7xl p-5"><POSProductGrid products={products} categories={[{id:'pizza',name:'Pizzas familiares'}]} configuration={{variants:[],optionGroups:[]}} restaurantId={restaurant.id} restaurantSlug={restaurant.slug} businessType="food" settings={{kitchenEnabled:true}} /></main>}
createRoot(document.getElementById('root')).render(<App/>);
`);
async function bundle() {
  await new Promise((resolve,reject)=>webpack({mode:'development',context:root,entry:path.join(dir,'entry.jsx'),output:{path:dir,filename:'bundle.js'},devtool:false,
    resolve:{extensions:['.tsx','.ts','.jsx','.js'],alias:{'@/app/admin/actions$':path.join(dir,'actions.js'),'@/lib/client/use-restaurant-realtime-refresh$':path.join(dir,'realtime.js'),'@/lib/client/use-realtime-broadcast$':path.join(dir,'realtime.js'),'@':path.join(root,'src')}},
    plugins:[new webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],module:{rules:[{test:/\.[jt]sx?$/,exclude:/node_modules/,use:path.join(dir,'loader.cjs')}]}
  },(error,stats)=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));
  const css = await postcss([tailwind({base:root})]).process(fs.readFileSync(path.join(root,'src/app/globals.css'),'utf8'),{from:path.join(root,'src/app/globals.css')});
  fs.writeFileSync(path.join(dir,'style.css'),css.css);
}
async function setup(browser,width,view='pos') {
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(), errors=[];
  page.setDefaultTimeout(10000); page.on('pageerror',error=>{errors.push(error.message);console.error('UI error:',error.message)});
  await page.route('**/*',route=>{const file=new URL(route.request().url()).pathname;
    if(file==='/bundle.js'||file==='/style.css') return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':'text/css',body:fs.readFileSync(path.join(dir,file.slice(1)))});
    const asset=path.join(root,'public',file);if((file.startsWith('/notificaciones/')||file.startsWith('/brand/')||file.startsWith('/images/'))&&fs.existsSync(asset)) return route.fulfill({body:fs.readFileSync(asset)});
    return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'});
  });
  let payment={available:true,status:'not_created',amount:60,orderStatus:'pending'}, generations=0;
  await page.route('**/api/payments/baneco/availability?**',route=>route.fulfill({json:{available:true}}));
  await page.route('**/api/mobile/pos/bank-qr?**',route=>{
    if(route.request().method()==='POST'){generations++;payment={...payment,status:'pending',image:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="white"/><path d="M20 20h80v80H20zM150 20h80v80h-80zM20 150h80v80H20zM150 150h80v80h-80z" fill="black"/></svg>'};}
    return route.fulfill({json:payment});
  });
  return {context,page,errors,generations:()=>generations,setPayment:async value=>{payment={...payment,...value};await page.evaluate(()=>window.dispatchEvent(new Event('qa-bank')))},view};
}
(async()=>{
  await bundle();
  const base='http://localhost';
  const browser=await chromium.launch({headless:true,executablePath:process.env.YOPIDO_QA_CHROMIUM});
  try {
    for(const width of [1440,1024,390]) {
      const t=await setup(browser,width),{page}=t;await page.goto(base);
      if(width>=1280) await page.getByRole('button',{name:'Abrir modo grande'}).click();
      await page.getByRole('button',{name:/Jamón y queso/}).first().click();
      if(width<1280) await page.getByRole('button',{name:/1 productos/}).click();
      if(width===1440) await page.screenshot({path:path.join(dir,'pos-1440.png')});
      await page.getByRole('button',{name:/^Cobrar Bs/}).last().click();
      const modal=page.getByRole('dialog');await modal.waitFor();
      await modal.getByRole('button',{name:'QR bancario',exact:true}).click();
      await modal.getByRole('button',{name:'Generar QR y esperar pago'}).click();
      await modal.getByRole('img',{name:'QR de pago del pedido'}).waitFor();
      assert.equal(t.generations(),1);
      await page.screenshot({path:path.join(dir,`qr-code-${width}.png`)});
      await t.setPayment({status:'paid',orderStatus:'pending',applicationState:'posted'});
      await modal.getByRole('heading',{name:'Pago recibido · Confirmando pedido'}).waitFor();
      assert.equal(await modal.getByText('Pedido enviado a cocina',{exact:true}).count(),0);
      await modal.getByRole('button',{name:'Cerrar cobro'}).click();
      await page.getByRole('button',{name:'Continuar cobro',exact:true}).last().click();
      assert.equal(t.generations(),1);
      const box=await modal.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);assert(box.y>=0&&box.height<=900);
      await page.screenshot({path:path.join(dir,`qr-${width}.png`)});
      await t.setPayment({status:'paid',orderStatus:'accepted',checkoutHeld:false});
      await modal.getByText('Pedido enviado a cocina',{exact:true}).waitFor();
      assert.equal((await page.evaluate(()=>window.__qa.actions)).length,1);
      await modal.getByRole('button',{name:'Nueva venta'}).click();
      assert.equal(await page.getByText('Agrega productos para iniciar la venta.').first().count(),1);
      assert.deepEqual(t.errors,[]);await t.context.close();console.log(`PASS ${width}px: exact QR, pending gate, resume, automatic completion, empty basket`);
    }
    {
      const t=await setup(browser,1440),{page}=t;await page.goto(base);await page.getByRole('button',{name:/Jamón y queso/}).first().click();await page.getByRole('button',{name:/^Cobrar Bs/}).click();
      const modal=page.getByRole('dialog');await modal.getByLabel('Paga con',{exact:true}).fill('100');await modal.getByText('Bs 40,00',{exact:true}).waitFor();
      await page.evaluate(()=>window.__qa.loseResponse=true);await modal.getByRole('button',{name:'Confirmar cobro y enviar a cocina'}).click();await modal.getByRole('button',{name:'Recuperar venta'}).click();
      await modal.getByText('Pedido enviado a cocina',{exact:true}).waitFor();
      const calls=await page.evaluate(()=>window.__qa.actions);assert.equal(calls[0].id,calls[1].id);assert.equal(calls[1].cash,'100');
      await page.screenshot({path:path.join(dir,'cash-1440.png')});assert.deepEqual(t.errors,[]);await t.context.close();console.log('PASS cash: change and recovery reuse original tender/id');
    }
    {
      const t=await setup(browser,1440,'kitchen'),{page}=t;await page.goto(base+'?kitchen');await page.getByRole('button',{name:'Activar sonido',exact:true}).click();
      const before=await page.evaluate(()=>window.__qa.sounds);
      const order={id:'33333333-3333-4333-8333-333333333333',orderNumber:'P1042',status:'pending',paymentStatus:'pending',orderType:'pos',createdAt:new Date().toISOString(),acceptedAt:new Date().toISOString(),etaAdjustmentMinutes:0,items:[{productName:'Pizza Hawaiana',quantity:1,prepMinutes:15,subtotal:60}]};
      await page.evaluate(order=>{localStorage.setItem('yopido:order-alert-sound:acknowledged:11111111-1111-4111-8111-111111111111',JSON.stringify([order.id]));window.__qa.setOrders([order])},order);
      assert.equal(await page.getByText('Nuevo en cocina: 1',{exact:true}).count(),0);
      await page.evaluate(order=>window.__qa.setOrders([{...order,status:'accepted',paymentStatus:'paid'}]),order);
      await page.getByText('Nuevo en cocina: 1',{exact:true}).waitFor();await page.waitForFunction(before=>window.__qa.sounds===before+1,before);
      await page.getByRole('button',{name:'Ampliar 5 minutos el pedido P1042'}).click();await page.getByText('Tiempo ampliado: +5 min',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Ya lo vi',exact:true}).click();
      await page.getByRole('button',{name:'Pantalla grande',exact:true}).click();await page.getByRole('button',{name:'Sonido activado',exact:true}).waitFor();
      await page.screenshot({path:path.join(dir,'kitchen-1440.png')});assert.deepEqual(t.errors,[]);await t.context.close();console.log('PASS kitchen: sounds only after acceptance, separate acknowledgments, +5 countdown, focus controls');
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
