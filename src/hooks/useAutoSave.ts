import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'offline';

interface AutoSaveOptions {
  debounceMs?: number;
  enableOfflineBackup?: boolean;
  onSaveSuccess?: (savedData?: any) => void;
  onSaveError?: (error: Error) => void;
}

interface AutoSaveHookReturn<T> {
  status: SaveStatus;
  lastSaved: Date | null;
  error: string | null;
  forceSave: () => Promise<void>;
  isOnline: boolean;
  hasUnsavedChanges: boolean;
}

export function useAutoSave<T>(
  data: T,
  saveFunction: (data: T) => Promise<any>,
  options: AutoSaveOptions = {},
  resetKey?: string | number,
  resetValue?: T
): AutoSaveHookReturn<T> {
  const {
    debounceMs = 2000,
    enableOfflineBackup = true,
    onSaveSuccess,
    onSaveError,
  } = options;

  const [status, setStatus] = useState<SaveStatus>('saved');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const timeoutRef = useRef<NodeJS.Timeout>();
  const lastDataRef = useRef<string>('');
  const isInitialRender = useRef(true);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setStatus('unsaved'); // Trigger save when back online
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Save to localStorage for offline backup
  const saveToLocalStorage = useCallback((data: T, key: string) => {
    if (enableOfflineBackup) {
      try {
        localStorage.setItem(key, JSON.stringify({
          data,
          timestamp: Date.now(),
          version: 'auto-save'
        }));
      } catch (err) {
        console.warn('Failed to save to localStorage:', err);
      }
    }
  }, [enableOfflineBackup]);

  // Load from localStorage
  const loadFromLocalStorage = useCallback((key: string): T | null => {
    if (!enableOfflineBackup) return null;
    
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.data;
      }
    } catch (err) {
      console.warn('Failed to load from localStorage:', err);
    }
    return null;
  }, [enableOfflineBackup]);

  // Debounced save function
  const debouncedSave = useCallback(async (value: T) => {
    if (!isOnline) {
      setStatus('offline');
      saveToLocalStorage(value, 'auto-save-backup');
      return;
    }

    setStatus('saving');
    setError(null);

    try {
      const result = await saveFunction(value);
      setStatus('saved');
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      
      // Clear localStorage backup after successful save
      if (enableOfflineBackup) {
        localStorage.removeItem('auto-save-backup');
      }
      
      onSaveSuccess?.(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Save failed';
      setError(errorMessage);
      setStatus('error');
      
      // Save to localStorage as fallback
      saveToLocalStorage(value, 'auto-save-backup');
      
      onSaveError?.(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [isOnline, saveFunction, saveToLocalStorage, enableOfflineBackup, onSaveSuccess, onSaveError]);

  // Force save function
  const forceSave = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    await debouncedSave(data);
  }, [data, debouncedSave]);

  // Memoize data serialization to prevent unnecessary comparisons
  const serializedData = useMemo(() => {
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }, [data]);

  // Memoize resetValue serialization
  const serializedResetValue = useMemo(() => {
    if (resetValue === undefined) return undefined;
    try {
      return JSON.stringify(resetValue);
    } catch {
      return String(resetValue);
    }
  }, [resetValue]);

  // Reset lastDataRef when resetKey or resetValue changes
  useEffect(() => {
    if (resetKey !== undefined) {
      lastDataRef.current = serializedResetValue !== undefined ? serializedResetValue : serializedData;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, serializedResetValue]);

  // Main effect to handle data changes
  useEffect(() => {
    // Skip initial render
    if (isInitialRender.current) {
      isInitialRender.current = false;
      lastDataRef.current = serializedData;
      return;
    }

    // Check if data actually changed
    if (serializedData === lastDataRef.current) return;

    lastDataRef.current = serializedData;
    setHasUnsavedChanges(true);
    setStatus('unsaved');

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for debounced save
    timeoutRef.current = setTimeout(() => {
      debouncedSave(data);
    }, debounceMs);

    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [serializedData, data, debouncedSave, debounceMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    status,
    lastSaved,
    error,
    forceSave,
    isOnline,
    hasUnsavedChanges,
  };
}

// Compute which cells changed between two row snapshots.
// Returns an array of { rowId, columnKey, value } for every changed cell.
function diffRows(
  prevRows: any[],
  nextRows: any[],
  columnKeys: string[]
): { rowId: number; columnKey: string; value: string }[] {
  const changes: { rowId: number; columnKey: string; value: string }[] = [];
  const prevById = new Map(prevRows.map(r => [r.id, r]));

  for (const row of nextRows) {
    if (!row.id || row.isAddRow) continue;
    const prev = prevById.get(row.id) ?? {};
    for (const key of columnKeys) {
      const oldVal = String(prev[key] ?? '');
      const newVal = String(row[key] ?? '');
      if (oldVal !== newVal) {
        changes.push({ rowId: row.id, columnKey: key, value: newVal });
      }
    }
  }
  return changes;
}

// Hook specifically for scorecards using API endpoints
export function useScoreCardAutoSave(
  scoreCardId: string | null,
  data: any,
  options: AutoSaveOptions = {},
  resetKey?: string | number,
  resetValue?: any
) {
  // Track the last saved rows snapshot so we can diff on next save
  const lastSavedRowsRef = useRef<any[]>([]);

  const saveToAPI = useCallback(async (data: any) => {
    if (!scoreCardId) {
      throw new Error('No scorecard ID provided');
    }

    // ── Handle local (pre-DB) scorecards ─────────────────────────────────────
    if (scoreCardId.startsWith('scorecard_')) {
      const createResponse = await fetch('/api/scorecards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: data?.name || 'Untitled Scorecard', data, is_draft: true }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create scorecard: ${createResponse.status}`);
      }

      const createdScorecard = await createResponse.json();

      const existingScoreCards = JSON.parse(localStorage.getItem('scorecards') || '[]');
      localStorage.setItem('scorecards', JSON.stringify(
        existingScoreCards.map((sc: any) =>
          sc.id === scoreCardId
            ? { ...sc, id: createdScorecard.id, ...data, lastModified: new Date().toISOString() }
            : sc
        )
      ));
      lastSavedRowsRef.current = data?.rows ?? [];
      return createdScorecard;
    }

    // ── Blob save (keeps existing behaviour, source of truth for the grid) ───
    const response = await fetch(`/api/scorecards/${scoreCardId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: data?.name || 'Untitled Scorecard', data, is_draft: true }),
    });

    if (!response.ok) {
      const text = await response.text();
      let errorData: any = {};
      try { errorData = JSON.parse(text); } catch { errorData = { error: text }; }
      throw new Error(errorData.error || `Failed to save scorecard: ${response.status}`);
    }

    const savedScorecard = await response.json();

    // ── Cell-level normalized save (fire-and-forget, won't break the UI) ─────
    const currentRows: any[] = data?.rows ?? [];
    const columnKeys: string[] = (data?.columns ?? [])
      .map((c: any) => c.key)
      .filter((k: string) => k && !k.startsWith('_') && k !== 'comments');

    const changes = diffRows(lastSavedRowsRef.current, currentRows, columnKeys);
    lastSavedRowsRef.current = currentRows;

    if (changes.length > 0) {
      fetch(`/api/scorecards/${scoreCardId}/cells`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ changes }),
      }).catch(() => {
        // Non-fatal: normalized save failed, blob is still authoritative
      });
    }

    return savedScorecard;
  }, [scoreCardId]);

  return useAutoSave(data, saveToAPI, options, resetKey, resetValue);
}

// Utility function to restore from localStorage
export function restoreFromLocalStorage<T>(key: string = 'auto-save-backup'): T | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.data;
    }
  } catch (err) {
    console.warn('Failed to restore from localStorage:', err);
  }
  return null;
} 