import { NextResponse } from 'next/server';
import { generateSecret, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { features } from '../../../../../../lib/features';
import { encryptSecret } from '../../../../../../lib/crypto';
import { logger } from '../../../../../../lib/logger';
import { getProof } from '../../../../../../lib/mfa/session';
import { isFreshFactor } from '../../../../../../lib/mfa/proof';
import { logMfaEvent, recoveryCodesRemaining } from '../../../../../../lib/mfa/state';

// POST /api/auth/2fa/setup - Start (re-)enrollment: generate a pending TOTP secret.
// The pending secret never replaces the active one until /verify confirms a code
// from it. If a factor is already active, the caller must have passed a second
// factor in the last 10 minutes — a password alone cannot swap the authenticator.
export async function POST(request: Request) {
  if (!features.ENABLE_2FA) return NextResponse.json({ enabled: false, skipped: true });

  let user;
  try {
    user = await getUserFromToken(request, { aal: 1 });
  } catch (authErr) {
    logger.warn('2FA setup POST: auth failed —', authErr instanceof Error ? authErr.message : authErr);
    return NextResponse.json(
      { error: 'Your session has expired. Please sign in again.' },
      { status: 401 },
    );
  }

  const { data: existing } = await supabaseAdmin
    .from('user_totp_secrets')
    .select('is_enabled')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing?.is_enabled && !isFreshFactor(await getProof(request, user))) {
    return NextResponse.json(
      { error: 'Confirm a code from your current authenticator first.', code: 'STEP_UP_REQUIRED' },
      { status: 403 },
    );
  }

  // Encrypt up-front so a server-config failure (TOTP_ENCRYPTION_KEY missing)
  // is distinguishable from a transient DB failure.
  let secret: string;
  let ciphertext: string;
  try {
    secret = generateSecret();
    ciphertext = encryptSecret(secret);
  } catch (cryptoErr) {
    logger.error(
      '2FA setup POST: encryptSecret failed — TOTP_ENCRYPTION_KEY is missing or not 64 hex chars in this environment. Fix env vars and redeploy.',
      cryptoErr instanceof Error ? cryptoErr.message : cryptoErr,
    );
    return NextResponse.json(
      {
        error: '2FA is not configured on this server. Please contact support — the administrator needs to set TOTP_ENCRYPTION_KEY.',
        code: 'TOTP_KEY_MISSING',
      },
      { status: 503 },
    );
  }

  try {
    const otpauth = generateURI({ issuer: '3Brothers Marketing', label: user.email || 'user', secret });
    const qrDataUrl = await QRCode.toDataURL(otpauth, { width: 256, margin: 2 });

    const { error: upsertError } = await supabaseAdmin
      .from('user_totp_secrets')
      .upsert({ user_id: user.id, pending_secret: ciphertext }, { onConflict: 'user_id' });

    if (upsertError) {
      logger.error('2FA setup POST: upsert failed —', upsertError.message);
      return NextResponse.json({ error: 'Failed to save 2FA secret. Please try again.' }, { status: 500 });
    }

    await logMfaEvent(user.id, existing?.is_enabled ? 'reenroll_started' : 'enroll_started', request);

    return NextResponse.json({
      qrCode: qrDataUrl,
      secret, // Show to user as manual entry backup
      message: 'Scan the QR code with your authenticator app, then verify with a code.',
    });
  } catch (err) {
    logger.error('2FA setup POST: unexpected error —', err);
    return NextResponse.json({ error: 'Failed to set up 2FA.' }, { status: 500 });
  }
}

// DELETE /api/auth/2fa/setup - 2FA is mandatory for every role, so it cannot be
// switched off. Replacing the authenticator goes through POST (with step-up).
export async function DELETE() {
  return NextResponse.json(
    { error: 'Two-factor authentication is required and cannot be disabled. You can set up a new authenticator instead.' },
    { status: 403 },
  );
}

// GET /api/auth/2fa/setup - 2FA status for the current user
export async function GET(request: Request) {
  if (!features.ENABLE_2FA) return NextResponse.json({ enabled: false });
  try {
    const user = await getUserFromToken(request, { aal: 1 });

    const { data } = await supabaseAdmin
      .from('user_totp_secrets')
      .select('is_enabled, verified_at')
      .eq('user_id', user.id)
      .maybeSingle();

    return NextResponse.json({
      enabled: data?.is_enabled || false,
      verifiedAt: data?.verified_at || null,
      recoveryCodesRemaining: data?.is_enabled ? await recoveryCodesRemaining(user.id) : 0,
    });
  } catch (err) {
    logger.warn('2FA setup GET: auth failed —', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Your session has expired. Please sign in again.' }, { status: 401 });
  }
}
