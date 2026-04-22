'use client';

// Post-login sibling of PasskeyEnrollModal. Shown ONLY on iOS in a non-
// standalone browser (iOS Chrome/Firefox/Edge, or Safari-in-tab users) to
// the same candidates who would otherwise see the enrollment modal: signed
// in, no existing passkey, haven't previously dismissed this prompt.
//
// The core message is different from a generic install banner: we're not
// upselling PWA benefits broadly, we're explaining the specific prerequisite
// for Face ID sign-in on iOS — the app must be installed to the home screen.
//
// Visibility gating lives in the login page (canEnrollBiometricOnThisDevice
// vs shouldSuggestInstallForBiometric). This component only renders and
// records dismissal.

import { useState } from 'react';

const SKIP_PREFIX = 'oco:install-prompt-skipped:';
// 14-day cooldown matches the portal/admin install banners so they don't
// re-prompt the moment the user lands on /portal after dismissing here.
const POST_REDIRECT_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export function shouldSkipInstallPrompt(email: string): boolean {
  if (typeof window === 'undefined' || !email) return false;
  try {
    return window.localStorage.getItem(SKIP_PREFIX + email.toLowerCase()) === '1';
  } catch {
    return false;
  }
}

function markInstallPromptSkipped(email: string): void {
  if (typeof window === 'undefined' || !email) return;
  try {
    window.localStorage.setItem(SKIP_PREFIX + email.toLowerCase(), '1');
  } catch {
    // Private browsing / storage disabled — best effort only.
  }
}

// The portal and admin install banners re-prompt immediately after the
// user lands on /portal or /admin post-login unless their cooldown is set.
// Since this modal is semantically the same action (please install), push
// that cooldown out too so the user isn't hit with the generic banner the
// moment their redirect resolves. The per-email "don't ask again" key
// above is separate — it suppresses THIS modal specifically on future logins.
function suppressFollowUpInstallBanners(): void {
  if (typeof window === 'undefined') return;
  const until = String(Date.now() + POST_REDIRECT_COOLDOWN_MS);
  try {
    window.localStorage.setItem('oco:install-dismissed-until:portal', until);
    window.localStorage.setItem('oco:install-dismissed-until:admin', until);
  } catch {
    // localStorage disabled — accept the occasional double-prompt.
  }
}

interface PasskeyInstallPromptModalProps {
  email: string;
  onClose: () => void;
}

export default function PasskeyInstallPromptModal({ email, onClose }: PasskeyInstallPromptModalProps) {
  const [dontAsk, setDontAsk] = useState(false);

  const handleDismiss = () => {
    if (dontAsk) markInstallPromptSkipped(email);
    suppressFollowUpInstallBanners();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-prompt-title"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        aria-hidden="true"
        onClick={handleDismiss}
      />

      <div
        className="relative z-10 w-full max-w-[400px] bg-white rounded-2xl shadow-2xl shadow-black/30 border border-white/60 px-6 py-7 sm:px-8 sm:py-8"
        style={{ animation: 'installPromptFadeInUp 0.3s ease-out both' }}
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7l4-4 4 4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
          </div>

          <h2
            id="install-prompt-title"
            className="text-xl sm:text-[22px] text-slate-900 mb-1.5"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Enable Face ID sign-in
          </h2>
          <p className="text-sm text-slate-500 mb-5 max-w-[320px]">
            Face ID requires adding 3Brothers to your Home Screen. Once installed, open the app and sign in to enable it.
          </p>
        </div>

        <div className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-4 mb-5">
          <ol className="space-y-3 text-sm text-slate-700">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center mt-0.5">
                1
              </span>
              <span className="leading-snug">
                Open this page in <span className="font-semibold text-slate-900">Safari</span>.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center mt-0.5">
                2
              </span>
              <span className="leading-snug">
                Tap the <span className="font-semibold text-slate-900">Share</span> button
                <svg className="inline-block w-4 h-4 mx-1 text-slate-500 align-text-bottom" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" d="M12 3v12" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7l4-4 4 4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                </svg>
                in the Safari toolbar.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center mt-0.5">
                3
              </span>
              <span className="leading-snug">
                Choose <span className="font-semibold text-slate-900">Add to Home Screen</span>.
              </span>
            </li>
          </ol>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="w-full py-3.5 min-h-[48px] bg-blue-500 text-white font-semibold rounded-xl [@media(hover:hover)]:hover:bg-blue-600 active:bg-blue-600 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 flex items-center justify-center gap-2 text-base"
        >
          Got it
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          className="w-full mt-2 py-3 min-h-[44px] text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
        >
          Not now
        </button>

        <label className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={e => setDontAsk(e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
          />
          Don&apos;t ask again on this device
        </label>
      </div>

      <style jsx>{`
        @keyframes installPromptFadeInUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
