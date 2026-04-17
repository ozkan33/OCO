import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { changePasswordSchema } from '../../../../../lib/schemas';
import { logger } from '../../../../../lib/logger';

export async function POST(request: Request) {
  let user;
  try {
    user = await getUserFromToken(request);
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

    // Update password in Supabase Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword,
      user_metadata: {
        ...user.user_metadata,
        must_change_password: false,
      },
    });

    if (updateError) {
      logger.error('change-password: updateUserById failed —', updateError.message);
      return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
    }

    // Update profile flag
    await supabaseAdmin
      .from('brand_user_profiles')
      .update({ must_change_password: false })
      .eq('id', user.id);

    // Re-authenticate with the new password to get a fresh session.
    // (Changing password via admin API may invalidate the old refresh token.)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: session, error: loginError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: newPassword,
    });

    if (loginError || !session.session) {
      // Re-auth failed. Surface the real reason so the UI can react.
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

    // Set fresh session cookies
    const response = NextResponse.json({ success: true, reauth: true });
    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    };
    response.cookies.set('supabase-access-token', session.session.access_token, cookieOpts);
    response.cookies.set('supabase-refresh-token', session.session.refresh_token, cookieOpts);
    response.cookies.set('supabase-user', JSON.stringify({
      id: user.id,
      email: user.email,
      role: user.user_metadata?.role ?? 'VENDOR',
      brand: user.user_metadata?.brand ?? null,
      must_change_password: false,
    }), cookieOpts);

    return response;
  } catch (err) {
    logger.error('change-password: unexpected error —', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
