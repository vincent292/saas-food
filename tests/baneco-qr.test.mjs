import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID, randomBytes } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
function load(path, mocks = {}) {
  mocks = {
    '@/lib/restaurant-directory-options': { businessTypeSupportsKitchen: type => !type || type === 'food' },
    '@/lib/services/mobile-push.service': {}, '@/lib/services/order-whatsapp-notification.service': {}, '@/lib/services/rider-dispatch.service': {},
    ...mocks,
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require: name => name === 'server-only' ? {} : name in mocks ? mocks[name] : require(name),
    process, Buffer, URL, Date, Intl, Error, console, setTimeout, clearTimeout });
  return exports;
}
const vault = load('src/lib/payments/credential-vault.ts');
const bank = load('src/lib/payments/baneco.ts');
const { bankPanelReadiness } = load('src/lib/payments/qr-panel-readiness.ts');
const credentials = { userName: 'QA-user', password: 'QA-password', aesKey: 'QA-bank-key', accountCredit: 'QA-account', encryptionMode: 'bank_api' };
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYmcAAAAASUVORK5CYII=';

test('panel explains every disabled state without removing encryption/storage guards', () => {
  const missingKey = bankPanelReadiness({ vaultConfigured:false,storageError:false,verifiedConnections:1 });
  assert.equal(missingKey.canSave, false); assert.equal(missingKey.generateBlocker, 'vault');
  const missingDb = bankPanelReadiness({ vaultConfigured:true,storageError:true,verifiedConnections:1 });
  assert.equal(missingDb.canSave, false); assert.equal(missingDb.generateBlocker, 'storage');
  const noConnection = bankPanelReadiness({ vaultConfigured:true,storageError:false,verifiedConnections:0 });
  assert.equal(noConnection.canSave, true); assert.equal(noConnection.canGenerate, false);
  assert.equal(noConnection.generateBlocker, 'connection');
  const ready = bankPanelReadiness({ vaultConfigured:true,storageError:false,verifiedConnections:1 });
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

test('arbitrary hosts are blocked; provider errors never return raw messages', async () => {
  assert.throws(() => bank.createBanecoClient('invalid', credentials), /bank-invalid-host/);
  await assert.rejects(bank.bankTransport(new URL('https://evil.invalid/'), 'GET'), /bank-invalid-host/);
  const client = bank.createBanecoClient('certification', { ...credentials, encryptionMode: 'pre_encrypted', password: 'cGFzcw==', accountCredit: 'YWNjb3VudA==' },
    async () => ({ responseCode: 5, message: 'SECRET bank account and password' }));
  await assert.rejects(client.checkConnection(), error => error.message === 'bank-rejected' && !error.message.includes('SECRET'));
  assert.throws(() => bank.qrImageDataUrl(Buffer.from('<svg onload="evil"/>').toString('base64')), /bank-invalid-qr-image/);
});

test('production uses its own host and preserves fixed, single-use generation', async () => {
  const paths=[];
  const client=bank.createBanecoClient('production',credentials,async(url,method,token,body)=>{
    assert.equal(url.origin,'https://apimkt.baneco.com.bo'); paths.push(url.pathname);
    if(url.pathname.endsWith('/encrypt')) return 'ZW5jcnlwdGVk';
    if(url.pathname.endsWith('/authenticate')) return {responseCode:0,token:'test-token'};
    assert.equal(method,'POST'); assert.equal(body.singleUse,true); assert.equal(body.modifyAmount,false);
    return {responseCode:0,qrId:'production-123',qrImage:png};
  });
  await client.generate({transactionId:'QA',amount:1,currency:'BOB',dueDate:bank.boliviaDate(),description:'QA',branchCode:''});
  assert.equal(paths.filter(path=>path.endsWith('/generateQR')).length,1);
});

test('errors identify each stage, distinguish HTTP from bank code and never leak messages', async () => {
  const stages=['password-encryption','authentication','account-encryption','generation'];
  for(let failAt=0;failAt<4;failAt++){
    let calls=0;
    const client=bank.createBanecoClient('production',credentials,async(url)=>{
      if(calls++===failAt) throw new bank.BanecoError('bank-http-error',undefined,502);
      return url.pathname.endsWith('/authenticate')?{responseCode:0,token:'test-token'}:'ZW5jcnlwdGVk';
    });
    await assert.rejects(client.generate({transactionId:'QA',amount:1,currency:'BOB',dueDate:bank.boliviaDate(),description:'QA',branchCode:''}),error=>{
      const details=bank.bankErrorDetails(error);
      assert.equal(details.last_error_stage,stages[failAt]); assert.equal(details.last_http_status,502);
      return true;
    });
    assert.equal(calls,failAt+1);
  }
  const denied=bank.createBanecoClient('production',{...credentials,encryptionMode:'pre_encrypted',password:'cGFzcw=='},async()=>({responseCode:404,message:'SECRET-account'}));
  await assert.rejects(denied.checkConnection(),error=>{
    const details=bank.bankErrorDetails(error);
    assert.equal(details.last_error_stage,'authentication');assert.equal(details.last_http_status,200);assert.equal(details.last_bank_code,404);
    assert.ok(!JSON.stringify(error).includes('SECRET'));return true;
  });
  const unsafe=bank.bankErrorDetails(new bank.BanecoError('bank-http-error','SECRET',999,Infinity));
  assert.equal(unsafe.last_error_stage,null);assert.equal(unsafe.last_http_status,null);assert.equal(unsafe.last_bank_code,null);
});

test('a generated QR ID survives an invalid image so it can still be reconciled', async () => {
  const client=bank.createBanecoClient('production',{...credentials,encryptionMode:'pre_encrypted',password:'cGFzcw==',accountCredit:'YWNjb3VudA=='},async(url)=>
    url.pathname.endsWith('/authenticate')?{responseCode:0,token:'test-token'}:{responseCode:0,qrId:'bank-created-123',qrImage:'PGh0bWw+'});
  await assert.rejects(client.generate({transactionId:'QA',amount:1,currency:'BOB',dueDate:bank.boliviaDate(),description:'QA',branchCode:''}),error=>error.qrId==='bank-created-123'&&error.stage==='generation');
});

test('service retains ambiguity after generation, detects preflight failures, and never replays a reservation', async () => {
  let failure, claimed=true, generationCalls=0, failSave=false;
  const updates=[];
  const stored={id:'connection',restaurant_id:'restaurant',environment:'production',active:true,credentials_ciphertext:'encrypted',branch_code:''};
  const admin={
    from(table){return {
      select(){return this;},eq(){return this;},maybeSingle:async()=>({data:stored,error:null}),
      update(value){assert.equal(table,'bank_qr_test_requests');updates.push(value);return {
        eq(){return this;},select(){return this;},
        maybeSingle:async()=>failSave?{data:null,error:{message:'DB failed'}}:{data:{id:'request'},error:null},
        then(resolve,reject){return Promise.resolve({error:null}).then(resolve,reject);}
      };}
    };},
    rpc:async()=>({error:null,data:{claimed,request:{id:'request',transaction_id:'YQ-request',amount:1,currency:'BOB',due_date:bank.boliviaDate(),description:'QA'}}})
  };
  const service=load('src/lib/services/bank-qr.service.ts',{
    '@/lib/services/auth.service':{authService:{getCurrentProfile:async()=>({id:'admin',globalRole:'superadmin'})}},
    '@/lib/services/support-impersonation.service':{getActiveSupportSession:async()=>null},
    '@/lib/supabase/admin':{createAdminClient:()=>admin},
    '@/lib/payments/credential-vault':{openBankCredentials:()=>credentials},
    '@/lib/payments/baneco':{...bank,createBanecoClient:()=>({generate:async()=>{generationCalls++;if(failure)throw failure;return {qrId:'bank-123',image:`data:image/png;base64,${png}`};}})}
  });
  const input={requestId:'request',connectionId:'connection',amount:1,currency:'BOB',dueDate:bank.boliviaDate(),description:'QA'};
  for(const stage of ['password-encryption','authentication','account-encryption','generation']){
    updates.length=0;failure=new bank.BanecoError('bank-http-error',stage,502);
    await assert.rejects(service.bankQrService.generate(input), error => { assert.equal(error.message,'bank-http-error'); return true; });
    assert.equal(updates.at(-1).status,stage==='generation'?'unknown':'failed');
  }
  failure=undefined;failSave=true;updates.length=0;
  await assert.rejects(service.bankQrService.generate(input));
  assert.equal(updates.at(-1).status,'unknown');assert.equal(updates.at(-1).qr_id,'bank-123');
  failSave=false;claimed=false;const before=generationCalls;
  assert.equal((await service.bankQrService.generate(input)).created,false);assert.equal(generationCalls,before);
});

test('production reuse authenticates then creates a freshly sealed version without rewriting its source', async () => {
  const previous=process.env.BANK_CREDENTIALS_KEY;
  process.env.BANK_CREDENTIALS_KEY=randomBytes(32).toString('base64');
  try{
    const source={id:'source',restaurant_id:'restaurant',environment:'certification',active:true,label:'Saved bank',branch_code:'',encryption_mode:'bank_api',
      credentials_ciphertext:vault.sealBankCredentials(credentials,'source','restaurant','certification')};
    let inserted=null,checks=0,rejectCheck=false;
    const admin={from(){return {select(fields){this.fields=fields;return this;},eq(){return this;},maybeSingle:async function(){return {data:this.fields==='*'?source:null,error:null};},
      insert:async(value)=>{inserted=value;return {error:null};},update(){throw new Error('Source must not be rewritten');}};}};
    const service=load('src/lib/services/bank-qr.service.ts',{
      '@/lib/services/auth.service':{authService:{getCurrentProfile:async()=>({id:'admin',globalRole:'superadmin'})}},
      '@/lib/services/support-impersonation.service':{getActiveSupportSession:async()=>null},
      '@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/payments/credential-vault':vault,
      '@/lib/payments/baneco':{...bank,createBanecoClient:environment=>({checkConnection:async()=>{assert.equal(environment,'production');checks++;if(rejectCheck)throw new bank.BanecoError('bank-rejected','authentication',200,404);}})}
    });
    const newId=await service.bankQrService.useProduction(source.id);
    assert.notEqual(newId,source.id);assert.equal(checks,1);assert.equal(inserted.environment,'production');assert.equal(inserted.check_result,'ok');
    assert.equal(vault.openBankCredentials(inserted.credentials_ciphertext,newId,source.restaurant_id,'production').password,credentials.password);
    assert.throws(()=>vault.openBankCredentials(inserted.credentials_ciphertext,source.id,source.restaurant_id,'certification'));
    assert.equal(vault.openBankCredentials(source.credentials_ciphertext,source.id,source.restaurant_id,'certification').password,credentials.password);
    rejectCheck=true;inserted=null;await assert.rejects(service.bankQrService.useProduction(source.id));assert.equal(inserted,null);
  }finally{if(previous===undefined)delete process.env.BANK_CREDENTIALS_KEY;else process.env.BANK_CREDENTIALS_KEY=previous;}
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
  await db.exec(read('supabase/migrations/0121_baneco_production_pilot.sql'));
  await db.exec(read('supabase/migrations/0122_baneco_automatic_reconciliation.sql'));
  const connectionId = randomUUID();
  await db.query(`insert into bank_qr_connections(id,restaurant_id,environment,label,credentials_ciphertext,encryption_mode,created_by,check_result)
    values($1,$2,'certification','QA','v1.secret','bank_api',$3,'ok')`, [connectionId, rest, adminId]);
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

test('reservation is idempotent in both environments and rejects unverified connections', async () => {
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
    assert.equal((await reserve()).rows[0].result.request.environment, 'production');
    await db.query("update bank_qr_connections set check_result=null where id=$1", [connectionId]);
    await assert.rejects(reserve(), /bank-connection-unverified/);
    assert.equal((await reserve(requestId)).rows[0].result.claimed, false);
    assert.equal((await db.query('select environment from bank_qr_test_requests where id=$1', [requestId])).rows[0].environment, 'certification');
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

test('pilot UI/actions use server role checks and order settlement is delegated to its bank-verified transaction', () => {
  const page = read('src/app/admin/pagos-qr/page.tsx');
  const service = read('src/lib/services/bank-qr.service.ts');
  const actions = read('src/app/admin/pagos-qr/actions.ts');
  assert.match(page, /await requireBankSuperadmin/);
  assert.match(actions, /await limited\(\)/);
  assert.match(actions, /z\.literal\(true\)/);
  assert.doesNotMatch(service, /from\("cash_movements"\)|charge_order_with_cash_movement/);
  assert.match(service, /status: beforeGeneration \? "failed" : "unknown"/);
  assert.match(service, /p_token: operationToken/);
  assert.match(service, /claim_baneco_reconciliation/);
});

test('reconciliation leases survive disconnect, enforce cooldown/backoff and reject stale workers', async () => {
  const { db, connectionId, reserve } = await fixture();
  const id=randomUUID(), token=randomUUID();
  const claim=(t=randomUUID(),cancel=false)=>db.query('select claim_baneco_reconciliation($1,$2,$3) result',[t,id,cancel]);
  const finish=(t,status,error=null)=>db.query('select finish_baneco_reconciliation($1,$2,$3,$4,$5,$6) result',[id,t,status,status==='paid'?'BANK-payment':null,error,{}]);
  try {
    await reserve(id);
    // Unknown without a bank ID is NEVER retried or regenerated by the worker.
    await db.query("update bank_qr_test_requests set status='unknown' where id=$1",[id]);
    assert.equal((await claim()).rows[0].result,null);
    await db.query("update bank_qr_test_requests set qr_id='QA-lease',status='pending' where id=$1",[id]);
    await db.query('update bank_qr_connections set active=false where id=$1',[connectionId]);
    await assert.rejects(reserve(),/bank-connection-unavailable/);
    const claims=await Promise.all(Array.from({length:8},()=>claim(token)));
    assert.equal(claims.filter(r=>r.rows[0].result).length,1);
    assert.equal((await finish(randomUUID(),'paid')).rows[0].result,false);
    assert.equal((await finish(token,'pending')).rows[0].result,true);
    assert.equal((await claim()).rows[0].result,null);
    // Cancellation can bypass polling cooldown, never another in-flight lease.
    assert.ok((await claim(token,true)).rows[0].result);
    assert.equal((await claim(randomUUID(),true)).rows[0].result,null);
    await finish(token,null,'bank-timeout');
    let row=(await db.query('select * from bank_qr_test_requests where id=$1',[id])).rows[0];
    assert.equal(row.consecutive_failures,1);assert.equal(row.status,'pending');
    await db.query("update bank_qr_test_requests set next_check_at=now()-interval '1 second' where id=$1",[id]);
    await claim(token); await finish(token,null,'bank-timeout');
    const delay=(await db.query('select extract(epoch from next_check_at-now()) delay from bank_qr_test_requests where id=$1',[id])).rows[0].delay;
    assert.ok(Number(delay)>118 && Number(delay)<=120);
    // A crashed worker becomes claimable again, with a new fencing token.
    await db.query("update bank_qr_test_requests set next_check_at=now()-interval '1 second',operation_until=now()-interval '1 second',operation_token=$2 where id=$1",[id,token]);
    const newToken=randomUUID(); assert.ok((await claim(newToken)).rows[0].result);
    assert.equal((await finish(token,'paid')).rows[0].result,false);
    assert.equal((await finish(newToken,'paid')).rows[0].result,true);
    assert.equal((await claim(randomUUID(),true)).rows[0].result,null);
    assert.equal((await finish(newToken,'pending')).rows[0].result,false);
    row=(await db.query('select status,consecutive_failures from bank_qr_test_requests where id=$1',[id])).rows[0];
    assert.equal(row.status,'paid');assert.equal(row.consecutive_failures,0);
    for(const role of ['anon','authenticated']) for(const fn of ['claim_baneco_reconciliation(uuid,uuid,boolean)','finish_baneco_reconciliation(uuid,uuid,text,text,text,jsonb)'])
      assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') allowed',[role,fn])).rows[0].allowed,false);
  } finally { await db.close(); }
});

test('automatic worker authenticates, reconciles disconnected accounts once, and never creates or cancels QRs', async () => {
  const {db,connectionId,reserve}=await fixture();
  const previous=process.env.BANK_QR_WORKER_SECRET;
  process.env.BANK_QR_WORKER_SECRET='unit-test-worker-token-at-least-32-characters';
  const id=randomUUID();let calls=0;
  try {
    await reserve(id);
    await db.query("update bank_qr_test_requests set qr_id='QA-worker',status='pending' where id=$1",[id]);
    await db.query('update bank_qr_connections set active=false where id=$1',[connectionId]);
    const admin={from(table){assert.equal(table,'bank_qr_connections');return {select(){return this;},eq(field,value){this.id=value;return this;},async maybeSingle(){return {data:(await db.query('select * from bank_qr_connections where id=$1',[this.id])).rows[0],error:null};}};},
      async rpc(name,args){let result;
        if(name==='claim_baneco_reconciliation') result=await db.query('select claim_baneco_reconciliation($1,$2,$3) result',[args.p_token,args.p_id??null,args.p_cancel??false]);
        else if(name==='finish_baneco_reconciliation')result=await db.query('select finish_baneco_reconciliation($1,$2,$3,$4,$5,$6) result',[args.p_id,args.p_token,args.p_status,args.p_transaction,args.p_error,args.p_details]);
        else if(name==='post_waiting_baneco_payments') return {data:0,error:null};
        else if(name==='claim_baneco_order_activation') return {data:null,error:null};
        else if(name==='release_baneco_group_ready') return {data:[],error:null};
        else throw Error('Unexpected RPC');return {data:result.rows[0].result,error:null};}
    };
    const service=load('src/lib/services/bank-qr.service.ts',{
      '@/lib/services/auth.service':{authService:{getCurrentProfile:async()=>{throw Error('Worker must not impersonate a user');}}},
      '@/lib/services/support-impersonation.service':{getActiveSupportSession:async()=>null},
      '@/lib/supabase/admin':{createAdminClient:()=>admin},
      '@/lib/payments/credential-vault':{openBankCredentials:()=>credentials},
      '@/lib/payments/baneco':{...bank,createBanecoClient:()=>({status:async()=>{calls++;return {responseCode:0,statusQrCode:1,payment:{qrId:'QA-worker',amount:1.25,currency:'BOB',transactionId:'BANK-paid',paymentDate:bank.boliviaDate(),paymentTime:'12:10:00'}};},generate:async()=>{throw Error('Cannot generate');},cancel:async()=>{throw Error('Cannot cancel');}})}
    });
    const sign=timestamp=>({timestamp,signature:createHmac('sha256',process.env.BANK_QR_WORKER_SECRET).update('baneco-worker-v1:'+timestamp).digest('hex')});
    for(const headers of [{timestamp:null,signature:null},sign(String(Math.floor(Date.now()/1000)-120)),sign(String(Math.floor(Date.now()/1000)+120)),{timestamp:String(Math.floor(Date.now()/1000)),signature:'0'.repeat(64)}])
      await assert.rejects(service.runBankQrWorker(headers),/bank-forbidden/);
    assert.equal(calls,0);
    const auth=sign(String(Math.floor(Date.now()/1000)));
    const results=await Promise.all([service.runBankQrWorker(auth),service.runBankQrWorker(auth)]);
    assert.equal(results.reduce((sum,r)=>sum+r.completed,0),1);assert.equal(calls,1);
    await service.runBankQrWorker(auth);assert.equal(calls,1);
    assert.equal((await db.query('select status from bank_qr_test_requests where id=$1',[id])).rows[0].status,'paid');
  } finally { await db.close();if(previous===undefined)delete process.env.BANK_QR_WORKER_SECRET;else process.env.BANK_QR_WORKER_SECRET=previous; }
});

test('scheduler is fixed-destination and private; UI refresh never contacts the bank',()=>{
  const sql=read('supabase/migrations/0123_baneco_scheduler.sql');
  assert.match(sql,/https:\/\/yopido.shop\/api\/cron\/bank-qr/);
  assert.match(sql,/vault.decrypted_secrets/);assert.match(sql,/timeout_milliseconds:=60000/);
  assert.match(sql,/extensions.hmac/);assert.doesNotMatch(sql,/Bearer/);
  const canonical=read('supabase/migrations/0124_baneco_worker_canonical_host.sql');
  assert.match(canonical,/url:='https:\/\/www.yopido.shop\/api\/cron\/bank-qr'/);
  assert.match(canonical,/extensions.hmac/);assert.doesNotMatch(canonical,/Bearer/);
  assert.match(sql,/revoke all .* from public,anon,authenticated/);
  assert.doesNotMatch(sql,/grant execute on function public.dispatch/);
  const client=read('src/app/admin/pagos-qr/BankQrAutoRefresh.tsx');
  assert.match(client,/router.refresh/);assert.doesNotMatch(client,/bankQrService|fetch\(/);
  assert.match(client,/window.confirm/);
  const transport=read('src/lib/payments/baneco.ts');assert.match(transport,/const deadline = setTimeout/);
});
