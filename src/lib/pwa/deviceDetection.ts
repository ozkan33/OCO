/**
 * Device-kind detection for PWA install gating and admin iPhone blocking.
 *
 * Why this lives client-side only: iPad detection relies on
 * `navigator.maxTouchPoints`, which is NOT sent in the HTTP User-Agent.
 * iPadOS 13+ reports a Mac UA; touch points are the only reliable
 * disambiguator. The middleware does a separate, coarser iPhone/Android-
 * phone UA check for SSR — see src/middleware.ts.
 *
 * All exports are safe to call from client code. On the server (no
 * `navigator`), `getDeviceKind()` returns 'unknown', which callers should
 * treat as "don't gate UI yet — wait for client hydration."
 */

export type DeviceKind =
  | 'iphone'
  | 'ipad'
  | 'android-phone'
  | 'android-tablet'
  | 'desktop'
  | 'unknown';

function readNavigator(): { userAgent: string; maxTouchPoints: number } | null {
  if (typeof navigator === 'undefined') return null;
  const ua = typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
  const mtp = typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;
  return { userAgent: ua, maxTouchPoints: mtp };
}

/**
 * Best-effort device classification.
 *
 * iPad detection covers two distinct UA shapes:
 *   1. Legacy: UA contains "iPad" (iOS 12 and earlier, plus request-desktop-site off)
 *   2. iPadOS 13+: UA contains "Macintosh" AND `navigator.maxTouchPoints > 1`
 *
 * A Mac with a touchscreen would also match case 2 — there is no Mac with a
 * built-in touchscreen as of this writing, so the false-positive rate is
 * negligible. If that changes, revisit.
 */
export function getDeviceKind(): DeviceKind {
  const nav = readNavigator();
  if (!nav) return 'unknown';
  const { userAgent: ua, maxTouchPoints } = nav;

  // Legacy iPad: UA explicitly says iPad. Check this BEFORE iPhone so we don't
  // get confused by the "Mobile" token that legacy iPad UAs also include.
  if (/iPad/.test(ua)) return 'ipad';

  // iPadOS 13+: Mac UA with multi-touch. Excludes desktop Macs (maxTouchPoints = 0).
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return 'ipad';

  // iPhone / iPod touch
  if (/iPhone|iPod/.test(ua)) return 'iphone';

  // Android: phones have "Mobile" token, tablets do not.
  if (/Android/.test(ua)) {
    return /Mobile/.test(ua) ? 'android-phone' : 'android-tablet';
  }

  // Anything else with a real UA we treat as desktop.
  if (ua) return 'desktop';

  return 'unknown';
}

/**
 * True for iPad, Android tablet, and desktop. False for iPhone and Android phone.
 * Used by the admin install banner to decide whether the current device is
 * appropriate for the admin surface.
 */
export function isTabletOrLarger(): boolean {
  const kind = getDeviceKind();
  return kind === 'ipad' || kind === 'android-tablet' || kind === 'desktop';
}

/**
 * True for iPhone or iPad (including the iPadOS-13+-Mac-UA case).
 * Used to pick the iOS-style install instructions (manual Share → Add to
 * Home Screen) since iOS Safari has no programmatic install prompt.
 */
export function isIOS(): boolean {
  const kind = getDeviceKind();
  return kind === 'iphone' || kind === 'ipad';
}

/**
 * Unified "is this page already running inside an installed PWA?" check.
 *
 * Chromium/Edge/Android Chrome expose `(display-mode: standalone)` via
 * matchMedia. iOS Safari instead sets `navigator.standalone = true` on
 * standalone windows and ignores the media query. All install banners and
 * the install-prompt hook must agree on this check, or a parent gate can
 * mount the banner inside a PWA shell where the child would otherwise
 * hide it. Call from useEffect on the client.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mmStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return mmStandalone || iosStandalone;
}
