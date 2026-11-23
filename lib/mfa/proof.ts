// Signed proof that a second factor was satisfied for one user + one session.
// Edge-compatible (Web Crypto only) so middleware and API routes share it.

export const MFA_PROOF_COOKIE = 'mfa_proof';
export const MFA_PROOF_TTL_S = 60 * 60 * 24 * 7;
export const STEP_UP_WINDOW_S = 10 * 60;

export type MfaMethod = 'totp' | 'webauthn' | 'trusted_device' | 'recovery';

export interface MfaProof {
  sub: string;
  sid: string;
  amr: MfaMethod;
  iat: number;
  exp: number;
  ep: number;
}

const PREFIX = 'v1';
const DOMAIN = 'mfa-proof.v1.';

function getSecret(): string | null {
  const s = process.env.MFA_PROOF_SECRET || process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
  if (s) return s;
  return process.env.NODE_ENV === 'production' ? null : 'dev-only-insecure-signing-key';
}

function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(DOMAIN + data)));
}

export async function signProof(proof: MfaProof): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error('MFA_PROOF_SECRET (or JWT_SECRET) must be set in production');
  const body = toB64Url(new TextEncoder().encode(JSON.stringify(proof)));
  return `${PREFIX}.${body}.${toB64Url(await hmac(secret, body))}`;
}

// Returns the payload only when the signature is valid and it has not expired.
export async function verifyProof(token: string | null | undefined): Promise<MfaProof | null> {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  try {
    const expected = await hmac(secret, parts[1]);
    const given = fromB64Url(parts[2]);
    if (given.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < given.length; i++) diff |= given[i] ^ expected[i];
    if (diff !== 0) return null;
    const proof = JSON.parse(new TextDecoder().decode(fromB64Url(parts[1]))) as MfaProof;
    if (!proof?.sub || typeof proof.exp !== 'number' || proof.exp < Date.now() / 1000) return null;
    return proof;
  } catch {
    return null;
  }
}

// JWT payload without signature verification — callers must only use it for
// claims that are re-checked server-side or that only steer redirects.
export function decodeJwtPayload(token: string | null | undefined): Record<string, any> | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(new TextDecoder().decode(fromB64Url(parts[1])));
  } catch {
    return null;
  }
}

export function proofMatches(
  proof: MfaProof | null,
  expected: { sub: string; sid: string; ep: number },
): proof is MfaProof {
  return !!proof && proof.sub === expected.sub && proof.sid === expected.sid && proof.ep === expected.ep;
}

// A silently reissued trusted-device proof never counts as a fresh factor.
export function isFreshFactor(proof: MfaProof | null): boolean {
  return !!proof && proof.amr !== 'trusted_device' && Date.now() / 1000 - proof.iat <= STEP_UP_WINDOW_S;
}
