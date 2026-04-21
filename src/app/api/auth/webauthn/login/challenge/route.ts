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

  let email = '';
  try {
    const body = await request.json();
    email = (body?.email ?? '').toString().trim().toLowerCase();
  } catch {
    // Treat parse errors as unknown email — same shape, same timing.
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const decoy = await buildDecoyOptions();
    await pad(start);
    return NextResponse.json(decoy);
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
