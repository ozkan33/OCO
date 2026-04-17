// End-to-end test of the 2FA flow for brand users.
// Creates a brand user directly via service role, then exercises the real API.
//
// Run: node scripts/test-2fa-flow.mjs

import { createClient } from '@supabase/supabase-js';
import { generate } from 'otplib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ── Load .env.local manually ────────────────────────────────────────────────
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

// Cookie jar
const jar = new Map();

function captureCookies(res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const c of raw) {
    const [kv] = c.split(';');
    const eq = kv.indexOf('=');
    if (eq < 0) continue;
    const name = kv.slice(0, eq).trim();
    const value = kv.slice(eq + 1).trim();
    jar.set(name, value);
  }
}

function cookieHeader() {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

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
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, ok: res.ok, body: json };
}

function log(label, obj) {
  console.log(`\n━━ ${label}`);
  console.log(JSON.stringify(obj, null, 2));
}

async function main() {
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!SUPA_URL || !SVC || !ANON) {
    console.error('Missing Supabase env vars. Got:', { SUPA_URL: !!SUPA_URL, SVC: !!SVC, ANON: !!ANON });
    process.exit(1);
  }

  const admin = createClient(SUPA_URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } });

  // Create a fresh brand user directly via service role
  const testEmail = `test-2fa-${Date.now()}@example.test`;
  const tempPassword = 'TempPass123!';
  console.log(`Creating brand user ${testEmail} via service role...`);
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: testEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { role: 'BRAND', brand: 'Test Brand', name: 'Test User', must_change_password: true },
  });
  if (createErr || !created.user) {
    console.error('Create user failed:', createErr?.message);
    process.exit(1);
  }
  const newUserId = created.user.id;

  // Create brand_user_profiles row (so change-password update doesn't silently no-op)
  await admin.from('brand_user_profiles').insert({
    id: newUserId, brand_name: 'Test Brand', contact_name: 'Test User', email: testEmail, must_change_password: true,
  });

  try {
    // ── Login as new user via client SDK (same as the login page) ───────────
    const client = createClient(SUPA_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sess, error: loginErr } = await client.auth.signInWithPassword({
      email: testEmail, password: tempPassword,
    });
    if (loginErr || !sess.session) { console.error('Login failed:', loginErr?.message); return; }

    // Prime cookies via set-session (exactly what the UI does)
    const setSess = await jfetch('/api/auth/set-session', {
      method: 'POST',
      body: { access_token: sess.session.access_token, refresh_token: sess.session.refresh_token },
    });
    log('POST /api/auth/set-session', setSess);
    log('Cookies after set-session', cookieHeader());

    // /api/auth/me as sanity
    log('GET /api/auth/me', await jfetch('/api/auth/me'));

    // Change password (this is the critical step)
    const newPassword = 'NewStrongPass456!';
    const chg = await jfetch('/api/auth/change-password', { method: 'POST', body: { newPassword } });
    log('POST /api/auth/change-password', chg);
    log('Cookies after change-password', cookieHeader());

    // GET /api/auth/2fa/setup
    log('GET /api/auth/2fa/setup', await jfetch('/api/auth/2fa/setup'));

    // POST /api/auth/2fa/setup
    const setup = await jfetch('/api/auth/2fa/setup', { method: 'POST' });
    const setupSummary = {
      status: setup.status,
      ok: setup.ok,
      body: typeof setup.body === 'object'
        ? { ...setup.body, qrCode: setup.body.qrCode ? `[${setup.body.qrCode.length} chars]` : null }
        : setup.body,
    };
    log('POST /api/auth/2fa/setup', setupSummary);

    if (!setup.ok) {
      console.error('\n❌ SETUP FAILED — matches the bug the user is reporting.');
      return;
    }

    const secret = setup.body.secret;
    const code = await generate({ secret });
    console.log(`\nGenerated valid TOTP code for secret: ${code}`);

    // POST /api/auth/2fa/verify
    const verify = await jfetch('/api/auth/2fa/verify', {
      method: 'POST', body: { code, trustDevice: false },
    });
    log('POST /api/auth/2fa/verify', verify);

    if (verify.ok) console.log('\n✅ 2FA flow succeeded end-to-end.');
    else console.log('\n❌ VERIFY FAILED for a locally-valid code.');
  } finally {
    await admin.auth.admin.deleteUser(newUserId);
    console.log('\nTest user deleted.');
  }
}

main().catch((e) => { console.error('UNCAUGHT:', e); process.exit(1); });
