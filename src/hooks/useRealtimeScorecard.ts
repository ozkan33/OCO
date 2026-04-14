import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseRealtimeScorecardOptions {
  scorecardId: string | null;
  /** Called when a remote change is detected. Receives the updated scorecard data. */
  onRemoteUpdate: (data: { columns: any[]; rows: any[] }, lastModified: string) => void;
  /** If true, suppresses the next incoming update (to avoid echoing our own save). */
  isSaving: boolean;
}

/**
 * Subscribes to Supabase Realtime changes on a specific scorecard.
 * When another tab/session updates the same scorecard, this hook
 * calls onRemoteUpdate so the local state can be refreshed.
 *
 * Automatically unsubscribes on scorecard switch or unmount.
 */
export function useRealtimeScorecard({
  scorecardId,
  onRemoteUpdate,
  isSaving,
}: UseRealtimeScorecardOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isSavingRef = useRef(isSaving);
  const suppressUntilRef = useRef<number>(0);

  // Keep ref in sync
  isSavingRef.current = isSaving;

  // Suppress echoes: after our own save, ignore updates for 3 seconds
  const suppressEcho = useCallback(() => {
    suppressUntilRef.current = Date.now() + 3000;
  }, []);

  useEffect(() => {
    // Clean up previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Don't subscribe for local (unsaved) scorecards
    if (!scorecardId || scorecardId.startsWith('scorecard_')) return;

    const channel = supabase
      .channel(`scorecard:${scorecardId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_scorecards',
          filter: `id=eq.${scorecardId}`,
        },
        (payload) => {
          // Skip if we're currently saving (our own write echoing back)
          if (isSavingRef.current) return;
          // Skip if within the suppression window
          if (Date.now() < suppressUntilRef.current) return;

          const newData = payload.new as any;
          if (newData?.data && newData?.last_modified) {
            onRemoteUpdate(newData.data, newData.last_modified);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scorecardId]);

  return { suppressEcho };
}
