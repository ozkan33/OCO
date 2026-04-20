import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Capability, ROLE_CAPABILITIES, isRole, type Role } from '../lib/rbac';

// ─── Trusted device token verification (Edge-compatible HMAC-SHA256) ─────────
async function verifyDeviceTokenEdge(signedToken: string): Promise<boolean> {
  const dotIndex = signedToken.lastIndexOf('.');
  if (dotIndex === -1) return false;

  const token = signedToken.substring(0, dotIndex);
  const sig = signedToken.substring(dotIndex + 1);
  if (!token || !sig || sig.length !== 64) return false;

  const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || 'dev-only-insecure-signing-key';
  if (secret === 'dev-only-insecure-signing-key' && process.env.NODE_ENV === 'production') return false;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(token));
    const expected = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
    // Constant-time comparison to prevent timing attacks
    if (sig.length !== expected.length) return false;
    let mismatch = 0;
    for (let i = 0; i < sig.length; i++) {
      mismatch |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}

// ─── In-memory rate limiter ───────────────────────────────────────────────────
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const contactAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX    = 10;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const CONTACT_RATE_MAX  = 5;
const CONTACT_RATE_WINDOW = 60 * 60 * 1000; // 1 hour

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

  // ── Rate-limit the public contact form ────────────────────────────────────
  if (pathname === '/api/contact' && request.method === 'POST') {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';
    const now = Date.now();
    const record = contactAttempts.get(ip);
    if (!record || now > record.resetAt) {
      contactAttempts.set(ip, { count: 1, resetAt: now + CONTACT_RATE_WINDOW });
    } else {
      record.count += 1;
      if (record.count > CONTACT_RATE_MAX) {
        return NextResponse.json(
          { error: 'Too many submissions. Please try again later.' },
          { status: 429 },
        );
      }
    }
    return NextResponse.next();
  }

  // ── Phone UA gate for /admin (Phase 2 PWA) ─────────────────────────────────
  // The admin surface is intentionally iPad+/desktop only. Redirect phone-class
  // devices to an informational page BEFORE any auth or capability work — a
  // bookmark-follower with a saved session on an iPhone shouldn't mount the
  // 5700-line AdminDataGrid just to hit an unusable UI. iPad detection uses
  // navigator.maxTouchPoints client-side; the server can only see UA, so here
  // we match unambiguous phone tokens and leave iPad/tablet cases to render
  // normally. `?force=desktop` is a documented escape hatch for edge cases.
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/mobile-unavailable')) {
    const forceDesktop = request.nextUrl.searchParams.get('force') === 'desktop';
    if (!forceDesktop) {
      const ua = request.headers.get('user-agent') || '';
      const isPhoneUA = /iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua));
      if (isPhoneUA) {
        return NextResponse.redirect(new URL('/admin/mobile-unavailable', request.url));
      }
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
    const rawRole = payload?.user_metadata?.role;
    const role: Role | null = typeof rawRole === 'string' && isRole(rawRole.toUpperCase()) ? (rawRole.toUpperCase() as Role) : null;
    const caps = role ? ROLE_CAPABILITIES[role] : null;
    const mustChangePassword = payload?.user_metadata?.must_change_password;

    const mustEnroll2FA = payload?.user_metadata?.must_enroll_2fa;

    // Any non-admin portal user must change password and/or enroll 2FA before
    // accessing the portal. The /auth/change-password page owns both the
    // password step and the 2FA enrollment step (scan QR → verify), so
    // redirect there for either flag.
    const needsOnboarding = caps?.has(Capability.PORTAL_ACCESS) && !caps.has(Capability.ADMIN_ACCESS);
    if (
      needsOnboarding &&
      (mustChangePassword || mustEnroll2FA) &&
      !pathname.startsWith('/auth/change-password') &&
      !pathname.startsWith('/api/auth/change-password') &&
      !pathname.startsWith('/api/auth/2fa') &&
      !pathname.startsWith('/api/auth/log-session') &&
      !pathname.startsWith('/api/auth/me')
    ) {
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

    // /admin requires admin:access capability
    if (pathname.startsWith('/admin') && !caps?.has(Capability.ADMIN_ACCESS)) {
      // If the user is a portal user, send them to /portal; otherwise login
      const dest = caps?.has(Capability.PORTAL_ACCESS) ? '/portal' : '/auth/login';
      return NextResponse.redirect(new URL(dest, request.url));
    }

    // /portal requires portal:access capability
    if (pathname.startsWith('/portal') && !caps?.has(Capability.PORTAL_ACCESS)) {
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
      const rawRefreshedRole = refreshedPayload?.user_metadata?.role;
      const refreshedRole: Role | null = typeof rawRefreshedRole === 'string' && isRole(rawRefreshedRole.toUpperCase())
        ? (rawRefreshedRole.toUpperCase() as Role)
        : null;
      const refreshedCaps = refreshedRole ? ROLE_CAPABILITIES[refreshedRole] : null;
      const refreshedMustChange = refreshedPayload?.user_metadata?.must_change_password;
      const refreshedMustEnroll = refreshedPayload?.user_metadata?.must_enroll_2fa;
      const refreshedTotpEnabled = refreshedPayload?.user_metadata?.totp_enabled;
      const refreshedHas2FA = request.cookies.get('2fa_verified')?.value === 'true';
      const refreshedTrustedCookie = request.cookies.get('trusted_device')?.value || '';
      const refreshedHasTrusted = refreshedTrustedCookie ? await verifyDeviceTokenEdge(refreshedTrustedCookie) : false;

      // Same onboarding redirect as the fast path above.
      const refreshedNeedsOnboarding = refreshedCaps?.has(Capability.PORTAL_ACCESS) && !refreshedCaps.has(Capability.ADMIN_ACCESS);
      if (
        refreshedNeedsOnboarding &&
        (refreshedMustChange || refreshedMustEnroll) &&
        !pathname.startsWith('/auth/change-password') &&
        !pathname.startsWith('/api/auth/change-password') &&
        !pathname.startsWith('/api/auth/2fa') &&
        !pathname.startsWith('/api/auth/log-session') &&
        !pathname.startsWith('/api/auth/me')
      ) {
        return NextResponse.redirect(new URL('/auth/change-password', request.url));
      }

      if (refreshedTotpEnabled && !refreshedHas2FA && !refreshedHasTrusted) {
        const allowed = pathname.startsWith('/api/auth/2fa') || pathname.startsWith('/api/auth/log-session') || pathname.startsWith('/auth/login');
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
  matcher: ['/admin/:path*', '/vendor/:path*', '/portal/:path*', '/api/auth/set-session', '/api/contact'],
};
