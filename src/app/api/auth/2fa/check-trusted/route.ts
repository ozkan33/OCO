import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { features } from '../../../../../../lib/features';
import { verifyDeviceToken } from '../../../../../../lib/crypto';
import { logger } from '../../../../../../lib/logger';
import { LEGACY_TRUSTED_DEVICE_COOKIE, getSessionId, issueProof, sessionCookieOpts, trustedDeviceCookie } from '../../../../../../lib/mfa/session';
import { hashDeviceToken } from '../../../../../../lib/mfa/state';

// GET /api/auth/2fa/check-trusted — if this browser holds a trusted-device token
// that belongs to the signed-in user, issue the MFA proof without a code prompt.
// Fails closed: any unexpected error returns { trusted: false } (200), which the
// sign-in flow treats as "show the 2FA prompt".
export async function GET(request: NextRequest) {
  if (!features.ENABLE_2FA) return NextResponse.json({ trusted: true });
  if (!features.ENABLE_TRUSTED_DEVICES) return NextResponse.json({ trusted: false });

  try {
    let user;
    try {
      user = await getUserFromToken(request, { aal: 1 });
    } catch (err) {
      logger.warn('check-trusted: session auth failed —', err instanceof Error ? err.message : err);
      return NextResponse.json({ trusted: false, reason: 'no_session' });
    }

    if (user.app_metadata?.mfa_enrolled !== true) {
      return NextResponse.json({ trusted: false, reason: 'not_enrolled' });
    }

    // The shared pre-per-user cookie is still honoured (and migrated below).
    const cookieName = trustedDeviceCookie(user.id);
    const legacyToken = request.cookies.get(LEGACY_TRUSTED_DEVICE_COOKIE)?.value || '';
    const signedToken = request.cookies.get(cookieName)?.value || legacyToken;
    if (!signedToken) {
      return NextResponse.json({ trusted: false, reason: 'no_cookie' });
    }

    if (!verifyDeviceToken(signedToken)) {
      logger.warn('check-trusted: invalid signature for user', user.id);
      return NextResponse.json({ trusted: false, reason: 'bad_signature' });
    }

    const rawToken = signedToken.substring(0, signedToken.lastIndexOf('.'));

    const { data, error } = await supabaseAdmin
      .from('trusted_devices')
      .select('id, expires_at')
      .eq('user_id', user.id)
      .eq('token_hash', hashDeviceToken(rawToken))
      .maybeSingle();

    if (error) {
      logger.error('check-trusted: DB lookup failed —', error.message);
      return NextResponse.json({ trusted: false, reason: 'db_error' });
    }

    if (!data) {
      return NextResponse.json({ trusted: false, reason: 'not_in_db' });
    }

    const remainingS = Math.floor((new Date(data.expires_at).getTime() - Date.now()) / 1000);
    if (remainingS <= 0) {
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
    await issueProof(res, user, getSessionId(request), 'trusted_device');
    // Keep the cookie alive for as long as the server-side record is.
    res.cookies.set(cookieName, signedToken, { ...sessionCookieOpts, maxAge: remainingS });
    if (signedToken === legacyToken) {
      res.cookies.set(LEGACY_TRUSTED_DEVICE_COOKIE, '', { ...sessionCookieOpts, maxAge: 0 });
    }
    return res;
  } catch (err) {
    logger.error('check-trusted: unexpected error —', err);
    return NextResponse.json({ trusted: false, reason: 'error' });
  }
}
