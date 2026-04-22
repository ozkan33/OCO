// WebAuthn relying-party configuration.
//
// RP_ID MUST be the host only (no scheme, no port). A mismatch between the
// browser-perceived effective domain and RP_ID surfaces as a silent
// `NotAllowedError` from the authenticator. Likewise RP_ORIGIN MUST include
// scheme + host (+ port in dev). Both have to agree with the deployment domain.
//
// Production host is derived from the same constant the SEO/sitemap code uses
// (3brothersmarketing.com). When NEXT_PUBLIC_APP_URL is set it overrides — this
// keeps preview deployments and custom domains workable without a code change.

const PROD_ORIGIN = 'https://3brothersmarketing.com';

function pickOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') return PROD_ORIGIN;
  return 'http://localhost:3000';
}

const ORIGIN = pickOrigin();

export const RP_NAME = '3Brothers Marketing';
export const RP_ORIGIN = ORIGIN;
export const RP_ID = (() => {
  try {
    return new URL(ORIGIN).hostname;
  } catch {
    return 'localhost';
  }
})();

// Coarse, UA-derived label written to the credential row. No PII (no IP, no
// hostname, no model number). Pattern: "<OS-family> <browser>".
//
// `clientKindHint` (when supplied) overrides UA parsing for OS detection.
// Needed because iPadOS 13+ sends a "Macintosh" UA with no Mobile token —
// server can't distinguish iPad from Mac without navigator.maxTouchPoints,
// which only exists in the browser. The enroll route forwards the client's
// own getDeviceKind() result via X-Client-Device-Kind to fix the label.
export function deriveDeviceLabel(ua: string, clientKindHint?: string): string {
  const u = ua || '';
  let os = 'Unknown';

  const hint = (clientKindHint ?? '').toLowerCase();
  if (hint === 'ipad') os = 'iPad';
  else if (hint === 'iphone') os = 'iPhone';
  else if (hint === 'android-phone' || hint === 'android-tablet') os = 'Android';
  else if (hint === 'desktop') {
    // Desktop hint — still need UA to pick between macOS / Windows / Linux.
    if (/Macintosh|Mac OS X/.test(u)) os = 'macOS';
    else if (/Windows/.test(u)) os = 'Windows';
    else if (/Linux/.test(u)) os = 'Linux';
  } else {
    if (/iPad/.test(u) || (/Macintosh/.test(u) && /Mobile/.test(u))) os = 'iPad';
    else if (/iPhone|iPod/.test(u)) os = 'iPhone';
    else if (/Android/.test(u)) os = 'Android';
    else if (/Macintosh|Mac OS X/.test(u)) os = 'macOS';
    else if (/Windows/.test(u)) os = 'Windows';
    else if (/Linux/.test(u)) os = 'Linux';
  }

  let browser = 'Browser';
  if (/Edg\//.test(u)) browser = 'Edge';
  else if (/OPR\//.test(u)) browser = 'Opera';
  else if (/Chrome\//.test(u) && !/Edg\//.test(u) && !/OPR\//.test(u)) browser = 'Chrome';
  else if (/Firefox\//.test(u)) browser = 'Firefox';
  else if (/Safari\//.test(u) && !/Chrome\//.test(u)) browser = 'Safari';

  return `${os} ${browser}`;
}
