'use client';

import { useCallback, useEffect, useState } from 'react';
import { getDeviceKind, type DeviceKind } from '@/lib/pwa/deviceDetection';
import { useInstallPrompt } from '@/lib/pwa/useInstallPrompt';

/**
 * Shared install-prompt UI used by AdminInstallBanner and
 * PortalInstallBanner.
 *
 * Floating bottom-sheet (iPhone / Android / desktop Chromium) or top-
 * sheet (iPad) with a scrim backdrop. Unlike the inline card this
 * replaces, the sheet is `position: fixed`, so it does not take layout
 * space from page content — parent surfaces just mount it unconditionally.
 *
 * Three render paths, all sharing the same surface layout:
 *   - iPhone: large pulsing Share glyph + copy pointing at Safari's
 *     bottom toolbar (where the Share action lives in default Safari).
 *   - iPad: top-docked sheet + pulsing Share glyph pointing at iPad
 *     Safari's top-right toolbar.
 *   - Chromium / Edge / Android Chrome: same sheet, big "Install app"
 *     button wired to the deferred beforeinstallprompt event.
 *
 * Visibility is still decided upstream (AdminInstallBanner /
 * PortalInstallBanner do role + device + cooldown + just-logged-in
 * gating). This component only handles: render chrome, enter/exit
 * animation, dismiss persistence, and install() on Chromium.
 */

export type InstallSurface = 'admin' | 'portal';

interface Props {
  surface: InstallSurface;
  title: string;
  description: string;
  onDismiss?: () => void;
}

const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

const SURFACE_TOKENS: Record<
  InstallSurface,
  {
    accent: string;
    accentHover: string;
    accentText: string;
    accentRing: string;
    glowClass: string;
    iconBg: string;
  }
> = {
  admin: {
    accent: 'bg-slate-900',
    accentHover: 'hover:bg-slate-800 active:bg-slate-800',
    accentText: 'text-slate-900',
    accentRing: 'focus-visible:ring-slate-500',
    glowClass: 'oco-install-glow-admin',
    iconBg: 'bg-slate-900',
  },
  portal: {
    accent: 'bg-blue-600',
    accentHover: 'hover:bg-blue-700 active:bg-blue-700',
    accentText: 'text-blue-600',
    accentRing: 'focus-visible:ring-blue-500',
    glowClass: 'oco-install-glow-portal',
    iconBg: 'bg-blue-600',
  },
};

function dismissKey(surface: InstallSurface) {
  return `oco:install-dismissed-until:${surface}`;
}

export default function InstallBanner({ surface, title, description, onDismiss }: Props) {
  const { canPrompt, isStandalone, promptInstall } = useInstallPrompt();
  const [deviceKind, setDeviceKind] = useState<DeviceKind | null>(null);
  const [entered, setEntered] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDeviceKind(getDeviceKind());
    // Let the browser paint the initial (hidden) state, then trigger
    // the enter transition on the next frame.
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const persistCooldown = useCallback(() => {
    try {
      localStorage.setItem(dismissKey(surface), String(Date.now() + COOLDOWN_MS));
    } catch {
      // localStorage unavailable — still dismiss this render.
    }
  }, [surface]);

  const handleDismiss = useCallback(() => {
    persistCooldown();
    setEntered(false);
    // Match the exit transition duration before unmounting.
    window.setTimeout(() => onDismiss?.(), 220);
  }, [persistCooldown, onDismiss]);

  const handleInstall = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === 'accepted' || outcome === 'dismissed') handleDismiss();
  }, [busy, promptInstall, handleDismiss]);

  if (isStandalone) return null;
  if (deviceKind === null) return null;

  const isIOSDevice = deviceKind === 'iphone' || deviceKind === 'ipad';
  const isIPad = deviceKind === 'ipad';
  const showChromium = !isIOSDevice && canPrompt;
  if (!isIOSDevice && !showChromium) return null;

  const tokens = SURFACE_TOKENS[surface];
  const dock: 'top' | 'bottom' = isIPad ? 'top' : 'bottom';

  return (
    <>
      <div
        aria-hidden="true"
        onClick={handleDismiss}
        className={`fixed inset-0 z-[70] bg-slate-950/35 backdrop-blur-[3px] transition-opacity duration-300 ${
          entered ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="oco-install-title"
        className={`fixed inset-x-0 z-[71] flex justify-center px-3 ${
          dock === 'top' ? 'top-0' : 'bottom-0'
        }`}
        style={
          dock === 'top'
            ? { paddingTop: 'max(env(safe-area-inset-top), 12px)' }
            : { paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }
        }
      >
        <div
          className={`w-full max-w-md rounded-3xl bg-white ring-1 ring-black/5 overflow-hidden transition-all duration-[260ms] ease-[cubic-bezier(0.2,0.9,0.3,1)] ${
            entered
              ? 'translate-y-0 scale-100 opacity-100'
              : dock === 'top'
                ? '-translate-y-4 scale-[0.98] opacity-0'
                : 'translate-y-6 scale-[0.98] opacity-0'
          }`}
          style={{ boxShadow: '0 24px 64px -16px rgba(15,23,42,0.28), 0 4px 12px -4px rgba(15,23,42,0.12)' }}
        >
          {dock === 'bottom' && (
            <div className="flex justify-center pt-2.5 pb-0.5" aria-hidden="true">
              <div className="h-1 w-10 rounded-full bg-slate-300" />
            </div>
          )}

          <div className="px-5 pb-5 pt-4">
            <div className="flex items-start gap-3">
              <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ${tokens.iconBg} shadow-sm`}>
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
                </svg>
              </div>

              <div className="min-w-0 flex-1">
                <h2 id="oco-install-title" className="text-[15px] font-semibold leading-tight text-slate-900">
                  {title}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
              </div>

              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Dismiss install prompt"
                className="-mr-1.5 -mt-1.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {isIOSDevice && (
              <IOSShareCallout
                accentText={tokens.accentText}
                glowClass={tokens.glowClass}
                direction={isIPad ? 'up' : 'down'}
              />
            )}

            {showChromium && (
              <button
                type="button"
                onClick={handleInstall}
                disabled={busy}
                className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${tokens.accent} ${tokens.accentHover} ${tokens.accentRing}`}
              >
                {busy ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                    Installing…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path d="M12 4v12m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 20h16" strokeLinecap="round" />
                    </svg>
                    Install app
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleDismiss}
              className="mt-3 w-full rounded-lg py-1.5 text-center text-xs font-medium text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function IOSShareCallout({
  accentText,
  glowClass,
  direction,
}: {
  accentText: string;
  glowClass: string;
  direction: 'up' | 'down';
}) {
  const chevronPath =
    direction === 'down'
      ? 'M6 9l6 6 6-6' // chevron-down
      : 'M18 15l-6-6-6 6'; // chevron-up
  const bounceClass = direction === 'down' ? 'oco-install-bounce-down' : 'oco-install-bounce-up';

  return (
    <div className="mt-5 flex flex-col items-center gap-2">
      {direction === 'up' && (
        <svg
          viewBox="0 0 24 24"
          className={`h-5 w-5 ${accentText} ${bounceClass}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          aria-hidden="true"
        >
          <path d={chevronPath} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}

      <div
        className={`relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200 ${accentText} ${glowClass}`}
      >
        <ShareGlyph className="h-7 w-7" />
      </div>

      {direction === 'down' && (
        <svg
          viewBox="0 0 24 24"
          className={`h-5 w-5 ${accentText} ${bounceClass}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          aria-hidden="true"
        >
          <path d={chevronPath} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}

      <p className="mt-1 px-2 text-center text-[13px] leading-relaxed text-slate-600">
        {direction === 'down' ? (
          <>
            Tap the <span className="font-semibold text-slate-800">Share</span> button in Safari&apos;s bottom toolbar,
            then <span className="font-semibold text-slate-800">Add to Home Screen</span>.
          </>
        ) : (
          <>
            Tap the <span className="font-semibold text-slate-800">Share</span> button in Safari&apos;s top toolbar,
            then <span className="font-semibold text-slate-800">Add to Home Screen</span>.
          </>
        )}
      </p>
    </div>
  );
}

function ShareGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
