// Short-lived, signed challenge cookie for WebAuthn ceremonies.
//
// Spec non-negotiable #2: challenges are single-use and signed. The cookie
// payload binds the random challenge to the ceremony purpose (register vs.
// login) and, for login, the resolved user_id. HMAC-SHA256 over the JSON
// payload prevents tampering. TTL is 5 minutes — long enough for a Face ID
// prompt, short enough that a stolen cookie is useless quickly.
//
// Reuses the same JWT_SECRET / SUPABASE_JWT_SECRET fallback chain that
// lib/crypto.ts uses for trusted-device tokens to avoid introducing a new
// secret material requirement.

import crypto from 'crypto';

const COOKIE_NAME_REGISTER = 'webauthn_chal_register';
const COOKIE_NAME_LOGIN = 'webauthn_chal_login';
const TTL_SECONDS = 5 * 60;

export type ChallengePurpose = 'register' | 'login';

export interface ChallengePayload {
  challenge: string;
  purpose: ChallengePurpose;
  userId?: string;
  expiresAt: number;
}

function getSigningKey(): string {
  const key = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '';
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET or SUPABASE_JWT_SECRET must be set in production');
    }
    return 'dev-only-insecure-signing-key';
  }
  return key;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function cookieNameFor(purpose: ChallengePurpose): string {
  return purpose === 'register' ? COOKIE_NAME_REGISTER : COOKIE_NAME_LOGIN;
}

export function signChallenge(payload: Omit<ChallengePayload, 'expiresAt'>): {
  cookieValue: string;
  expiresAt: number;
} {
  const expiresAt = Date.now() + TTL_SECONDS * 1000;
  const full: ChallengePayload = { ...payload, expiresAt };
  const json = JSON.stringify(full);
  const body = b64url(Buffer.from(json, 'utf8'));
  const sig = crypto.createHmac('sha256', getSigningKey()).update(body).digest('hex');
  return { cookieValue: `${body}.${sig}`, expiresAt };
}

export function verifyChallenge(
  cookieValue: string | undefined | null,
  expectedPurpose: ChallengePurpose,
): ChallengePayload | null {
  if (!cookieValue) return null;
  const dot = cookieValue.lastIndexOf('.');
  if (dot === -1) return null;
  const body = cookieValue.substring(0, dot);
  const sig = cookieValue.substring(dot + 1);
  if (!body || !sig) return null;

  let expected: string;
  try {
    expected = crypto.createHmac('sha256', getSigningKey()).update(body).digest('hex');
  } catch {
    return null;
  }
  if (sig.length !== expected.length) return null;
  let ok: boolean;
  try {
    ok = crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return null;
  }
  if (!ok) return null;

  let parsed: ChallengePayload;
  try {
    parsed = JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    return null;
  }
  if (parsed.purpose !== expectedPurpose) return null;
  if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Date.now()) return null;
  if (typeof parsed.challenge !== 'string' || parsed.challenge.length < 16) return null;
  return parsed;
}

export const challengeCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: TTL_SECONDS,
};
