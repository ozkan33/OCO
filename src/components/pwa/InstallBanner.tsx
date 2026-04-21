'use client';

import { useEffect, useState } from 'react';
import { isIOS } from '@/lib/pwa/deviceDetection';
import { useInstallPrompt } from '@/lib/pwa/useInstallPrompt';

/**
 * Shared install-prompt banner used by AdminInstallBanner and
 * PortalInstallBanner.
 *
 * Two render variants:
 *   - iOS Safari: manual instructions ("Tap Share, then Add to Home
 *     Screen") with an inline animated SVG of the Safari share glyph.
 *     Apple does not expose a programmatic install prompt anywhere.
 *   - Chromium / Edge / Android Chrome: Install button that calls the
 *     deferred `beforeinstallprompt`.
 *
 * The component is "dumb" — it does NOT decide WHEN to show. The parent
 * (AdminInstallBanner / PortalInstallBanner) handles role + device
 * gating and only mounts this when it should be visible. Cooldown
 * persistence still lives here so the cooldown key stays co-located
 * with the dismiss handler.
 *
 * `surface` is "admin" | "portal" — picks the dismissal cooldown key
 * and the visual accent. Tone matches the corresponding manifest theme.
 */

export type InstallSurface = 'admin' | 'portal';

interface Props {
  surface: InstallSurface;
  title: string;
  description: string;
  onDismiss?: () => void;
}

const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

const SURFACE_TOKENS: Record<InstallSurface, {
  iconWrap: string;
  iconColor: string;
  button: string;
  shareGlow: string;
}> = {
  admin: {
    iconWrap: 'bg-slate-900',
    iconColor: 'text-white',
    button: 'bg-slate-900 hover:bg-slate-800 active:bg-slate-800 text-white focus-visible:ring-slate-500',
    shareGlow: 'text-slate-700',
  },
  portal: {
    iconWrap: 'bg-blue-600',
    iconColor: 'text-white',
    button: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-700 text-white focus-visible:ring-blue-500',
    shareGlow: 'text-blue-600',
  },
};

function dismissKey(surface: InstallSurface) {
  return `oco:install-dismissed-until:${surface}`;
}

export default function InstallBanner({ surface, title, description, onDismiss }: Props) {
  const { canPrompt, isStandalone, promptInstall } = useInstallPrompt();
  const [iosClient, setIosClient] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setIosClient(isIOS());
  }, []);

  if (isStandalone) return null;
  if (iosClient === null) return null;

  const tokens = SURFACE_TOKENS[surface];

  const handleDismiss = () => {
    try {
      localStorage.setItem(dismissKey(surface), String(Date.now() + COOLDOWN_MS));
    } catch {
      // localStorage unavailable — still dismiss this render.
    }
    onDismiss?.();
  };

  const handleInstall = async () => {
    if (busy) return;
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === 'accepted' || outcome === 'dismissed') {
      handleDismiss();
    }
  };

  const showChromiumButton = !iosClient && canPrompt;
  const showIOSInstructions = iosClient;
  if (!showChromiumButton && !showIOSInstructions) return null;

  return (
    <div
      role="region"
      aria-label={title}
      className="mx-auto my-3 max-w-3xl w-[calc(100%-1.5rem)] rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${tokens.iconWrap} flex items-center justify-center`}>
          <svg
            className={`w-5 h-5 ${tokens.iconColor}`}
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
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>

          {showIOSInstructions && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <span>Tap</span>
              <ShareGlyph className={`w-5 h-5 ${tokens.shareGlow}`} />
              <span>then choose <span className="font-medium text-slate-800">Add to Home Screen</span>.</span>
            </div>
          )}

          {showChromiumButton && (
            <button
              type="button"
              onClick={handleInstall}
              disabled={busy}
              className={`mt-3 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${tokens.button}`}
            >
              {busy ? 'Installing…' : 'Install app'}
            </button>
          )}
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

      <style jsx>{`
        @keyframes oco-share-pulse {
          0%, 100% { transform: translateY(0); opacity: 1; }
          50% { transform: translateY(-2px); opacity: 0.85; }
        }
      `}</style>
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
      strokeWidth="1.8"
      aria-hidden="true"
      style={{ animation: 'oco-share-pulse 1.6s ease-in-out infinite' }}
    >
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
