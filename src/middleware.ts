import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─── Trusted device token verification (Edge-compatible HMAC-SHA256) ─────────
async function verifyDeviceTokenEdge(signedToken: string): Promise<boolean> {
  const dotIndex = signedToken.lastIndexOf('.');
  if (dotIndex === -1) return false;

  const token = signedToken.substring(0, dotIndex);
  const sig = signedToken.substring(dotIndex + 1);
  if (!token || !sig || sig.length !== 64) return false;

  const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '';
  if (!secret) return false;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(token));
    const expected = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
    return sig === expected;
  } catch {
    return false;
  }
}

// ─── In-memory rate limiter ───────────────────────────────────────────────────
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX    = 10;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  if (loginAttempts.size > 50 && Math.random() < 0.02) {
    loginAttempts.forEach((record, key) => {
      if (now > record.resetAt) loginAttempts.delete(key);
    });
  }
  const record = loginAttempts.get(ip);
  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }
  record.count += 1;
  return record.count > RATE_LIMIT_MAX;
}

// ─── Decode a JWT payload without verification (just to check exp & metadata)
function decodeToken(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeToken(token);
  return !payload?.exp || payload.exp < Date.now() / 1000;
}

// ─── Supabase client factory ─────────────────────────────────────────────────
function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
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

  // ── Rate-limit the login endpoint ──────────────────────────────────────────
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

  // ── Only protect /admin, /vendor, and /portal routes ───────────────────────
  const isProtected = pathname.startsWith('/admin') || pathname.startsWith('/vendor') || pathname.startsWith('/portal');
  if (!isProtected) {
    return NextResponse.next();
  }

  const accessToken  = request.cookies.get('supabase-access-token')?.value;
  const refreshToken = request.cookies.get('supabase-refresh-token')?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // ── Fast path: decode JWT locally to check expiration ──────────────────────
  if (accessToken && !isTokenExpired(accessToken)) {
    // Token valid — now check role-based routing
    const payload = decodeToken(accessToken);
    const role = payload?.user_metadata?.role;
    const mustChangePassword = payload?.user_metadata?.must_change_password;

    // Brand users must change password before accessing portal
    if (role === 'BRAND' && mustChangePassword && !pathname.startsWith('/auth/change-password') && !pathname.startsWith('/api/auth/change-password')) {
      return NextResponse.redirect(new URL('/auth/change-password', request.url));
    }

    // 2FA enforcement: if user has TOTP enabled but hasn't verified this session,
    // block access to protected routes (allow auth API routes so they can verify)
    const totpEnabled = payload?.user_metadata?.totp_enabled;
    const has2FAVerified = request.cookies.get('2fa_verified')?.value === 'true';
    const trustedDeviceCookie = request.cookies.get('trusted_device')?.value || '';
    // Validate trusted device token signature (not just existence)
    const hasTrustedDevice = trustedDeviceCookie ? await verifyDeviceTokenEdge(trustedDeviceCookie) : false;
    if (totpEnabled && !has2FAVerified && !hasTrustedDevice && !mustChangePassword) {
      // Only allow 2FA-related API calls and login page — NOT settings or other pages
      const allowed = pathname.startsWith('/api/auth/2fa') ||
        pathname.startsWith('/api/auth/log-session') ||
        pathname.startsWith('/auth/login');
      if (!allowed) {
        return NextResponse.redirect(new URL('/auth/login', request.url));
      }
    }

    // Brand users cannot access /admin
    if (role === 'BRAND' && pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/portal', request.url));
    }

    // Non-admin, non-brand users trying to access admin
    if (pathname.startsWith('/admin') && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    return NextResponse.next();
  }

  // ── Access token missing or expired — try refresh ──────────────────────────
  if (refreshToken) {
    const refreshed = await tryRefresh(refreshToken);

    if (refreshed) {
      // Check 2FA on refreshed token too
      const refreshedPayload = decodeToken(refreshed.access_token);
      const refreshedTotpEnabled = refreshedPayload?.user_metadata?.totp_enabled;
      const refreshedHas2FA = request.cookies.get('2fa_verified')?.value === 'true';
      const refreshedTrustedCookie = request.cookies.get('trusted_device')?.value || '';
      const refreshedHasTrusted = refreshedTrustedCookie ? await verifyDeviceTokenEdge(refreshedTrustedCookie) : false;
      if (refreshedTotpEnabled && !refreshedHas2FA && !refreshedHasTrusted) {
        const allowed = pathname.startsWith('/api/auth/2fa') || pathname.startsWith('/auth/login') || pathname.startsWith('/admin/settings');
        if (!allowed) {
          return NextResponse.redirect(new URL('/auth/login', request.url));
        }
      }

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

  // ── Both tokens invalid — clear and redirect ──────────────────────────────
  const redirect = NextResponse.redirect(new URL('/auth/login', request.url));
  redirect.cookies.delete('supabase-access-token');
  redirect.cookies.delete('supabase-refresh-token');
  redirect.cookies.delete('supabase-user');
  return redirect;
}

export const config = {
  matcher: ['/admin/:path*', '/vendor/:path*', '/portal/:path*', '/api/auth/set-session'],
};
