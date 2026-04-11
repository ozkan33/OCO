import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

export async function POST(request: Request) {
  // Revoke the session on Supabase so the token can't be reused even if stolen
  try {
    const cookieHeader = request.headers.get('Cookie') ?? '';
    const accessToken = cookieHeader.match(/supabase-access-token=([^;]+)/)?.[1] ?? null;

    if (accessToken) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(accessToken);
      if (user?.id) {
        // Invalidates all sessions for this user on the Supabase side
        await supabaseAdmin.auth.admin.signOut(user.id);
      }
    }
  } catch {
    // Non-fatal — always clear cookies regardless of Supabase call result
  }

  const response = NextResponse.json({ success: true });

  const clear = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };

  response.cookies.set('supabase-access-token',  '', clear);
  response.cookies.set('supabase-refresh-token', '', clear);
  response.cookies.set('supabase-user',          '', clear);
  response.cookies.set('2fa_verified',           '', clear);

  return response;
}
