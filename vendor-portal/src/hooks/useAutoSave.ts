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

// Hook specifically for scorecards using API endpoints
export function useScoreCardAutoSave(
  scoreCardId: string | null,
  data: any,
  options: AutoSaveOptions = {},
  resetKey?: string | number,
  resetValue?: any
) {
  const saveToAPI = useCallback(async (data: any) => {
    if (!scoreCardId) {
      throw new Error('No scorecard ID provided');
    }

    console.log('🔄 Auto-save attempting to save:', { scoreCardId, data });

    // Check if this is a local scorecard (starts with 'scorecard_') 
    // In this case, create it in the database and update the local reference
    if (scoreCardId.startsWith('scorecard_')) {
      console.log('💾 Creating local scorecard in database');
      
      // Create the scorecard in the database
      const createBody = {
        title: data?.name || 'Untitled Scorecard',
        data: data, // The entire scorecard data
        is_draft: true,
      };

      const createResponse = await fetch('/api/scorecards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(createBody),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        console.error('❌ Database create failed:', errorData);
        throw new Error(errorData.error || `Failed to create scorecard in database: ${createResponse.status}`);
      }

      const createdScorecard = await createResponse.json();
      console.log('✅ Database create successful!', createdScorecard);

      // Update localStorage to replace the local ID with the database ID
      const existingScoreCards = JSON.parse(localStorage.getItem('scorecards') || '[]');
      const updatedScoreCards = existingScoreCards.map((sc: any) => 
        sc.id === scoreCardId ? { ...sc, id: createdScorecard.id, ...data, lastModified: new Date().toISOString() } : sc
      );
      localStorage.setItem('scorecards', JSON.stringify(updatedScoreCards));
      
      console.log('✅ Local scorecard updated with database ID!');
      return createdScorecard;
    }

    // For database scorecards, use the API
    const requestBody = {
      title: data?.name || 'Untitled Scorecard',
      data: data, // The entire scorecard data
      is_draft: true,
    };

    console.log('📤 Sending request body:', requestBody);

    const response = await fetch(`/api/scorecards/${scoreCardId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(requestBody),
    });

    console.log('📥 Response status:', response.status);
    console.log('📥 Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const responseText = await response.text();
      console.error('❌ Save failed - Response text:', responseText);
      
      let errorData: any = {};
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        console.error('❌ Failed to parse error response as JSON:', e);
        errorData = { error: responseText || `HTTP ${response.status}` };
      }
      
      console.error('❌ Save failed:', errorData);
      throw new Error(errorData.error || `Failed to save scorecard: ${response.status}`);
    }

    const savedScorecard = await response.json();
    console.log('✅ API save successful!', savedScorecard);
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