'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import {
  BUILT_IN_CONTACT_COUNT, addContactOption, removeContactOption, useContactOptions,
} from '@/components/admin/contactOptionsStore';

// Admin-only settings for scorecard fields. Each card manages the choices of
// one dropdown column; 3B Contact is the first.
export default function ConfigPage() {
  const [role, setRole] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const { options, canManage, ready, loaded } = useContactOptions();

  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setRole(d?.user?.role ?? null))
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await addContactOption(newLabel);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setNewLabel('');
  };

  const handleRemove = async (label: string) => {
    if (confirmRemove !== label) { setConfirmRemove(label); return; }
    setBusy(true);
    setError(null);
    const result = await removeContactOption(label);
    setBusy(false);
    setConfirmRemove(null);
    if (!result.ok) setError(result.error);
  };

  const isAdmin = role === 'ADMIN';

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Config</h1>
        <p className="text-sm text-slate-500 mt-1">Choices offered in scorecard dropdown columns. Changes apply to every scorecard.</p>

        {!authChecked || !loaded ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-blue-600" />
          </div>
        ) : !isAdmin ? (
          <p className="mt-8 text-sm text-slate-600 bg-white border border-slate-200 rounded-xl px-5 py-4">
            Only Admins can change these settings.
          </p>
        ) : (
          <section className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">3B Contact</h2>
              <p className="text-xs text-slate-500 mt-0.5">People who can be picked in the 3B Contact column.</p>
            </div>

            <div className="px-6 py-5 space-y-5">
              {!ready && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  This list can&apos;t be edited yet: the <code className="font-mono text-xs">contact_options</code> table is missing.
                  Run <code className="font-mono text-xs">supabase/migrations/20261126_contact_options.sql</code> in Supabase, then reload.
                </p>
              )}

              <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {options.map((opt, idx) => {
                  const builtIn = idx < BUILT_IN_CONTACT_COUNT;
                  return (
                    <li key={opt.value} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                        style={{ background: opt.bg, color: opt.color }}
                      >
                        {opt.label}
                      </span>
                      {builtIn ? (
                        <span className="text-xs text-slate-400">Built in</span>
                      ) : canManage && (
                        <button
                          type="button"
                          onClick={() => handleRemove(opt.value)}
                          onBlur={() => setConfirmRemove(null)}
                          disabled={busy}
                          className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 ${
                            confirmRemove === opt.value
                              ? 'text-white bg-red-600 hover:bg-red-700'
                              : 'text-red-600 hover:bg-red-50'
                          }`}
                        >
                          {confirmRemove === opt.value ? 'Confirm remove' : 'Remove'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              {canManage && (
                <form onSubmit={handleAdd} className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <label htmlFor="new-contact" className="sr-only">New 3B Contact name</label>
                    <input
                      id="new-contact"
                      value={newLabel}
                      maxLength={40}
                      onChange={e => { setNewLabel(e.target.value); setError(null); }}
                      placeholder="Add a name"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy || !newLabel.trim()}
                    className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    Add
                  </button>
                </form>
              )}

              {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

              <p className="text-xs text-slate-400">
                Removing a name stops it being offered. Cells already set to it keep showing it.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
