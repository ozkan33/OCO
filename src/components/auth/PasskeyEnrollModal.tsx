'use client';

// Post-login prompt that offers to enable Face ID / Touch ID / Windows Hello
// for the user who just signed in with a password. Without this surface the
// biometric feature is effectively invisible — users never discover it.
//
// Shown by the login page after a successful password (or password + TOTP)
// sign-in when: the platform has a built-in authenticator, the account has
// no passkey yet, and the user hasn't previously dismissed the prompt for
// this email.
//
// Closing the modal (enroll success, skip, or "don't ask again") resumes the
// caller's redirect via onClose — the login page blocks navigation until
// this resolves.

import { useState } from 'react';
import { enrollPasskey } from '@/lib/webauthn/client';

const SKIP_PREFIX = 'oco:passkey-prompt-skipped:';

export function shouldSkipPasskeyPrompt(email: string): boolean {
  if (typeof window === 'undefined' || !email) return false;
  try {
    return window.localStorage.getItem(SKIP_PREFIX + email.toLowerCase()) === '1';
  } catch {
    return false;
  }
}

function markPasskeyPromptSkipped(email: string): void {
  if (typeof window === 'undefined' || !email) return;
  try {
    window.localStorage.setItem(SKIP_PREFIX + email.toLowerCase(), '1');
  } catch {
    // Private browsing / storage disabled — best effort only.
  }
}

interface PasskeyEnrollModalProps {
  email: string;
  onClose: () => void;
}

export default function PasskeyEnrollModal({ email, onClose }: PasskeyEnrollModalProps) {
  const [busy, setBusy] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleEnable = async () => {
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await enrollPasskey();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not enable Face ID.';
      // User-cancelled from the system prompt isn't really an error — just let them move on.
      if (/cancel/i.test(msg)) {
        onClose();
        return;
      }
      setErrorMsg(msg);
      setBusy(false);
    }
  };

  const handleSkip = () => {
    if (dontAsk) markPasskeyPromptSkipped(email);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="passkey-prompt-title"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        aria-hidden="true"
        onClick={busy ? undefined : handleSkip}
      />

      <div
        className="relative z-10 w-full max-w-[400px] bg-white rounded-2xl shadow-2xl shadow-black/30 border border-white/60 px-6 py-7 sm:px-8 sm:py-8"
        style={{ animation: 'fadeInUp 0.3s ease-out both' }}
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 flex items-center justify-center mb-4">
            <svg
              className="w-7 h-7 text-indigo-600"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.864 4.243A10.48 10.48 0 0112 3.75c1.51 0 2.947.317 4.243.867M4.243 7.864A10.48 10.48 0 003.75 12c0 1.51.317 2.947.867 4.243M20.25 12c0-1.51-.317-2.947-.867-4.243M7.864 19.757A10.48 10.48 0 0012 20.25c1.51 0 2.947-.317 4.243-.867M9.75 9.75a2.25 2.25 0 014.5 0v4.5a2.25 2.25 0 01-4.5 0v-4.5z"
              />
            </svg>
          </div>

          <h2
            id="passkey-prompt-title"
            className="text-xl sm:text-[22px] text-slate-900 mb-1.5"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Sign in faster next time
          </h2>
          <p className="text-sm text-slate-500 mb-6 max-w-[300px]">
            Use Face ID, Touch ID, or Windows Hello on this device to sign in without a password.
          </p>
        </div>

        {errorMsg && (
          <div
            className="w-full mb-4 flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
            role="alert"
          >
            <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="text-sm text-red-700 leading-snug">{errorMsg}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleEnable}
          disabled={busy}
          aria-busy={busy}
          className="w-full py-3.5 min-h-[48px] bg-blue-500 text-white font-semibold rounded-xl [@media(hover:hover)]:hover:bg-blue-600 active:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 flex items-center justify-center gap-2 text-base"
        >
          {busy && (
            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {busy ? 'Waiting for Face ID…' : 'Enable biometric sign-in'}
        </button>

        <button
          type="button"
          onClick={handleSkip}
          disabled={busy}
          className="w-full mt-2 py-3 min-h-[44px] text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg disabled:opacity-50"
        >
          Not now
        </button>

        <label className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={e => setDontAsk(e.target.checked)}
            disabled={busy}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
          />
          Don&apos;t ask again on this device
        </label>
      </div>
    </div>
  );
}
