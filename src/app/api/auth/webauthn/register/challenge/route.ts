import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { supabaseAdmin } from '../../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../../lib/apiAuth';
import { logger } from '../../../../../../../lib/logger';
import { RP_ID, RP_NAME } from '@/lib/webauthn/config';
import {
  challengeCookieOptions,
  cookieNameFor,
  signChallenge,
} from '@/lib/webauthn/challengeCookie';

export async function POST(request: Request) {
  let user;
  try {
    user = await getUserFromToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: existing, error: listErr } = await supabaseAdmin
    .from('webauthn_credentials')
    .select('credential_id, transports')
    .eq('user_id', user.id);
  if (listErr) {
    logger.error('webauthn register/challenge: list existing failed —', listErr.message);
    return NextResponse.json({ error: 'Could not start enrollment' }, { status: 500 });
  }

  // Hard cap to bound per-user data: 10 passkeys is well above what any real
  // user needs (one per device typically) and keeps runaway enrollment from a
  // compromised session bounded. Surface a clear message so the UI can tell
  // the user to revoke something rather than retry.
  const MAX_PASSKEYS_PER_USER = 10;
  if ((existing?.length ?? 0) >= MAX_PASSKEYS_PER_USER) {
    return NextResponse.json(
      { error: `Passkey limit reached (${MAX_PASSKEYS_PER_USER}). Remove one before adding a new passkey.` },
      { status: 400 },
    );
  }

  const excludeCredentials = (existing ?? []).map((row: { credential_id: string; transports: string[] | null }) => ({
    id: row.credential_id,
    transports: (row.transports ?? undefined) as AuthenticatorTransportLike[] | undefined,
  }));

  let options;
  try {
    options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.email ?? user.id,
      userDisplayName: (user.user_metadata?.name as string) || user.email || 'Account',
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
        authenticatorAttachment: 'platform',
      },
    });
  } catch (err) {
    logger.error('webauthn register/challenge: generateRegistrationOptions failed —', err);
    return NextResponse.json({ error: 'Could not start enrollment' }, { status: 500 });
  }

  const { cookieValue } = signChallenge({
    challenge: options.challenge,
    purpose: 'register',
    userId: user.id,
  });

  const res = NextResponse.json(options);
  res.cookies.set(cookieNameFor('register'), cookieValue, challengeCookieOptions);
  return res;
}

type AuthenticatorTransportLike = 'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb';
