import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { changePasswordSchema } from '../../../../../lib/schemas';
import { logger } from '../../../../../lib/logger';
import { features } from '../../../../../lib/features';
import { getProof, issueProof, sessionCookieOpts, sessionIdFromToken, setSessionCookies } from '../../../../../lib/mfa/session';
import { logMfaEvent } from '../../../../../lib/mfa/state';

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// POST /api/auth/change-password
//   • Forced change (must_change_password set by an admin): the temp password
//     that created this session is the only proof needed.
//   • Voluntary change: requires a verified second factor and the current password.
export async function POST(request: Request) {
  let user;
  try {
    user = await getUserFromToken(request, { aal: 1 });
  } catch (authErr) {
    logger.warn('change-password: auth failed —', authErr instanceof Error ? authErr.message : authErr);
    return NextResponse.json({ error: 'Your session has expired. Please sign in again.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { newPassword } = parsed.data;
    const forced = user.app_metadata?.must_change_password === true;
    const proof = await getProof(request, user);

    if (!forced) {
      if (features.ENABLE_2FA && !proof) {
        return NextResponse.json({ error: 'Verify your second factor before changing your password.' }, { status: 403 });
      }
      const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
      const { error: pwErr } = currentPassword
        ? await anonClient().auth.signInWithPassword({ email: user.email!, password: currentPassword })
        : { error: new Error('missing') };
      if (pwErr) {
        return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 403 });
      }
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword,
      app_metadata: { must_change_password: false },
    });

    if (updateError) {
      logger.error('change-password: updateUserById failed —', updateError.message);
      return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
    }

    await supabaseAdmin
      .from('brand_user_profiles')
      .update({ must_change_password: false })
      .eq('id', user.id);

    // End every existing session (including any an attacker holds), then sign
    // in again with the new password for a fresh one.
    const oldToken = (request.headers.get('cookie') ?? '').match(/supabase-access-token=([^;]+)/)?.[1];
    if (oldToken) {
      const { error: soErr } = await supabaseAdmin.auth.admin.signOut(oldToken, 'global');
      if (soErr) logger.warn('change-password: global sign-out failed —', soErr.message);
    }

    const { data: session, error: loginError } = await anonClient().auth.signInWithPassword({
      email: user.email!,
      password: newPassword,
    });

    if (loginError || !session.session) {
      logger.error(
        'change-password: reauth with new password failed —',
        loginError?.message ?? 'no session returned',
      );
      return NextResponse.json(
        {
          error: 'Password updated, but we could not refresh your session. Please sign in again with your new password.',
          reauth: false,
        },
        { status: 500 },
      );
    }

    await logMfaEvent(user.id, 'password_changed', request, { forced });

    const response = NextResponse.json({ success: true, reauth: true });
    setSessionCookies(response, session.session);
    response.cookies.set('supabase-user', JSON.stringify({
      id: user.id,
      email: user.email,
      role: user.app_metadata?.role ?? 'VENDOR',
      brand: user.user_metadata?.brand ?? null,
      must_change_password: false,
    }), sessionCookieOpts);

    // The proof is bound to the session id, which just changed. Carry the
    // second factor over only if this request had already proven it.
    if (proof) {
      await issueProof(response, user, sessionIdFromToken(session.session.access_token), proof.amr);
    }

    return response;
  } catch (err) {
    logger.error('change-password: unexpected error —', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
