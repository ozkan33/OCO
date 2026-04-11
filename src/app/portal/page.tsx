'use client';

import { useEffect, useState, Fragment } from 'react';
import Image from 'next/image';
import PortalNotificationBell from '@/components/portal/PortalNotificationBell';

interface Product { name: string; status: string; }
interface RetailerInfo { priority: string; buyer: string; storeCount: number; hqLocation: string; contact: string; }
interface Comment { text: string; author: string; date: string; }
interface Retailer { rowId: string; retailerName: string; products: Product[]; retailerInfo: RetailerInfo; comments?: Comment[]; notes?: string; }
interface Scorecard { id: string; scorecardName: string; retailers: Retailer[]; }
interface Summary { totalRetailers: number; authorized: number; inProcess: number; buyerPassed: number; presented: number; other: number; }
interface MarketVisit { id: string; photo_url: string; visit_date: string; store_name: string; address: string; note: string; }
interface DashboardData { brand: string; contactName: string; scorecards: Scorecard[]; summary: Summary; }

const statusStyles: Record<string, { bg: string; color: string; dot: string }> = {
  'Authorized':       { bg: '#e6f4ea', color: '#14532d', dot: '#16a34a' },
  'In Process':       { bg: '#e0e7ff', color: '#1e3a8a', dot: '#3b82f6' },
  'Buyer Passed':     { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
  'Presented':        { bg: '#ede9fe', color: '#6d28d9', dot: '#8b5cf6' },
  'Discontinued':     { bg: '#f3f4f6', color: '#374151', dot: '#6b7280' },
  'Meeting Secured':  { bg: '#fff7ed', color: '#b45309', dot: '#f59e0b' },
  'On Hold':          { bg: '#fdf2f8', color: '#be185d', dot: '#ec4899' },
  'Category Review':  { bg: '#f0fdfa', color: '#0f766e', dot: '#14b8a6' },
  'Open Review':      { bg: '#e0f2fe', color: '#0369a1', dot: '#0ea5e9' },
  'In/Out':           { bg: '#fef9c3', color: '#92400e', dot: '#eab308' },
};

function StatusBadge({ status }: { status: string }) {
  if (!status) return <span className="text-slate-300 text-xs">—</span>;
  const s = statusStyles[status] || { bg: '#f3f4f6', color: '#374151', dot: '#6b7280' };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: s.bg, color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {status}
    </span>
  );
}

export default function PortalDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [visits, setVisits] = useState<MarketVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'visits'>('overview');
  const [addingNoteFor, setAddingNoteFor] = useState<{ scorecardId: string; rowId: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/portal/dashboard', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
      fetch('/api/portal/market-visits', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    ]).then(([dashData, visitData]) => {
      setData(dashData);
      setVisits(visitData || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleAddNote = async (scorecardId: string, rowId: string) => {
    if (!noteText.trim() || submittingNote) return;
    setSubmittingNote(true);
    try {
      const res = await fetch('/api/portal/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scorecard_id: scorecardId, row_id: rowId, text: noteText.trim() }),
      });
      if (!res.ok) throw new Error('Failed to add note');
      const newComment = await res.json();
      // Add the new comment to local state
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          scorecards: prev.scorecards.map(sc => {
            if (sc.id !== scorecardId) return sc;
            return {
              ...sc,
              retailers: sc.retailers.map(r => {
                if (r.rowId !== rowId) return r;
                return {
                  ...r,
                  comments: [...(r.comments || []), { text: newComment.text || noteText.trim(), author: newComment.author || 'You', date: newComment.created_at || new Date().toISOString() }],
                };
              }),
            };
          }),
        };
      });
      setNoteText('');
      setAddingNoteFor(null);
    } catch {
      // Could add error toast here
    }
    setSubmittingNote(false);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/log-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'logout' }) }).catch(() => {});
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/auth/login';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Unable to load dashboard. Please try again.</p>
      </div>
    );
  }

  const { brand, contactName, scorecards, summary } = data;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="3Brothers Marketing" width={32} height={32} className="rounded-lg" />
            <div>
              <h1 className="text-base font-bold text-slate-900">{brand}</h1>
              <p className="text-xs text-slate-500">Welcome, {contactName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <PortalNotificationBell />
            <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard label="Total Retailers" value={summary.totalRetailers} color="slate" />
          <SummaryCard label="Authorized" value={summary.authorized} color="green" />
          <SummaryCard label="In Process" value={summary.inProcess} color="blue" />
          <SummaryCard label="Presented" value={summary.presented} color="purple" />
          <SummaryCard label="Buyer Passed" value={summary.buyerPassed} color="red" />
          <SummaryCard label="Other" value={summary.other} color="gray" />
        </div>

        {/* Tab Nav */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          <button onClick={() => setActiveTab('overview')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'overview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Product Status</button>
          <button onClick={() => setActiveTab('visits')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'visits' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Market Visits{visits.length > 0 && <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{visits.length}</span>}
          </button>
        </div>

        {/* Product Status Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {scorecards.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-slate-400">No scorecards assigned yet. Your broker will set this up.</p>
              </div>
            ) : scorecards.map(sc => (
              <div key={sc.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <h3 className="text-sm font-bold text-slate-800">{sc.scorecardName}</h3>
                  <p className="text-xs text-slate-400">{sc.retailers.length} retailer{sc.retailers.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Retailer</th>
                        {sc.retailers[0]?.products.map(p => (
                          <th key={p.name} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{p.name}</th>
                        ))}
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Priority</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Buyer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sc.retailers.map((r, i) => {
                        const isAddingNote = addingNoteFor?.scorecardId === sc.id && addingNoteFor?.rowId === r.rowId;
                        return (
                        <Fragment key={i}>
                          <tr className="border-b border-slate-50 hover:bg-slate-50/50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-900">{r.retailerName}</span>
                                {(r.comments?.length ?? 0) > 0 && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">{r.comments!.length}</span>
                                )}
                                <button
                                  onClick={() => {
                                    if (isAddingNote) {
                                      setAddingNoteFor(null);
                                      setNoteText('');
                                    } else {
                                      setAddingNoteFor({ scorecardId: sc.id, rowId: r.rowId });
                                      setNoteText('');
                                    }
                                  }}
                                  className="text-slate-400 hover:text-blue-600 transition-colors ml-1"
                                  title="Add a note"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                            {r.products.map(p => (
                              <td key={p.name} className="px-4 py-3"><StatusBadge status={p.status} /></td>
                            ))}
                            <td className="px-4 py-3 text-slate-600">{r.retailerInfo.priority}</td>
                            <td className="px-4 py-3 text-slate-600">{r.retailerInfo.buyer}</td>
                          </tr>
                          {/* Add note form */}
                          {isAddingNote && (
                            <tr className="bg-blue-50/50">
                              <td colSpan={r.products.length + 3} className="px-4 py-2.5">
                                <div className="flex items-start gap-2 max-w-lg">
                                  <textarea
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    placeholder={`Add a note for ${r.retailerName}...`}
                                    className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    rows={2}
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleAddNote(sc.id, r.rowId);
                                      }
                                      if (e.key === 'Escape') {
                                        setAddingNoteFor(null);
                                        setNoteText('');
                                      }
                                    }}
                                  />
                                  <div className="flex flex-col gap-1">
                                    <button
                                      onClick={() => handleAddNote(sc.id, r.rowId)}
                                      disabled={!noteText.trim() || submittingNote}
                                      className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                      {submittingNote ? 'Sending...' : 'Send'}
                                    </button>
                                    <button
                                      onClick={() => { setAddingNoteFor(null); setNoteText(''); }}
                                      className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          {/* Notes and comments row */}
                          {((r.comments?.length ?? 0) > 0 || r.notes) && (
                            <tr className="bg-slate-50/50">
                              <td colSpan={r.products.length + 3} className="px-4 py-2">
                                <div className="flex flex-col gap-1.5 pl-2 border-l-2 border-blue-200">
                                  {r.notes && <p className="text-xs text-slate-600"><span className="font-semibold text-slate-500">Note:</span> {r.notes}</p>}
                                  {r.comments?.map((c, ci) => (
                                    <div key={ci} className="text-xs text-slate-500">
                                      <span className="font-medium text-slate-700">{c.author}</span>
                                      <span className="mx-1 text-slate-300">&middot;</span>
                                      <span className="text-slate-400">{new Date(c.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                      <span className="mx-1 text-slate-300">&middot;</span>
                                      <span>{c.text}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Market Visits Tab */}
        {activeTab === 'visits' && (
          <div>
            {visits.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-slate-400">No market visits yet for {brand}.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visits.map(v => (
                  <div key={v.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {v.photo_url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={v.photo_url} alt={v.store_name || 'Market visit'} className="w-full h-48 object-cover" />
                    )}
                    <div className="p-4">
                      <h4 className="font-semibold text-slate-900 text-sm">{v.store_name || 'Store Visit'}</h4>
                      <p className="text-xs text-slate-400 mt-1">{new Date(v.visit_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                      {v.address && <p className="text-xs text-slate-500 mt-1">{v.address}</p>}
                      {v.note && <p className="text-sm text-slate-600 mt-2">{v.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-green-50 text-green-700',
    blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
    red: 'bg-red-50 text-red-700',
    gray: 'bg-gray-50 text-gray-600',
  };
  return (
    <div className={`rounded-xl px-4 py-3 ${colors[color] || colors.slate}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium opacity-75">{label}</p>
    </div>
  );
}
