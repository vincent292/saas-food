import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
function load(path, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require: name => name === 'server-only' ? {} : name in mocks ? mocks[name] : require(name),
    process, Buffer, URL, Date, Intl, console });
  return exports;
}
const vault = load('src/lib/payments/credential-vault.ts');
const bank = load('src/lib/payments/baneco.ts');
const { bankPanelReadiness } = load('src/lib/payments/qr-panel-readiness.ts');
const credentials = { userName: 'QA-user', password: 'QA-password', aesKey: 'QA-bank-key', accountCredit: 'QA-account', encryptionMode: 'bank_api' };
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYmcAAAAASUVORK5CYII=';

test('panel explains every disabled state without removing encryption/storage guards', () => {
  const missingKey = bankPanelReadiness({ vaultConfigured:false,storageError:false,certificationConnections:1 });
  assert.equal(missingKey.canSave, false); assert.equal(missingKey.generateBlocker, 'vault');
  const missingDb = bankPanelReadiness({ vaultConfigured:true,storageError:true,certificationConnections:1 });
  assert.equal(missingDb.canSave, false); assert.equal(missingDb.generateBlocker, 'storage');
  const noConnection = bankPanelReadiness({ vaultConfigured:true,storageError:false,certificationConnections:0 });
  assert.equal(noConnection.canSave, true); assert.equal(noConnection.canGenerate, false);
  assert.equal(noConnection.generateBlocker, 'connection');
  const ready = bankPanelReadiness({ vaultConfigured:true,storageError:false,certificationConnections:1 });
  assert.equal(ready.canSave, true); assert.equal(ready.canGenerate, true);
  const page=read('src/app/admin/pagos-qr/page.tsx');
  assert.match(page,/id="bank-save-blocker"/); assert.match(page,/id="bank-generate-blocker"/);
  assert.match(page,/query\.result \? <Card/);
});

test('merchant vault randomizes authenticated encryption and binds tenant/environment/connection', () => {
  const previous = process.env.BANK_CREDENTIALS_KEY;
  try {
    delete process.env.BANK_CREDENTIALS_KEY;
    assert.equal(vault.bankVaultConfigured(), false);
    assert.throws(() => vault.sealBankCredentials(credentials, 'c', 'r', 'certification'), /bank-vault-not-configured/);
    process.env.BANK_CREDENTIALS_KEY = randomBytes(32).toString('base64');
    const first = vault.sealBankCredentials(credentials, 'c', 'r', 'certification');
    const second = vault.sealBankCredentials(credentials, 'c', 'r', 'certification');
    assert.notEqual(first, second);
    assert.ok(!first.includes('QA-password') && !first.includes('QA-account'));
    assert.equal(vault.openBankCredentials(first, 'c', 'r', 'certification').password, credentials.password);
    for (const [c,r,e] of [['other','r','certification'],['c','other','certification'],['c','r','production']])
      assert.throws(() => vault.openBankCredentials(first, c, r, e), /bank-vault-unreadable/);
    const parts = first.split('.'); const changed = Buffer.from(parts[3], 'base64'); changed[0] ^= 1; parts[3] = changed.toString('base64');
    assert.throws(() => vault.openBankCredentials(parts.join('.'), 'c', 'r', 'certification'), /bank-vault-unreadable/);
    process.env.BANK_CREDENTIALS_KEY = randomBytes(32).toString('base64');
    assert.throws(() => vault.openBankCredentials(first, 'c', 'r', 'certification'), /bank-vault-unreadable/);
  } finally { if (previous === undefined) delete process.env.BANK_CREDENTIALS_KEY; else process.env.BANK_CREDENTIALS_KEY = previous; }
});

test('Baneco adapter uses documented certification paths, encrypted fields, single-use fixed amount', async () => {
  const calls = [];
  const client = bank.createBanecoClient('certification', credentials, async (url, method, token, body) => {
    calls.push({ url, method, token, body });
    assert.equal(url.origin, 'https://apimktdesa.baneco.com.bo');
    if (url.pathname.endsWith('/encrypt')) { assert.equal(url.searchParams.get('aesKey'), 'QA-bank-key'); return 'ZW5jcnlwdGVk'; }
    if (url.pathname.endsWith('/authenticate')) {
      assert.equal(body.password, 'ZW5jcnlwdGVk'); assert.equal(body.userName, 'QA-user');
      return { responseCode: 0, token: 'QA-token' };
    }
    if (url.pathname.endsWith('/generateQR')) {
      assert.equal(token, 'QA-token'); assert.equal(method, 'POST');
      assert.equal(body.singleUse, true); assert.equal(body.modifyAmount, false); assert.equal(body.accountCredit, 'ZW5jcnlwdGVk');
      return { responseCode: 0, qrId: 'QA-123', qrImage: png };
    }
    if (url.pathname.includes('/statusQR/')) return { responseCode: 0, statusQrCode: 0 };
    if (url.pathname.endsWith('/cancelQR')) { assert.equal(method, 'DELETE'); assert.equal(body.qrId, 'QA-123'); return { responseCode: 0 }; }
    throw Error('Unexpected path');
  });
  const result = await client.generate({ transactionId: 'QA-request', amount: 1.25, currency: 'BOB', dueDate: bank.boliviaDate(), description: 'QA', branchCode: 'E0001' });
  assert.equal(result.qrId, 'QA-123'); assert.ok(result.image.startsWith('data:image/png;base64,'));
  await client.status(result.qrId); await client.cancel(result.qrId);
  assert.ok(calls.some(call => call.url.pathname.includes('/v2/statusQR/QA-123')));
});

test('production and arbitrary hosts are blocked; provider errors never return raw messages', async () => {
  assert.throws(() => bank.createBanecoClient('production', credentials, async () => { throw Error('Should not call'); }), /bank-production-disabled/);
  await assert.rejects(bank.bankTransport(new URL('https://evil.invalid/'), 'GET'), /bank-invalid-host/);
  const client = bank.createBanecoClient('certification', { ...credentials, encryptionMode: 'pre_encrypted', password: 'cGFzcw==', accountCredit: 'YWNjb3VudA==' },
    async () => ({ responseCode: 5, message: 'SECRET bank account and password' }));
  await assert.rejects(client.checkConnection(), error => error.message === 'bank-rejected' && !error.message.includes('SECRET'));
  assert.throws(() => bank.qrImageDataUrl(Buffer.from('<svg onload="evil"/>').toString('base64')), /bank-invalid-qr-image/);
});

test('verification handles casing and requires authoritative matching payment details', () => {
  const expected = { qrId: 'QA-123', amount: 1.25, currency: 'BOB', branchCode: 'E0001', dueDate: bank.boliviaDate() };
  const payment = { qrId: 'QA-123', amount: 1.25, currency: 'BOB', branchCode: 'E0001', transactionId: 'BANK-987', paymentDate: '2026-10-14T00:00:00', paymentTime: '13:45:00' };
  assert.equal(bank.verifyBankStatus({ statusQRCode: 0 }, expected), 'pending');
  assert.equal(bank.verifyBankStatus({ statusQrCode: 9 }, expected), 'cancelled');
  assert.equal(bank.verifyBankStatus({ statusQrCode: 1, payment: [payment] }, expected), 'paid');
  assert.equal(bank.verifyBankStatus({ statusQRCode: 1, payment }, expected), 'paid');
  for (const patch of [{ amount: 1 }, { currency: 'USD' }, { qrId: 'other' }, { branchCode: 'other' }, { transactionId: '' }, { paymentDate: '2026-02-30' }, { paymentTime: '24:00:00' }])
    assert.equal(bank.verifyBankStatus({ statusQrCode: 1, payment: [{ ...payment, ...patch }] }, expected), 'review');
  assert.equal(bank.verifyBankStatus({ statusQrCode: 1 }, expected), 'review');
  assert.equal(bank.verifyBankStatus({ statusQrCode: 1, payment: [null] }, expected), 'review');
  assert.equal(bank.verifyBankStatus({ statusQrCode: 1, payment: [payment,payment] }, expected), 'review');
  assert.equal(bank.verifyBankStatus({ statusQrCode: 0 }, { ...expected, dueDate: '2020-01-01' }), 'expired');
});

test('test amounts/dates reject manipulated precision and impossible dates', () => {
  for (const value of [0, -1, 100.01, '1.005', '1e2', 'NaN', 'Infinity', null]) assert.throws(() => bank.bankAmount(value));
  assert.equal(bank.bankAmount('0.01'), .01); assert.equal(bank.bankAmount('100.00'), 100);
  assert.equal(bank.validBankDate('2026-02-30'), false); assert.equal(bank.validBankDate('2026-10-14'), true);
});

const adminId = '11111111-1111-4111-8111-111111111111';
const staffId = '22222222-2222-4222-8222-222222222222';
const rest = '33333333-3333-4333-8333-333333333333';
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table profiles(id uuid primary key,global_role text);
    create table restaurants(id uuid primary key);
    insert into profiles values('${adminId}','superadmin'),('${staffId}','cashier');
    insert into restaurants values('${rest}');`);
  await db.exec(read('supabase/migrations/0120_baneco_superadmin_test_panel.sql'));
  const connectionId = randomUUID();
  await db.query(`insert into bank_qr_connections(id,restaurant_id,environment,label,credentials_ciphertext,encryption_mode,created_by)
    values($1,$2,'certification','QA','v1.secret','bank_api',$3)`, [connectionId, rest, adminId]);
  const reserve = (id = randomUUID(), who = adminId, amount = 1.25) => db.query(`select reserve_baneco_test_qr($1,$2,$3,$4,'BOB',(now() at time zone 'America/La_Paz')::date,'QA') result`, [id, connectionId, who, amount]);
  return { db, connectionId, reserve };
}

test('private DB tables and reservation RPC are inaccessible to anon/authenticated', async () => {
  const { db } = await fixture();
  try {
    for (const role of ['anon','authenticated']) {
      for (const table of ['bank_qr_connections','bank_qr_test_requests'])
        assert.equal((await db.query("select has_table_privilege($1,$2,'select') allowed", [role,table])).rows[0].allowed, false);
      assert.equal((await db.query("select has_function_privilege($1,'reserve_baneco_test_qr(uuid,uuid,uuid,numeric,text,date,text)','execute') allowed", [role])).rows[0].allowed, false);
    }
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select credentials_ciphertext from bank_qr_connections'), /permission denied/);
    await db.exec('reset role');
  } finally { await db.close(); }
});

test('reservation is idempotent and binds amount/connection/actor; non-admin and production rejected', async () => {
  const { db, connectionId, reserve } = await fixture();
  try {
    const requestId = randomUUID();
    const attempts = await Promise.all(Array.from({ length: 10 }, () => reserve(requestId)));
    assert.equal(attempts.filter(result => result.rows[0].result.claimed).length, 1);
    assert.equal((await db.query('select count(*)::int n from bank_qr_test_requests')).rows[0].n, 1);
    await assert.rejects(reserve(requestId, adminId, 2), /bank-request-conflict/);
    await assert.rejects(reserve(randomUUID(), staffId), /bank-forbidden/);
    for (const value of [0,100.01,1.005]) await assert.rejects(reserve(randomUUID(), adminId, value), /bank-invalid-input/);
    await db.query("update bank_qr_connections set environment='production' where id=$1", [connectionId]);
    await assert.rejects(reserve(), /bank-connection-unavailable/);
  } finally { await db.close(); }
});

test('credential versions are retained for old QRs and only one active per merchant/environment', async () => {
  const { db, connectionId, reserve } = await fixture();
  try {
    await reserve();
    const insert = id => db.query(`insert into bank_qr_connections(id,restaurant_id,environment,label,credentials_ciphertext,encryption_mode,created_by)
      values($1,$2,'certification','New','v1.new','bank_api',$3)`, [id,rest,adminId]);
    await assert.rejects(insert(randomUUID()), /duplicate key/);
    await db.query('update bank_qr_connections set active=false where id=$1', [connectionId]);
    await insert(randomUUID());
    assert.equal((await db.query('select connection_id from bank_qr_test_requests')).rows[0].connection_id, connectionId);
    assert.equal((await db.query('select count(*)::int n from bank_qr_connections')).rows[0].n, 2);
  } finally { await db.close(); }
});

test('service authorization denies staff, customer, forced password change and read-only support before DB access', async () => {
  let profile = null, support = null, dbCalls = 0;
  const service = load('src/lib/services/bank-qr.service.ts', {
    '@/lib/services/auth.service': { authService: { getCurrentProfile: async () => profile } },
    '@/lib/services/support-impersonation.service': { getActiveSupportSession: async () => support },
    '@/lib/supabase/admin': { createAdminClient: () => { dbCalls++; throw Error('Should not reach database'); } },
    '@/lib/payments/credential-vault': vault,
    '@/lib/payments/baneco': bank,
  });
  for (const value of [null, { globalRole:'cashier' }, { globalRole:'superadmin',isCustomerAccount:true }, { globalRole:'superadmin',mustChangePassword:true }]) {
    profile = value;
    await assert.rejects(service.bankQrService.list(), /bank-forbidden/);
    await assert.rejects(service.bankQrService.check(randomUUID()), /bank-forbidden/);
    await assert.rejects(service.bankQrService.generate({}), /bank-forbidden/);
  }
  profile = { id:adminId,globalRole:'superadmin' }; support = { id:randomUUID() };
  await assert.rejects(service.bankQrService.save({}), /bank-support-readonly/);
  assert.equal(dbCalls, 0);
  assert.equal(service.safeBankError(new Error('password=SECRET')), 'bank-operation-failed');
  assert.ok(!service.publicConnectionFields.includes('ciphertext'));
});

test('UI/actions use server role checks and test-only workflow, never automatic checkout approval', () => {
  const page = read('src/app/admin/pagos-qr/page.tsx');
  const service = read('src/lib/services/bank-qr.service.ts');
  const actions = read('src/app/admin/pagos-qr/actions.ts');
  assert.match(page, /await requireBankSuperadmin/);
  assert.match(actions, /await limited\(\)/);
  assert.match(actions, /z\.literal\(true\)/);
  assert.doesNotMatch(service, /from\("orders"\)|from\("cash_movements"\)|charge_order_with_cash_movement/);
  assert.match(service, /status: "unknown"/);
  assert.match(service, /operation_token", operationToken/);
  assert.match(service, /\.in\("status", \["pending", "expired", "review", "unknown"\]\)/);
});
