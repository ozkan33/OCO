import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { features } from '../../../../../../lib/features';
import { verifyDeviceToken } from '../../../../../../lib/crypto';

// GET /api/auth/2fa/check-trusted — check if the current device has a valid trusted_device cookie
export async function GET(request: Request) {
  if (!features.ENABLE_2FA) return NextResponse.json({ trusted: true });
  try {
    const user = await getUserFromToken(request);

    // Read the trusted_device cookie from the request
    const cookieHeader = request.headers.get('cookie') || '';
    const match = cookieHeader.match(/(?:^|;\s*)trusted_device=([^;]+)/);
    const signedToken = match?.[1] ? decodeURIComponent(match[1]) : null;

    if (!signedToken) return NextResponse.json({ trusted: false });

    // Verify the HMAC signature
    if (!verifyDeviceToken(signedToken)) return NextResponse.json({ trusted: false });

    // Extract the raw token (before the signature dot)
    const dotIndex = signedToken.lastIndexOf('.');
    const rawToken = signedToken.substring(0, dotIndex);

    // Check DB: token exists, belongs to this user, and hasn't expired
    const { data } = await supabaseAdmin
      .from('trusted_devices')
      .select('id, expires_at')
      .eq('user_id', user.id)
      .eq('device_token', rawToken)
      .single();

    if (!data || new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ trusted: false });
    }

    // Device is trusted — set the 2fa_verified cookie so middleware lets them through
    const res = NextResponse.json({ trusted: true });
    res.cookies.set('2fa_verified', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return res;
  } catch {
    return NextResponse.json({ trusted: false });
  }
}
