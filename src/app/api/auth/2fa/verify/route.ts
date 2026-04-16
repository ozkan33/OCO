import { NextResponse } from 'next/server';
import { verify as verifyTOTP } from 'otplib';
import crypto from 'crypto';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { features } from '../../../../../../lib/features';
import { decryptSecret, signDeviceToken } from '../../../../../../lib/crypto';
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
    try {
      secret = decryptSecret(totpData.encrypted_secret);
    } catch (decryptErr) {
      logger.error('2FA verify: decryption failed for user', user.id, decryptErr);
      return NextResponse.json({ error: 'Unable to verify code. Please contact support.' }, { status: 500 });
    }

    const result = await verifyTOTP({ token: code, secret });

    if (!result.valid) {
      return NextResponse.json({ error: 'Invalid code. Please try again.' }, { status: 400 });
    }

    // ── Step 5: If first verification (setup), enable 2FA ────────────────────
    if (!totpData.is_enabled) {
      await supabaseAdmin
        .from('user_totp_secrets')
        .update({ is_enabled: true, verified_at: new Date().toISOString() })
        .eq('user_id', user.id);

      // Update profile
      await supabaseAdmin
        .from('brand_user_profiles')
        .update({ totp_enabled: true })
        .eq('id', user.id);

      // Update user metadata
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, totp_enabled: true },
      });
    }

    const response: any = { success: true, verified: true };

    // ── Step 6: Trust this device if requested ───────────────────────────────
    if (trustDevice) {
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

      await supabaseAdmin.from('trusted_devices').insert({
        user_id: user.id,
        device_token: deviceToken,
        device_name: deviceName,
        user_agent: ua.substring(0, 500),
        ip_address: ip,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      });

      // Set trusted device cookie (signed to prevent forgery) + 2FA verified session cookie
      const signedToken = signDeviceToken(deviceToken);
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
