import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─── In-memory rate limiter ───────────────────────────────────────────────────
// Limits login attempts per IP: max 10 per 15-minute window.
// Note: resets on cold starts (acceptable for a small business portal).
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX    = 10;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes in ms

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  record.count += 1;
  if (record.count > RATE_LIMIT_MAX) return true;

  loginAttempts.set(ip, record);
  return false;
}

// ─── Supabase client factory (anon key only — no service role in middleware) ──
function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── Try to refresh an expired access token ──────────────────────────────────
async function tryRefresh(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string } | null> {
  try {
    const supabase = makeSupabase();
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) return null;
    return {
      access_token:  data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Rate-limit the login page POST ─────────────────────────────────────────
  if (pathname === '/api/auth/set-session' && request.method === 'POST') {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in 15 minutes.' },
        { status: 429 },
      );
    }
  }

  // ── Protect /admin and /vendor routes ──────────────────────────────────────
  if (!pathname.startsWith('/admin') && !pathname.startsWith('/vendor')) {
    return NextResponse.next();
  }

  const accessToken  = request.cookies.get('supabase-access-token')?.value;
  const refreshToken = request.cookies.get('supabase-refresh-token')?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  const supabase = makeSupabase();

  // ── Try current access token ────────────────────────────────────────────────
  if (accessToken) {
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (!error && user) {
      return NextResponse.next(); // Token valid — allow through
    }
  }

  // ── Access token expired — try refresh ─────────────────────────────────────
  if (refreshToken) {
    const refreshed = await tryRefresh(refreshToken);

    if (refreshed) {
      const response = NextResponse.next();
      const opts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      };
      response.cookies.set('supabase-access-token',  refreshed.access_token,  opts);
      response.cookies.set('supabase-refresh-token', refreshed.refresh_token, opts);
      return response;
    }
  }

  // ── Both tokens invalid — clear and redirect ────────────────────────────────
  const redirect = NextResponse.redirect(new URL('/auth/login', request.url));
  redirect.cookies.delete('supabase-access-token');
  redirect.cookies.delete('supabase-refresh-token');
  redirect.cookies.delete('supabase-user');
  return redirect;
}

export const config = {
  matcher: ['/admin/:path*', '/vendor/:path*', '/api/auth/set-session'],
};
