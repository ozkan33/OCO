import { useRef, useCallback } from 'react';

export interface CellDelta {
  rowId?: number | string;        // main grid row ID
  columnKey: string;
  value: any;
  parentRowId?: number | string;  // for subgrid cells
  subRowId?: number | string;     // for subgrid cells
}

interface DeltaState {
  deltas: CellDelta[];
  isStructural: boolean;
}

/**
 * Tracks granular cell-level changes between saves.
 * Uses refs (not state) to avoid re-renders on every keystroke.
 *
 * Cell edits → recordCellDelta() → accumulates in queue
 * Structural ops (add/delete row/col) → markStructuralChange() → forces full save
 * On save success → flush() clears the queue
 */
export function useDeltaTracker() {
  const deltasRef = useRef<CellDelta[]>([]);
  const structuralRef = useRef(false);

  // Dedupe key: last-write-wins for same cell
  const deltaKey = (d: CellDelta) =>
    d.parentRowId !== undefined
      ? `sub:${d.parentRowId}:${d.subRowId}:${d.columnKey}`
      : `${d.rowId}:${d.columnKey}`;

  const recordCellDelta = useCallback((delta: CellDelta) => {
    const key = deltaKey(delta);
    // Replace existing delta for same cell (last-write-wins)
    const existing = deltasRef.current;
    const idx = existing.findIndex(d => deltaKey(d) === key);
    if (idx !== -1) {
      existing[idx] = delta;
    } else {
      existing.push(delta);
    }
    // Cap at 500 to prevent unbounded growth — if exceeded, force full save
    if (existing.length > 500) {
      structuralRef.current = true;
      deltasRef.current = [];
    }
  }, []);

  const markStructuralChange = useCallback(() => {
    structuralRef.current = true;
    // Clear deltas — the full save that follows captures everything
    deltasRef.current = [];
  }, []);

  // Return current state without clearing (for pre-save inspection)
  const peek = useCallback((): DeltaState => ({
    deltas: [...deltasRef.current],
    isStructural: structuralRef.current,
  }), []);

  // Return current state and clear (call after successful save)
  const flush = useCallback((): DeltaState => {
    const state: DeltaState = {
      deltas: [...deltasRef.current],
      isStructural: structuralRef.current,
    };
    deltasRef.current = [];
    structuralRef.current = false;
    return state;
  }, []);

  // Full reset (on scorecard switch)
  const reset = useCallback(() => {
    deltasRef.current = [];
    structuralRef.current = false;
  }, []);

  return { recordCellDelta, markStructuralChange, peek, flush, reset };
}
