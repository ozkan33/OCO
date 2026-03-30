import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    const { access_token, refresh_token } = await request.json();

    if (!access_token || !refresh_token) {
      return NextResponse.json({ error: 'Missing session data' }, { status: 400 });
    }

    // Verify the token server-side — never trust the user object from the client
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(access_token);

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    };

    response.cookies.set('supabase-access-token',  access_token,  cookieOptions);
    response.cookies.set('supabase-refresh-token', refresh_token, cookieOptions);
    // Store only the server-verified user — never the client-supplied object
    response.cookies.set('supabase-user', JSON.stringify({
      id:    user.id,
      email: user.email,
      role:  user.user_metadata?.role ?? 'VENDOR',
    }), cookieOptions);

    return response;
  } catch {
    return NextResponse.json({ error: 'Failed to set session' }, { status: 500 });
  }
}
