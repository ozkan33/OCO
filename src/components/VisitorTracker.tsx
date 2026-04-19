'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Invisible component that tracks page visits.
 * Fires a POST to /api/visitors on each navigation.
 * Uses sessionStorage to generate a session ID for unique visit tracking.
 */
export default function VisitorTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Don't track admin/portal/auth pages
    if (pathname?.startsWith('/admin') || pathname?.startsWith('/portal') || pathname?.startsWith('/auth') || pathname?.startsWith('/api')) {
      return;
    }

    // Skip dev/localhost traffic entirely — dev navigations polluted the
    // referrer breakdown and made the real traffic signal hard to read.
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]') {
      return;
    }

    // Generate or reuse session ID
    let sessionId = sessionStorage.getItem('visitor_session');
    if (!sessionId) {
      sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      sessionStorage.setItem('visitor_session', sessionId);
    }

    // Extract UTM params
    const utmSource = searchParams?.get('utm_source') || undefined;
    const utmMedium = searchParams?.get('utm_medium') || undefined;
    const utmCampaign = searchParams?.get('utm_campaign') || undefined;

    // Fire and forget — don't block rendering
    fetch('/api/visitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageUrl: pathname,
        referrer: document.referrer || null,
        sessionId,
        utmSource,
        utmMedium,
        utmCampaign,
      }),
    }).catch(() => { /* silent — tracking should never break the site */ });
  }, [pathname, searchParams]);

  return null; // Invisible component
}
