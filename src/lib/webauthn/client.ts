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
import { getDeviceKind, isIOS, isStandalone } from '@/lib/pwa/deviceDetection';

export async function isBiometricSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!browserSupportsWebAuthn()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

/**
 * Can this device actually complete a platform-authenticator enrollment
 * RIGHT NOW? This is stricter than `isBiometricSupported()` because iOS
 * lies: `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`
 * returns true inside iOS Chrome (a WKWebView), but the real `create()` call
 * will reject with NotAllowedError. Face ID/Touch ID enrollment on iOS is
 * only usable from:
 *   - Safari (regular tab, iOS 16+)
 *   - An installed PWA running in standalone display mode
 *   - SFSafariViewController (we don't ship one)
 *
 * On Android and desktop the capability check is sufficient — Chrome, Edge,
 * Firefox, and desktop Safari all honor the platform authenticator in a
 * regular browser tab.
 *
 * Callers that ask "should I offer the enrollment modal?" must use this
 * instead of `isBiometricSupported()` — otherwise iOS Chrome users see a
 * prompt that cannot succeed. Separate affordance
 * (`shouldSuggestInstallForBiometric`) handles the iOS-non-standalone case.
 */
export async function canEnrollBiometricOnThisDevice(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!browserSupportsWebAuthn()) return false;
  let hasPlatformAuth = false;
  try {
    hasPlatformAuth = await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
  if (!hasPlatformAuth) return false;
  // iOS gate: Safari-in-tab and installed PWAs can enroll. Chrome/Firefox/
  // Edge on iOS all route through WKWebView and cannot use platform
  // authenticators. Standalone mode covers the installed-PWA case across
  // every iOS browser the user may have installed it from.
  if (isIOS()) {
    if (isStandalone()) return true;
    if (isIOSSafari()) return true;
    return false;
  }
  return true;
}

/**
 * True when the user is on iOS in a browser that cannot enroll a passkey
 * (iOS Chrome, Firefox, Edge — or Safari-in-tab users who chose not to
 * install and want Face ID sign-in). For these users we offer "Add to Home
 * Screen" guidance instead of the enrollment modal. Returns false outside
 * iOS (Android / desktop handle enrollment in-tab without installing).
 */
export function shouldSuggestInstallForBiometric(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('PublicKeyCredential' in window)) return false;
  if (!isIOS()) return false;
  if (isStandalone()) return false;
  return true;
}

/**
 * Best-effort iOS Safari detection. iOS Safari UA contains "Safari" and
 * "Version/"; in-app browsers (Chrome "CriOS", Firefox "FxiOS", Edge "EdgiOS",
 * embedded webviews) do NOT include "Version/" alongside "Safari". This is
 * only consulted on iOS (after `isIOS()` gate), so we don't need to handle
 * desktop Safari here.
 */
function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/CriOS|FxiOS|EdgiOS|OPiOS|mercury|GSA\//i.test(ua)) return false;
  return /Safari/.test(ua) && /Version\//.test(ua);
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

  // X-Client-Device-Kind lets the server pick the right device label for
  // iPadOS 13+ (whose UA is "Macintosh" with no Mobile token — server-side
  // UA parsing can't distinguish it from a real Mac). Falls through to UA
  // parsing server-side if absent or unexpected.
  const verifyRes = await fetch('/api/auth/webauthn/register/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Device-Kind': getDeviceKind(),
    },
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
