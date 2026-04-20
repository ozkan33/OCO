'use client';

import { useEffect, useState } from 'react';
import { getDeviceKind } from '@/lib/pwa/deviceDetection';

/**
 * Admin install banner — Phase 2 STUB.
 *
 * Self-gates visibility. Safe to always mount from the admin layout.
 * Renders only when ALL are true:
 *   - Authenticated admin user (GET /api/auth/me → role ADMIN)
 *   - Device kind is 'ipad' (iPadOS 13+ Mac-UA case handled by
 *     deviceDetection via maxTouchPoints)
 *   - sessionStorage 'oco:just-logged-in' flag is set (consumed on mount;
 *     one-shot — a reload does not re-trigger this banner)
 *   - Not already running in standalone PWA mode
 *   - No active 14-day dismissal cooldown
 *
 * Phase 1 will wire the real iOS Share → Add to Home Screen UX here
 * (animated SVG of the Safari share icon, etc.) plus
 * `beforeinstallprompt` handling for Chromium. This file deliberately
 * does NOT import any install-prompt hook yet — per spec.
 */

const DISMISS_KEY = 'oco:install-dismissed-until:admin';
const JUST_LOGGED_IN_KEY = 'oco:just-logged-in';
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export default function AdminInstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // All the following checks must run client-side only.
    if (typeof window === 'undefined') return;

    let cancelled = false;

    // Standalone check: if already installed, never show the banner.
    const isStandalone =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    // Device check: iPad-only for v1 (desktop comes later per spec).
    if (getDeviceKind() !== 'ipad') return;

    // One-shot login flag — consume immediately so reloads don't re-fire.
    let justLoggedIn = false;
    try {
      justLoggedIn = sessionStorage.getItem(JUST_LOGGED_IN_KEY) === '1';
      if (justLoggedIn) sessionStorage.removeItem(JUST_LOGGED_IN_KEY);
    } catch {
      // sessionStorage access can throw in some sandboxed contexts — bail.
      return;
    }
    if (!justLoggedIn) return;

    // Cooldown check — respect the user's 14-day dismissal.
    try {
      const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (until && until > Date.now()) return;
    } catch {
      // If localStorage is unavailable, err on the side of not showing.
      return;
    }

    // Authenticated-admin check. If /api/auth/me fails or returns a non-admin,
    // silently do nothing.
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const role = (data?.user?.role || data?.role || '').toString().toUpperCase();
        if (role !== 'ADMIN') return;
        if (!cancelled) setVisible(true);
      } catch {
        // Network error — do not surface the banner.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + COOLDOWN_MS));
    } catch {
      // Cooldown couldn't persist — still hide this render.
    }
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Install OCO Admin"
      className="mx-auto my-3 max-w-3xl w-[calc(100%-1.5rem)] rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
          <svg
            className="w-5 h-5 text-slate-700"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M12 3v12m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Install OCO Admin</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Phase 1 will wire the Share &rarr; Add to Home Screen flow here.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install banner"
          className="flex-shrink-0 w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        >
          <svg
            className="w-4 h-4 mx-auto"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
