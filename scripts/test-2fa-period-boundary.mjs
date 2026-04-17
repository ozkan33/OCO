// Verify the epochTolerance fix: a code from the PREVIOUS 30-second period
// should still verify (matching real-world phone/server clock drift).

import { createClient } from '@supabase/supabase-js';
import { generate } from 'otplib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
try {
  const env = readFileSync(envPath, 'utf-8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
} catch {}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const jar = new Map();

function captureCookies(res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const c of raw) {
    const [kv] = c.split(';');
    const eq = kv.indexOf('=');
    if (eq < 0) continue;
    jar.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
  }
}
const cookieHeader = () => Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

async function jfetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const ck = cookieHeader();
  if (ck) headers.Cookie = ck;
  if (opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(BASE_URL + path, { ...opts, headers, redirect: 'manual' });
  captureCookies(res);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, ok: res.ok, body: json };
}

async function main() {
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const admin = createClient(SUPA_URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } });
  const testEmail = `test-2fa-boundary-${Date.now()}@example.test`;
  const tempPassword = 'TempPass123!';

  const { data: created } = await admin.auth.admin.createUser({
    email: testEmail, password: tempPassword, email_confirm: true,
    user_metadata: { role: 'BRAND', brand: 'Test Brand', name: 'Test User', must_change_password: false },
  });
  const userId = created.user.id;
  await admin.from('brand_user_profiles').insert({
    id: userId, brand_name: 'Test Brand', contact_name: 'Test User', email: testEmail, must_change_password: false,
  });

  try {
    const client = createClient(SUPA_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sess } = await client.auth.signInWithPassword({ email: testEmail, password: tempPassword });
    const setSess = await jfetch('/api/auth/set-session', {
      method: 'POST',
      body: { access_token: sess.session.access_token, refresh_token: sess.session.refresh_token },
    });
    console.log('set-session:', setSess);
    console.log('cookies after set-session:', cookieHeader().slice(0, 120), '...');

    const setup = await jfetch('/api/auth/2fa/setup', { method: 'POST' });
    console.log('Setup response:', { status: setup.status, body: setup.body });
    const secret = setup.body.secret;
    if (!secret) { console.error('No secret returned — aborting.'); return; }
    console.log('Setup ok. secret =', secret);

    // Test 1: current-period code
    const codeNow = await generate({ secret });
    console.log('\nTest 1: current period code =', codeNow);
    const r1 = await jfetch('/api/auth/2fa/verify', { method: 'POST', body: { code: codeNow, trustDevice: false } });
    console.log('  -> status:', r1.status, 'body:', r1.body);

    // Test 2: a code from 30 seconds ago (the PREVIOUS period).
    // This simulates a phone clock that's 30s behind the server, or the classic
    // case of a user typing slowly right when the period rolls over.
    const pastEpoch = Math.floor(Date.now() / 1000) - 30;
    const codePrev = await generate({ secret, epoch: pastEpoch });
    console.log('\nTest 2: previous-period code (30s ago) =', codePrev);
    const r2 = await jfetch('/api/auth/2fa/verify', { method: 'POST', body: { code: codePrev, trustDevice: false } });
    console.log('  -> status:', r2.status, 'body:', r2.body);

    // Test 3: a code from 30 seconds in the future (phone clock 30s ahead).
    const futureEpoch = Math.floor(Date.now() / 1000) + 30;
    const codeNext = await generate({ secret, epoch: futureEpoch });
    console.log('\nTest 3: future-period code (30s ahead) =', codeNext);
    const r3 = await jfetch('/api/auth/2fa/verify', { method: 'POST', body: { code: codeNext, trustDevice: false } });
    console.log('  -> status:', r3.status, 'body:', r3.body);

    // Test 4: a code from 2 minutes ago - should REJECT (outside tolerance)
    const wayPast = Math.floor(Date.now() / 1000) - 120;
    const codeOld = await generate({ secret, epoch: wayPast });
    console.log('\nTest 4: code from 2min ago =', codeOld, '(should reject)');
    const r4 = await jfetch('/api/auth/2fa/verify', { method: 'POST', body: { code: codeOld, trustDevice: false } });
    console.log('  -> status:', r4.status, 'body:', r4.body);

    // Test 5: obviously wrong code
    console.log('\nTest 5: fake code 000000 (should reject)');
    const r5 = await jfetch('/api/auth/2fa/verify', { method: 'POST', body: { code: '000000', trustDevice: false } });
    console.log('  -> status:', r5.status, 'body:', r5.body);

    console.log('\n─── Summary ───');
    console.log('current period:', r1.ok ? 'ACCEPT ✓' : 'REJECT ✗');
    console.log('-30s code     :', r2.ok ? 'ACCEPT ✓' : 'REJECT ✗');
    console.log('+30s code     :', r3.ok ? 'ACCEPT ✓' : 'REJECT ✗');
    console.log('-120s code    :', r4.ok ? 'ACCEPT (BAD!) ✗' : 'REJECT ✓');
    console.log('fake 000000   :', r5.ok ? 'ACCEPT (BAD!) ✗' : 'REJECT ✓');
  } finally {
    await admin.auth.admin.deleteUser(userId);
    console.log('\nTest user deleted.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
