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
 * True ONLY for handheld devices — iPhone, iPad, Android phone, Android
 * tablet. False for desktop (Windows, Linux, macOS — including MacBooks
 * with Touch ID) and 'unknown' (SSR / pre-hydration).
 *
 * Used to gate the post-login "enable biometric sign-in" enrollment prompt:
 * modern MacBooks have Touch ID via WebAuthn and will happily complete an
 * enrollment, but product direction is that the upsell modal only belongs
 * on phones/tablets where biometrics replace typing a password on a tiny
 * keyboard. Desktop users who already have a synced passkey (via iCloud
 * Keychain, Windows Hello profile, etc.) still see the Face ID / Touch ID
 * sign-in BUTTON — this helper only hides the nag to enroll.
 *
 * Combines the existing UA-based device kind with a touch+coarse-pointer
 * media query so we don't offer the prompt to a desktop user who happens
 * to have a touchscreen monitor plugged in (rare, but they generally also
 * have a mouse — coarse-pointer rules them out).
 *
 * SSR-safe: returns false when `window`/`navigator` are unavailable.
 */
export function isHandheldDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const kind = getDeviceKind();
  const isHandheldByUA =
    kind === 'iphone' ||
    kind === 'ipad' ||
    kind === 'android-phone' ||
    kind === 'android-tablet';
  if (!isHandheldByUA) return false;
  // Belt-and-suspenders: confirm touch-primary input. A phone/tablet UA
  // with (pointer: fine) is almost certainly a spoofed desktop dev-tools
  // emulation or a niche convertible — treat as not-handheld so we don't
  // surface the prompt to a reviewer poking at the site in Chrome DevTools
  // without mobile emulation enabled.
  if (typeof window.matchMedia !== 'function') return true;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const anyHover = window.matchMedia('(any-hover: none)').matches;
  // Either signal is sufficient — some Android tablets in desktop mode
  // report `any-hover: none` while flipping pointer to fine.
  return coarsePointer || anyHover;
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
