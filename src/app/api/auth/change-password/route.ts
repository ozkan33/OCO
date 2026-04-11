import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { changePasswordSchema } from '../../../../../lib/schemas';

export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { newPassword } = parsed.data;

    // Update password in Supabase Auth
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword,
      user_metadata: {
        ...user.user_metadata,
        must_change_password: false,
      },
    });

    if (error) {
      return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
    }

    // Update profile flag
    await supabaseAdmin
      .from('brand_user_profiles')
      .update({ must_change_password: false })
      .eq('id', user.id);

    // Re-authenticate with the new password to get a fresh session
    // (changing password via admin API invalidates the old session token)
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
      // Password was changed but re-auth failed — user will need to log in again
      return NextResponse.json({ success: true, reauth: false });
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
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
