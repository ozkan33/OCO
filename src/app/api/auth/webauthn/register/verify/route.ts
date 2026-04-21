import { NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { supabaseAdmin } from '../../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../../lib/apiAuth';
import { logger } from '../../../../../../../lib/logger';
import { RP_ID, RP_ORIGIN, deriveDeviceLabel } from '@/lib/webauthn/config';
import {
  challengeCookieOptions,
  cookieNameFor,
  verifyChallenge,
} from '@/lib/webauthn/challengeCookie';

export async function POST(request: Request) {
  let user;
  try {
    user = await getUserFromToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieName = cookieNameFor('register');
  const re = new RegExp(`(?:^|; )${cookieName}=([^;]+)`);
  const challengeCookie = cookieHeader.match(re)?.[1] ?? null;

  const clearCookie = (res: NextResponse) =>
    res.cookies.set(cookieName, '', { ...challengeCookieOptions, maxAge: 0 });

  const payload = verifyChallenge(challengeCookie, 'register');
  if (!payload || payload.userId !== user.id) {
    const res = NextResponse.json({ error: 'Challenge expired or invalid' }, { status: 400 });
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

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: payload.challenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });
  } catch (err) {
    logger.warn('webauthn register/verify: verifyRegistrationResponse rejected —', err instanceof Error ? err.message : err);
    const res = NextResponse.json({ error: 'Registration could not be verified' }, { status: 400 });
    clearCookie(res);
    return res;
  }

  if (!verification.verified || !verification.registrationInfo) {
    const res = NextResponse.json({ error: 'Registration not verified' }, { status: 400 });
    clearCookie(res);
    return res;
  }

  const { credential } = verification.registrationInfo;

  // Both credential.id and credential.publicKey are persisted as base64url-encoded
  // TEXT. id is already a base64url string from the browser; publicKey is a
  // Uint8Array that we encode here.
  const publicKeyB64 = Buffer.from(credential.publicKey).toString('base64url');
  const transports = credential.transports ?? null;
  const deviceLabel = deriveDeviceLabel(request.headers.get('user-agent') ?? '');

  const { error: insertErr } = await supabaseAdmin
    .from('webauthn_credentials')
    .insert({
      user_id: user.id,
      credential_id: credential.id,
      public_key: publicKeyB64,
      counter: credential.counter ?? 0,
      transports,
      device_label: deviceLabel,
    });

  if (insertErr) {
    logger.error('webauthn register/verify: insert failed —', insertErr.message);
    const res = NextResponse.json({ error: 'Could not save credential' }, { status: 500 });
    clearCookie(res);
    return res;
  }

  const res = NextResponse.json({ ok: true, deviceLabel });
  clearCookie(res);
  return res;
}
