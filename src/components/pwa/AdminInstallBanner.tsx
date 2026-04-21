'use client';

import { useEffect, useState } from 'react';
import { getDeviceKind } from '@/lib/pwa/deviceDetection';
import InstallBanner from './InstallBanner';

/**
 * Admin install banner.
 *
 * Self-gates visibility. Safe to always mount from the admin layout.
 * Renders only when ALL are true:
 *   - Authenticated admin user (GET /api/auth/me → role ADMIN)
 *   - Device kind is 'ipad' (iPadOS 13+ Mac-UA case handled by
 *     deviceDetection via maxTouchPoints; desktop banner is deferred per
 *     spec until iPad path is proven)
 *   - sessionStorage 'oco:just-logged-in' flag is set (consumed on mount;
 *     one-shot — a reload does not re-trigger this banner)
 *   - Not already running in standalone PWA mode (handled inside
 *     InstallBanner)
 *   - No active 14-day dismissal cooldown (key
 *     `oco:install-dismissed-until:admin`)
 *
 * The actual banner UI (iOS Share-to-Home-Screen instructions vs.
 * Chromium install button) lives in <InstallBanner />, which Phase 1
 * introduced. This component is the gating shell only.
 */

const DISMISS_KEY = 'oco:install-dismissed-until:admin';
const JUST_LOGGED_IN_KEY = 'oco:just-logged-in';

export default function AdminInstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const isStandalone =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    if (getDeviceKind() !== 'ipad') return;

    let justLoggedIn = false;
    try {
      justLoggedIn = sessionStorage.getItem(JUST_LOGGED_IN_KEY) === '1';
      if (justLoggedIn) sessionStorage.removeItem(JUST_LOGGED_IN_KEY);
    } catch {
      return;
    }
    if (!justLoggedIn) return;

    try {
      const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (until && until > Date.now()) return;
    } catch {
      return;
    }

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

  return (
    <InstallBanner
      surface="admin"
      title="Install 3Brothers Marketing"
      description="Add 3Brothers Marketing to your iPad home screen for one-tap access. Runs in its own window with no Safari chrome."
      onDismiss={() => setVisible(false)}
    />
  );
}
