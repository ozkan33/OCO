import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { features } from '../../../../../../lib/features';
import { verifyDeviceToken } from '../../../../../../lib/crypto';
import { logger } from '../../../../../../lib/logger';

// GET /api/auth/2fa/check-trusted — check if the current device has a valid trusted_device cookie
// Fails closed: any unexpected error returns { trusted: false } (200), never a 500. The login flow
// treats trusted=false as "show the 2FA prompt", which is the safe default.
export async function GET(request: NextRequest) {
  if (!features.ENABLE_2FA) return NextResponse.json({ trusted: true });
  if (!features.ENABLE_TRUSTED_DEVICES) return NextResponse.json({ trusted: false });

  try {
    let user;
    try {
      user = await getUserFromToken(request);
    } catch (err) {
      logger.warn('check-trusted: session auth failed —', err instanceof Error ? err.message : err);
      return NextResponse.json({ trusted: false, reason: 'no_session' });
    }

    const signedToken = request.cookies.get('trusted_device')?.value || '';
    if (!signedToken) {
      return NextResponse.json({ trusted: false, reason: 'no_cookie' });
    }

    if (!verifyDeviceToken(signedToken)) {
      logger.warn('check-trusted: invalid signature for user', user.id);
      return NextResponse.json({ trusted: false, reason: 'bad_signature' });
    }

    const dotIndex = signedToken.lastIndexOf('.');
    const rawToken = signedToken.substring(0, dotIndex);

    const { data, error } = await supabaseAdmin
      .from('trusted_devices')
      .select('id, expires_at')
      .eq('user_id', user.id)
      .eq('device_token', rawToken)
      .maybeSingle();

    if (error) {
      logger.error('check-trusted: DB lookup failed —', error.message);
      return NextResponse.json({ trusted: false, reason: 'db_error' });
    }

    if (!data) {
      return NextResponse.json({ trusted: false, reason: 'not_in_db' });
    }

    if (new Date(data.expires_at) < new Date()) {
      await supabaseAdmin.from('trusted_devices').delete().eq('id', data.id);
      return NextResponse.json({ trusted: false, reason: 'expired' });
    }

    supabaseAdmin
      .from('trusted_devices')
      .update({ last_used: new Date().toISOString() })
      .eq('id', data.id)
      .then(({ error: updErr }) => {
        if (updErr) logger.warn('check-trusted: last_used update failed —', updErr.message);
      });

    const res = NextResponse.json({ trusted: true });
    res.cookies.set('2fa_verified', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return res;
  } catch (err) {
    logger.error('check-trusted: unexpected error —', err);
    return NextResponse.json({ trusted: false, reason: 'error' });
  }
}
