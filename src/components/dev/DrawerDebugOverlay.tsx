'use client';
// Live measurement overlay for bottom-sheet / drawer debugging on iOS.
// Shows the numbers we actually need to reason about the gap-at-top bug:
//   - innerH   : window.innerHeight (layout viewport on some iOS versions)
//   - vvH      : visualViewport.height (true visible area)
//   - vvTop    : visualViewport.offsetTop (non-zero when keyboard pushes up)
//   - dH       : drawer.offsetHeight (rendered height, inline style wins)
//   - dTop     : drawer.getBoundingClientRect().top (gap from visible top)
//   - dBot     : drawer rect bottom (positive if extends below visible)
//   - 100dvh   : computed value of a probe element sized to 100dvh
//   - 92svh    : computed value of a probe element sized to 92svh
//   - delta    : innerH - vvH (keyboard heuristic threshold is 80)
//
// Gated by the same `oco-debug` localStorage flag as DebugLoader, so it
// never shows for real users. Screenshot this overlay on the affected
// phone and paste it to triage — the numbers tell the whole story.
import { useEffect, useRef, useState } from 'react';

const FLAG_KEY = 'oco-debug';

function useDebugFlag(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('debug') === '1') { setOn(true); return; }
      if (params.get('debug') === '0') { setOn(false); return; }
      setOn(window.localStorage.getItem(FLAG_KEY) === '1' || process.env.NODE_ENV !== 'production');
    } catch {
      setOn(process.env.NODE_ENV !== 'production');
    }
  }, []);
  return on;
}

export default function DrawerDebugOverlay({
  targetRef,
  label,
}: {
  targetRef: React.RefObject<HTMLElement | null>;
  label?: string;
}) {
  const on = useDebugFlag();
  const [, force] = useState(0);
  const probeDvhRef = useRef<HTMLDivElement | null>(null);
  const probeSvhRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const tick = () => { force(n => n + 1); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  if (!on) return null;

  const innerH = typeof window !== 'undefined' ? window.innerHeight : 0;
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const vvH = vv ? Math.round(vv.height) : 0;
  const vvTop = vv ? Math.round(vv.offsetTop) : 0;
  const el = targetRef.current;
  const dH = el ? Math.round(el.offsetHeight) : 0;
  const rect = el ? el.getBoundingClientRect() : null;
  const dTop = rect ? Math.round(rect.top) : 0;
  const dBot = rect ? Math.round(rect.bottom) : 0;
  const dvhPx = probeDvhRef.current ? Math.round(probeDvhRef.current.getBoundingClientRect().height) : 0;
  const svhPx = probeSvhRef.current ? Math.round(probeSvhRef.current.getBoundingClientRect().height) : 0;
  const delta = innerH - vvH;

  return (
    <>
      {/* Hidden probes so we can read what the browser computes for dvh/svh. */}
      <div ref={probeDvhRef} aria-hidden="true" style={{ position: 'fixed', left: -9999, top: 0, width: 1, height: '100dvh', pointerEvents: 'none' }} />
      <div ref={probeSvhRef} aria-hidden="true" style={{ position: 'fixed', left: -9999, top: 0, width: 1, height: '100svh', pointerEvents: 'none' }} />
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 'env(safe-area-inset-top, 8px)',
          right: 8,
          zIndex: 2147483647,
          padding: '6px 8px',
          borderRadius: 8,
          background: 'rgba(17,24,39,0.88)',
          color: '#d1fae5',
          font: '11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace',
          pointerEvents: 'none',
          maxWidth: 220,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ color: '#fbbf24', fontWeight: 600, marginBottom: 2 }}>
          {label || 'drawer'} · debug
        </div>
        <div>innerH: <b>{innerH}</b></div>
        <div>vvH: <b>{vvH}</b> (top {vvTop})</div>
        <div>100dvh: <b>{dvhPx}</b> · 100svh: <b>{svhPx}</b></div>
        <div style={{ color: delta > 80 ? '#fca5a5' : '#d1fae5' }}>
          delta: <b>{delta}</b>{delta > 80 ? ' (kbd)' : ''}
        </div>
        <div style={{ marginTop: 3, paddingTop: 3, borderTop: '1px solid #374151' }}>
          dH: <b>{dH}</b>
        </div>
        <div style={{ color: dTop > 8 ? '#fca5a5' : '#d1fae5' }}>
          dTop: <b>{dTop}</b>
        </div>
        <div style={{ color: dBot > vvH + 4 ? '#fca5a5' : '#d1fae5' }}>
          dBot: <b>{dBot}</b>
        </div>
      </div>
    </>
  );
}
