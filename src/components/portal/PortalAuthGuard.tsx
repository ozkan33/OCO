'use client';

import { useEffect, useRef } from 'react';

// Idle timeout for the brand portal. After this much wall-clock time away
// from the app (backgrounded PWA, closed tab, system sleep), the next time
// the page becomes visible we force a fresh sign-in regardless of whether
// the access/refresh cookies are still valid on the server.
//
// Why 15 min: matches what the user asked for and is a reasonable default
// for a PWA handling commercial data on a shared/lost phone. Bump via
// constant below if product direction changes.
const IDLE_LIMIT_MS = 15 * 60 * 1000;
const ACTIVITY_KEY = 'portal_last_activity_at';

/**
 * Client-side guard that handles two failure modes the middleware can't:
 *
 *   1) iOS Safari PWA bfcache restore — when the user relaunches the installed
 *      app, Safari often restores the last-rendered page from page-cache
 *      without making a network request, so `middleware.ts` never runs and
 *      the stale dashboard shows even though cookies are gone.
 *
 *   2) Idle timeout — the server session may still be valid (refresh token
 *      alive for days), but if the user has been away for 15+ minutes we
 *      force re-authentication as a defense against a lost/borrowed phone.
 *
 * Renders nothing. Mount once per portal layout.
 */
export default function PortalAuthGuard() {
  // Prevents a double-redirect if pageshow and visibilitychange both fire
  // in the same resume. location.replace is async from our POV.
  const redirectingRef = useRef(false);

  useEffect(() => {
    const redirectToLogin = async (opts: { revoke: boolean }) => {
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      if (opts.revoke) {
        // Best-effort server-side revocation so the access token can't be
        // reused from another tab/device before it naturally expires.
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
          keepalive: true,
        }).catch(() => {});
      }
      try { localStorage.removeItem(ACTIVITY_KEY); } catch {}
      window.location.replace('/auth/login');
    };

    const recordActivity = () => {
      try { localStorage.setItem(ACTIVITY_KEY, String(Date.now())); } catch {}
    };

    const isIdleExpired = (): boolean => {
      try {
        const raw = localStorage.getItem(ACTIVITY_KEY);
        if (!raw) return false;
        const last = Number(raw);
        if (!Number.isFinite(last) || last <= 0) return false;
        return Date.now() - last > IDLE_LIMIT_MS;
      } catch {
        return false;
      }
    };

    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) await redirectToLogin({ revoke: false });
      } catch {
        // Network errors: stay put. A dropped connection shouldn't boot
        // the user; middleware will catch it on the next real navigation.
      }
    };

    // Prime the clock on first mount so a user who opens the PWA cold
    // doesn't get kicked on their very first visibilitychange.
    recordActivity();

    const activityEvents: (keyof DocumentEventMap)[] = [
      'pointerdown',
      'keydown',
      'touchstart',
      'scroll',
    ];
    activityEvents.forEach(e => document.addEventListener(e, recordActivity, { passive: true }));

    const handlePageShow = (e: PageTransitionEvent) => {
      // persisted=true means the page was restored from bfcache — Safari
      // on iOS does this aggressively when returning to an installed PWA.
      // A regular fresh load has persisted=false and middleware already ran.
      if (isIdleExpired()) {
        void redirectToLogin({ revoke: true });
        return;
      }
      if (e.persisted) void checkAuth();
    };

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (isIdleExpired()) {
        void redirectToLogin({ revoke: true });
        return;
      }
      void checkAuth();
    };

    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibility);

    // Validate on initial mount too — covers the case where the HTML was
    // served then the user's session was revoked from elsewhere before
    // the JS hydrated.
    void checkAuth();

    return () => {
      activityEvents.forEach(e => document.removeEventListener(e, recordActivity));
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return null;
}
