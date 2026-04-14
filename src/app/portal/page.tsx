'use client';

import { useEffect, useState, Fragment } from 'react';
import PortalNotificationBell from '@/components/portal/PortalNotificationBell';
import { LogoMark } from '@/components/layout/Logo';
import PhotoLightbox from '@/components/admin/PhotoLightbox';
import MasterScorecard from '@/components/admin/MasterScorecard';

interface Product { name: string; status: string; }
interface RetailerInfo { priority: string; buyer: string; storeCount: number; hqLocation: string; contact: string; }
interface Comment { id?: string; text: string; author: string; date: string; isOwn?: boolean; }
interface Retailer { rowId: string; retailerName: string; products: Product[]; retailerInfo: RetailerInfo; comments?: Comment[]; notes?: string; }
interface Scorecard { id: string; scorecardName: string; retailers: Retailer[]; }
interface Summary { totalRetailers: number; authorized: number; inProcess: number; buyerPassed: number; presented: number; other: number; }
interface MarketVisit { id: string; photo_url: string; visit_date: string; store_name: string; address: string; note: string; brands?: string[]; }
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
  const [activeTab, setActiveTab] = useState<'overview' | 'scorecard' | 'visits'>('overview');
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [addingNoteFor, setAddingNoteFor] = useState<{ scorecardId: string; rowId: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [editingComment, setEditingComment] = useState<{ id: string; scorecardId: string; rowId: string } | null>(null);
  const [editText, setEditText] = useState('');

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
                  comments: [...(r.comments || []), { id: newComment.id, text: newComment.text || noteText.trim(), author: newComment.author || 'You', date: newComment.created_at || new Date().toISOString(), isOwn: true }],
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

  const handleEditComment = async (commentId: string, scorecardId: string, rowId: string) => {
    if (!editText.trim()) return;
    try {
      const res = await fetch('/api/portal/comments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: commentId, text: editText.trim() }),
      });
      if (!res.ok) throw new Error();
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          scorecards: prev.scorecards.map(sc => {
            if (sc.id !== scorecardId) return sc;
            return { ...sc, retailers: sc.retailers.map(r => {
              if (r.rowId !== rowId) return r;
              return { ...r, comments: r.comments?.map(c => c.id === commentId ? { ...c, text: editText.trim() } : c) };
            })};
          }),
        };
      });
      setEditingComment(null);
      setEditText('');
    } catch { /* silent */ }
  };

  const handleDeleteComment = async (commentId: string, scorecardId: string, rowId: string) => {
    if (!confirm('Delete this note?')) return;
    try {
      const res = await fetch(`/api/portal/comments?id=${commentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          scorecards: prev.scorecards.map(sc => {
            if (sc.id !== scorecardId) return sc;
            return { ...sc, retailers: sc.retailers.map(r => {
              if (r.rowId !== rowId) return r;
              return { ...r, comments: r.comments?.filter(c => c.id !== commentId) };
            })};
          }),
        };
      });
    } catch { /* silent */ }
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

  // Sort market visits by first brand tag A-Z, then by visit date descending
  const sortedVisits = [...visits].sort((a, b) => {
    const brandA = (a.brands?.[0] || '').toLowerCase();
    const brandB = (b.brands?.[0] || '').toLowerCase();
    if (brandA !== brandB) return brandA.localeCompare(brandB);
    return new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime();
  });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity" title="Go to 3Brothers Marketing">
              <LogoMark size={32} />
              <div>
                <h1 className="text-base font-bold text-slate-900">{brand}</h1>
                <p className="text-xs text-slate-500">Welcome, {contactName}</p>
              </div>
            </a>
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
          <SummaryCard label="Total Customers" value={summary.totalRetailers} color="slate" />
          <SummaryCard label="Authorized" value={summary.authorized} color="green" />
          <SummaryCard label="In Process" value={summary.inProcess} color="blue" />
          <SummaryCard label="Presented" value={summary.presented} color="purple" />
          <SummaryCard label="Buyer Passed" value={summary.buyerPassed} color="red" />
          <SummaryCard label="Other" value={summary.other} color="gray" />
        </div>

        {/* Tab Nav */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          <button onClick={() => setActiveTab('overview')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'overview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Product Status</button>
          <button onClick={() => setActiveTab('scorecard')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'scorecard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Master Scorecard</button>
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
                  <p className="text-xs text-slate-400">{sc.retailers.length} customer{sc.retailers.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
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
                                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-blue-600 hover:bg-blue-50 px-2 py-0.5 rounded-md transition-colors ml-1"
                                  title="Add a note"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                  </svg>
                                  <span>Add note</span>
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
                            <tr className="bg-slate-50/60">
                              <td colSpan={r.products.length + 3} className="px-4 py-3">
                                <div className="max-w-xl">
                                  <div className="flex items-center gap-2 mb-2">
                                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                                    </svg>
                                    <span className="text-xs font-medium text-slate-500">New note for {r.retailerName}</span>
                                  </div>
                                  <div className="flex items-end gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
                                    <textarea
                                      value={noteText}
                                      onChange={(e) => setNoteText(e.target.value)}
                                      placeholder="Type your note... (Enter to send, Shift+Enter for new line)"
                                      className="flex-1 text-sm text-slate-700 placeholder-slate-400 resize-none focus:outline-none bg-transparent"
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
                                    <div className="flex items-center gap-1.5 shrink-0 pb-0.5">
                                      <button
                                        onClick={() => { setAddingNoteFor(null); setNoteText(''); }}
                                        className="px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => handleAddNote(sc.id, r.rowId)}
                                        disabled={!noteText.trim() || submittingNote}
                                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                      >
                                        {submittingNote ? (
                                          <>
                                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                            Sending
                                          </>
                                        ) : (
                                          <>
                                            Send
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                                            </svg>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          {/* Notes and comments row - chat bubbles */}
                          {((r.comments?.length ?? 0) > 0 || r.notes) && (
                            <tr className="bg-slate-50/80">
                              <td colSpan={r.products.length + 3} className="px-4 py-3">
                                <div className="flex flex-col gap-2 max-w-2xl">
                                  {/* Broker note (from admin) */}
                                  {r.notes && (
                                    <div className="flex items-start gap-2">
                                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                                        <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
                                      </div>
                                      <div className="bg-amber-50 border border-amber-100 rounded-xl rounded-tl-sm px-3 py-2">
                                        <p className="text-xs font-semibold text-amber-700 mb-0.5">Broker Note</p>
                                        <p className="text-sm text-slate-700">{r.notes}</p>
                                      </div>
                                    </div>
                                  )}
                                  {/* Comment bubbles */}
                                  {r.comments?.map((c, ci) => {
                                    const isEditing = editingComment?.id === c.id;
                                    const initial = (c.author || '?')[0].toUpperCase();
                                    return (
                                    <div key={c.id || ci} className={`flex items-start gap-2 group/comment ${c.isOwn ? 'flex-row-reverse' : ''}`}>
                                      {/* Avatar */}
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold ${c.isOwn ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                        {initial}
                                      </div>
                                      {/* Bubble */}
                                      <div className={`max-w-sm ${c.isOwn ? 'items-end' : 'items-start'}`}>
                                        <div className={`rounded-xl px-3 py-2 ${c.isOwn ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 rounded-tl-sm'}`}>
                                          {/* Author & date header */}
                                          <div className={`flex items-center gap-1.5 mb-0.5 ${c.isOwn ? 'justify-end' : ''}`}>
                                            <span className={`text-[11px] font-semibold ${c.isOwn ? 'text-blue-100' : 'text-slate-700'}`}>{c.author}</span>
                                            <span className={`text-[10px] ${c.isOwn ? 'text-blue-200' : 'text-slate-400'}`}>
                                              {new Date(c.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                              {' '}
                                              {new Date(c.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                            </span>
                                          </div>
                                          {/* Message text or edit form */}
                                          {isEditing ? (
                                            <div className="flex flex-col gap-1.5 mt-1">
                                              <input
                                                type="text"
                                                value={editText}
                                                onChange={e => setEditText(e.target.value)}
                                                className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full bg-white"
                                                autoFocus
                                                onKeyDown={e => {
                                                  if (e.key === 'Enter') handleEditComment(c.id!, sc.id, r.rowId);
                                                  if (e.key === 'Escape') { setEditingComment(null); setEditText(''); }
                                                }}
                                              />
                                              <div className="flex items-center gap-1.5">
                                                <button onClick={() => handleEditComment(c.id!, sc.id, r.rowId)} className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded transition-colors">Save</button>
                                                <button onClick={() => { setEditingComment(null); setEditText(''); }} className="text-xs font-medium text-slate-400 hover:text-slate-600 px-2 py-0.5 rounded transition-colors">Cancel</button>
                                              </div>
                                            </div>
                                          ) : (
                                            <p className={`text-sm leading-relaxed ${c.isOwn ? 'text-white' : 'text-slate-700'}`}>{c.text}</p>
                                          )}
                                        </div>
                                        {/* Edit/Delete actions on hover */}
                                        {c.isOwn && c.id && !isEditing && (
                                          <div className={`flex gap-1 mt-0.5 opacity-0 group-hover/comment:opacity-100 transition-opacity ${c.isOwn ? 'justify-end' : 'justify-start'}`}>
                                            <button
                                              onClick={() => { setEditingComment({ id: c.id!, scorecardId: sc.id, rowId: r.rowId }); setEditText(c.text); }}
                                              className="text-slate-400 hover:text-blue-600 transition-colors p-0.5 rounded"
                                              title="Edit note"
                                            >
                                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                                            </button>
                                            <button
                                              onClick={() => handleDeleteComment(c.id!, sc.id, r.rowId)}
                                              className="text-slate-400 hover:text-red-600 transition-colors p-0.5 rounded"
                                              title="Delete note"
                                            >
                                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    );
                                  })}
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

        {/* Master Scorecard Tab */}
        {activeTab === 'scorecard' && (
          <MasterScorecard apiUrl="/api/portal/master-scorecard" />
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
                {sortedVisits.map(v => (
                  <div key={v.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden group">
                    {v.photo_url && (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={v.photo_url}
                          alt={v.store_name || 'Market visit'}
                          className="w-full h-48 object-cover cursor-pointer transition-transform duration-200 group-hover:scale-[1.02]"
                          onClick={() => setLightbox({ src: v.photo_url, alt: v.store_name || 'Market visit' })}
                        />
                        <div
                          className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none flex items-center justify-center"
                        >
                          <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 px-3 py-1 rounded-full">Click to enlarge</span>
                        </div>
                        <a
                          href={v.photo_url}
                          download={`${(v.store_name || 'visit').replace(/[^a-zA-Z0-9_-]/g, '_')}_${v.visit_date}.jpg`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Download photo"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12M12 16.5V3" /></svg>
                        </a>
                      </div>
                    )}
                    <div className="p-4">
                      <h4 className="font-semibold text-slate-900 text-sm">{v.store_name || 'Store Visit'}</h4>
                      <p className="text-xs text-slate-400 mt-1">{new Date(v.visit_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                      {v.brands && v.brands.filter(b => b === brand).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {v.brands.filter(b => b === brand).map(b => (
                            <span key={b} className="text-[10px] font-medium bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{b}</span>
                          ))}
                        </div>
                      )}
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
      {lightbox && <PhotoLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
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
    gray: 'bg-slate-50 text-slate-600',
  };
  return (
    <div className={`rounded-xl px-4 py-3 ${colors[color] || colors.slate}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium opacity-75">{label}</p>
    </div>
  );
}
