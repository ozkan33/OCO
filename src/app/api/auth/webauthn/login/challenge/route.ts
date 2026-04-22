import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { supabaseAdmin } from '../../../../../../../lib/supabaseAdmin';
import { logger } from '../../../../../../../lib/logger';
import { RP_ID } from '@/lib/webauthn/config';
import {
  challengeCookieOptions,
  cookieNameFor,
  signChallenge,
} from '@/lib/webauthn/challengeCookie';

const MIN_RESPONSE_MS = 220;

// Per-IP rate limit. Same budget as /has-credentials — the two endpoints
// share an enumeration risk and attacker economy, so keeping them aligned
// avoids the weaker one becoming the bypass. In-memory by design; Edge/
// serverless instances each keep their own bucket, which is acceptable at
// the current scale.
const ipBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  if (ipBuckets.size > 100 && Math.random() < 0.02) {
    ipBuckets.forEach((rec, k) => {
      if (now > rec.resetAt) ipBuckets.delete(k);
    });
  }
  const rec = ipBuckets.get(ip);
  if (!rec || now > rec.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT_MAX;
}

async function pad(start: number) {
  const elapsed = Date.now() - start;
  const wait = MIN_RESPONSE_MS - elapsed;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function lookupUserByEmail(email: string): Promise<{ id: string } | null> {
  // listUsers caps at 1000 per page. We page until we find a match or exhaust
  // results — O(users) but only hot on unknown emails, and we rate-limit
  // has-credentials / challenge endpoints so this can't be weaponised as an
  // enumeration oracle.
  try {
    const lowered = email.toLowerCase();
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error || !data?.users?.length) return null;
      const match = data.users.find((u) => (u.email ?? '').toLowerCase() === lowered);
      if (match) return { id: match.id };
      if (data.users.length < 200) return null;
    }
    return null;
  } catch (e) {
    logger.warn('webauthn login/challenge: listUsers failed —', e instanceof Error ? e.message : e);
    return null;
  }
}

async function buildDecoyOptions() {
  return generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'required',
    allowCredentials: [],
    timeout: 60_000,
  });
}

export async function POST(request: Request) {
  const start = Date.now();

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  if (isRateLimited(ip)) {
    // Return the same 429 shape has-credentials does. No decoy cookie on
    // rate-limit — a 429 already tells the caller to back off, and setting
    // a cookie here would just be noise.
    await pad(start);
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  }

  let email = '';
  try {
    const body = await request.json();
    email = (body?.email ?? '').toString().trim().toLowerCase();
  } catch {
    // Treat parse errors as unknown email — same shape, same timing.
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    // Parse-fail case: match the unknown-user path below so the presence of
    // a Set-Cookie header doesn't reveal whether the email format was valid.
    const decoy = await buildDecoyOptions();
    const { cookieValue } = signChallenge({
      challenge: decoy.challenge,
      purpose: 'login',
    });
    const res = NextResponse.json(decoy);
    res.cookies.set(cookieNameFor('login'), cookieValue, challengeCookieOptions);
    await pad(start);
    return res;
  }

  const user = await lookupUserByEmail(email);

  if (!user) {
    const decoy = await buildDecoyOptions();
    const { cookieValue } = signChallenge({
      challenge: decoy.challenge,
      purpose: 'login',
    });
    const res = NextResponse.json(decoy);
    res.cookies.set(cookieNameFor('login'), cookieValue, challengeCookieOptions);
    await pad(start);
    return res;
  }

  const { data: creds, error: credsErr } = await supabaseAdmin
    .from('webauthn_credentials')
    .select('credential_id, transports')
    .eq('user_id', user.id);

  if (credsErr) {
    logger.error('webauthn login/challenge: cred fetch failed —', credsErr.message);
    const decoy = await buildDecoyOptions();
    await pad(start);
    return NextResponse.json(decoy);
  }

  const allowCredentials = (creds ?? []).map((c: { credential_id: string; transports: string[] | null }) => ({
    id: c.credential_id,
    transports: (c.transports ?? undefined) as AuthenticatorTransportLike[] | undefined,
  }));

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'required',
    allowCredentials,
    timeout: 60_000,
  });

  const { cookieValue } = signChallenge({
    challenge: options.challenge,
    purpose: 'login',
    userId: user.id,
  });

  const res = NextResponse.json(options);
  res.cookies.set(cookieNameFor('login'), cookieValue, challengeCookieOptions);
  await pad(start);
  return res;
}

type AuthenticatorTransportLike = 'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb';
