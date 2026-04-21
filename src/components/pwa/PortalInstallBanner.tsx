'use client';

import { useEffect, useState } from 'react';
import { getDeviceKind } from '@/lib/pwa/deviceDetection';
import InstallBanner from './InstallBanner';

/**
 * Portal install banner.
 *
 * Same gating pattern as AdminInstallBanner but tuned for the brand-user
 * surface:
 *   - Role gate: BRAND (the only role with PORTAL_ACCESS as primary
 *     home; admins see /portal occasionally but their install affordance
 *     is the admin one).
 *   - Allowed device kinds: every form factor — phone, tablet, desktop.
 *     The portal is mobile-first and works everywhere.
 *
 * Mounted from src/app/portal/page.tsx (the portal is a single page;
 * there's no shared layout to attach to).
 */

const DISMISS_KEY = 'oco:install-dismissed-until:portal';
const JUST_LOGGED_IN_KEY = 'oco:just-logged-in';

export default function PortalInstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const isStandalone =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    const kind = getDeviceKind();
    if (kind === 'unknown') return;

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
        // Admins use the admin install banner; everyone else with portal access
        // (BRAND, KEY_ACCOUNT_MANAGER, FIELD_SALES_REP) sees the portal one.
        if (!role || role === 'ADMIN') return;
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
      surface="portal"
      title="Install 3Brothers Portal"
      description="Add the portal to your home screen for fast, full-screen access to your product status and store visits."
      onDismiss={() => setVisible(false)}
    />
  );
}
