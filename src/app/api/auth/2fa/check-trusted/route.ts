import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { features } from '../../../../../../lib/features';
import { verifyDeviceToken } from '../../../../../../lib/crypto';
import { logger } from '../../../../../../lib/logger';

// GET /api/auth/2fa/check-trusted — check if the current device has a valid trusted_device cookie
export async function GET(request: NextRequest) {
  if (!features.ENABLE_2FA) return NextResponse.json({ trusted: true });
  if (!features.ENABLE_TRUSTED_DEVICES) return NextResponse.json({ trusted: false });

  let user;
  try {
    user = await getUserFromToken(request);
  } catch (err) {
    logger.warn('check-trusted: session auth failed —', err instanceof Error ? err.message : err);
    return NextResponse.json({ trusted: false, reason: 'no_session' });
  }

  // Read the trusted_device cookie via NextRequest (handles URL-decoding consistently with middleware)
  const signedToken = request.cookies.get('trusted_device')?.value || '';
  if (!signedToken) {
    logger.info('check-trusted: no trusted_device cookie for user', user.id);
    return NextResponse.json({ trusted: false, reason: 'no_cookie' });
  }

  // Verify the HMAC signature
  if (!verifyDeviceToken(signedToken)) {
    logger.warn('check-trusted: invalid signature for user', user.id);
    return NextResponse.json({ trusted: false, reason: 'bad_signature' });
  }

  // Extract the raw token (before the signature dot)
  const dotIndex = signedToken.lastIndexOf('.');
  const rawToken = signedToken.substring(0, dotIndex);

  // Check DB: token exists, belongs to this user, and hasn't expired
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
    logger.warn('check-trusted: token not found in DB for user', user.id);
    return NextResponse.json({ trusted: false, reason: 'not_in_db' });
  }

  if (new Date(data.expires_at) < new Date()) {
    logger.info('check-trusted: trusted device expired for user', user.id);
    // Clean up expired row
    await supabaseAdmin.from('trusted_devices').delete().eq('id', data.id);
    return NextResponse.json({ trusted: false, reason: 'expired' });
  }

  // Refresh last_used (best-effort — don't fail the check if this errors)
  supabaseAdmin
    .from('trusted_devices')
    .update({ last_used: new Date().toISOString() })
    .eq('id', data.id)
    .then(({ error: updErr }) => {
      if (updErr) logger.warn('check-trusted: last_used update failed —', updErr.message);
    });

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
}
