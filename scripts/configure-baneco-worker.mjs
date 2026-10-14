// Run once after migrations, from the linked Vercel project:
// node --env-file=.env.local scripts/configure-baneco-worker.mjs
// No bank credentials, tokens, or provider payloads are printed or written to disk.
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Supabase configuration is missing');
const endpoint = new URL('/rest/v1/rpc/configure_baneco_worker', url);
if (endpoint.protocol !== 'https:') throw new Error('HTTPS required');
const secret = randomBytes(48).toString('base64url');
// Intentionally no --force: never overwrite an existing production worker key.
const result = spawnSync('npx', ['vercel', 'env', 'add', 'BANK_QR_WORKER_SECRET', 'production', '--sensitive', '--yes'],
  { input: secret, encoding: 'utf8', timeout: 60_000, stdio: ['pipe', 'pipe', 'pipe'] });
if (result.status !== 0) throw new Error('Vercel secret was not added; existing keys were not overwritten. Check the linked project and variable names.');
const response = await fetch(endpoint, { method: 'POST', headers: {
  apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json',
}, body: JSON.stringify({ p_secret: secret }), signal: AbortSignal.timeout(15_000) });
if (!response.ok) throw new Error(`Vault setup failed (HTTP ${response.status}); do not deploy the worker until its key is synchronized.`);
console.log('Worker secret synchronized to Vercel Production and Supabase Vault. Redeploy to activate.');
