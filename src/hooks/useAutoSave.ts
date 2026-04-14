import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'offline';

interface AutoSaveOptions {
  debounceMs?: number;
  enableOfflineBackup?: boolean;
  maxRetries?: number;
  onSaveSuccess?: (savedData?: any) => void;
  onSaveError?: (error: Error) => void;
}

// ─── Generic auto-save hook ──────────────────────────────────────────────────
export function useAutoSave<T>(
  data: T,
  saveFunction: (data: T) => Promise<any>,
  options: AutoSaveOptions = {},
  resetKey?: string | number,
  resetValue?: T
) {
  const {
    debounceMs = 3000,
    enableOfflineBackup = true,
    maxRetries = 3,
    onSaveSuccess,
    onSaveError,
  } = options;

  const [status, setStatus] = useState<SaveStatus>('saved');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const lastDataRef = useRef<string>('');
  const isInitialRender = useRef(true);
  const isSavingRef = useRef(false);        // mutex: only one save at a time
  const pendingSaveRef = useRef<T | null>(null); // queued data while save is in-flight
  const retryCountRef = useRef(0);
  const latestDataRef = useRef<T>(data);     // always points to the latest data (for forceSave)

  // Keep latestDataRef in sync
  latestDataRef.current = data;

  // ── Online/offline ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Flush any dirty data when coming back online
      if (hasUnsavedChanges) {
        executeSave(latestDataRef.current);
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setStatus('offline');
      // Immediately persist to localStorage when going offline
      if (enableOfflineBackup && hasUnsavedChanges) {
        writeBackup(latestDataRef.current);
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsavedChanges]);

  // ── localStorage backup (keyed per resetKey so scorecards don't collide) ───
  const backupKey = `auto-save-backup-${resetKey || 'default'}`;

  function writeBackup(value: T) {
    try { localStorage.setItem(backupKey, JSON.stringify({ data: value, timestamp: Date.now() })); } catch { /* full */ }
  }
  function clearBackup() {
    try { localStorage.removeItem(backupKey); } catch { /* */ }
  }

  // ── Core save executor (serialized — only one in-flight at a time) ─────────
  const executeSave = useCallback(async (value: T) => {
    if (!isOnline) {
      setStatus('offline');
      writeBackup(value);
      return;
    }

    // If already saving, queue this data for after current save completes
    if (isSavingRef.current) {
      pendingSaveRef.current = value;
      return;
    }

    isSavingRef.current = true;
    setStatus('saving');
    setError(null);

    try {
      const result = await saveFunction(value);
      setStatus('saved');
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      retryCountRef.current = 0;
      clearBackup();
      onSaveSuccess?.(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';

      // Retry with exponential backoff
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        isSavingRef.current = false;
        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 10000);
        timeoutRef.current = setTimeout(() => executeSave(value), delay);
        setStatus('unsaved');
        return;
      }

      // All retries exhausted
      setError(msg);
      setStatus('error');
      retryCountRef.current = 0;
      writeBackup(value);
      onSaveError?.(err instanceof Error ? err : new Error(msg));
    } finally {
      isSavingRef.current = false;
    }

    // Process queued save (if data changed while we were saving)
    if (pendingSaveRef.current !== null) {
      const queued = pendingSaveRef.current;
      pendingSaveRef.current = null;
      // Use setTimeout(0) to avoid deep recursion
      setTimeout(() => executeSave(queued), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, saveFunction, maxRetries, onSaveSuccess, onSaveError]);

  // ── Force save (flush pending debounce immediately) ────────────────────────
  const forceSave = useCallback(async () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // Wait for any in-flight save to finish
    if (isSavingRef.current) {
      pendingSaveRef.current = latestDataRef.current;
      // Wait for the queue to flush (max 5s)
      await new Promise<void>(resolve => {
        const check = setInterval(() => { if (!isSavingRef.current) { clearInterval(check); resolve(); } }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
      });
      if (pendingSaveRef.current !== null) return; // queued save handled it
    }
    await executeSave(latestDataRef.current);
  }, [executeSave]);

  // ── Serialize data for comparison ──────────────────────────────────────────
  const serializedData = useMemo(() => {
    try { return JSON.stringify(data); } catch { return ''; }
  }, [data]);

  // ── Reset when switching scorecards ────────────────────────────────────────
  useEffect(() => {
    if (resetKey !== undefined) {
      // Cancel any pending debounce or retry timer
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      const resetSerialized = resetValue !== undefined
        ? ((() => { try { return JSON.stringify(resetValue); } catch { return ''; } })())
        : serializedData;
      lastDataRef.current = resetSerialized;
      isInitialRender.current = true; // treat next render as initial
      retryCountRef.current = 0;
      pendingSaveRef.current = null;
      isSavingRef.current = false;

      // Reset status so the new scorecard starts clean
      setStatus('saved');
      setHasUnsavedChanges(false);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Keep a ref to executeSave so the timer closure always calls the latest version
  const executeSaveRef = useRef(executeSave);
  executeSaveRef.current = executeSave;

  // ── Main effect: detect changes and schedule debounced save ────────────────
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      lastDataRef.current = serializedData;
      return;
    }

    if (serializedData === lastDataRef.current) return;

    lastDataRef.current = serializedData;
    setHasUnsavedChanges(true);
    setStatus('unsaved');

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      executeSaveRef.current(latestDataRef.current);
    }, debounceMs);

    // Only clean up the timer on unmount, not on every re-run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedData, debounceMs]);

  // ── Save on tab hide (flush unsaved changes when user leaves) ──────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && hasUnsavedChanges && !isSavingRef.current) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        executeSaveRef.current(latestDataRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [hasUnsavedChanges]);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  return { status, lastSaved, error, forceSave, isOnline, hasUnsavedChanges };
}

// ─── Scorecard-specific auto-save (delta-aware) ─────────────────────────────
export function useScoreCardAutoSave(
  scoreCardId: string | null,
  data: any,
  options: AutoSaveOptions = {},
  resetKey?: string | number,
  resetValue?: any,
  deltaTracker?: { peek: () => { deltas: any[]; isStructural: boolean }; flush: () => any; markStructuralChange: () => void; reset: () => void }
) {
  // Ref to hold the real DB ID after migration (prevents ghost creation)
  const resolvedIdRef = useRef<string | null>(scoreCardId);
  const isMigratingRef = useRef(false);
  const lastModifiedRef = useRef<string | null>(null);

  // Keep ref in sync with prop, but don't overwrite during migration
  useEffect(() => {
    if (!isMigratingRef.current) {
      resolvedIdRef.current = scoreCardId;
    }
  }, [scoreCardId]);

  // Reset delta tracker on scorecard switch
  useEffect(() => {
    deltaTracker?.reset();
    lastModifiedRef.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const saveToAPI = useCallback(async (data: any) => {
    const id = resolvedIdRef.current;
    if (!id) throw new Error('No scorecard ID');

    // ── Local scorecard → create in DB first (always full save) ──────────────
    if (id.startsWith('scorecard_')) {
      if (isMigratingRef.current) return null;
      isMigratingRef.current = true;

      try {
        const res = await fetch('/api/scorecards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ title: data?.name || 'Untitled Scorecard', data, is_draft: true }),
        });

        if (!res.ok) {
          isMigratingRef.current = false;
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to create scorecard');
        }

        const created = await res.json();
        resolvedIdRef.current = created.id;
        lastModifiedRef.current = created.last_modified || null;
        deltaTracker?.flush(); // clear any pending deltas

        try {
          const all = JSON.parse(localStorage.getItem('scorecards') || '[]');
          localStorage.setItem('scorecards', JSON.stringify(
            all.map((sc: any) => sc.id === id ? { ...sc, id: created.id, lastModified: new Date().toISOString() } : sc)
          ));
        } catch { /* */ }

        isMigratingRef.current = false;
        return created;
      } catch (err) {
        isMigratingRef.current = false;
        throw err;
      }
    }

    // ── Check if we can do a granular delta save ─────────────────────────────
    const deltaState = deltaTracker?.peek();
    const canDelta = deltaState && !deltaState.isStructural && deltaState.deltas.length > 0;

    if (canDelta) {
      // ── Delta PATCH: send only changed cells ──────────────────────────────
      const res = await fetch(`/api/scorecards/${id}/cells`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          changes: deltaState.deltas,
          expectedLastModified: lastModifiedRef.current,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        lastModifiedRef.current = result.last_modified;
        deltaTracker!.flush();

        try {
          const all = JSON.parse(localStorage.getItem('scorecards') || '[]');
          localStorage.setItem('scorecards', JSON.stringify(
            all.map((sc: any) => sc.id === id ? { ...sc, lastModified: new Date().toISOString() } : sc)
          ));
        } catch { /* */ }

        return result;
      }

      if (res.status === 409) {
        // Conflict or stale rows — fall through to full PUT
        deltaTracker!.markStructuralChange();
      } else {
        const text = await res.text();
        let errData: any = {};
        try { errData = JSON.parse(text); } catch { errData = { error: text }; }
        throw new Error(errData.error || `Delta save failed: ${res.status}`);
      }
    }

    // ── Full PUT: send entire scorecard ──────────────────────────────────────
    const res = await fetch(`/api/scorecards/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: data?.name || 'Untitled Scorecard', data, is_draft: true }),
    });

    if (!res.ok) {
      const text = await res.text();
      let errData: any = {};
      try { errData = JSON.parse(text); } catch { errData = { error: text }; }
      throw new Error(errData.error || `Save failed: ${res.status}`);
    }

    const saved = await res.json();
    lastModifiedRef.current = saved.last_modified || null;
    deltaTracker?.flush(); // clear deltas after successful full save

    try {
      const all = JSON.parse(localStorage.getItem('scorecards') || '[]');
      localStorage.setItem('scorecards', JSON.stringify(
        all.map((sc: any) => sc.id === id ? { ...sc, lastModified: new Date().toISOString() } : sc)
      ));
    } catch { /* */ }

    return saved;
  }, []); // No deps — uses refs internally so it never goes stale

  return useAutoSave(data, saveToAPI, options, resetKey, resetValue);
}

// ─── Utility: restore backup ─────────────────────────────────────────────────
export function restoreFromLocalStorage<T>(key: string = 'auto-save-backup-default'): T | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored).data;
  } catch { /* */ }
  return null;
}
