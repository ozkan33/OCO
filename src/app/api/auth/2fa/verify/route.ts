import { NextResponse } from 'next/server';
import { verify as verifyTOTP } from 'otplib';
import crypto from 'crypto';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { features } from '../../../../../../lib/features';
import { decryptSecretDetailed, encryptSecret, signDeviceToken, TotpDecryptError } from '../../../../../../lib/crypto';
import { logger } from '../../../../../../lib/logger';

// POST /api/auth/2fa/verify - Verify TOTP code (during setup or login)
export async function POST(request: Request) {
  if (!features.ENABLE_2FA) return NextResponse.json({ success: true, verified: true, skipped: true });
  try {
    // ── Step 1: Authenticate the user via session cookie ──────────────────────
    let user;
    try {
      user = await getUserFromToken(request);
    } catch (authErr) {
      logger.warn('2FA verify: session auth failed —', authErr instanceof Error ? authErr.message : authErr);
      return NextResponse.json(
        { error: 'Your session has expired. Please sign in again.' },
        { status: 401 },
      );
    }

    // ── Step 2: Validate the TOTP code input ─────────────────────────────────
    const { code, trustDevice } = await request.json();

    if (!code || typeof code !== 'string' || code.length !== 6) {
      return NextResponse.json({ error: 'Invalid code. Enter the 6-digit code from your authenticator.' }, { status: 400 });
    }

    // ── Step 3: Look up the stored TOTP secret ───────────────────────────────
    const { data: totpData, error: totpErr } = await supabaseAdmin
      .from('user_totp_secrets')
      .select('encrypted_secret, is_enabled')
      .eq('user_id', user.id)
      .single();

    if (totpErr || !totpData) {
      logger.warn('2FA verify: no TOTP secret found for user', user.id);
      return NextResponse.json({ error: '2FA not set up. Please set up 2FA first.' }, { status: 400 });
    }

    // ── Step 4: Decrypt and verify ───────────────────────────────────────────
    let secret: string;
    let needsRewrap = false;
    try {
      ({ secret, needsRewrap } = decryptSecretDetailed(totpData.encrypted_secret));
    } catch (decryptErr) {
      if (decryptErr instanceof TotpDecryptError) {
        logger.error('2FA verify: secret unreadable under all known keys for user', user.id);
        return NextResponse.json(
          {
            error: 'Your 2FA enrollment is unreadable on this server. Reset 2FA and re-enroll.',
            code: 'TOTP_UNREADABLE',
          },
          { status: 409 },
        );
      }
      logger.error('2FA verify: unexpected decryption error for user', user.id, decryptErr);
      return NextResponse.json({ error: 'Unable to verify code. Please try again.' }, { status: 500 });
    }

    // otplib v13 defaults epochTolerance to 0 (no clock-skew window), which makes
    // verification fail whenever the code crosses a 30-second period boundary between
    // the phone generating it and the server checking it. Allow ±30s (one period) —
    // the standard window used by most 2FA implementations.
    const result = await verifyTOTP({ token: code, secret, epochTolerance: 30 });

    if (!result.valid) {
      return NextResponse.json({ error: 'Invalid code. Please try again.' }, { status: 400 });
    }

    // Re-encrypt under the current primary key when the stored ciphertext was legacy /
    // encrypted under a deprecated key. Completes the migration transparently on the
    // next successful verify, so users don't have to re-enroll after key rotation.
    if (needsRewrap) {
      await supabaseAdmin
        .from('user_totp_secrets')
        .update({ encrypted_secret: encryptSecret(secret) })
        .eq('user_id', user.id);
    }

    // ── Step 5: If first verification (setup), enable 2FA ────────────────────
    if (!totpData.is_enabled) {
      await supabaseAdmin
        .from('user_totp_secrets')
        .update({ is_enabled: true, verified_at: new Date().toISOString() })
        .eq('user_id', user.id);

      // Update profile — clear must_enroll_2fa now that the user has a working
      // authenticator. Until this point middleware keeps forcing /auth/change-password.
      await supabaseAdmin
        .from('brand_user_profiles')
        .update({ totp_enabled: true, must_enroll_2fa: false })
        .eq('id', user.id);

      // Update user metadata — both flags in one write. must_enroll_2fa is the
      // middleware-side gate; totp_enabled is what the login page uses to decide
      // whether to prompt for the 6-digit code on subsequent sign-ins.
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          totp_enabled: true,
          must_enroll_2fa: false,
        },
      });
    }

    const response: any = { success: true, verified: true };

    // ── Step 6: Trust this device if requested ───────────────────────────────
    if (trustDevice && features.ENABLE_TRUSTED_DEVICES) {
      const deviceToken = crypto.randomBytes(32).toString('hex');
      const ua = request.headers.get('user-agent') || 'Unknown';
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';

      // Parse a friendly device name from user agent
      let deviceName = 'Unknown Device';
      if (ua.includes('Windows')) deviceName = 'Windows PC';
      else if (ua.includes('Mac')) deviceName = 'Mac';
      else if (ua.includes('iPhone')) deviceName = 'iPhone';
      else if (ua.includes('Android')) deviceName = 'Android';
      else if (ua.includes('iPad')) deviceName = 'iPad';
      else if (ua.includes('Linux')) deviceName = 'Linux PC';

      // Sign the token BEFORE inserting — if signing fails (missing JWT_SECRET), the row would be
      // an orphan that check-trusted can never validate. Fail fast instead.
      let signedToken: string;
      try {
        signedToken = signDeviceToken(deviceToken);
      } catch (signErr) {
        logger.error('2FA verify: signDeviceToken failed —', signErr);
        const res = NextResponse.json({ ...response, trustDeviceError: 'Could not save trusted device; you may need to re-verify next time.' });
        res.cookies.set('2fa_verified', 'true', {
          httpOnly: true, secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7,
        });
        return res;
      }

      const { error: insertErr } = await supabaseAdmin.from('trusted_devices').insert({
        user_id: user.id,
        device_token: deviceToken,
        device_name: deviceName,
        user_agent: ua.substring(0, 500),
        ip_address: ip,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      });

      if (insertErr) {
        logger.error('2FA verify: trusted_devices insert failed —', insertErr.message);
        const res = NextResponse.json({ ...response, trustDeviceError: 'Could not save trusted device; you may need to re-verify next time.' });
        res.cookies.set('2fa_verified', 'true', {
          httpOnly: true, secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7,
        });
        return res;
      }

      const res = NextResponse.json(response);
      const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
      res.cookies.set('trusted_device', signedToken, { ...cookieOpts, maxAge: 30 * 24 * 60 * 60 });
      res.cookies.set('2fa_verified', 'true', { ...cookieOpts, maxAge: 60 * 60 * 24 * 7 }); // 7 day session
      return res;
    }

    // No trusted device — set session-level 2FA verified cookie
    const res = NextResponse.json(response);
    res.cookies.set('2fa_verified', 'true', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return res;
  } catch (err) {
    logger.error('2FA verify: unexpected error —', err);
    return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 500 });
  }
}
