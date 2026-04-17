'use client';

import { useEffect, useState, useRef, useCallback, Fragment } from 'react';
import { toast, Toaster } from 'sonner';
import PortalNotificationBell from '@/components/portal/PortalNotificationBell';
import { LogoMark } from '@/components/layout/Logo';
import PhotoLightbox from '@/components/admin/PhotoLightbox';
import MasterScorecard from '@/components/admin/MasterScorecard';
import ConfirmDialog from '@/components/portal/ConfirmDialog';
import WeeklySummaryCard from '@/components/portal/WeeklySummaryCard';

interface Product { name: string; status: string; }
interface RetailerInfo { priority: string; buyer: string; storeCount: number; hqLocation: string; contact: string; }
interface Comment { id?: string; text: string; author: string; date: string; isOwn?: boolean; }
interface Retailer { rowId: string; retailerName: string; products: Product[]; retailerInfo: RetailerInfo; comments?: Comment[]; notes?: string; }
interface Scorecard { id: string; scorecardName: string; retailers: Retailer[]; }
interface Summary { totalRetailers: number; authorized: number; inProcess: number; buyerPassed: number; presented: number; other: number; }
interface MarketVisit { id: string; photo_url: string; visit_date: string; store_name: string; address: string; note: string; brands?: string[]; comments?: Comment[]; }
interface DashboardData { brand: string; contactName: string; scorecards: Scorecard[]; summary: Summary; }
interface WeeklySummaryPayload { weekOf: string; markdown: string; stats: { visitCount?: number; storeCount?: number; statusChangeCount?: number; scorecardNoteCount?: number }; generatedAt: string; }

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
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'scorecard' | 'visits'>('overview');
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [addingNoteFor, setAddingNoteFor] = useState<{ scorecardId: string; rowId: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [editingComment, setEditingComment] = useState<{ id: string; scorecardId: string; rowId: string } | null>(null);
  const [editText, setEditText] = useState('');
  const [photoCommentText, setPhotoCommentText] = useState<Record<string, string>>({});
  const [submittingPhotoComment, setSubmittingPhotoComment] = useState<string | null>(null);
  const [editingVisitCommentId, setEditingVisitCommentId] = useState<string | null>(null);
  const [editVisitText, setEditVisitText] = useState('');
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description?: string;
    confirmLabel?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [highlight, setHighlight] = useState<
    | { kind: 'row'; scorecardId: string; rowId: string }
    | { kind: 'visit'; visitId: string }
    | null
  >(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshData = useCallback(async () => {
    const [dashData, visitData, summaryData] = await Promise.all([
      fetch('/api/portal/dashboard', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
      fetch('/api/portal/market-visits', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/portal/weekly-summary', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
    ]);
    if (dashData) setData(dashData);
    const freshVisits = Array.isArray(visitData) ? visitData : [];
    setVisits(freshVisits);
    setWeeklySummary(summaryData?.summary || null);
    return { dashData, visits: freshVisits };
  }, []);

  useEffect(() => {
    refreshData()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshData]);

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

  const handleDeleteComment = (commentId: string, scorecardId: string, rowId: string) => {
    setConfirmState({
      title: 'Delete note?',
      description: 'This note will be permanently removed. This action cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
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
        setConfirmState(null);
      },
    });
  };

  const handleAddPhotoComment = async (visitId: string, storeName: string) => {
    const text = photoCommentText[visitId]?.trim();
    if (!text || submittingPhotoComment) return;
    setSubmittingPhotoComment(visitId);
    try {
      const scorecardId = data?.scorecards?.[0]?.id;
      if (!scorecardId) {
        toast.error('No scorecard available for comments');
        return;
      }
      const res = await fetch('/api/portal/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scorecard_id: scorecardId, row_id: storeName, text, store_name: storeName }),
      });
      if (!res.ok) throw new Error('Failed to add comment');
      const newComment = await res.json();
      // Optimistically append to the visit's comment thread
      setVisits(prev => prev.map(v => {
        if (v.id !== visitId) return v;
        return {
          ...v,
          comments: [
            ...(v.comments || []),
            {
              id: newComment.id,
              text: newComment.text || text,
              author: newComment.author || 'You',
              date: newComment.created_at || new Date().toISOString(),
              isOwn: true,
            },
          ],
        };
      }));
      setPhotoCommentText(prev => ({ ...prev, [visitId]: '' }));
      toast.success('Comment sent');
    } catch {
      toast.error('Could not send comment. Please try again.');
    } finally {
      setSubmittingPhotoComment(null);
    }
  };

  const handleEditVisitComment = async (commentId: string, visitId: string) => {
    const trimmed = editVisitText.trim();
    if (!trimmed) return;
    try {
      const res = await fetch('/api/portal/comments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: commentId, text: trimmed }),
      });
      if (!res.ok) throw new Error();
      setVisits(prev => prev.map(v => {
        if (v.id !== visitId) return v;
        return { ...v, comments: v.comments?.map(c => c.id === commentId ? { ...c, text: trimmed } : c) };
      }));
      setEditingVisitCommentId(null);
      setEditVisitText('');
      toast.success('Comment updated');
    } catch {
      toast.error('Could not update comment.');
    }
  };

  const handleDeleteVisitComment = (commentId: string, visitId: string) => {
    setConfirmState({
      title: 'Delete comment?',
      description: 'This comment will be permanently removed. This action cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/portal/comments?id=${commentId}`, {
            method: 'DELETE',
            credentials: 'include',
          });
          if (!res.ok) throw new Error();
          setVisits(prev => prev.map(v => {
            if (v.id !== visitId) return v;
            return { ...v, comments: v.comments?.filter(c => c.id !== commentId) };
          }));
          toast.success('Comment deleted');
        } catch {
          toast.error('Could not delete comment.');
        }
        setConfirmState(null);
      },
    });
  };

  const handleNotificationClick = async ({
    scorecardId,
    rowId,
    storeName,
    actionType,
  }: {
    scorecardId: string;
    rowId: string;
    storeName?: string | null;
    actionType: string;
  }) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);

    // Refresh so the newly-added comment is in local state before we scroll to it.
    // Without this, the row's comments thread may not yet be rendered (initial
    // fetch happened at mount, possibly before the admin wrote the note).
    const fresh = await refreshData().catch(() => null);
    const visitList = fresh?.visits ?? visits;

    const isMarketVisit = actionType === 'market_visit_comment_added';
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const matchStore = storeName ? norm(storeName) : '';
    const matchingVisit = isMarketVisit
      ? visitList.find(v => v.store_name && norm(v.store_name) === matchStore)
        ?? visitList.find(v => v.store_name && matchStore && (norm(v.store_name).includes(matchStore) || matchStore.includes(norm(v.store_name))))
      : null;

    // Double rAF ensures the freshly-set state has rendered to the DOM before
    // we scroll — otherwise the comment row may not exist yet.
    const scrollTo = (id: string) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      });
    };

    if (isMarketVisit && matchingVisit) {
      setActiveTab('visits');
      setHighlight({ kind: 'visit', visitId: matchingVisit.id });
      scrollTo(`visit-${matchingVisit.id}`);
    } else {
      setActiveTab('overview');
      setHighlight({ kind: 'row', scorecardId, rowId: String(rowId) });
      scrollTo(`row-${scorecardId}-${rowId}`);
    }

    highlightTimerRef.current = setTimeout(() => setHighlight(null), 3500);
  };

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/log-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'logout' }) }).catch(() => {});
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/auth/login';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-200 animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-36 bg-slate-200 rounded animate-pulse" />
                <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
              </div>
            </div>
            <div className="h-8 w-8 rounded-full bg-slate-100 animate-pulse" />
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-white border border-slate-200 px-4 py-3 space-y-2">
                <div className="h-6 w-10 bg-slate-200 rounded animate-pulse" />
                <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
          <div className="h-9 w-80 rounded-lg bg-slate-100 animate-pulse" />
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 w-full bg-slate-50 rounded-lg animate-pulse" />
            ))}
          </div>
        </main>
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Toaster position="top-right" richColors closeButton />
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-3 group" title="Go to 3Brothers Marketing">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 group-hover:border-blue-200 transition-colors">
                <LogoMark size={28} />
              </div>
              <div className="leading-tight">
                <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">{brand}</h1>
                <p className="text-xs text-slate-500">Welcome back, <span className="text-slate-700 font-medium">{contactName}</span></p>
              </div>
            </a>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <PortalNotificationBell onNotificationClick={handleNotificationClick} />
            <div className="h-5 w-px bg-slate-200 hidden sm:block" />
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
              </svg>
              <span className="hidden sm:inline">Sign out</span>
            </button>
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
        <div className="inline-flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('overview')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'overview' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
            </svg>
            Product Status
          </button>
          <button
            onClick={() => setActiveTab('scorecard')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'scorecard' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
            Master Scorecard
          </button>
          <button
            onClick={() => setActiveTab('visits')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'visits' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.822 1.316Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
            </svg>
            Market Visits
            {visits.length > 0 && (
              <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${activeTab === 'visits' ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700'}`}>{visits.length}</span>
            )}
          </button>
        </div>

        {/* Product Status Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <WeeklySummaryCard summary={weeklySummary} />
            {scorecards.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 flex items-center justify-center mb-4">
                  <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-800">No scorecards assigned yet</h3>
                <p className="text-xs text-slate-500 mt-1">Your broker will set this up shortly.</p>
              </div>
            ) : scorecards.map(sc => (
              <div key={sc.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
                          <tr
                            id={`row-${sc.id}-${r.rowId}`}
                            className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors duration-500 ${
                              highlight?.kind === 'row' && highlight.scorecardId === sc.id && highlight.rowId === String(r.rowId)
                                ? 'bg-amber-50'
                                : ''
                            }`}
                          >
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
                            <tr
                              className={`transition-colors duration-500 ${
                                highlight?.kind === 'row' && highlight.scorecardId === sc.id && highlight.rowId === String(r.rowId)
                                  ? 'bg-amber-50'
                                  : 'bg-slate-50/80'
                              }`}
                            >
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
                                    const mv = c.text.match(/^\[Market Visit\s+[\u2014\u2013-]\s+(\d{4}-\d{2}-\d{2})(?:\s+[·\u00B7]\s+([^\]]+))?\]\s*([\s\S]*)$/);
                                    const mvStore = mv?.[2]?.trim() || null;
                                    const displayText = mv ? (mv[3] || '').trim() : c.text;
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
                                          {/* Market-visit store pill */}
                                          {mvStore && !isEditing && (
                                            <div className={`flex items-center gap-1 mb-1 ${c.isOwn ? 'justify-end' : ''}`}>
                                              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${c.isOwn ? 'bg-blue-500/40 text-blue-50' : 'bg-slate-100 text-slate-600 border border-slate-200'}`} title={`Market visit at ${mvStore}`}>
                                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                                                </svg>
                                                {mvStore}
                                              </span>
                                            </div>
                                          )}
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
                                            <p className={`text-sm leading-relaxed ${c.isOwn ? 'text-white' : 'text-slate-700'}`}>{displayText}</p>
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
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 flex items-center justify-center mb-4">
                  <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-800">No market visits yet</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">When your broker visits a store carrying <span className="font-medium text-slate-700">{brand}</span> products, photos and notes will show up here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedVisits.map(v => {
                  const visitComments = v.comments || [];
                  const isSending = submittingPhotoComment === v.id;
                  const pendingText = photoCommentText[v.id] || '';
                  return (
                  <div
                    key={v.id}
                    id={`visit-${v.id}`}
                    className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all overflow-hidden group flex flex-col ${
                      highlight?.kind === 'visit' && highlight.visitId === v.id
                        ? 'border-amber-400 ring-2 ring-amber-300'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {v.photo_url ? (
                      <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={v.photo_url}
                          alt={v.store_name || 'Market visit'}
                          className="w-full h-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-[1.03]"
                          onClick={() => setLightbox({ src: v.photo_url, alt: v.store_name || 'Market visit' })}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                        <div className="absolute bottom-2 left-2 right-12 pointer-events-none">
                          <p className="text-white text-[11px] font-medium drop-shadow-md">
                            {new Date(v.visit_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                        <a
                          href={v.photo_url}
                          download={`${(v.store_name || 'visit').replace(/[^a-zA-Z0-9_-]/g, '_')}_${v.visit_date}.jpg`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                          title="Download photo"
                          aria-label="Download photo"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12M12 16.5V3" /></svg>
                        </a>
                      </div>
                    ) : (
                      <div className="aspect-[4/3] bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
                        <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z" />
                        </svg>
                      </div>
                    )}
                    <div className="p-4 flex flex-col gap-2 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-slate-900 text-sm leading-tight">{v.store_name || 'Store Visit'}</h4>
                        {v.brands && v.brands.filter(b => b === brand).length > 0 && (
                          <span className="shrink-0 text-[10px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">{brand}</span>
                        )}
                      </div>
                      {v.address && (
                        <div className="flex items-start gap-1.5 text-xs text-slate-500">
                          <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                          </svg>
                          <span className="leading-snug">{v.address}</span>
                        </div>
                      )}
                      {v.note && (
                        <div className="bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2 text-sm text-slate-700 leading-snug">
                          <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Visit Note</p>
                          {v.note}
                        </div>
                      )}

                      {/* Comment thread */}
                      {visitComments.length > 0 && (
                        <div className="mt-1 space-y-1.5 border-t border-slate-100 pt-2.5">
                          {visitComments.map((c, ci) => {
                            const initial = (c.author || '?')[0].toUpperCase();
                            const isEditing = !!c.id && editingVisitCommentId === c.id;
                            return (
                              <div key={c.id || ci} className={`flex items-start gap-1.5 group/vcomment ${c.isOwn ? 'flex-row-reverse' : ''}`}>
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold ${c.isOwn ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                  {initial}
                                </div>
                                <div className={`max-w-[85%] flex flex-col ${c.isOwn ? 'items-end' : 'items-start'}`}>
                                  <div className={`rounded-xl px-2.5 py-1.5 text-xs leading-snug ${c.isOwn ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-slate-100 text-slate-700 rounded-tl-sm'}`}>
                                    <div className={`flex items-center gap-1.5 mb-0.5 ${c.isOwn ? 'justify-end' : ''}`}>
                                      <span className={`text-[10px] font-semibold ${c.isOwn ? 'text-blue-100' : 'text-slate-700'}`}>{c.author}</span>
                                      <span className={`text-[9px] ${c.isOwn ? 'text-blue-200' : 'text-slate-400'}`}>
                                        {new Date(c.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                      </span>
                                    </div>
                                    {isEditing ? (
                                      <div className="flex flex-col gap-1 mt-0.5">
                                        <input
                                          type="text"
                                          value={editVisitText}
                                          onChange={e => setEditVisitText(e.target.value)}
                                          className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full bg-white"
                                          autoFocus
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') handleEditVisitComment(c.id!, v.id);
                                            if (e.key === 'Escape') { setEditingVisitCommentId(null); setEditVisitText(''); }
                                          }}
                                        />
                                        <div className="flex items-center gap-1.5 justify-end">
                                          <button onClick={() => handleEditVisitComment(c.id!, v.id)} className="text-[10px] font-medium text-white bg-blue-800/60 hover:bg-blue-900/70 px-2 py-0.5 rounded transition-colors">Save</button>
                                          <button onClick={() => { setEditingVisitCommentId(null); setEditVisitText(''); }} className="text-[10px] font-medium text-blue-100 hover:text-white px-2 py-0.5 rounded transition-colors">Cancel</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className={c.isOwn ? 'text-white' : 'text-slate-700'}>{c.text}</p>
                                    )}
                                  </div>
                                  {c.isOwn && c.id && !isEditing && (
                                    <div className="flex gap-1 mt-0.5 opacity-0 group-hover/vcomment:opacity-100 transition-opacity justify-end">
                                      <button
                                        onClick={() => { setEditingVisitCommentId(c.id!); setEditVisitText(c.text); }}
                                        className="text-slate-400 hover:text-blue-600 transition-colors p-0.5 rounded"
                                        title="Edit comment"
                                        aria-label="Edit comment"
                                      >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                                      </button>
                                      <button
                                        onClick={() => handleDeleteVisitComment(c.id!, v.id)}
                                        className="text-slate-400 hover:text-red-600 transition-colors p-0.5 rounded"
                                        title="Delete comment"
                                        aria-label="Delete comment"
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
                      )}

                      {/* Comment input */}
                      <div className="mt-auto pt-2">
                        <div className="flex items-end gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent focus-within:bg-white transition-all">
                          <input
                            type="text"
                            value={pendingText}
                            onChange={(e) => setPhotoCommentText(prev => ({ ...prev, [v.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleAddPhotoComment(v.id, v.store_name || 'Store Visit');
                              }
                            }}
                            placeholder="Add a comment..."
                            className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none py-0.5"
                            disabled={isSending}
                            aria-label={`Add a comment to ${v.store_name || 'this visit'}`}
                          />
                          <button
                            onClick={() => handleAddPhotoComment(v.id, v.store_name || 'Store Visit')}
                            disabled={!pendingText.trim() || isSending}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                            title="Send comment"
                            aria-label="Send comment"
                          >
                            {isSending ? (
                              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
      {lightbox && <PhotoLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ''}
        description={confirmState?.description}
        confirmLabel={confirmState?.confirmLabel ?? 'Delete'}
        destructive
        onConfirm={() => { confirmState?.onConfirm(); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const palette: Record<string, { iconBg: string; iconColor: string; dot: string; icon: React.ReactNode }> = {
    slate: {
      iconBg: 'bg-slate-100', iconColor: 'text-slate-600', dot: 'bg-slate-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />,
    },
    green: {
      iconBg: 'bg-green-50', iconColor: 'text-green-600', dot: 'bg-green-500',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
    },
    blue: {
      iconBg: 'bg-blue-50', iconColor: 'text-blue-600', dot: 'bg-blue-500',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
    },
    purple: {
      iconBg: 'bg-purple-50', iconColor: 'text-purple-600', dot: 'bg-purple-500',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />,
    },
    red: {
      iconBg: 'bg-red-50', iconColor: 'text-red-600', dot: 'bg-red-500',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />,
    },
    gray: {
      iconBg: 'bg-slate-50', iconColor: 'text-slate-500', dot: 'bg-slate-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1 .75 0 .375.375 0 0 1-.75 0Zm0 0H8.25m.375 0h.375m0 0H9m5.625 0a.375.375 0 1 1 .75 0 .375.375 0 0 1-.75 0Zm0 0h-.375m.375 0h.375m-.375 0H15m-5.625-2.25h.008v.008H9.375V7.5Zm5.25 0h.008v.008H14.625V7.5Z" />,
    },
  };
  const p = palette[color] || palette.slate;
  return (
    <div className="group relative rounded-xl bg-white border border-slate-200 px-4 py-3 hover:border-slate-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide truncate">{label}</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums mt-0.5">{value}</p>
        </div>
        <div className={`w-8 h-8 rounded-lg ${p.iconBg} flex items-center justify-center shrink-0`}>
          <svg className={`w-4 h-4 ${p.iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            {p.icon}
          </svg>
        </div>
      </div>
    </div>
  );
}
