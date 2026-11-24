import { NextResponse } from 'next/server';
import { verify as verifyTOTP } from 'otplib';
import crypto from 'crypto';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { features } from '../../../../../../lib/features';
import { decryptSecretDetailed, encryptSecret, signDeviceToken, TotpDecryptError } from '../../../../../../lib/crypto';
import { logger } from '../../../../../../lib/logger';
import { getProof, getSessionId, issueProof, refreshSessionCookies, sessionCookieOpts } from '../../../../../../lib/mfa/session';
import { isFreshFactor } from '../../../../../../lib/mfa/proof';
import {
  TRUSTED_DEVICE_TTL_S, hashDeviceToken, lockMessage, lockedForSeconds, logMfaEvent,
  registerFailure, replaceRecoveryCodes, setAppMetadata,
} from '../../../../../../lib/mfa/state';

function deviceNameFromUA(ua: string): string {
  if (ua.includes('iPhone')) return 'iPhone';
  if (ua.includes('iPad')) return 'iPad';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Windows')) return 'Windows PC';
  if (ua.includes('Mac')) return 'Mac';
  if (ua.includes('Linux')) return 'Linux PC';
  return 'Unknown Device';
}

// POST /api/auth/2fa/verify - Verify a TOTP code.
//   • Sign-in / step-up: checks the active secret and issues the MFA proof.
//   • Enrollment: checks the pending secret, activates it, returns recovery codes.
export async function POST(request: Request) {
  if (!features.ENABLE_2FA) return NextResponse.json({ success: true, verified: true, skipped: true });
  try {
    let user;
    try {
      user = await getUserFromToken(request, { aal: 1 });
    } catch (authErr) {
      logger.warn('2FA verify: session auth failed —', authErr instanceof Error ? authErr.message : authErr);
      return NextResponse.json(
        { error: 'Your session has expired. Please sign in again.' },
        { status: 401 },
      );
    }

    const { code, trustDevice, enroll } = await request.json();

    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Invalid code. Enter the 6-digit code from your authenticator.' }, { status: 400 });
    }

    const { data: row, error: rowErr } = await supabaseAdmin
      .from('user_totp_secrets')
      .select('encrypted_secret, pending_secret, is_enabled, locked_until')
      .eq('user_id', user.id)
      .maybeSingle();

    if (rowErr || !row) {
      logger.warn('2FA verify: no TOTP row for user', user.id);
      return NextResponse.json({ error: '2FA not set up. Please set up 2FA first.' }, { status: 400 });
    }

    const lockedFor = lockedForSeconds(row.locked_until);
    if (lockedFor > 0) {
      return NextResponse.json({ error: lockMessage(lockedFor), code: 'LOCKED' }, { status: 429 });
    }

    // Enrollment when nothing is active yet, or when the caller explicitly asks
    // to activate a pending replacement.
    const enrolling = !!row.pending_secret && (!row.is_enabled || enroll === true);
    if (enrolling && row.is_enabled && !isFreshFactor(await getProof(request, user))) {
      return NextResponse.json(
        { error: 'Confirm a code from your current authenticator first.', code: 'STEP_UP_REQUIRED' },
        { status: 403 },
      );
    }

    const stored: string | null = enrolling ? row.pending_secret : row.encrypted_secret;
    if (!stored) {
      return NextResponse.json({ error: '2FA not set up. Please set up 2FA first.' }, { status: 400 });
    }

    let secret: string;
    let needsRewrap = false;
    try {
      ({ secret, needsRewrap } = decryptSecretDetailed(stored));
    } catch (decryptErr) {
      if (decryptErr instanceof TotpDecryptError) {
        logger.error('2FA verify: secret unreadable under all known keys for user', user.id);
        return NextResponse.json(
          {
            error: 'Your authenticator enrollment cannot be read on this server. Use a recovery code, or ask your administrator to reset your 2FA.',
            code: 'TOTP_UNREADABLE',
          },
          { status: 409 },
        );
      }
      logger.error('2FA verify: unexpected decryption error for user', user.id, decryptErr);
      return NextResponse.json({ error: 'Unable to verify code. Please try again.' }, { status: 500 });
    }

    // otplib v13 defaults epochTolerance to 0; allow ±30s (one period) of clock skew.
    const result = await verifyTOTP({ token: code, secret, epochTolerance: 30 });

    const fail = async (reason: string) => {
      const nowLocked = await registerFailure(user.id);
      await logMfaEvent(user.id, nowLocked > 0 ? 'totp_locked' : 'totp_failed', request, { reason });
      return nowLocked > 0
        ? NextResponse.json({ error: lockMessage(nowLocked), code: 'LOCKED' }, { status: 429 })
        : NextResponse.json({ error: 'Invalid code. Please try again.' }, { status: 400 });
    };

    if (!result.valid) return fail('invalid');

    const step: number = (result as { timeStep?: number }).timeStep ?? Math.floor(Date.now() / 30000);
    const nextSecret = needsRewrap ? encryptSecret(secret) : stored;
    const success = { last_used_step: step, failed_attempts: 0, locked_until: null };
    let recoveryCodes: string[] | undefined;

    if (enrolling) {
      const { error: actErr } = await supabaseAdmin
        .from('user_totp_secrets')
        .update({
          ...success,
          encrypted_secret: nextSecret,
          pending_secret: null,
          is_enabled: true,
          verified_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
      if (actErr) {
        logger.error('2FA verify: activation failed —', actErr.message);
        return NextResponse.json({ error: 'Could not finish 2FA setup. Please try again.' }, { status: 500 });
      }

      await supabaseAdmin
        .from('brand_user_profiles')
        .update({ totp_enabled: true, must_enroll_2fa: false })
        .eq('id', user.id);
      await setAppMetadata(user.id, { mfa_enrolled: true });
      recoveryCodes = await replaceRecoveryCodes(user.id);
      await logMfaEvent(user.id, row.is_enabled ? 'reenrolled' : 'enrolled', request);
    } else {
      // A code is accepted once: the update only lands if this time step is
      // newer than the last accepted one.
      // Two plain conditional updates rather than one .or() filter: PostgREST
      // rejects an or-filter on this UPDATE ("column … does not exist").
      const patch = { ...success, ...(needsRewrap ? { encrypted_secret: nextSecret } : {}) };
      const claim = (first: boolean) => {
        const q = supabaseAdmin.from('user_totp_secrets').update(patch).eq('user_id', user.id);
        return (first ? q.is('last_used_step', null) : q.lt('last_used_step', step)).select('user_id');
      };
      let { data: claimed, error: claimErr } = await claim(true);
      if (!claimErr && (!claimed || claimed.length === 0)) {
        ({ data: claimed, error: claimErr } = await claim(false));
      }
      if (claimErr) {
        logger.error('2FA verify: step claim failed —', claimErr.message);
        return NextResponse.json({ error: 'Unable to verify code. Please try again.' }, { status: 500 });
      }
      if (!claimed || claimed.length === 0) {
        await logMfaEvent(user.id, 'totp_replay', request);
        return NextResponse.json(
          { error: 'That code was already used. Wait for the next code and try again.' },
          { status: 400 },
        );
      }
      await logMfaEvent(user.id, 'totp_verified', request);
    }

    const body: Record<string, unknown> = { success: true, verified: true };
    if (recoveryCodes) body.recoveryCodes = recoveryCodes;

    let trusted: { signedToken: string } | null = null;
    if (trustDevice && features.ENABLE_TRUSTED_DEVICES) {
      try {
        const deviceToken = crypto.randomBytes(32).toString('hex');
        const signedToken = signDeviceToken(deviceToken);
        const ua = request.headers.get('user-agent') || 'Unknown';
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
        const { error: insertErr } = await supabaseAdmin.from('trusted_devices').insert({
          user_id: user.id,
          token_hash: hashDeviceToken(deviceToken),
          device_name: deviceNameFromUA(ua),
          user_agent: ua.substring(0, 500),
          ip_address: ip,
          expires_at: new Date(Date.now() + TRUSTED_DEVICE_TTL_S * 1000).toISOString(),
        });
        if (insertErr) throw new Error(insertErr.message);
        trusted = { signedToken };
        await logMfaEvent(user.id, 'device_trusted', request);
      } catch (trustErr) {
        logger.error('2FA verify: could not trust device —', trustErr instanceof Error ? trustErr.message : trustErr);
        body.trustDeviceError = 'Could not save trusted device; you may need to re-verify next time.';
      }
    }

    const res = NextResponse.json(body);
    await issueProof(res, user, getSessionId(request), 'totp');
    if (trusted) {
      res.cookies.set('trusted_device', trusted.signedToken, { ...sessionCookieOpts, maxAge: TRUSTED_DEVICE_TTL_S });
    }
    // Enrollment changed app_metadata; middleware reads it from the token.
    if (enrolling) await refreshSessionCookies(request, res);
    return res;
  } catch (err) {
    logger.error('2FA verify: unexpected error —', err);
    return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 500 });
  }
}
