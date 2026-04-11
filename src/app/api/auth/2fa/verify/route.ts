import { NextResponse } from 'next/server';
import { verify as verifyTOTP } from 'otplib';
import crypto from 'crypto';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { features } from '../../../../../../lib/features';

// POST /api/auth/2fa/verify - Verify TOTP code (during setup or login)
export async function POST(request: Request) {
  if (!features.ENABLE_2FA) return NextResponse.json({ success: true, verified: true, skipped: true });
  try {
    const user = await getUserFromToken(request);
    const { code, trustDevice } = await request.json();

    if (!code || typeof code !== 'string' || code.length !== 6) {
      return NextResponse.json({ error: 'Invalid code. Enter the 6-digit code from your authenticator.' }, { status: 400 });
    }

    // Get stored secret
    const { data: totpData } = await supabaseAdmin
      .from('user_totp_secrets')
      .select('encrypted_secret, is_enabled')
      .eq('user_id', user.id)
      .single();

    if (!totpData) {
      return NextResponse.json({ error: '2FA not set up. Please set up 2FA first.' }, { status: 400 });
    }

    // Verify the code
    const isValid = verifyTOTP({ token: code, secret: totpData.encrypted_secret });

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid code. Please try again.' }, { status: 400 });
    }

    // If first verification (setup), enable 2FA
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

    // Trust this device if requested
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

      // Set trusted device cookie
      const res = NextResponse.json(response);
      res.cookies.set('trusted_device', deviceToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
      return res;
    }

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
