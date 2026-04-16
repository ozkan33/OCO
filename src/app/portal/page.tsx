'use client';

import { useEffect, useState, useRef } from 'react';
import PortalNotificationBell from '@/components/portal/PortalNotificationBell';
import { LogoMark } from '@/components/layout/Logo';
import PhotoLightbox from '@/components/admin/PhotoLightbox';
import MasterScorecard from '@/components/admin/MasterScorecard';

interface Product { name: string; status: string; }
interface RetailerInfo { priority: string; buyer: string; storeCount: number; hqLocation: string; contact: string; }
interface Comment { id?: string; text: string; author: string; date: string; updated_at?: string; isOwn?: boolean; isAdmin?: boolean; }
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
  if (!status) return <span className="text-slate-300 text-xs">&mdash;</span>;
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
  const [commentDrawer, setCommentDrawer] = useState<{ scorecardId: string; rowId: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [editingComment, setEditingComment] = useState<{ id: string; scorecardId: string; rowId: string } | null>(null);
  const [editText, setEditText] = useState('');
  const [photoCommentText, setPhotoCommentText] = useState<Record<string, string>>({});
  const [submittingPhotoComment, setSubmittingPhotoComment] = useState<string | null>(null);
  const commentThreadRef = useRef<HTMLDivElement>(null);

  // Derive drawer content from data state
  const drawerScorecard = commentDrawer ? data?.scorecards.find(sc => sc.id === commentDrawer.scorecardId) : null;
  const drawerRetailer = drawerScorecard?.retailers.find(r => r.rowId === commentDrawer?.rowId);

  const scrollToBottom = () => {
    setTimeout(() => {
      commentThreadRef.current?.scrollTo({ top: commentThreadRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  };

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

  // Scroll to bottom when drawer opens or comments change
  useEffect(() => {
    if (commentDrawer) scrollToBottom();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentDrawer, drawerRetailer?.comments?.length]);

  const handleAddPhotoComment = async (visitId: string, storeName: string) => {
    const text = photoCommentText[visitId]?.trim();
    if (!text || submittingPhotoComment) return;
    setSubmittingPhotoComment(visitId);
    try {
      const scorecardId = data?.scorecards?.[0]?.id;
      if (!scorecardId) return;

      const res = await fetch('/api/portal/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          scorecard_id: scorecardId,
          row_id: storeName,
          text,
          store_name: storeName,
        }),
      });
      if (!res.ok) throw new Error('Failed to add comment');
      setPhotoCommentText(prev => ({ ...prev, [visitId]: '' }));
    } catch {
      // silent
    } finally {
      setSubmittingPhotoComment(null);
    }
  };

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
                const rawAuthor = newComment.author || 'You';
                const friendlyAuthor = rawAuthor.includes('@') ? rawAuthor.split('@')[0].charAt(0).toUpperCase() + rawAuthor.split('@')[0].slice(1) : rawAuthor;
                return {
                  ...r,
                  comments: [...(r.comments || []), { id: newComment.id, text: newComment.text || noteText.trim(), author: friendlyAuthor, date: newComment.created_at || new Date().toISOString(), updated_at: newComment.updated_at || newComment.created_at || new Date().toISOString(), isOwn: true, isAdmin: false }],
                };
              }),
            };
          }),
        };
      });
      setNoteText('');
      scrollToBottom();
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
              return { ...r, comments: r.comments?.map(c => c.id === commentId ? { ...c, text: editText.trim(), updated_at: new Date().toISOString() } : c) };
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

  const openDrawer = (scorecardId: string, rowId: string) => {
    setCommentDrawer({ scorecardId, rowId });
    setNoteText('');
    setEditingComment(null);
    setEditText('');
  };

  const closeDrawer = () => {
    setCommentDrawer(null);
    setNoteText('');
    setEditingComment(null);
    setEditText('');
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
          <button onClick={() => { setActiveTab('overview'); }} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'overview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Product Status</button>
          <button onClick={() => { setActiveTab('scorecard'); closeDrawer(); }} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'scorecard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Master Scorecard</button>
          <button onClick={() => { setActiveTab('visits'); closeDrawer(); }} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'visits' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
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
                        const noteCount = (r.comments?.length ?? 0) + (r.notes ? 1 : 0);
                        return (
                          <tr
                            key={i}
                            className="border-b border-slate-50 hover:bg-blue-50/40 cursor-pointer transition-colors group"
                            onClick={() => openDrawer(sc.id, r.rowId)}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-900">{r.retailerName}</span>
                                {noteCount > 0 ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-600 pl-1.5 pr-2 py-0.5 rounded-full font-medium">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                                    </svg>
                                    {noteCount}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pl-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                    Add note
                                  </span>
                                )}
                              </div>
                            </td>
                            {r.products.map(p => (
                              <td key={p.name} className="px-4 py-3"><StatusBadge status={p.status} /></td>
                            ))}
                            <td className="px-4 py-3 text-slate-600">{r.retailerInfo.priority}</td>
                            <td className="px-4 py-3 text-slate-600">{r.retailerInfo.buyer}</td>
                          </tr>
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
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Add a comment..."
                            value={photoCommentText[v.id] || ''}
                            onChange={e => setPhotoCommentText(prev => ({ ...prev, [v.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddPhotoComment(v.id, v.store_name); }}
                            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                          />
                          <button
                            onClick={() => handleAddPhotoComment(v.id, v.store_name)}
                            disabled={!photoCommentText[v.id]?.trim() || submittingPhotoComment === v.id}
                            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors font-medium"
                          >
                            {submittingPhotoComment === v.id ? '...' : 'Send'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─── Comment / Notes Drawer ─────────────────────────────────────── */}
      {commentDrawer && drawerRetailer && (
        <div className="fixed inset-0 z-50 flex" onKeyDown={e => { if (e.key === 'Escape') closeDrawer(); }}>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={closeDrawer} />

          {/* Panel */}
          <div className="relative ml-auto w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-slideInRight">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900 truncate">{drawerRetailer.retailerName}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {(drawerRetailer.comments?.length ?? 0)} note{(drawerRetailer.comments?.length ?? 0) !== 1 ? 's' : ''}
                  {drawerScorecard && <span className="mx-1">&middot;</span>}
                  {drawerScorecard && <span className="text-slate-400">{drawerScorecard.scorecardName}</span>}
                </p>
              </div>
              <button
                onClick={closeDrawer}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0 ml-3"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Retailer quick info */}
            {(drawerRetailer.retailerInfo.priority || drawerRetailer.retailerInfo.buyer) && (
              <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-4 text-xs text-slate-500 shrink-0">
                {drawerRetailer.retailerInfo.priority && (
                  <span>Priority: <span className="font-medium text-slate-700">{drawerRetailer.retailerInfo.priority}</span></span>
                )}
                {drawerRetailer.retailerInfo.buyer && (
                  <span>Buyer: <span className="font-medium text-slate-700">{drawerRetailer.retailerInfo.buyer}</span></span>
                )}
              </div>
            )}

            {/* Comment Thread */}
            <div ref={commentThreadRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {/* Broker Note (pinned) */}
              {drawerRetailer.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-5 h-5 rounded-full bg-amber-200 flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Broker Note</span>
                  </div>
                  <p className="text-sm text-amber-900 leading-relaxed">{drawerRetailer.notes}</p>
                </div>
              )}

              {/* Empty state */}
              {!drawerRetailer.notes && (drawerRetailer.comments?.length ?? 0) === 0 && (
                <div className="text-center py-16">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-7 h-7 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-slate-400">No notes yet</p>
                  <p className="text-xs text-slate-300 mt-1">Start the conversation below</p>
                </div>
              )}

              {/* Comments */}
              {drawerRetailer.comments?.map((c, ci) => {
                const isEditing = editingComment?.id === c.id;
                const initial = (c.author || '?')[0].toUpperCase();
                const isEdited = c.updated_at && c.date && (Math.abs(new Date(c.updated_at).getTime() - new Date(c.date).getTime()) > 1000);

                return (
                  <div key={c.id || ci} className="group/comment">
                    {/* Author line */}
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        c.isAdmin ? 'bg-amber-100 text-amber-700' :
                        c.isOwn ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {initial}
                      </div>
                      <span className="text-xs font-semibold text-slate-700">{c.author}</span>
                      {c.isAdmin && (
                        <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 uppercase tracking-wide">Broker</span>
                      )}
                      {c.isOwn && (
                        <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-wide">You</span>
                      )}
                      <span className="text-[10px] text-slate-300 ml-auto whitespace-nowrap">
                        {new Date(c.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        {', '}
                        {new Date(c.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Message bubble */}
                    <div className={`ml-8 rounded-xl px-3.5 py-2.5 ${
                      c.isAdmin ? 'bg-amber-50/70 border border-amber-100' :
                      c.isOwn ? 'bg-blue-50/70 border border-blue-100' :
                      'bg-slate-50 border border-slate-100'
                    }`}>
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none"
                            rows={3}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditComment(c.id!, commentDrawer!.scorecardId, commentDrawer!.rowId); }
                              if (e.key === 'Escape') { setEditingComment(null); setEditText(''); }
                            }}
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditComment(c.id!, commentDrawer!.scorecardId, commentDrawer!.rowId)}
                              className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >Save</button>
                            <button
                              onClick={() => { setEditingComment(null); setEditText(''); }}
                              className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                            >Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{c.text}</p>
                          {isEdited && (
                            <span className="text-[10px] text-slate-400 italic mt-1 block">edited</span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Edit / Delete — always visible for own comments (no hover-only) */}
                    {c.isOwn && c.id && !isEditing && (
                      <div className="ml-8 flex gap-1 mt-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingComment({ id: c.id!, scorecardId: commentDrawer!.scorecardId, rowId: commentDrawer!.rowId }); setEditText(c.text); }}
                          className="text-[11px] font-medium text-slate-400 hover:text-blue-600 transition-colors px-2 py-0.5 rounded-md hover:bg-blue-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteComment(c.id!, commentDrawer!.scorecardId, commentDrawer!.rowId); }}
                          className="text-[11px] font-medium text-slate-400 hover:text-red-600 transition-colors px-2 py-0.5 rounded-md hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Input Area */}
            <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4">
              <div className="flex items-end gap-2">
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Write a note..."
                  className="flex-1 text-sm border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-slate-50 placeholder-slate-400 min-h-[44px]"
                  rows={2}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddNote(commentDrawer!.scorecardId, commentDrawer!.rowId);
                    }
                  }}
                />
                <button
                  onClick={() => handleAddNote(commentDrawer!.scorecardId, commentDrawer!.rowId)}
                  disabled={!noteText.trim() || submittingNote}
                  className="shrink-0 w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Send note"
                >
                  {submittingNote ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 ml-1">Enter to send &middot; Shift+Enter for new line</p>
            </div>
          </div>
        </div>
      )}

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
