// Read-only UI QA against a local Next server. All bank endpoints are mocked.
// YOPIDO_QA_PLAYWRIGHT may point to an existing Playwright installation.
const { chromium } = require(process.env.YOPIDO_QA_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.YOPIDO_QA_BASE_URL || 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local QA server required');
const branch = '11111111-1111-4111-8111-111111111111', requestId = '22222222-2222-4222-8222-222222222222';
const orderId = '33333333-3333-4333-8333-333333333333';
async function setup(browser, width, age = 5 * 60000, paid = false, settling = false) {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  await page.addInitScript(({ branch, requestId, age }) => {
    const now = Date.now(), day = new Date(now + 8 * 3600000).toISOString();
    localStorage.setItem('yopido:order-recovery:v1', JSON.stringify([
      { restaurantId: branch, restaurantSlug: 'prueba-1', requestId, recoveryKey: '1'.repeat(64), createdAt: now - age },
      { restaurantId: '44444444-4444-4444-8444-444444444444', restaurantSlug: 'old-local', requestId: '55555555-5555-4555-8555-555555555555', recoveryKey: '2'.repeat(64), createdAt: now - 31 * 60000 },
    ]));
    const cart = (slug, name, old) => ({ restaurantSlug: slug, restaurantName: name, items: [{ productId: 'qa', name: 'Pizza QA', price: 45, quantity: 1 }], updatedAt: new Date(now - old).toISOString(), expiresAt: day });
    localStorage.setItem('restaurant-saas-cart-v2', JSON.stringify({
      'prueba-1': cart('prueba-1', 'Pruebas', age),
      'pizza-brava': cart('pizza-brava', 'Pizza Brava', age),
      'old-local': cart('old-local', 'Old Local', 40 * 60000),
    }));
  }, { branch, requestId, age });
  let bankMutations = 0;
  await page.route('**/api/payments/baneco/**', async route => {
    if (route.request().url().includes('/recover') && route.request().method() === 'POST') return route.fulfill({ json: {
      path: `/prueba-1/${paid ? 'pedido' : 'pago'}/${orderId}?token=qa-not-a-real-capability`,
      terminal: false, stage: paid ? 'tracking' : 'payment', paymentStatus: paid || settling ? 'paid' : 'pending', restaurantName: 'Pruebas', amount: 60,
    } });
    bankMutations++; await route.abort();
  });
  await page.route(`**/prueba-1/${paid ? 'pedido' : 'pago'}/${orderId}?**`, route => route.fulfill({ contentType: 'text/html', body: `<main>${paid ? 'Seguimiento' : 'Pago'} de prueba; sin transacción bancaria.</main>` }));
  return { context, page, mutations: () => bankMutations };
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [320, 360, 450]) {
      const test = await setup(browser, width), { page } = test;
      await page.goto(base, { timeout: 120000 });
      const panel = page.getByRole('region', { name: 'Continúa donde lo dejaste' });
      await panel.getByText('Pago QR por completar', { exact: false }).waitFor();
      assert.equal(await panel.getByText('Pruebas', { exact: true }).count(), 1);
      assert.equal(await panel.getByText('Pizza Brava', { exact: true }).count(), 1);
      assert.equal(await panel.getByText('Old Local', { exact: true }).count(), 0);
      await panel.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
      const box = await panel.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width + 1); assert(box.height < 360);
      assert(await panel.evaluate(node => node.scrollWidth <= node.clientWidth));
      for (const button of await panel.getByRole('button', { name: /Ocultar acceso|Quitar carrito/ }).all()) {
        assert((await button.boundingBox()).height >= 44);
        assert(await button.evaluate(node => { const box = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)); }));
      }
      assert(await panel.getByRole('link', { name: /Revisar carrito/ }).evaluate(node => { const box = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)); }));
      await panel.screenshot({ path: `/tmp/yopido-pending-activity-${width}.png` });
      await panel.getByRole('button', { name: /Continuar con el pago/ }).click();
      await page.waitForURL(`**/prueba-1/pago/${orderId}?**`);
      assert.equal(test.mutations(), 0);
      console.log(`PASS ${width}px: compact panel, no duplicate basket, payment before tracking`);
      await test.context.close();
    }
    {
      const test = await setup(browser, 360), { page } = test;
      await page.goto(base);
      await page.getByRole('button', { name: 'Ocultar acceso de Pruebas' }).click();
      const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('yopido:order-recovery:v1')).find(row => row.restaurantSlug === 'prueba-1'));
      assert(kept.hiddenAt); assert.equal(kept.requestId, requestId); assert.equal(kept.recoveryKey, '1'.repeat(64));
      assert.equal(test.mutations(), 0);
      console.log('PASS hiding: capability retained and no bank cancellation');
      await test.context.close();
    }
    {
      const test = await setup(browser, 360, 30 * 60000 - 1000), { page } = test;
      await page.clock.install(); await page.goto(base);
      const panel = page.getByRole('region', { name: 'Continúa donde lo dejaste' });
      await panel.waitFor(); await page.clock.runFor(1100);
      await panel.waitFor({ state: 'detached' });
      const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('yopido:order-recovery:v1')).find(row => row.restaurantSlug === 'prueba-1'));
      assert(kept); assert.equal(test.mutations(), 0);
      console.log('PASS 30-minute boundary: shortcuts disappear while open, bank recovery retained');
      await test.context.close();
    }
    {
      const test = await setup(browser, 360, 5 * 60000, true), { page } = test;
      await page.goto(base);
      const panel = page.getByRole('region', { name: 'Continúa donde lo dejaste' });
      await panel.getByText('Ver seguimiento', { exact: true }).waitFor();
      await panel.getByRole('button', { name: /Ver seguimiento/ }).click();
      await page.waitForURL(`**/prueba-1/pedido/${orderId}?**`);
      assert.equal(test.mutations(), 0);
      console.log('PASS paid: only server-confirmed recovery opens tracking');
      await test.context.close();
    }
    {
      const test = await setup(browser, 360, 5 * 60000, false, true), { page } = test;
      await page.goto(base);
      const panel = page.getByRole('region', { name: 'Continúa donde lo dejaste' });
      await panel.getByText('Pago recibido · Confirmando pedido', { exact: false }).waitFor();
      assert.equal(await panel.getByText('Continuar con el pago', { exact: true }).count(), 0);
      await panel.getByRole('button', { name: /Ver confirmación/ }).click();
      await page.waitForURL(`**/prueba-1/pago/${orderId}?**`);
      assert.equal(test.mutations(), 0);
      console.log('PASS paid under review: show confirmation, never request another payment');
      await test.context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
