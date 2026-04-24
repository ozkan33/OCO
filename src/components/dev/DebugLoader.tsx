'use client';
// Dev/preview-only devtools loader. Injects Eruda (mobile DevTools overlay)
// so we can inspect the DOM, computed styles, and console directly on a
// real iPhone. Eruda is ~100 KB gzipped — it does NOT ship to production
// users unless they explicitly opt in with `?debug=1`.
//
// Enable:
//   - `?debug=1` once → persisted to localStorage (`oco-debug` = `1`)
//   - Or manually: `localStorage.setItem('oco-debug','1')` + reload
// Disable:
//   - `?debug=0` → clears localStorage and reloads without Eruda
//
// On dev (`NODE_ENV !== 'production'`), Eruda auto-loads. On previews /
// prod it only loads when the flag is set, so real users never see it.
import { useEffect } from 'react';

declare global {
  interface Window {
    eruda?: { init: (opts?: unknown) => void; destroy?: () => void };
  }
}

const FLAG_KEY = 'oco-debug';
const ERUDA_CDN = 'https://cdn.jsdelivr.net/npm/eruda@3';

function readDebugFlag(): boolean {
  if (typeof window === 'undefined') return false;
  // URL param wins — also persists so you don't need to re-add it per page.
  try {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('debug');
    if (p === '1') {
      window.localStorage.setItem(FLAG_KEY, '1');
      return true;
    }
    if (p === '0') {
      window.localStorage.removeItem(FLAG_KEY);
      return false;
    }
  } catch { /* noop */ }
  try {
    if (window.localStorage.getItem(FLAG_KEY) === '1') return true;
  } catch { /* noop */ }
  // Default-on in dev so you never have to think about it locally.
  return process.env.NODE_ENV !== 'production';
}

export default function DebugLoader() {
  useEffect(() => {
    if (!readDebugFlag()) return;
    if (window.eruda) {
      try { window.eruda.init(); } catch { /* noop */ }
      return;
    }
    const s = document.createElement('script');
    s.src = ERUDA_CDN;
    s.async = true;
    s.onload = () => {
      try { window.eruda?.init(); } catch { /* noop */ }
    };
    document.head.appendChild(s);
    // We intentionally do NOT tear down on unmount — Eruda is a singleton
    // and ClientLayout persists for the lifetime of the SPA anyway.
  }, []);
  return null;
}
