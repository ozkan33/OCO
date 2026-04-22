import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { supabaseAdmin } from '../../../../../../../lib/supabaseAdmin';
import { logger } from '../../../../../../../lib/logger';
import { getLandingPath, getRoleFromUser } from '../../../../../../../lib/rbac';
import { RP_ID, RP_ORIGIN } from '@/lib/webauthn/config';
import {
  challengeCookieOptions,
  consumeChallenge,
  cookieNameFor,
  verifyChallenge,
} from '@/lib/webauthn/challengeCookie';

export async function POST(request: Request) {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieName = cookieNameFor('login');
  const re = new RegExp(`(?:^|; )${cookieName}=([^;]+)`);
  const challengeCookie = cookieHeader.match(re)?.[1] ?? null;

  const clearCookie = (res: NextResponse) =>
    res.cookies.set(cookieName, '', { ...challengeCookieOptions, maxAge: 0 });

  const payload = verifyChallenge(challengeCookie, 'login');
  if (!payload || !payload.userId) {
    const res = NextResponse.json({ error: 'Authentication failed' }, { status: 400 });
    clearCookie(res);
    return res;
  }

  // Spec non-negotiable #2: challenges are single-use. The cookie HMAC + TTL
  // alone can't prevent a replay of a captured authenticator response within
  // the 5-minute window (counter check doesn't help for Apple authenticators
  // which always return 0). Mark the challenge as consumed before touching
  // the credential row — unique-key violation means replay, reject.
  const freshChallenge = await consumeChallenge(payload.challenge, payload.expiresAt);
  if (!freshChallenge) {
    const res = NextResponse.json({ error: 'Authentication failed' }, { status: 400 });
    clearCookie(res);
    return res;
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    const res = NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    clearCookie(res);
    return res;
  }

  const rawCredId: string = body?.id ?? body?.rawId ?? '';
  if (!rawCredId || typeof rawCredId !== 'string') {
    const res = NextResponse.json({ error: 'Authentication failed' }, { status: 400 });
    clearCookie(res);
    return res;
  }

  // Spec non-negotiable #5: always filter credentials by the user_id resolved
  // when the challenge cookie was issued. Never trust the client to tell us
  // who they are by credential_id alone.
  const { data: credRow, error: credErr } = await supabaseAdmin
    .from('webauthn_credentials')
    .select('id, user_id, credential_id, public_key, counter, transports')
    .eq('user_id', payload.userId)
    .eq('credential_id', rawCredId)
    .single();

  if (credErr || !credRow) {
    const res = NextResponse.json({ error: 'Authentication failed' }, { status: 400 });
    clearCookie(res);
    return res;
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: payload.challenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: credRow.credential_id as string,
        publicKey: new Uint8Array(Buffer.from(credRow.public_key as string, 'base64url')),
        counter: Number(credRow.counter ?? 0),
        transports: (credRow.transports ?? undefined) as AuthenticatorTransportLike[] | undefined,
      },
    });
  } catch (err) {
    logger.warn('webauthn login/verify: verifyAuthenticationResponse rejected —', err instanceof Error ? err.message : err);
    const res = NextResponse.json({ error: 'Authentication failed' }, { status: 400 });
    clearCookie(res);
    return res;
  }

  if (!verification.verified) {
    const res = NextResponse.json({ error: 'Authentication failed' }, { status: 400 });
    clearCookie(res);
    return res;
  }

  // Counter handling per spec non-negotiable #4. Many platform authenticators
  // (Apple, in particular) always return 0; treat 0 as "no replay protection
  // available" and accept it without comparison. Otherwise enforce strict
  // monotonic increase — anything <= stored is a possible cloned authenticator.
  const newCounter = verification.authenticationInfo.newCounter ?? 0;
  const storedCounter = Number(credRow.counter ?? 0);
  if (newCounter !== 0 && newCounter <= storedCounter) {
    logger.error('webauthn login/verify: counter regression for credential', credRow.id);
    const res = NextResponse.json({ error: 'Authentication failed' }, { status: 400 });
    clearCookie(res);
    return res;
  }

  await supabaseAdmin
    .from('webauthn_credentials')
    .update({ counter: newCounter, last_used_at: new Date().toISOString() })
    .eq('id', credRow.id);

  // Issue a Supabase session for this user. Pattern: admin generateLink (magiclink)
  // → take the hashed_token → verifyOtp on a fresh anon client to get an
  // access/refresh pair. Same final shape as /api/auth/set-session.
  const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserById(payload.userId);
  const userEmail = userRes?.user?.email;
  if (userErr || !userEmail) {
    logger.error('webauthn login/verify: getUserById failed —', userErr?.message);
    const res = NextResponse.json({ error: 'Could not establish session' }, { status: 500 });
    clearCookie(res);
    return res;
  }

  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: userEmail,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    logger.error('webauthn login/verify: generateLink failed —', linkErr?.message);
    const res = NextResponse.json({ error: 'Could not establish session' }, { status: 500 });
    clearCookie(res);
    return res;
  }

  const tokenHash = linkData.properties.hashed_token;
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: otpData, error: otpErr } = await anonClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (otpErr || !otpData?.session || !otpData?.user) {
    logger.error('webauthn login/verify: verifyOtp failed —', otpErr?.message);
    const res = NextResponse.json({ error: 'Could not establish session' }, { status: 500 });
    clearCookie(res);
    return res;
  }

  const role = getRoleFromUser(otpData.user);
  const redirect = getLandingPath(role);

  const res = NextResponse.json({ ok: true, redirect });
  clearCookie(res);

  const sessionCookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  };
  res.cookies.set('supabase-access-token', otpData.session.access_token, sessionCookieOpts);
  res.cookies.set('supabase-refresh-token', otpData.session.refresh_token, sessionCookieOpts);
  res.cookies.set(
    'supabase-user',
    JSON.stringify({
      id: otpData.user.id,
      email: otpData.user.email,
      role: otpData.user.user_metadata?.role ?? 'VENDOR',
      brand: otpData.user.user_metadata?.brand ?? null,
      must_change_password: otpData.user.user_metadata?.must_change_password ?? false,
    }),
    sessionCookieOpts,
  );

  // Spec non-negotiable #6: WebAuthn is full MFA. Same cookie semantics as the
  // TOTP verify route — 7-day session-scoped 2fa_verified flag.
  res.cookies.set('2fa_verified', 'true', sessionCookieOpts);

  return res;
}

type AuthenticatorTransportLike = 'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb';
