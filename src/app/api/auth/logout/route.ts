import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { clearProof } from '../../../../../lib/mfa/session';

export async function POST(request: Request) {
  // Revoke this session on Supabase so the token can't be reused even if stolen
  try {
    const cookieHeader = request.headers.get('Cookie') ?? '';
    const accessToken = cookieHeader.match(/supabase-access-token=([^;]+)/)?.[1] ?? null;
    if (accessToken) await supabaseAdmin.auth.admin.signOut(accessToken, 'local');
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
  // The trusted_device cookie is deliberately kept: it is what lets this
  // browser skip the code prompt at the next sign-in.
  clearProof(response);

  return response;
}
