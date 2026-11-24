import { createClient } from '@supabase/supabase-js';
import type { NextResponse } from 'next/server';
import {
  MFA_PROOF_COOKIE, MFA_PROOF_TTL_S, decodeJwtPayload, proofMatches, signProof, verifyProof,
  type MfaMethod, type MfaProof,
} from './proof';

type UserLike = { id: string; app_metadata?: Record<string, any> | null };

export const sessionCookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
};

// One cookie per account: several accounts can be trusted in the same browser
// without overwriting each other's token.
export const LEGACY_TRUSTED_DEVICE_COOKIE = 'trusted_device';
export function trustedDeviceCookie(userId: string): string {
  return `trusted_device_${userId}`;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? request.headers.get('Cookie') ?? '';
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

export function sessionIdFromToken(accessToken: string | null | undefined): string {
  return decodeJwtPayload(accessToken)?.session_id ?? '';
}

export function getSessionId(request: Request): string {
  return sessionIdFromToken(readCookie(request, 'supabase-access-token'));
}

export function getEpoch(user: UserLike): number {
  const ep = Number(user.app_metadata?.mfa_epoch ?? 0);
  return Number.isFinite(ep) ? ep : 0;
}

// The proof cookie, only if it is valid for this user, this session and the
// user's current epoch.
export async function getProof(request: Request, user: UserLike): Promise<MfaProof | null> {
  const proof = await verifyProof(readCookie(request, MFA_PROOF_COOKIE));
  return proofMatches(proof, { sub: user.id, sid: getSessionId(request), ep: getEpoch(user) }) ? proof : null;
}

export async function issueProof(res: NextResponse, user: UserLike, sid: string, amr: MfaMethod): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const token = await signProof({ sub: user.id, sid, amr, iat: now, exp: now + MFA_PROOF_TTL_S, ep: getEpoch(user) });
  res.cookies.set(MFA_PROOF_COOKIE, token, { ...sessionCookieOpts, maxAge: MFA_PROOF_TTL_S });
}

export function clearProof(res: NextResponse): void {
  res.cookies.set(MFA_PROOF_COOKIE, '', { ...sessionCookieOpts, maxAge: 0 });
  res.cookies.set('2fa_verified', '', { ...sessionCookieOpts, maxAge: 0 });
}

export function setSessionCookies(res: NextResponse, session: { access_token: string; refresh_token: string }): void {
  res.cookies.set('supabase-access-token', session.access_token, sessionCookieOpts);
  res.cookies.set('supabase-refresh-token', session.refresh_token, sessionCookieOpts);
}

// app_metadata changes only reach the access token on refresh, and middleware
// reads the token. Call this after changing enrollment state so the next page
// load sees it. Refresh keeps the same session_id, so the proof stays valid.
export async function refreshSessionCookies(request: Request, res: NextResponse): Promise<boolean> {
  const refreshToken = readCookie(request, 'supabase-refresh-token');
  if (!refreshToken) return false;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) return false;
  setSessionCookies(res, data.session);
  return true;
}
