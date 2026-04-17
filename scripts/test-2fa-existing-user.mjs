// Simulates a CLIENT that already has 2FA enrolled logging in again.
// This is the flow where the user hits /auth/login, enters email+password,
// and is prompted for a TOTP code.

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

const BASE_URL = process.env.BASE_URL || 'http://localhost:3003';
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

  const testEmail = `test-2fa-existing-${Date.now()}@example.test`;
  const password = 'StrongPass123!';

  const { data: created } = await admin.auth.admin.createUser({
    email: testEmail, password, email_confirm: true,
    user_metadata: { role: 'BRAND', brand: 'Test Brand', name: 'Existing User', must_change_password: false },
  });
  const userId = created.user.id;
  await admin.from('brand_user_profiles').insert({
    id: userId, brand_name: 'Test Brand', contact_name: 'Existing User', email: testEmail, must_change_password: false,
  });

  try {
    // ── Phase A: initial enrolment ────────────────────────────────────────────
    const client = createClient(SUPA_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: s1 } = await client.auth.signInWithPassword({ email: testEmail, password });
    await jfetch('/api/auth/set-session', {
      method: 'POST',
      body: { access_token: s1.session.access_token, refresh_token: s1.session.refresh_token },
    });

    const setup = await jfetch('/api/auth/2fa/setup', { method: 'POST' });
    const secret = setup.body.secret;
    console.log('Enrolment: setup secret =', secret);

    const firstCode = await generate({ secret });
    const firstVerify = await jfetch('/api/auth/2fa/verify', { method: 'POST', body: { code: firstCode, trustDevice: false } });
    console.log('Enrolment: first verify =', firstVerify.status, firstVerify.body);

    // ── Phase B: simulate the user comes back on a different day ──────────────
    // Clear cookies and log in fresh.
    jar.clear();
    console.log('\n── Phase B: re-login (existing 2FA user) ──');

    const { data: s2 } = await client.auth.signInWithPassword({ email: testEmail, password });
    await jfetch('/api/auth/set-session', {
      method: 'POST',
      body: { access_token: s2.session.access_token, refresh_token: s2.session.refresh_token },
    });

    // Login page calls check-trusted first
    const trusted = await jfetch('/api/auth/2fa/check-trusted');
    console.log('check-trusted:', trusted.status, trusted.body);

    // Then GET /api/auth/2fa/setup to see if enabled
    const statusCheck = await jfetch('/api/auth/2fa/setup');
    console.log('GET setup (status):', statusCheck.status, statusCheck.body);

    // Now POST verify with current code (the existing client flow)
    const code = await generate({ secret });
    console.log('TOTP code =', code);
    const v = await jfetch('/api/auth/2fa/verify', { method: 'POST', body: { code, trustDevice: true } });
    console.log('POST verify:', v.status, v.body);

    if (v.ok) console.log('\n✅ Existing-client 2FA login flow succeeded.');
    else console.log('\n❌ Existing-client verify failed.');
  } finally {
    await admin.auth.admin.deleteUser(userId);
    console.log('\nTest user deleted.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
