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
      const resetSerialized = resetValue !== undefined
        ? ((() => { try { return JSON.stringify(resetValue); } catch { return ''; } })())
        : serializedData;
      lastDataRef.current = resetSerialized;
      isInitialRender.current = true; // treat next render as initial
      retryCountRef.current = 0;
      pendingSaveRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

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
      executeSave(data);
    }, debounceMs);

    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [serializedData, data, executeSave, debounceMs]);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  return { status, lastSaved, error, forceSave, isOnline, hasUnsavedChanges };
}

// ─── Scorecard-specific auto-save ────────────────────────────────────────────
export function useScoreCardAutoSave(
  scoreCardId: string | null,
  data: any,
  options: AutoSaveOptions = {},
  resetKey?: string | number,
  resetValue?: any
) {
  // Ref to hold the real DB ID after migration (prevents ghost creation)
  const resolvedIdRef = useRef<string | null>(scoreCardId);
  const isMigratingRef = useRef(false);

  // Keep ref in sync with prop, but don't overwrite during migration
  useEffect(() => {
    if (!isMigratingRef.current) {
      resolvedIdRef.current = scoreCardId;
    }
  }, [scoreCardId]);

  const saveToAPI = useCallback(async (data: any) => {
    const id = resolvedIdRef.current;
    if (!id) throw new Error('No scorecard ID');

    // ── Local scorecard → create in DB first ─────────────────────────────────
    if (id.startsWith('scorecard_')) {
      // Prevent double-creation: if already migrating, skip
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

        // Update the resolved ID immediately (before React re-renders)
        resolvedIdRef.current = created.id;

        // Update localStorage with the new ID
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

    // ── Normal save: PUT to existing scorecard ───────────────────────────────
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

    // Sync localStorage with server state
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
