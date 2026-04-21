'use client';

// Browser-side wrapper around @simplewebauthn/browser for the four UX entry
// points the rest of the app cares about:
//   - isBiometricSupported()       — capability probe for showing the button
//   - hasPasskeyFor(email)         — should we offer biometric login for this email?
//   - enrollPasskey()              — authed user adds Face ID / Touch ID
//   - signInWithPasskey(email)     — unauthed user signs in with biometrics
//
// All network calls use credentials: 'include' so the short-lived challenge
// cookie issued by the challenge endpoints is sent back with the verify call.

import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser';

export async function isBiometricSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!browserSupportsWebAuthn()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

export async function hasPasskeyFor(email: string): Promise<boolean> {
  if (!email) return false;
  try {
    const res = await fetch('/api/auth/webauthn/has-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.has);
  } catch {
    return false;
  }
}

export interface EnrollResult {
  ok: true;
  deviceLabel?: string;
}

export async function enrollPasskey(): Promise<EnrollResult> {
  const challengeRes = await fetch('/api/auth/webauthn/register/challenge', {
    method: 'POST',
    credentials: 'include',
  });
  if (!challengeRes.ok) {
    const err = await safeErr(challengeRes);
    throw new Error(err || 'Could not start passkey enrollment');
  }
  const options = await challengeRes.json();

  let attResp;
  try {
    attResp = await startRegistration({ optionsJSON: options });
  } catch (err: unknown) {
    // Name of the error is how we distinguish user-cancelled from fatal.
    const name = (err as { name?: string })?.name;
    if (name === 'NotAllowedError' || name === 'AbortError') {
      throw new Error('Passkey enrollment was cancelled.');
    }
    throw new Error(((err as Error)?.message) || 'Your device refused the passkey request.');
  }

  const verifyRes = await fetch('/api/auth/webauthn/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(attResp),
  });
  if (!verifyRes.ok) {
    const err = await safeErr(verifyRes);
    throw new Error(err || 'Passkey registration could not be verified');
  }
  const data = await verifyRes.json();
  return { ok: true, deviceLabel: data?.deviceLabel };
}

export interface SignInResult {
  ok: true;
  redirect: string;
}

export async function signInWithPasskey(email: string): Promise<SignInResult> {
  const challengeRes = await fetch('/api/auth/webauthn/login/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email }),
  });
  if (!challengeRes.ok) {
    throw new Error('Passkey sign-in unavailable. Use your password.');
  }
  const options = await challengeRes.json();

  let authResp;
  try {
    authResp = await startAuthentication({ optionsJSON: options });
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name;
    if (name === 'NotAllowedError' || name === 'AbortError') {
      throw new Error('Passkey sign-in was cancelled.');
    }
    throw new Error(((err as Error)?.message) || 'Your device refused the passkey request.');
  }

  const verifyRes = await fetch('/api/auth/webauthn/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(authResp),
  });
  if (!verifyRes.ok) {
    const err = await safeErr(verifyRes);
    throw new Error(err || 'Passkey sign-in failed');
  }
  const data = await verifyRes.json();
  if (!data?.ok || !data?.redirect) {
    throw new Error('Passkey sign-in failed');
  }
  return { ok: true, redirect: String(data.redirect) };
}

export interface PasskeyRow {
  id: string;
  device_label: string | null;
  created_at: string;
  last_used_at: string | null;
}

export async function listPasskeys(): Promise<PasskeyRow[]> {
  const res = await fetch('/api/auth/webauthn/credentials', { credentials: 'include' });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.credentials) ? data.credentials : [];
}

export async function revokePasskey(id: string): Promise<void> {
  const res = await fetch('/api/auth/webauthn/credentials', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const err = await safeErr(res);
    throw new Error(err || 'Could not revoke passkey');
  }
}

async function safeErr(res: Response): Promise<string | null> {
  try {
    const data = await res.json();
    return typeof data?.error === 'string' ? data.error : null;
  } catch {
    return null;
  }
}
