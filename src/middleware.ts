import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Capability, ROLE_CAPABILITIES, isRole, type Role } from '../lib/rbac';
import { features } from '../lib/features';
import { MFA_PROOF_COOKIE, decodeJwtPayload, proofMatches, verifyProof } from '../lib/mfa/proof';

// ─── MFA gate ───────────────────────────────────────────────────────────────
// Pages need: no pending forced password change, an enrolled second factor, and
// a signed proof bound to this user + session. Anything missing goes to the
// onboarding page, which asks the server what the next step is (and silently
// re-issues the proof on a trusted device). API routes enforce the same rules
// themselves in getUserFromToken — this is routing, not the security boundary.
async function needsOnboarding(request: NextRequest, payload: Record<string, any> | null): Promise<boolean> {
  const meta = payload?.app_metadata ?? {};
  if (meta.must_change_password === true) return true;
  if (!features.ENABLE_2FA) return false;
  if (meta.mfa_enrolled !== true) return true;
  const proof = await verifyProof(request.cookies.get(MFA_PROOF_COOKIE)?.value);
  return !proofMatches(proof, {
    sub: payload?.sub ?? '',
    sid: payload?.session_id ?? '',
    ep: Number(meta.mfa_epoch ?? 0) || 0,
  });
}

function onboardingRedirect(request: NextRequest): NextResponse {
  const url = new URL('/auth/change-password', request.url);
  url.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(url);
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
  return decodeJwtPayload(token);
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

  // Forward the pathname to RSC so the root layout can pick the right
  // PWA manifest (one per scope: /admin, /portal, marketing). Without
  // this header the layout can't tell the surface during SSR.
  const rscHeaders = new Headers(request.headers);
  rscHeaders.set('x-pathname', pathname);

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
    return NextResponse.next({ request: { headers: rscHeaders } });
  }

  // ── Only protect /admin, /vendor, and /portal routes ───────────────────────
  // /admin/mobile-unavailable stays publicly viewable so anyone navigating
  // there directly still sees the informational page.
  const isProtected =
    (pathname.startsWith('/admin') && !pathname.startsWith('/admin/mobile-unavailable')) ||
    pathname.startsWith('/vendor') ||
    pathname.startsWith('/portal');
  if (!isProtected) {
    return NextResponse.next({ request: { headers: rscHeaders } });
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
    const rawRole = payload?.app_metadata?.role;
    const role: Role | null = typeof rawRole === 'string' && isRole(rawRole.toUpperCase()) ? (rawRole.toUpperCase() as Role) : null;
    const caps = role ? ROLE_CAPABILITIES[role] : null;
    if (await needsOnboarding(request, payload)) return onboardingRedirect(request);

    // /admin requires admin:access capability
    if (pathname.startsWith('/admin') && !caps?.has(Capability.ADMIN_ACCESS)) {
      // If the user is a portal user, send them to /portal; otherwise login
      const dest = caps?.has(Capability.PORTAL_ACCESS) ? '/portal' : '/auth/login';
      return NextResponse.redirect(new URL(dest, request.url));
    }

    // Internal-employee admin-page restrictions: KAM sees scorecards + market
    // visits; FSR sees market visits only. Anything else under /admin (except
    // the publicly viewable mobile-unavailable page and per-user settings)
    // bounces to their landing.
    if (pathname.startsWith('/admin') && caps?.has(Capability.ADMIN_ACCESS) && !caps.has(Capability.ADMIN_FULL)) {
      const alwaysAllowed =
        pathname.startsWith('/admin/mobile-unavailable') ||
        pathname.startsWith('/admin/settings');
      if (!alwaysAllowed) {
        if (role === 'FIELD_SALES_REP') {
          if (!pathname.startsWith('/admin/market-visits')) {
            return NextResponse.redirect(new URL('/admin/market-visits', request.url));
          }
        } else if (role === 'KEY_ACCOUNT_MANAGER') {
          const allowed =
            pathname.startsWith('/admin/dashboard') ||
            pathname.startsWith('/admin/market-visits');
          if (!allowed) {
            return NextResponse.redirect(new URL('/admin/dashboard', request.url));
          }
        }
      }
    }

    // /portal requires portal:access capability
    if (pathname.startsWith('/portal') && !caps?.has(Capability.PORTAL_ACCESS)) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    return NextResponse.next({ request: { headers: rscHeaders } });
  }

  // ── Access token missing or expired — try refresh ──────────────────────────
  if (refreshToken) {
    const refreshed = await tryRefresh(refreshToken);

    if (refreshed) {
      // Check 2FA on refreshed token too
      const refreshedPayload = decodeToken(refreshed.access_token);
      const rawRefreshedRole = refreshedPayload?.app_metadata?.role;
      const refreshedRole: Role | null = typeof rawRefreshedRole === 'string' && isRole(rawRefreshedRole.toUpperCase())
        ? (rawRefreshedRole.toUpperCase() as Role)
        : null;
      const refreshedCaps = refreshedRole ? ROLE_CAPABILITIES[refreshedRole] : null;
      if (await needsOnboarding(request, refreshedPayload)) return onboardingRedirect(request);

      // Mirror the fast-path /admin restrictions so an expired-token hop
      // doesn't sneak KAM/FSR into pages they shouldn't see.
      if (pathname.startsWith('/admin') && !refreshedCaps?.has(Capability.ADMIN_ACCESS)) {
        const dest = refreshedCaps?.has(Capability.PORTAL_ACCESS) ? '/portal' : '/auth/login';
        return NextResponse.redirect(new URL(dest, request.url));
      }
      if (pathname.startsWith('/admin') && refreshedCaps?.has(Capability.ADMIN_ACCESS) && !refreshedCaps.has(Capability.ADMIN_FULL)) {
        const alwaysAllowed =
          pathname.startsWith('/admin/mobile-unavailable') ||
          pathname.startsWith('/admin/settings');
        if (!alwaysAllowed) {
          if (refreshedRole === 'FIELD_SALES_REP' && !pathname.startsWith('/admin/market-visits')) {
            return NextResponse.redirect(new URL('/admin/market-visits', request.url));
          }
          if (refreshedRole === 'KEY_ACCOUNT_MANAGER') {
            const allowed = pathname.startsWith('/admin/dashboard') || pathname.startsWith('/admin/market-visits');
            if (!allowed) return NextResponse.redirect(new URL('/admin/dashboard', request.url));
          }
        }
      }
      if (pathname.startsWith('/portal') && !refreshedCaps?.has(Capability.PORTAL_ACCESS)) {
        return NextResponse.redirect(new URL('/auth/login', request.url));
      }

      const response = NextResponse.next({ request: { headers: rscHeaders } });
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
