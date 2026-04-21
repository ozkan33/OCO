'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * BeforeInstallPromptEvent shape per WHATWG. Not present in lib.dom.d.ts in
 * Node TS configs, so declare the bits we use.
 */
type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type Ctx = {
  deferredRef: React.MutableRefObject<BIPEvent | null>;
  isStandalone: boolean;
  hasDeferred: boolean;
  setHasDeferred: (v: boolean) => void;
};

const InstallPromptContext = createContext<Ctx | null>(null);

/**
 * Provider mounted once at the app root (ClientLayout). Captures the
 * `beforeinstallprompt` event the moment the browser fires it and stashes
 * it in a ref. Per spec NON-NEGOTIABLE #4: never call `event.prompt()`
 * inside the listener — capture and defer until a user-gesture handler
 * (the install button) calls `promptInstall()`.
 *
 * `isStandalone` is sticky for the session: once the page boots in a
 * standalone PWA window, install banners must never render.
 */
export function InstallPromptProvider({ children }: { children: ReactNode }) {
  const deferredRef = useRef<BIPEvent | null>(null);
  const [hasDeferred, setHasDeferred] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standalone =
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      // iOS Safari uses navigator.standalone instead of the media query
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) setIsStandalone(true);

    const handler = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BIPEvent;
      setHasDeferred(true);
    };

    const installedHandler = () => {
      deferredRef.current = null;
      setHasDeferred(false);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  return createElement(
    InstallPromptContext.Provider,
    { value: { deferredRef, isStandalone, hasDeferred, setHasDeferred } },
    children,
  );
}

export type PromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

export function useInstallPrompt() {
  const ctx = useContext(InstallPromptContext);

  const promptInstall = useCallback(async (): Promise<PromptOutcome> => {
    const evt = ctx?.deferredRef.current;
    if (!evt) return 'unavailable';
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      ctx.deferredRef.current = null;
      ctx.setHasDeferred(false);
      return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
    } catch {
      return 'unavailable';
    }
  }, [ctx]);

  return {
    canPrompt: !!ctx?.hasDeferred && !ctx?.isStandalone,
    isStandalone: !!ctx?.isStandalone,
    promptInstall,
  };
}
