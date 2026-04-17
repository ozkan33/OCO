import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { features } from '../../../../../../lib/features';
import { logger } from '../../../../../../lib/logger';

// POST /api/auth/2fa/reset
// Self-service recovery for users whose TOTP enrollment is unreadable (key rotation,
// corruption, lost phone). Requires:
//   1. A valid session cookie (first-factor password was already proven during sign-in)
//   2. Re-entering the password in the body (guards against session-token theft being
//      sufficient to strip 2FA)
// On success, deletes the TOTP secret, every trusted device, and clears the profile flag,
// so the next login proceeds without a second factor and the user can re-enroll from the
// admin settings page.
export async function POST(request: Request) {
  if (!features.ENABLE_2FA) return NextResponse.json({ success: true, skipped: true });

  let user;
  try {
    user = await getUserFromToken(request);
  } catch (authErr) {
    logger.warn('2FA reset: session auth failed —', authErr instanceof Error ? authErr.message : authErr);
    return NextResponse.json({ error: 'Your session has expired. Please sign in again.' }, { status: 401 });
  }

  const { password } = await request.json().catch(() => ({ password: null }));
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Password is required to reset 2FA.' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: pwErr } = await supabase.auth.signInWithPassword({ email: user.email!, password });
  if (pwErr) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 403 });
  }

  await supabaseAdmin.from('user_totp_secrets').delete().eq('user_id', user.id);
  await supabaseAdmin.from('trusted_devices').delete().eq('user_id', user.id);
  await supabaseAdmin
    .from('brand_user_profiles')
    .update({ totp_enabled: false })
    .eq('id', user.id);
  await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, totp_enabled: false },
  });

  logger.info('2FA reset: cleared enrollment for user', user.id);

  const res = NextResponse.json({ success: true });
  res.cookies.set('trusted_device', '', { path: '/', maxAge: 0 });
  res.cookies.set('2fa_verified', '', { path: '/', maxAge: 0 });
  return res;
}
