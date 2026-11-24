'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { contactOptions } from './constants';

// Live list of "3B Contact" choices: the built-ins from constants.ts plus the
// ones Admins manage on /admin/config (GET /api/contact-options).
//
// The grid reads `contactOptions` from a dozen places (cell labels, editors,
// the picker). Rather than thread a prop through all of them, added contacts
// are appended to that same exported array, and subscribers re-render when the
// version changes.

const PALETTE = [
  { bg: '#dcfce7', color: '#15803d' },
  { bg: '#ede9fe', color: '#6d28d9' },
  { bg: '#fce7f3', color: '#be185d' },
  { bg: '#ffedd5', color: '#c2410c' },
  { bg: '#ccfbf1', color: '#0f766e' },
  { bg: '#e2e8f0', color: '#334155' },
];
export const BUILT_IN_CONTACT_COUNT = contactOptions.length;

type Result = { ok: true } | { ok: false; error: string };

let version = 0;
let canManage = false;
let ready = false;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  version++;
  listeners.forEach(l => l());
}

function appendLocal(label: string) {
  if (contactOptions.some(o => o.value.toLowerCase() === label.toLowerCase())) return;
  const tone = PALETTE[(contactOptions.length - BUILT_IN_CONTACT_COUNT) % PALETTE.length];
  contactOptions.push({ value: label, label, ...tone });
}

export function loadContactOptions(): Promise<void> {
  if (!loading) {
    loading = fetch('/api/contact-options', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d) {
          for (const label of d.options || []) appendLocal(label);
          canManage = !!d.canManage;
          ready = !!d.ready;
        }
        loaded = true;
        emit();
      })
      .catch(() => { loading = null; loaded = true; emit(); });
  }
  return loading;
}

async function call(method: 'POST' | 'DELETE', label: string): Promise<Result> {
  try {
    const res = method === 'POST'
      ? await fetch('/api/contact-options', {
          method, headers: { 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({ label }),
        })
      : await fetch(`/api/contact-options?label=${encodeURIComponent(label)}`, { method, credentials: 'include' });
    const d = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: d.error || 'Something went wrong. Please try again.' };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection.' };
  }
}

export async function addContactOption(label: string): Promise<Result> {
  const clean = label.trim().replace(/\s+/g, ' ');
  const result = await call('POST', clean);
  if (result.ok) { appendLocal(clean); emit(); }
  return result;
}

export async function removeContactOption(label: string): Promise<Result> {
  const result = await call('DELETE', label);
  if (result.ok) {
    const idx = contactOptions.findIndex((o, i) => i >= BUILT_IN_CONTACT_COUNT && o.value === label);
    if (idx !== -1) contactOptions.splice(idx, 1);
    emit();
  }
  return result;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Loads the list once and re-renders the caller whenever it changes.
export function useContactOptions() {
  useSyncExternalStore(subscribe, () => version, () => 0);
  useEffect(() => { loadContactOptions(); }, []);
  return { options: contactOptions, canManage, ready, loaded };
}
