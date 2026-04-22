'use client';

import { useEffect, useState, useRef, useCallback, useMemo, Fragment } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { toast, Toaster } from 'sonner';
import PortalNotificationBell from '@/components/portal/PortalNotificationBell';
import PortalInstallBanner from '@/components/pwa/PortalInstallBanner';
import { LogoMark } from '@/components/layout/Logo';
import PhotoLightbox from '@/components/admin/PhotoLightbox';
import MasterScorecard from '@/components/admin/MasterScorecard';
import ConfirmDialog from '@/components/portal/ConfirmDialog';
import WeeklySummaryCard from '@/components/portal/WeeklySummaryCard';
import { Capability, Role, hasCapability, isRole } from '../../../lib/rbac';

// Lazy-load the upload form — only roles with MARKET_VISITS_CREATE ever open
// it, and the form pulls EXIF + geolocation helpers that aren't worth shipping
// to read-only brand users on first paint.
const MarketVisitUpload = dynamic(() => import('@/components/admin/MarketVisitUpload'), { ssr: false });

interface Product { name: string; status: string; }
interface RetailerInfo { priority: string; buyer: string; storeCount: number; hqLocation: string; contact: string; }
interface Comment { id?: string; text: string; author: string; date: string; isOwn?: boolean; }
interface Retailer { rowId: string; retailerName: string; products: Product[]; retailerInfo: RetailerInfo; comments?: Comment[]; notes?: string; }
interface Scorecard { id: string; scorecardName: string; retailers: Retailer[]; }
interface Summary { totalRetailers: number; authorized: number; inProcess: number; buyerPassed: number; presented: number; other: number; otherBreakdown?: Record<string, number>; }
interface VisitAuthor { id: string; name: string; roleLabel: string | null; role: string | null; }
interface MarketVisit {
  id: string;
  photo_url: string;
  visit_date: string;
  store_name: string;
  address: string;
  note: string;
  brands?: string[];
  comments?: Comment[];
  author?: VisitAuthor;
  isOwn?: boolean;
  canEdit?: boolean;
}
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
    <span
      className="inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
      title={status}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
      {status}
    </span>
  );
}

export default function PortalDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [visits, setVisits] = useState<MarketVisit[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingVisit, setEditingVisit] = useState<MarketVisit | null>(null);
  const [editVisitForm, setEditVisitForm] = useState<{ store_name: string; address: string; visit_date: string; note: string } | null>(null);
  const [savingVisit, setSavingVisit] = useState(false);
  const canSeeScorecard = hasCapability(role, Capability.SCORECARD_READ);
  const canSeeMaster = hasCapability(role, Capability.MASTER_SCORECARD_READ);
  const canSeeVisits = hasCapability(role, Capability.MARKET_VISITS_READ);
  const canCreateVisits = hasCapability(role, Capability.MARKET_VISITS_CREATE);
  const [activeTab, setActiveTab] = useState<'overview' | 'scorecard' | 'visits'>('overview');
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [addingNoteFor, setAddingNoteFor] = useState<{ scorecardId: string; rowId: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [savingCommentEdit, setSavingCommentEdit] = useState(false);
  const [savingVisitCommentEdit, setSavingVisitCommentEdit] = useState(false);
  const [editingComment, setEditingComment] = useState<{ id: string; scorecardId: string; rowId: string } | null>(null);
  const [editText, setEditText] = useState('');
  const [photoCommentText, setPhotoCommentText] = useState<Record<string, string>>({});
  const [submittingPhotoComment, setSubmittingPhotoComment] = useState<string | null>(null);
  const [editingVisitCommentId, setEditingVisitCommentId] = useState<string | null>(null);
  const [editVisitText, setEditVisitText] = useState('');
  const [expandedVisitComments, setExpandedVisitComments] = useState<Set<string>>(new Set());
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
  const [visitsQuery, setVisitsQuery] = useState('');
  const [chainSearch, setChainSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | '7d' | '30d' | 'unread'>('all');
  const [sortMode, setSortMode] = useState<'default' | 'recent'>('default');
  // Per-row last-seen timestamps. Persisted to localStorage so unread state
  // survives reloads. Keyed by `${scorecardId}:${rowId}`. Note: localStorage
  // is per-browser, so unread state does not sync across devices — acceptable
  // for v1 since brand users typically check from one machine.
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, number>>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [visibleCountPerRow, setVisibleCountPerRow] = useState<Record<string, number>>({});
  // Per-store expansion inside an expanded Store Visits section.
  // Key: `${scorecardId}:${rowId}` -> Set of storeNames that are expanded.
  const [expandedStoresPerRow, setExpandedStoresPerRow] = useState<Record<string, Set<string>>>({});
  // Client UX: Chain Discussion + Store Visits are hidden per row until the
  // client opts in via the count pill. Keys: `${scorecardId}:${rowId}:chain`
  // and `${scorecardId}:${rowId}:store`. Empty set = everything collapsed.
  // Broker Notes remain visible always.
  const [discussionsVisibleRows, setDiscussionsVisibleRows] = useState<Set<string>>(new Set());
  const [pulseThread, setPulseThread] = useState<string | null>(null);
  const threadRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-expand the Chain Discussion thread AND Store Visits section when a
  // notification deep-links to a row. We don't know if the notification is chain-
  // or store-related, so open both so the user sees the full context immediately.
  // We leave the row expanded after the highlight clears — the user is reading.
  useEffect(() => {
    if (highlight?.kind === 'visit') {
      const vid = highlight.visitId;
      setExpandedVisitComments(prev => {
        if (prev.has(vid)) return prev;
        const next = new Set(prev);
        next.add(vid);
        return next;
      });
      return;
    }
    if (highlight?.kind !== 'row') return;
    const key = `${highlight.scorecardId}:${highlight.rowId}`;
    const storesKey = `${key}:stores`;
    setExpandedRows(prev => {
      if (prev.has(key) && prev.has(storesKey)) return prev;
      const next = new Set(prev);
      next.add(key);
      next.add(storesKey);
      return next;
    });
    // Also reveal both row-level discussion sections so the deep-linked thread
    // is visible without requiring a second tap (we don't know which kind).
    setDiscussionsVisibleRows(prev => {
      const chainK = `${key}:chain`;
      const storeK = `${key}:store`;
      if (prev.has(chainK) && prev.has(storeK)) return prev;
      const next = new Set(prev);
      next.add(chainK);
      next.add(storeK);
      return next;
    });
    // Brief ring pulse on the thread panel so the eye lands on the conversation.
    setPulseThread(key);
    const t = setTimeout(() => setPulseThread(curr => (curr === key ? null : curr)), 1500);
    // After the thread renders expanded, scroll the inner container to the latest message.
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = threadRefs.current[key];
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(rafId);
    };
  }, [highlight]);

  const refreshData = useCallback(async (effectiveRole: Role | null) => {
    const canScore = hasCapability(effectiveRole, Capability.SCORECARD_READ);
    const canVisit = hasCapability(effectiveRole, Capability.MARKET_VISITS_READ);
    const [dashData, visitData, summaryData] = await Promise.all([
      canScore ? fetch('/api/portal/dashboard', { credentials: 'include' }).then(r => r.ok ? r.json() : null) : Promise.resolve(null),
      canVisit ? fetch('/api/portal/market-visits', { credentials: 'include' }).then(r => r.ok ? r.json() : []) : Promise.resolve([]),
      canScore ? fetch('/api/portal/weekly-summary', { credentials: 'include' }).then(r => r.ok ? r.json() : null) : Promise.resolve(null),
    ]);
    if (dashData) setData(dashData);
    const freshVisits = Array.isArray(visitData) ? visitData : [];
    setVisits(freshVisits);
    setWeeklySummary(summaryData?.summary || null);
    return { dashData, visits: freshVisits };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me', { credentials: 'include' });
        const meData = meRes.ok ? await meRes.json() : null;
        const resolvedRole: Role | null = isRole(meData?.user?.role) ? meData.user.role : null;
        if (cancelled) return;
        setRole(resolvedRole);
        // Default tab: first one the role can see. Product Status (overview)
        // and Master Scorecard both require SCORECARD_READ, so a FIELD_SALES_REP
        // lands directly on the Market Visits tab.
        if (!hasCapability(resolvedRole, Capability.SCORECARD_READ)) {
          setActiveTab('visits');
        }
        await refreshData(resolvedRole);
      } catch { /* ignore */ }
      finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshData]);

  // Brand-scoped storage key for last-seen state. Scoping by brand prevents
  // cross-pollination if two brand users share a browser.
  const lastSeenStorageKey = useMemo(() => {
    const brand = (data?.brand || 'unknown').toLowerCase().replace(/\s+/g, '_');
    return `portal:lastSeen:${brand}`;
  }, [data?.brand]);

  // Hydrate lastSeen map once we know the brand.
  useEffect(() => {
    if (!data?.brand) return;
    try {
      const raw = window.localStorage.getItem(lastSeenStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') setLastSeenMap(parsed as Record<string, number>);
    } catch {
      // ignore — corrupt JSON, treat as empty
    }
  }, [data?.brand, lastSeenStorageKey]);

  // Mark a row as seen "now" and persist. Called when the user opens a thread.
  const markRowSeen = useCallback((scorecardId: string, rowId: string) => {
    const key = `${scorecardId}:${rowId}`;
    setLastSeenMap(prev => {
      const next = { ...prev, [key]: Date.now() };
      try { window.localStorage.setItem(lastSeenStorageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [lastSeenStorageKey]);

  // Latest comment timestamp on a row (any author). Returns 0 if none.
  const latestActivityTs = useCallback((comments?: Comment[]) => {
    if (!comments || comments.length === 0) return 0;
    let max = 0;
    for (const c of comments) {
      const t = new Date(c.date).getTime();
      if (!Number.isNaN(t) && t > max) max = t;
    }
    return max;
  }, []);

  // True if the row has any comment newer than the user's last-seen mark,
  // OR if there is activity but no last-seen mark yet.
  const isRowUnread = useCallback((scorecardId: string, rowId: string, comments?: Comment[]) => {
    const latest = latestActivityTs(comments);
    if (latest === 0) return false;
    const seen = lastSeenMap[`${scorecardId}:${rowId}`] ?? 0;
    return latest > seen;
  }, [lastSeenMap, latestActivityTs]);

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
    if (savingCommentEdit) return;
    if (!editText.trim()) return;
    setSavingCommentEdit(true);
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
    } catch { /* silent */ } finally {
      setSavingCommentEdit(false);
    }
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
      setExpandedVisitComments(prev => {
        if (prev.has(visitId)) return prev;
        const next = new Set(prev);
        next.add(visitId);
        return next;
      });
      toast.success('Comment sent');
    } catch {
      toast.error('Could not send comment. Please try again.');
    } finally {
      setSubmittingPhotoComment(null);
    }
  };

  const handleEditVisitComment = async (commentId: string, visitId: string) => {
    if (savingVisitCommentEdit) return;
    const trimmed = editVisitText.trim();
    if (!trimmed) return;
    setSavingVisitCommentEdit(true);
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
    } finally {
      setSavingVisitCommentEdit(false);
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
    const fresh = await refreshData(role).catch(() => null);
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

  const openEditVisit = (v: MarketVisit) => {
    setEditingVisit(v);
    setEditVisitForm({
      store_name: v.store_name || '',
      address: v.address || '',
      visit_date: v.visit_date || new Date().toISOString().split('T')[0],
      note: v.note || '',
    });
  };

  const handleSaveVisitEdit = async () => {
    if (!editingVisit || !editVisitForm || savingVisit) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editVisitForm.visit_date)) {
      toast.error('Invalid visit date');
      return;
    }
    setSavingVisit(true);
    try {
      const res = await fetch(`/api/market-visits/${editingVisit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          store_name: editVisitForm.store_name.trim(),
          address: editVisitForm.address.trim(),
          visit_date: editVisitForm.visit_date,
          note: editVisitForm.note.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || 'Failed to update visit');
        setSavingVisit(false);
        return;
      }
      setEditingVisit(null);
      setEditVisitForm(null);
      toast.success('Visit updated');
      await refreshData(role);
    } catch {
      toast.error('Failed to update visit');
    } finally {
      setSavingVisit(false);
    }
  };

  const handleDeleteVisit = (v: MarketVisit) => {
    setConfirmState({
      title: 'Delete this market visit?',
      description: 'The photo and note will be removed. This cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/market-visits/${v.id}`, {
            method: 'DELETE', credentials: 'include',
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            toast.error(body.error || 'Failed to delete visit');
            return;
          }
          toast.success('Visit deleted');
          await refreshData(role);
        } catch {
          toast.error('Failed to delete visit');
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

  const handleLogout = async () => {
    await fetch('/api/auth/log-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'logout' }) }).catch(() => {});
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/auth/login';
  };

  if (loading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-50">
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

  // Users with scorecard access need `data` to render the overview; users
  // without it (e.g. FIELD_SALES_REP) see only market visits and use a stub.
  if (!data && canSeeScorecard) {
    return (
      <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-slate-50 px-4 text-center">
        <p className="text-slate-500">Unable to load dashboard. Please try again.</p>
      </div>
    );
  }

  const { brand, contactName, scorecards, summary } = data ?? {
    brand: '',
    contactName: '',
    scorecards: [] as Scorecard[],
    summary: { totalRetailers: 0, authorized: 0, inProcess: 0, buyerPassed: 0, presented: 0, other: 0, otherBreakdown: {} },
  };

  // Sort market visits by first brand tag A-Z, then by visit date descending
  const sortedVisits = [...visits].sort((a, b) => {
    const brandA = (a.brands?.[0] || '').toLowerCase();
    const brandB = (b.brands?.[0] || '').toLowerCase();
    if (brandA !== brandB) return brandA.localeCompare(brandB);
    return new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime();
  });

  const trimmedVisitsQuery = visitsQuery.trim().toLowerCase();
  const filteredVisits = trimmedVisitsQuery
    ? sortedVisits.filter(v => {
        const haystack = [
          v.store_name,
          v.address,
          v.note,
          v.visit_date,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(trimmedVisitsQuery);
      })
    : sortedVisits;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gradient-to-b from-slate-50 to-white">
      <Toaster position="top-right" richColors closeButton />
      {/* Header */}
      <header
        className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 py-3 sm:py-3.5 flex items-center gap-2 sm:gap-3">
          <Link href="/" className="flex items-center gap-2 sm:gap-3 group min-w-0 flex-1" title="Go to 3Brothers Marketing">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 group-hover:border-blue-200 transition-colors flex-shrink-0">
              <LogoMark size={28} />
            </div>
            <div className="leading-tight min-w-0">
              <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight truncate">{brand}</h1>
              {/* Hide welcome line on mobile — narrow viewports would otherwise squeeze the right-side actions. */}
              <p className="hidden sm:block text-xs text-slate-500 truncate">Welcome back, <span className="text-slate-700 font-medium">{contactName}</span></p>
            </div>
          </Link>
          <div className="flex items-center gap-0.5 sm:gap-3 flex-shrink-0 ml-auto pr-1 sm:pr-0">
            <PortalNotificationBell onNotificationClick={handleNotificationClick} />
            <div className="h-5 w-px bg-slate-200 hidden sm:block" />
            <Link
              href="/portal/settings"
              aria-label="Settings"
              title="Settings"
              className="inline-flex items-center justify-center text-slate-600 hover:text-slate-900 rounded-lg [@media(hover:hover)]:hover:bg-slate-100 active:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex-shrink-0 w-11 h-11 sm:w-9 sm:h-9"
            >
              <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </Link>
            <button
              onClick={handleLogout}
              aria-label="Sign out"
              className="inline-flex items-center justify-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium rounded-lg [@media(hover:hover)]:hover:bg-slate-100 active:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex-shrink-0 w-11 h-11 sm:w-auto sm:h-auto sm:px-2.5 sm:py-1.5"
            >
              <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
              </svg>
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main
        className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6"
        style={{ paddingBottom: 'max(1.5rem, calc(1.5rem + env(safe-area-inset-bottom)))' }}
      >
        <PortalInstallBanner />
        {/* Summary Cards — only meaningful for roles with scorecard access */}
        {canSeeScorecard && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          <SummaryCard label="Total Customers" value={summary.totalRetailers} color="slate" />
          <SummaryCard label="Authorized" value={summary.authorized} color="green" />
          <SummaryCard label="In Process" value={summary.inProcess} color="blue" />
          <SummaryCard label="Presented" value={summary.presented} color="purple" />
          <SummaryCard label="Buyer Passed" value={summary.buyerPassed} color="red" />
          <OtherSummaryCard value={summary.other} breakdown={summary.otherBreakdown || {}} />
        </div>
        )}

        {/* Tab Nav */}
        <div className="overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0">
        <div className="inline-flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm whitespace-nowrap">
          {canSeeScorecard && (
          <button
            onClick={() => setActiveTab('overview')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'overview' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
            </svg>
            Product Status
          </button>
          )}
          {canSeeMaster && (
          <button
            onClick={() => setActiveTab('scorecard')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'scorecard' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
            Master Scorecard
          </button>
          )}
          {canSeeVisits && (
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
          )}
        </div>
        </div>

        {/* Product Status Tab */}
        {activeTab === 'overview' && (() => {
          // Aggregate unread count across every retailer in every scorecard.
          // Drives the badge inside the filter bar so the brand user can see
          // at a glance how many chains have new activity since they last looked.
          let totalUnread = 0;
          for (const sc of scorecards) {
            for (const r of sc.retailers) {
              if (isRowUnread(sc.id, r.rowId, r.comments)) totalUnread++;
            }
          }
          const isFiltering = chainSearch.trim() !== '' || activityFilter !== 'all' || sortMode !== 'default';
          const resetFilters = () => {
            setChainSearch('');
            setActivityFilter('all');
            setSortMode('default');
          };
          return (
          <div className="space-y-6">
            <WeeklySummaryCard summary={weeklySummary} />
            {scorecards.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-col lg:flex-row lg:items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-0 lg:max-w-sm">
                  <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                  <input
                    type="search"
                    value={chainSearch}
                    onChange={e => setChainSearch(e.target.value)}
                    placeholder="Search chains…"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    aria-label="Search chains"
                  />
                  {chainSearch && (
                    <button
                      type="button"
                      onClick={() => setChainSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md"
                      aria-label="Clear search"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {/* Activity filter pills */}
                <div className="inline-flex items-center bg-slate-100 rounded-xl p-0.5 shrink-0">
                  {([
                    { key: 'all',    label: 'All' },
                    { key: 'unread', label: 'Unread', count: totalUnread },
                    { key: '7d',     label: 'Last 7d' },
                    { key: '30d',    label: 'Last 30d' },
                  ] as const).map(opt => {
                    const active = activityFilter === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setActivityFilter(opt.key)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        aria-pressed={active}
                      >
                        {opt.label}
                        {'count' in opt && opt.count !== undefined && opt.count > 0 && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${active ? 'bg-blue-50 text-blue-700' : 'bg-blue-600 text-white'}`}>{opt.count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Sort */}
                <div className="flex items-center gap-2 shrink-0">
                  <label htmlFor="portal-sort" className="text-xs font-medium text-slate-500">Sort</label>
                  <select
                    id="portal-sort"
                    value={sortMode}
                    onChange={e => setSortMode(e.target.value as 'default' | 'recent')}
                    className="bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="default">Default order</option>
                    <option value="recent">Most recent activity</option>
                  </select>
                </div>
                {isFiltering && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors lg:ml-auto"
                  >
                    Reset
                  </button>
                )}
              </div>
            )}
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
            ) : scorecards.map(sc => {
              // Apply search/activity filter and sort to this scorecard's retailers.
              const q = chainSearch.trim().toLowerCase();
              const now = Date.now();
              const windowMs = activityFilter === '7d' ? 7 * 24 * 60 * 60 * 1000
                : activityFilter === '30d' ? 30 * 24 * 60 * 60 * 1000
                : 0;
              const visibleRetailers = sc.retailers.filter(r => {
                if (q && !r.retailerName.toLowerCase().includes(q)) return false;
                if (activityFilter === 'unread' && !isRowUnread(sc.id, r.rowId, r.comments)) return false;
                if (windowMs > 0) {
                  const latest = latestActivityTs(r.comments);
                  if (latest === 0 || now - latest > windowMs) return false;
                }
                return true;
              });
              if (sortMode === 'recent') {
                visibleRetailers.sort((a, b) => latestActivityTs(b.comments) - latestActivityTs(a.comments));
              }
              return (
              <div key={sc.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 rounded-t-2xl flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">{sc.scorecardName}</h3>
                    <p className="text-xs text-slate-400">
                      {visibleRetailers.length === sc.retailers.length
                        ? `${sc.retailers.length} customer${sc.retailers.length !== 1 ? 's' : ''}`
                        : `${visibleRetailers.length} of ${sc.retailers.length} customer${sc.retailers.length !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-b-2xl">
                  {visibleRetailers.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                      <p className="text-sm text-slate-500">No chains match your filters.</p>
                    </div>
                  ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-3 sm:px-4 py-2.5 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide">Chain</th>
                        {sc.retailers[0]?.products.map(p => (
                          <th key={p.name} className="text-left px-2 sm:px-4 py-2.5 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide">{p.name}</th>
                        ))}
                        <th className="hidden sm:table-cell text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Priority</th>
                        <th className="hidden sm:table-cell text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Buyer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRetailers.map((r, i) => {
                        const isAddingNote = addingNoteFor?.scorecardId === sc.id && addingNoteFor?.rowId === r.rowId;
                        // Split r.comments into chain-level vs store-visit-level to drive both
                        // the header indicators and the expanded thread panel below.
                        const mvRegexRow = /^\[Market Visit\s+[\u2014\u2013-]\s+(\d{4}-\d{2}-\d{2})(?:\s+[·\u00B7]\s+([^\]]+))?\]\s*([\s\S]*)$/;
                        let chainNoteCount = 0;
                        let storeNoteCount = 0;
                        (r.comments || []).forEach(c => {
                          if (mvRegexRow.test(c.text)) storeNoteCount++;
                          else chainNoteCount++;
                        });
                        const rowBaseKey = `${sc.id}:${r.rowId}`;
                        const chainKey = `${rowBaseKey}:chain`;
                        const storeKey = `${rowBaseKey}:store`;
                        const chainOpen = discussionsVisibleRows.has(chainKey);
                        const storeOpen = discussionsVisibleRows.has(storeKey);
                        const toggleSection = (key: string) => {
                          setDiscussionsVisibleRows(prev => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          });
                        };
                        const toggleChainSection = () => toggleSection(chainKey);
                        const toggleStoreSection = () => toggleSection(storeKey);
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
                            <td className="px-3 sm:px-4 py-3 align-top">
                              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                <span className="font-semibold text-slate-900 text-sm sm:text-base leading-tight">{r.retailerName}</span>
                                {chainNoteCount > 0 && (
                                  <button
                                    type="button"
                                    onClick={toggleChainSection}
                                    aria-expanded={chainOpen}
                                    aria-label={`${chainOpen ? 'Hide' : 'Show'} chain discussion (${chainNoteCount} ${chainNoteCount === 1 ? 'note' : 'notes'})`}
                                    title={`${chainNoteCount} chain ${chainNoteCount === 1 ? 'note' : 'notes'}`}
                                    className={`inline-flex items-center gap-1 text-[11px] font-semibold border px-1.5 py-0.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                      chainOpen
                                        ? 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'
                                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 hover:border-slate-300'
                                    }`}
                                  >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                                    </svg>
                                    {chainNoteCount}
                                  </button>
                                )}
                                {storeNoteCount > 0 && (
                                  <button
                                    type="button"
                                    onClick={toggleStoreSection}
                                    aria-expanded={storeOpen}
                                    aria-label={`${storeOpen ? 'Hide' : 'Show'} store visits (${storeNoteCount} ${storeNoteCount === 1 ? 'note' : 'notes'})`}
                                    title={`${storeNoteCount} store visit ${storeNoteCount === 1 ? 'note' : 'notes'}`}
                                    className={`inline-flex items-center gap-1 text-[11px] font-semibold border px-1.5 py-0.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                                      storeOpen
                                        ? 'bg-teal-100 text-teal-800 border-teal-300 hover:bg-teal-200'
                                        : 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100 hover:border-teal-300'
                                    }`}
                                  >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                    </svg>
                                    {storeNoteCount}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isAddingNote) {
                                      setAddingNoteFor(null);
                                      setNoteText('');
                                    } else {
                                      setAddingNoteFor({ scorecardId: sc.id, rowId: r.rowId });
                                      setNoteText('');
                                    }
                                  }}
                                  aria-expanded={isAddingNote}
                                  aria-label={isAddingNote ? 'Close add note' : 'Add a note'}
                                  title={isAddingNote ? 'Close add note' : 'Add a note'}
                                  className={`hidden sm:inline-flex items-center justify-center w-6 h-6 min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0 border rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                    isAddingNote
                                      ? 'bg-slate-700 text-white border-slate-700 hover:bg-slate-800 hover:border-slate-800'
                                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 hover:text-slate-800 hover:border-slate-300'
                                  }`}
                                >
                                  <svg className={`w-3 h-3 transition-transform ${isAddingNote ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                  </svg>
                                </button>
                              </div>
                              {(r.retailerInfo.priority || r.retailerInfo.buyer) && (
                                <div className="sm:hidden mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                                  {r.retailerInfo.priority && (
                                    <span className="inline-flex items-center gap-1">
                                      <span className="text-slate-400 uppercase tracking-wider text-[9px] font-semibold">Pri</span>
                                      <span className="text-slate-700 font-medium">{r.retailerInfo.priority}</span>
                                    </span>
                                  )}
                                  {r.retailerInfo.priority && r.retailerInfo.buyer && (
                                    <span className="text-slate-300" aria-hidden="true">·</span>
                                  )}
                                  {r.retailerInfo.buyer && (
                                    <span className="inline-flex items-center gap-1 min-w-0">
                                      <span className="text-slate-400 uppercase tracking-wider text-[9px] font-semibold shrink-0">Buyer</span>
                                      <span className="text-slate-700 font-medium truncate">{r.retailerInfo.buyer}</span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            {r.products.map(p => (
                              <td key={p.name} className="px-2 sm:px-4 py-3 align-top"><StatusBadge status={p.status} /></td>
                            ))}
                            <td className="hidden sm:table-cell px-4 py-3 text-slate-600 align-top">{r.retailerInfo.priority}</td>
                            <td className="hidden sm:table-cell px-4 py-3 text-slate-600 align-top">{r.retailerInfo.buyer}</td>
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
                                  <div className="flex flex-col sm:flex-row sm:items-end gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
                                    <textarea
                                      ref={(el) => {
                                        if (el && noteText) {
                                          el.style.height = 'auto';
                                          el.style.height = Math.min(el.scrollHeight, 280) + 'px';
                                        }
                                      }}
                                      value={noteText}
                                      onChange={(e) => {
                                        setNoteText(e.target.value);
                                        const el = e.currentTarget;
                                        el.style.height = 'auto';
                                        el.style.height = Math.min(el.scrollHeight, 280) + 'px';
                                      }}
                                      placeholder="Type your note... (Enter to send, Shift+Enter for new line)"
                                      className="flex-1 text-sm text-slate-700 placeholder-slate-400 resize-none focus:outline-none bg-transparent min-h-[44px] max-h-72 leading-snug"
                                      rows={2}
                                      autoFocus
                                      onFocus={(e) => {
                                        try { e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
                                      }}
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
                                    <div className="flex items-center gap-2 shrink-0 justify-end sm:pb-0.5">
                                      <button
                                        onClick={() => { setAddingNoteFor(null); setNoteText(''); }}
                                        className="px-4 py-2 min-h-[40px] text-sm sm:text-xs font-medium text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => handleAddNote(sc.id, r.rowId)}
                                        disabled={!noteText.trim() || submittingNote}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-sm sm:text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                      >
                                        {submittingNote ? (
                                          <>
                                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                            Sending
                                          </>
                                        ) : (
                                          <>
                                            Send
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
                          {/* Notes and comments row - differentiated by type.
                              Desktop (>=sm) behavior is unchanged. On mobile (<sm), when there
                              are only chain/store comments (no Broker Notes) and the client
                              hasn't toggled discussions open, the tr hides via `max-sm:hidden`
                              below so the page stays clean. */}
                          {((r.comments?.length ?? 0) > 0 || r.notes) && (() => {
                            const mvRegex = /^\[Market Visit\s+[\u2014\u2013-]\s+(\d{4}-\d{2}-\d{2})(?:\s+[·\u00B7]\s+([^\]]+))?\]\s*([\s\S]*)$/;
                            type ParsedComment = { c: Comment; mvStore: string | null; mvDate: string | null; displayText: string };
                            const parsed: ParsedComment[] = (r.comments || []).map(c => {
                              const m = c.text.match(mvRegex);
                              return {
                                c,
                                mvStore: m?.[2]?.trim() || null,
                                mvDate: m?.[1] || null,
                                displayText: m ? (m[3] || '').trim() : c.text,
                              };
                            });
                            const storeNotes = parsed.filter(p => p.mvStore);
                            const chainNotes = parsed.filter(p => !p.mvStore);
                            // Group store notes by store name for visual clustering
                            const storeGroups = new Map<string, ParsedComment[]>();
                            storeNotes.forEach(p => {
                              const key = p.mvStore!;
                              const arr = storeGroups.get(key) || [];
                              arr.push(p);
                              storeGroups.set(key, arr);
                            });
                            const expandKey = `${sc.id}:${r.rowId}`;
                            const isExpanded = expandedRows.has(expandKey);
                            // Decide whether to show section headers: only when more than one category is present
                            const categoryCount = (r.notes ? 1 : 0) + (storeNotes.length > 0 ? 1 : 0) + (chainNotes.length > 0 ? 1 : 0);
                            const showHeaders = categoryCount > 1;
                            const toggleExpand = () => {
                              setExpandedRows(prev => {
                                const next = new Set(prev);
                                if (next.has(expandKey)) next.delete(expandKey);
                                else {
                                  next.add(expandKey);
                                  // Opening the thread counts as "seeing" the latest activity.
                                  // Persists to localStorage so the unread badge clears across reloads.
                                  markRowSeen(sc.id, r.rowId);
                                }
                                return next;
                              });
                            };
                            const rowUnread = isRowUnread(sc.id, r.rowId, r.comments);
                            const SectionHeader = ({ label }: { label: string }) => {
                              // Accent dot is color-keyed per section so the eye can lock on to each group quickly.
                              const dot =
                                label === 'Chain Discussion'
                                  ? 'bg-blue-500'
                                  : label === 'Store Visits'
                                  ? 'bg-teal-500'
                                  : label === 'Broker Summary'
                                  ? 'bg-amber-500'
                                  : 'bg-slate-400';
                              return (
                                <div className="flex items-center gap-1.5 mt-3 mb-0.5 first:mt-1 pl-0.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
                                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.12em]">{label}</span>
                                  <span className="flex-1 h-px bg-slate-200/80" aria-hidden="true" />
                                </div>
                              );
                            };
                            // Chain Discussion header summary — always computed cheaply.
                            const chainCount = chainNotes.length;
                            const lastChain = chainCount > 0 ? chainNotes[chainNotes.length - 1] : null;
                            const relativeTime = (iso: string) => {
                              const then = new Date(iso).getTime();
                              if (Number.isNaN(then)) return '';
                              const diffMs = Date.now() - then;
                              const sec = Math.max(0, Math.floor(diffMs / 1000));
                              if (sec < 60) return 'just now';
                              const min = Math.floor(sec / 60);
                              if (min < 60) return `${min}m ago`;
                              const hr = Math.floor(min / 60);
                              if (hr < 24) return `${hr}h ago`;
                              const day = Math.floor(hr / 24);
                              if (day < 7) return `${day}d ago`;
                              const wk = Math.floor(day / 7);
                              if (wk < 5) return `${wk}w ago`;
                              const mo = Math.floor(day / 30);
                              if (mo < 12) return `${mo}mo ago`;
                              return `${Math.floor(day / 365)}y ago`;
                            };
                            const truncate = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
                            const PER_PAGE = 30;
                            const visibleCount = visibleCountPerRow[expandKey] ?? PER_PAGE;
                            const loadOlder = () => {
                              setVisibleCountPerRow(prev => ({ ...prev, [expandKey]: (prev[expandKey] ?? PER_PAGE) + PER_PAGE }));
                            };
                            // Hide the whole activity tr when there are no Broker Notes and
                            // the client hasn't opened either the Chain or Store section via
                            // the count pills — keeps the landing quiet on both mobile and
                            // desktop until the client opts in.
                            const hideRow = !r.notes && !chainOpen && !storeOpen;
                            return (
                            <tr
                              className={`transition-colors duration-500 ${hideRow ? 'hidden' : ''} ${
                                highlight?.kind === 'row' && highlight.scorecardId === sc.id && highlight.rowId === String(r.rowId)
                                  ? 'bg-amber-50'
                                  : 'bg-slate-50/80'
                              }`}
                            >
                              {/* Indent the whole expanded payload so children visibly nest under the retailer name above.
                                  A subtle vertical rail (border-l) ties these sub-sections to their parent retailer row.
                                  Mobile uses a tighter inset to preserve bubble width. */}
                              <td colSpan={r.products.length + 3} className="pl-3 pr-2 sm:pl-10 sm:pr-4 pt-1.5 pb-4">
                                <div className="flex flex-col gap-1 max-w-2xl border-l-2 border-slate-200 pl-2 sm:pl-4 py-0.5">
                                  {/* 1. Chain Discussion — hidden by default. The client opens it
                                      by clicking the blue-bubble count pill in the retailer row. */}
                                  {chainCount > 0 && (
                                    <div className={chainOpen ? 'contents' : 'hidden'}>
                                      {!isExpanded ? (
                                        // Collapsed state: slim, calm row. One accent rail on the left carries the unread signal.
                                        <button
                                          type="button"
                                          onClick={toggleExpand}
                                          aria-expanded={false}
                                          className={`group/chhdr relative w-full flex items-center gap-2 pl-3.5 pr-2.5 py-1.5 rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 before:content-[''] before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[2px] before:rounded-full ${
                                            rowUnread
                                              ? 'bg-white hover:bg-slate-50 before:bg-blue-500'
                                              : 'hover:bg-slate-100/70 before:bg-slate-300'
                                          }`}
                                        >
                                          <svg className={`w-3.5 h-3.5 shrink-0 ${rowUnread ? 'text-blue-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                                          </svg>
                                          <span className={`text-[11px] font-medium shrink-0 ${rowUnread ? 'text-slate-800' : 'text-slate-600'}`}>Chain Discussion</span>
                                          <span className="text-[10px] font-medium text-slate-500 shrink-0">{chainCount}</span>
                                          {rowUnread && (
                                            <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-blue-600 shrink-0" aria-label="New activity">
                                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                              <span className="uppercase tracking-wider">New</span>
                                            </span>
                                          )}
                                          {lastChain && (
                                            <span className="hidden sm:block text-[11px] text-slate-400 truncate min-w-0 flex-1">
                                              {truncate(lastChain.displayText || lastChain.c.text, 52)}
                                              <span className="text-slate-300"> · {relativeTime(lastChain.c.date)}</span>
                                            </span>
                                          )}
                                          <svg className="w-3 h-3 text-slate-300 group-hover/chhdr:text-slate-500 transition-colors shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                          </svg>
                                        </button>
                                      ) : (
                                        // Expanded: full thread with date grouping, max-height scroll, load-older.
                                        (() => {
                                          // Slice to the most-recent `visibleCount` messages (chronological tail).
                                          const start = Math.max(0, chainCount - visibleCount);
                                          const slice = chainNotes.slice(start);
                                          const hasOlder = start > 0;
                                          // Bucket a date into a relative group label.
                                          const bucketFor = (iso: string) => {
                                            const d = new Date(iso);
                                            if (Number.isNaN(d.getTime())) return 'Earlier';
                                            const now = new Date();
                                            const toKey = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
                                            if (toKey(d) === toKey(now)) return 'Today';
                                            const y = new Date(now);
                                            y.setDate(y.getDate() - 1);
                                            if (toKey(d) === toKey(y)) return 'Yesterday';
                                            const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
                                            if (diffDays < 7) return 'This week';
                                            return 'Earlier';
                                          };
                                          const pulse = pulseThread === expandKey;
                                          return (
                                            <div className={`relative rounded-xl bg-stone-50 border pl-4 pr-3 py-2.5 transition-all shadow-sm before:content-[''] before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-full before:bg-slate-400 ${pulse ? 'border-blue-400 ring-2 ring-blue-400/50 shadow-md' : 'border-stone-300'}`}>
                                              {/* Thread header (expanded) */}
                                              <div className="flex items-center gap-1.5 mb-2">
                                                <svg className="w-3.5 h-3.5 text-slate-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                                                </svg>
                                                <span className="text-[10px] font-semibold text-slate-800 uppercase tracking-wider">Chain Discussion</span>
                                                <span className="text-[10px] font-medium text-slate-400">{chainCount} {chainCount === 1 ? 'message' : 'messages'}</span>
                                                <button
                                                  type="button"
                                                  onClick={toggleExpand}
                                                  aria-expanded={true}
                                                  className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-slate-700 hover:text-slate-900 hover:bg-stone-200/60 px-1.5 py-0.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                  title="Collapse thread"
                                                >
                                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                  </svg>
                                                  Collapse
                                                </button>
                                              </div>
                                              {/* Scroll container with fade masks */}
                                              <div className="relative">
                                                <div
                                                  ref={(el) => { threadRefs.current[expandKey] = el; }}
                                                  className="relative flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-1"
                                                  style={{ maskImage: 'linear-gradient(to bottom, transparent 0, black 18px, black calc(100% - 18px), transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, black 18px, black calc(100% - 18px), transparent 100%)' }}
                                                >
                                                  {hasOlder && (
                                                    <div className="sticky top-0 z-10 flex justify-center pt-1 pb-1.5 bg-gradient-to-b from-slate-50/95 via-slate-50/70 to-transparent">
                                                      <button
                                                        type="button"
                                                        onClick={loadOlder}
                                                        className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-2 py-0.5 rounded-full shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                      >
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                                        </svg>
                                                        Load {Math.min(PER_PAGE, start)} older {Math.min(PER_PAGE, start) === 1 ? 'message' : 'messages'}
                                                      </button>
                                                    </div>
                                                  )}
                                                  {slice.map(({ c, displayText }, ci) => {
                                                    const isEditing = editingComment?.id === c.id;
                                                    const initial = (c.author || '?')[0].toUpperCase();
                                                    const isLast = ci === slice.length - 1;
                                                    const thisBucket = bucketFor(c.date);
                                                    const prevBucket = ci > 0 ? bucketFor(slice[ci - 1].c.date) : null;
                                                    const showBucket = ci === 0 || thisBucket !== prevBucket;
                                                    return (
                                                      <Fragment key={c.id || ci}>
                                                        {showBucket && (
                                                          <div className="flex items-center gap-2 py-1 select-none">
                                                            <div className="flex-1 h-px bg-slate-200" aria-hidden="true" />
                                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-white/70 backdrop-blur-sm border border-slate-200 px-2 py-0.5 rounded-full shadow-sm">
                                                              {thisBucket}
                                                            </span>
                                                            <div className="flex-1 h-px bg-slate-200" aria-hidden="true" />
                                                          </div>
                                                        )}
                                                        <div className={`relative flex items-start gap-2 group/comment ${c.isOwn ? 'flex-row-reverse' : ''}`}>
                                                          {/* Timeline rail connector (not on last item) */}
                                                          {!isLast && (
                                                            <span
                                                              aria-hidden="true"
                                                              className={`absolute top-7 h-[calc(100%-0.75rem)] w-px ${c.isOwn ? 'right-[11px] bg-blue-200/70' : 'left-[11px] bg-slate-200'}`}
                                                            />
                                                          )}
                                                          {/* Avatar */}
                                                          <div className={`relative w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold ring-2 ring-white ${c.isOwn ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 border border-slate-300'}`}>
                                                            {initial}
                                                          </div>
                                                          {/* Bubble */}
                                                          <div className={`max-w-sm flex flex-col ${c.isOwn ? 'items-end' : 'items-start'}`}>
                                                            <div
                                                              className={`relative rounded-2xl px-3 py-2 shadow-sm ${
                                                                c.isOwn
                                                                  ? 'bg-blue-600 text-white rounded-tr-sm before:content-[""] before:absolute before:top-2 before:-right-1.5 before:w-0 before:h-0 before:border-y-[6px] before:border-y-transparent before:border-l-[7px] before:border-l-blue-600'
                                                                  : 'bg-white border border-slate-200 rounded-tl-sm before:content-[""] before:absolute before:top-2 before:-left-[7px] before:w-0 before:h-0 before:border-y-[6px] before:border-y-transparent before:border-r-[7px] before:border-r-slate-200 after:content-[""] after:absolute after:top-2 after:-left-[6px] after:w-0 after:h-0 after:border-y-[6px] after:border-y-transparent after:border-r-[7px] after:border-r-white'
                                                              }`}
                                                            >
                                                              <div className={`flex items-center gap-1.5 mb-0.5 ${c.isOwn ? 'justify-end' : ''}`}>
                                                                <span className={`text-[11px] font-semibold ${c.isOwn ? 'text-blue-100' : 'text-slate-700'}`}>{c.author}</span>
                                                                <span className={`text-[10px] ${c.isOwn ? 'text-blue-200' : 'text-slate-400'}`}>
                                                                  {new Date(c.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                                  {' '}
                                                                  {new Date(c.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                                                </span>
                                                              </div>
                                                              {isEditing ? (
                                                                <div className="flex flex-col gap-2 mt-1">
                                                                  <textarea
                                                                    ref={(el) => {
                                                                      if (el) {
                                                                        el.style.height = 'auto';
                                                                        el.style.height = Math.min(el.scrollHeight, 280) + 'px';
                                                                      }
                                                                    }}
                                                                    rows={2}
                                                                    value={editText}
                                                                    onChange={e => {
                                                                      setEditText(e.target.value);
                                                                      const el = e.currentTarget;
                                                                      el.style.height = 'auto';
                                                                      el.style.height = Math.min(el.scrollHeight, 280) + 'px';
                                                                    }}
                                                                    className="text-sm border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full bg-white resize-none min-h-[44px] max-h-72 leading-snug"
                                                                    autoFocus
                                                                    onKeyDown={e => {
                                                                      if (e.key === 'Enter' && !e.shiftKey && !savingCommentEdit) {
                                                                        e.preventDefault();
                                                                        handleEditComment(c.id!, sc.id, r.rowId);
                                                                      }
                                                                      if (e.key === 'Escape' && !savingCommentEdit) { setEditingComment(null); setEditText(''); }
                                                                    }}
                                                                    disabled={savingCommentEdit}
                                                                  />
                                                                  <div className="flex items-center gap-2 justify-end">
                                                                    <button
                                                                      onClick={() => { setEditingComment(null); setEditText(''); }}
                                                                      disabled={savingCommentEdit}
                                                                      className={`text-xs font-medium px-3 py-1.5 min-h-[32px] rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${c.isOwn ? 'text-blue-100 hover:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                                                                    >Cancel</button>
                                                                    <button
                                                                      onClick={() => handleEditComment(c.id!, sc.id, r.rowId)}
                                                                      disabled={savingCommentEdit || !editText.trim()}
                                                                      aria-busy={savingCommentEdit}
                                                                      className={`text-xs font-semibold px-3 py-1.5 min-h-[32px] rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${c.isOwn ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                                                                    >{savingCommentEdit ? 'Saving…' : 'Save'}</button>
                                                                  </div>
                                                                </div>
                                                              ) : (
                                                                <p className={`text-sm leading-relaxed ${c.isOwn ? 'text-white' : 'text-slate-700'}`}>{displayText}</p>
                                                              )}
                                                            </div>
                                                            {c.isOwn && c.id && !isEditing && (
                                                              <div className={`flex gap-2 mt-1 opacity-60 group-hover/comment:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity ${c.isOwn ? 'justify-end' : 'justify-start'}`}>
                                                                <button
                                                                  onClick={() => { setEditingComment({ id: c.id!, scorecardId: sc.id, rowId: r.rowId }); setEditText(c.text); }}
                                                                  className="text-slate-500 hover:text-blue-600 transition-colors p-1.5 -m-1.5 rounded min-h-[32px] min-w-[32px] inline-flex items-center justify-center"
                                                                  title="Edit note"
                                                                  aria-label="Edit note"
                                                                >
                                                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                                                                </button>
                                                                <button
                                                                  onClick={() => handleDeleteComment(c.id!, sc.id, r.rowId)}
                                                                  className="text-slate-500 hover:text-red-600 transition-colors p-1.5 -m-1.5 rounded min-h-[32px] min-w-[32px] inline-flex items-center justify-center"
                                                                  title="Delete note"
                                                                  aria-label="Delete note"
                                                                >
                                                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                                                                </button>
                                                              </div>
                                                            )}
                                                          </div>
                                                        </div>
                                                      </Fragment>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })()
                                      )}
                                    </div>
                                  )}

                                  {/* 2. Store Visits — hidden by default. The client opens it
                                      by clicking the teal pin count pill in the retailer row. */}
                                  {storeNotes.length > 0 && (() => {
                                    // Keys are suffixed so they never collide with the chain-discussion key.
                                    const storesKey = `${sc.id}:${r.rowId}:stores`;
                                    const storesExpanded = expandedRows.has(storesKey);
                                    const rowKey = `${sc.id}:${r.rowId}`;
                                    // Helper: best-known timestamp for a parsed comment (prefer mvDate).
                                    const tsOf = (p: { c: Comment; mvDate: string | null }) => {
                                      const t1 = p.mvDate ? new Date(p.mvDate).getTime() : NaN;
                                      if (!Number.isNaN(t1)) return t1;
                                      const t2 = new Date(p.c.date).getTime();
                                      return Number.isNaN(t2) ? 0 : t2;
                                    };
                                    // Sort store groups by most-recently-active first (cheap: one pass).
                                    const storeGroupsSorted: Array<[string, typeof storeNotes]> = Array.from(storeGroups.entries())
                                      .map(([name, items]) => {
                                        const latest = items.reduce((mx, p) => Math.max(mx, tsOf(p)), 0);
                                        return { name, items, latest };
                                      })
                                      .sort((a, b) => b.latest - a.latest)
                                      .map(({ name, items }) => [name, items]);
                                    const totalStoreNotes = storeNotes.length;
                                    const totalStoreCount = storeGroupsSorted.length;
                                    const mostRecentStore = storeGroupsSorted[0];
                                    const latestStoreNote = mostRecentStore
                                      ? mostRecentStore[1].slice().sort((a, b) => tsOf(b) - tsOf(a))[0]
                                      : null;
                                    const toggleStoresSection = () => {
                                      setExpandedRows(prev => {
                                        const next = new Set(prev);
                                        if (next.has(storesKey)) next.delete(storesKey);
                                        else {
                                          next.add(storesKey);
                                          // Seed per-store expansion: only the most-recently-active store.
                                          setExpandedStoresPerRow(curr => {
                                            if (curr[rowKey]) return curr;
                                            const seed = new Set<string>();
                                            if (mostRecentStore) seed.add(mostRecentStore[0]);
                                            return { ...curr, [rowKey]: seed };
                                          });
                                        }
                                        return next;
                                      });
                                    };
                                    return (
                                      <div className={storeOpen ? 'contents' : 'hidden'}>
                                        {!storesExpanded ? (
                                          // Collapsed: slim, calm row. Teal accent rail keys it as Store Visits.
                                          <button
                                            type="button"
                                            onClick={toggleStoresSection}
                                            aria-expanded={false}
                                            className="group/svhdr relative w-full flex items-center gap-2 pl-3.5 pr-2.5 py-1.5 rounded-lg hover:bg-slate-100/70 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 before:content-[''] before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[2px] before:rounded-full before:bg-teal-400"
                                          >
                                            <svg className="w-3.5 h-3.5 text-teal-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                            </svg>
                                            <span className="text-[11px] font-medium text-slate-600 shrink-0">Store Visits</span>
                                            <span className="text-[10px] font-medium text-slate-500 shrink-0">
                                              {totalStoreNotes} <span className="text-slate-300">·</span> {totalStoreCount} {totalStoreCount === 1 ? 'store' : 'stores'}
                                            </span>
                                            {latestStoreNote && mostRecentStore && (
                                              <span className="hidden sm:block text-[11px] text-slate-400 truncate min-w-0 flex-1">
                                                <span className="text-slate-500">{truncate(mostRecentStore[0], 22)}</span>
                                                <span className="text-slate-300"> · </span>
                                                {truncate(latestStoreNote.displayText || latestStoreNote.c.text, 48)}
                                              </span>
                                            )}
                                            <svg className="w-3 h-3 text-slate-300 group-hover/svhdr:text-slate-500 transition-colors shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                            </svg>
                                          </button>
                                        ) : (() => {
                                          // Expanded state — two-tier. Paginate stores (8 per page).
                                          const STORE_PAGE = 8;
                                          const storeCountKey = `${sc.id}:${r.rowId}:storeCount`;
                                          const visibleStoreCount = visibleCountPerRow[storeCountKey] ?? STORE_PAGE;
                                          const visibleStoreGroups = storeGroupsSorted.slice(0, visibleStoreCount);
                                          const hiddenStoreCount = Math.max(0, storeGroupsSorted.length - visibleStoreCount);
                                          const loadOlderStores = () => {
                                            setVisibleCountPerRow(prev => ({ ...prev, [storeCountKey]: (prev[storeCountKey] ?? STORE_PAGE) + STORE_PAGE }));
                                          };
                                          const expandedStoreSet = expandedStoresPerRow[rowKey] || new Set<string>();
                                          const toggleStore = (storeName: string) => {
                                            setExpandedStoresPerRow(curr => {
                                              const prevSet = curr[rowKey] || new Set<string>();
                                              const nextSet = new Set(prevSet);
                                              if (nextSet.has(storeName)) nextSet.delete(storeName);
                                              else nextSet.add(storeName);
                                              return { ...curr, [rowKey]: nextSet };
                                            });
                                          };
                                          // Date-bucket helper local to store visits (same buckets as Chain Discussion).
                                          const getDateBucket = (iso: string) => {
                                            const d = new Date(iso);
                                            if (Number.isNaN(d.getTime())) return 'Earlier';
                                            const now = new Date();
                                            const toKey = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
                                            if (toKey(d) === toKey(now)) return 'Today';
                                            const y = new Date(now);
                                            y.setDate(y.getDate() - 1);
                                            if (toKey(d) === toKey(y)) return 'Yesterday';
                                            const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
                                            if (diffDays < 7) return 'This week';
                                            return 'Earlier';
                                          };
                                          return (
                                            <div className="relative rounded-xl bg-slate-50/60 border border-slate-300 shadow-sm pl-4 pr-3 py-2.5 before:content-[''] before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-full before:bg-teal-400/70">
                                              {/* Section header with collapse */}
                                              <div className="flex items-center gap-1.5 mb-2">
                                                <svg className="w-3.5 h-3.5 text-teal-500/80 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                                </svg>
                                                <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Store Visits</span>
                                                <span className="text-[10px] font-medium text-slate-400">{totalStoreNotes} {totalStoreNotes === 1 ? 'note' : 'notes'} · {totalStoreCount} {totalStoreCount === 1 ? 'store' : 'stores'}</span>
                                                <button
                                                  type="button"
                                                  onClick={toggleStoresSection}
                                                  aria-expanded={true}
                                                  className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 px-1.5 py-0.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                  title="Collapse store visits"
                                                >
                                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                  </svg>
                                                  Collapse
                                                </button>
                                              </div>
                                              {/* Read-only notice — comments happen on the Market Visits tab */}
                                              <div className="flex items-start gap-1.5 mb-2 px-2 py-1.5 rounded-md bg-slate-100/70 border border-slate-200/80">
                                                <svg className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-[1px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                                                </svg>
                                                <p className="text-[10.5px] text-slate-600 leading-snug">
                                                  Store visit notes are read-only here. To add a comment on a store visit, open the <span className="font-semibold text-slate-700">Market Visits</span> tab.
                                                </p>
                                              </div>
                                              <div className="flex flex-col gap-2">
                                                {visibleStoreGroups.map(([storeName, items]) => {
                                                  const storeExpanded = expandedStoreSet.has(storeName);
                                                  // Visits sorted chronologically (oldest -> newest) for grouping.
                                                  const sortedItems = items.slice().sort((a, b) => tsOf(a) - tsOf(b));
                                                  const latestItem = sortedItems[sortedItems.length - 1];
                                                  const latestDateIso = latestItem
                                                    ? (latestItem.mvDate || latestItem.c.date)
                                                    : null;
                                                  // Per-store visit pagination (10 per page, newest tail).
                                                  const VISIT_PAGE = 10;
                                                  const visitKey = `${sc.id}:${r.rowId}:store:${storeName}`;
                                                  const visibleVisitCount = visibleCountPerRow[visitKey] ?? VISIT_PAGE;
                                                  const visitStart = Math.max(0, sortedItems.length - visibleVisitCount);
                                                  const visitSlice = sortedItems.slice(visitStart);
                                                  const hasOlderVisits = visitStart > 0;
                                                  const loadOlderVisits = () => {
                                                    setVisibleCountPerRow(prev => ({ ...prev, [visitKey]: (prev[visitKey] ?? VISIT_PAGE) + VISIT_PAGE }));
                                                  };
                                                  return (
                                                    <div key={storeName} className="relative bg-white border border-slate-200 rounded-xl overflow-hidden">
                                                      {/* Store header — clickable toggle */}
                                                      <button
                                                        type="button"
                                                        onClick={() => toggleStore(storeName)}
                                                        aria-expanded={storeExpanded}
                                                        className={`group/storehdr w-full flex items-center gap-2 pl-4 pr-3 py-2 bg-white hover:bg-slate-50 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${storeExpanded ? 'border-b border-slate-100' : ''}`}
                                                      >
                                                        <svg className="w-3.5 h-3.5 text-teal-500/80 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                                        </svg>
                                                        <span className="text-xs font-semibold text-slate-800 uppercase tracking-wide truncate" title={storeName}>{storeName}</span>
                                                        <span className="text-[10px] font-medium text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded-md shrink-0 ml-auto">
                                                          {items.length} {items.length === 1 ? 'visit note' : 'visit notes'}
                                                        </span>
                                                        {latestDateIso && (
                                                          <span className="hidden sm:inline text-[10px] text-slate-400 shrink-0">{relativeTime(latestDateIso)}</span>
                                                        )}
                                                        <svg
                                                          className={`w-3.5 h-3.5 text-slate-400 group-hover/storehdr:text-slate-600 transition-transform shrink-0 ${storeExpanded ? 'rotate-90' : ''}`}
                                                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                                                        >
                                                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                        </svg>
                                                      </button>
                                                      {/* Store visit entries — read-only on Product Status.
                                                          To edit/delete store notes, brand users go to the
                                                          Market Visits tab where they can comment directly
                                                          on the visit photo. Only rendered when store is expanded. */}
                                                      {storeExpanded && (
                                                        <div className="divide-y divide-slate-100">
                                                          {hasOlderVisits && (
                                                            <div className="flex justify-center py-1.5 bg-slate-50/60">
                                                              <button
                                                                type="button"
                                                                onClick={loadOlderVisits}
                                                                className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-2 py-0.5 rounded-full shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                              >
                                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                                                </svg>
                                                                Show {Math.min(VISIT_PAGE, visitStart)} older {Math.min(VISIT_PAGE, visitStart) === 1 ? 'visit' : 'visits'}
                                                              </button>
                                                            </div>
                                                          )}
                                                          {visitSlice.map((entry, idx) => {
                                                            const { c, mvDate, displayText } = entry;
                                                            const bucketIso = mvDate || c.date;
                                                            const thisBucket = getDateBucket(bucketIso);
                                                            const prevIso = idx > 0 ? (visitSlice[idx - 1].mvDate || visitSlice[idx - 1].c.date) : null;
                                                            const prevBucket = prevIso ? getDateBucket(prevIso) : null;
                                                            const showBucket = idx === 0 || thisBucket !== prevBucket;
                                                            return (
                                                              <Fragment key={c.id || `${storeName}-${idx}`}>
                                                                {showBucket && (
                                                                  <div className="flex items-center gap-2 px-4 pt-2 pb-1 bg-slate-50/40 select-none">
                                                                    <div className="flex-1 h-px bg-slate-200" aria-hidden="true" />
                                                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full shadow-sm">
                                                                      {thisBucket}
                                                                    </span>
                                                                    <div className="flex-1 h-px bg-slate-200" aria-hidden="true" />
                                                                  </div>
                                                                )}
                                                                <div className="pl-4 pr-3 py-2.5">
                                                                  <div className="flex items-center gap-1.5 mb-1 min-w-0">
                                                                    <span className="text-[11px] font-semibold text-slate-700 truncate">{c.author}</span>
                                                                    <span className="text-[10px] text-slate-400 shrink-0">
                                                                      {mvDate
                                                                        ? new Date(mvDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                                                                        : `${new Date(c.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${new Date(c.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
                                                                      }
                                                                    </span>
                                                                    <span
                                                                      className="ml-auto inline-flex items-center gap-1 text-[9px] font-semibold text-slate-400 uppercase tracking-wider shrink-0"
                                                                      title="Read-only here — edit on the Market Visits tab"
                                                                    >
                                                                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                                                                      </svg>
                                                                      Read-only
                                                                    </span>
                                                                  </div>
                                                                  <p className="text-sm text-slate-700 leading-relaxed">{displayText}</p>
                                                                </div>
                                                              </Fragment>
                                                            );
                                                          })}
                                                        </div>
                                                      )}
                                                    </div>
                                                  );
                                                })}
                                                {hiddenStoreCount > 0 && (
                                                  <button
                                                    type="button"
                                                    onClick={loadOlderStores}
                                                    className="inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-2.5 py-1 rounded-full shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 self-center"
                                                  >
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                    </svg>
                                                    Show {Math.min(STORE_PAGE, hiddenStoreCount)} older {Math.min(STORE_PAGE, hiddenStoreCount) === 1 ? 'store' : 'stores'}
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    );
                                  })()}

                                  {/* 3. Broker Note — persistent summary, reference at the bottom */}
                                  {r.notes && (
                                    <>
                                      {showHeaders && <SectionHeader label="Broker Summary" />}
                                      <div className="flex items-start gap-2">
                                        <div className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 mt-0.5">
                                          <svg className="w-3.5 h-3.5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                          </svg>
                                        </div>
                                        <div className="flex-1 bg-gradient-to-br from-amber-50 to-amber-50/40 border border-amber-200 rounded-xl px-3.5 py-2.5 shadow-sm">
                                          <div className="flex items-center gap-1.5 mb-1">
                                            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wide">Broker Note</span>
                                            <span className="text-[10px] text-amber-600/80">Chain summary</span>
                                          </div>
                                          <p className="text-sm text-slate-700 leading-relaxed">{r.notes}</p>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                            );
                          })()}
                        </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  )}
                </div>
              </div>
              );
            })}
          </div>
          );
        })()}

        {/* Master Scorecard Tab */}
        {activeTab === 'scorecard' && (
          <MasterScorecard apiUrl="/api/portal/master-scorecard" />
        )}

        {/* Market Visits Tab */}
        {activeTab === 'visits' && (
          <div>
            {canCreateVisits && (
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add Market Visit
                </button>
              </div>
            )}
            {visits.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 flex items-center justify-center mb-4">
                  <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-800">No market visits yet</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {canCreateVisits
                    ? 'Tap "Add Market Visit" to upload a photo, location, and note from your store visit.'
                    : <>When your broker visits a store carrying <span className="font-medium text-slate-700">{brand}</span> products, photos and notes will show up here.</>}
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="relative flex-1 max-w-md">
                    <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                    <input
                      type="search"
                      value={visitsQuery}
                      onChange={e => setVisitsQuery(e.target.value)}
                      placeholder="Filter by store name, address, or note…"
                      className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-sm text-slate-700 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      aria-label="Filter market visits"
                    />
                    {visitsQuery && (
                      <button
                        type="button"
                        onClick={() => setVisitsQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        aria-label="Clear filter"
                        title="Clear filter"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {trimmedVisitsQuery
                      ? `${filteredVisits.length} of ${sortedVisits.length} ${sortedVisits.length === 1 ? 'visit' : 'visits'}`
                      : `${sortedVisits.length} ${sortedVisits.length === 1 ? 'visit' : 'visits'}`}
                  </p>
                </div>
                {filteredVisits.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
                    <h3 className="text-sm font-semibold text-slate-800">No visits match &ldquo;{visitsQuery}&rdquo;</h3>
                    <p className="text-xs text-slate-500 mt-1">Try a different search term or clear the filter.</p>
                  </div>
                ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredVisits.map(v => {
                  const visitComments = v.comments || [];
                  const isSending = submittingPhotoComment === v.id;
                  const pendingText = photoCommentText[v.id] || '';
                  const commentsExpanded = expandedVisitComments.has(v.id);
                  const latestComment = visitComments.length > 0 ? visitComments[visitComments.length - 1] : null;
                  const toggleVisitComments = () => {
                    setExpandedVisitComments(prev => {
                      const next = new Set(prev);
                      if (next.has(v.id)) next.delete(v.id);
                      else next.add(v.id);
                      return next;
                    });
                  };
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
                      {v.author && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                          </svg>
                          <span className="truncate">
                            Added by <span className="font-medium text-slate-700">{v.author.name}</span>
                            {v.author.roleLabel && <span className="text-slate-400"> · {v.author.roleLabel}</span>}
                          </span>
                          {v.isOwn && (
                            <span className="ml-auto shrink-0 text-[10px] font-semibold text-blue-600">You</span>
                          )}
                          {v.canEdit && (
                            <div className={`flex items-center gap-0.5 ${v.isOwn ? '' : 'ml-auto'} shrink-0`}>
                              <button
                                type="button"
                                onClick={() => openEditVisit(v)}
                                className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                aria-label="Edit visit"
                                title="Edit visit"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteVisit(v)}
                                className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                aria-label="Delete visit"
                                title="Delete visit"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
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

                      {/* Comment thread — collapsed by default; click to expand */}
                      {visitComments.length > 0 && (
                        <div className="mt-1 border-t border-slate-100 pt-2.5">
                          <button
                            type="button"
                            onClick={toggleVisitComments}
                            aria-expanded={commentsExpanded}
                            aria-controls={`visit-${v.id}-comments`}
                            className="w-full flex items-center gap-1.5 text-left text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md px-1.5 py-1 -mx-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            title={commentsExpanded ? 'Hide comments' : 'Show comments'}
                          >
                            <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                            </svg>
                            <span className="font-semibold text-slate-700 shrink-0">
                              {visitComments.length} {visitComments.length === 1 ? 'comment' : 'comments'}
                            </span>
                            {!commentsExpanded && latestComment && (
                              <span className="text-slate-500 truncate min-w-0 flex-1 italic font-normal">
                                · &ldquo;{latestComment.text.length > 50 ? latestComment.text.slice(0, 49).trimEnd() + '…' : latestComment.text}&rdquo;
                              </span>
                            )}
                            <svg
                              className={`w-3 h-3 text-slate-400 shrink-0 transition-transform ml-auto ${commentsExpanded ? 'rotate-90' : ''}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                          </button>
                          {commentsExpanded && (
                          <div id={`visit-${v.id}-comments`} className="mt-2 space-y-1.5">
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
                                      <div className="flex flex-col gap-1.5 mt-0.5">
                                        <textarea
                                          ref={(el) => {
                                            if (el) {
                                              el.style.height = 'auto';
                                              el.style.height = Math.min(el.scrollHeight, 240) + 'px';
                                            }
                                          }}
                                          rows={2}
                                          value={editVisitText}
                                          onChange={e => {
                                            setEditVisitText(e.target.value);
                                            const el = e.currentTarget;
                                            el.style.height = 'auto';
                                            el.style.height = Math.min(el.scrollHeight, 240) + 'px';
                                          }}
                                          className="text-xs border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full bg-white resize-none min-h-[44px] max-h-60 leading-snug"
                                          autoFocus
                                          onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey && !savingVisitCommentEdit) {
                                              e.preventDefault();
                                              handleEditVisitComment(c.id!, v.id);
                                            }
                                            if (e.key === 'Escape' && !savingVisitCommentEdit) { setEditingVisitCommentId(null); setEditVisitText(''); }
                                          }}
                                          disabled={savingVisitCommentEdit}
                                        />
                                        <div className="flex items-center gap-2 justify-end">
                                          <button
                                            onClick={() => { setEditingVisitCommentId(null); setEditVisitText(''); }}
                                            disabled={savingVisitCommentEdit}
                                            className="text-[11px] font-medium text-blue-100 hover:text-white px-3 py-1.5 min-h-[32px] rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                          >Cancel</button>
                                          <button
                                            onClick={() => handleEditVisitComment(c.id!, v.id)}
                                            disabled={savingVisitCommentEdit || !editVisitText.trim()}
                                            aria-busy={savingVisitCommentEdit}
                                            className="text-[11px] font-semibold text-white bg-blue-800/70 hover:bg-blue-900/80 px-3 py-1.5 min-h-[32px] rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                          >{savingVisitCommentEdit ? 'Saving…' : 'Save'}</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className={c.isOwn ? 'text-white' : 'text-slate-700'}>{c.text}</p>
                                    )}
                                  </div>
                                  {c.isOwn && c.id && !isEditing && (
                                    <div className="flex gap-2 mt-1 opacity-60 group-hover/vcomment:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity justify-end">
                                      <button
                                        onClick={() => { setEditingVisitCommentId(c.id!); setEditVisitText(c.text); }}
                                        className="text-slate-500 hover:text-blue-600 transition-colors p-1.5 -m-1.5 rounded min-h-[32px] min-w-[32px] inline-flex items-center justify-center"
                                        title="Edit comment"
                                        aria-label="Edit comment"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                                      </button>
                                      <button
                                        onClick={() => handleDeleteVisitComment(c.id!, v.id)}
                                        className="text-slate-500 hover:text-red-600 transition-colors p-1.5 -m-1.5 rounded min-h-[32px] min-w-[32px] inline-flex items-center justify-center"
                                        title="Delete comment"
                                        aria-label="Delete comment"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          </div>
                          )}
                        </div>
                      )}

                      {/* Comment input */}
                      <div className="mt-auto pt-2">
                        <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent focus-within:bg-white transition-all">
                          <textarea
                            ref={(el) => {
                              if (el) {
                                el.style.height = 'auto';
                                el.style.height = Math.min(el.scrollHeight, 160) + 'px';
                              }
                            }}
                            rows={1}
                            value={pendingText}
                            onChange={(e) => {
                              setPhotoCommentText(prev => ({ ...prev, [v.id]: e.target.value }));
                              const el = e.currentTarget;
                              el.style.height = 'auto';
                              el.style.height = Math.min(el.scrollHeight, 160) + 'px';
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleAddPhotoComment(v.id, v.store_name || 'Store Visit');
                              }
                            }}
                            placeholder="Add a comment..."
                            className="flex-1 resize-none bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none py-1.5 max-h-40 leading-snug"
                            disabled={isSending}
                            aria-label={`Add a comment to ${v.store_name || 'this visit'}`}
                          />
                          <button
                            onClick={() => handleAddPhotoComment(v.id, v.store_name || 'Store Visit')}
                            disabled={!pendingText.trim() || isSending}
                            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 shrink-0"
                            title="Send comment"
                            aria-label="Send comment"
                          >
                            {isSending ? (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
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
              </>
            )}
          </div>
        )}
      </main>
      {lightbox && <PhotoLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
      {showUploadModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-start justify-center bg-black/40 backdrop-blur-sm sm:p-4 sm:overflow-y-auto"
          onClick={() => setShowUploadModal(false)}
        >
          <div
            className="bg-white shadow-xl w-full flex flex-col max-h-[100dvh] sm:max-h-[calc(100dvh-4rem)] sm:max-w-2xl sm:mt-8 sm:mb-8 sm:rounded-2xl rounded-t-2xl sheet-slide-up sm:animate-none"
            onClick={e => e.stopPropagation()}
          >
            <div className="sm:hidden flex justify-center pt-2.5 pb-1" aria-hidden="true">
              <span className="block w-10 h-1.5 rounded-full bg-slate-300" />
            </div>
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 sticky top-0 bg-white sm:rounded-t-2xl">
              <h3 className="text-base font-semibold text-slate-900">Add Market Visit</h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div
              className="p-4 sm:p-6 overflow-y-auto touch-scroll flex-1"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <MarketVisitUpload
                onUploaded={() => {
                  setShowUploadModal(false);
                  refreshData(role).catch(() => {});
                }}
              />
            </div>
          </div>
        </div>
      )}
      {editingVisit && editVisitForm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4"
          onClick={() => { setEditingVisit(null); setEditVisitForm(null); }}
        >
          <div
            className="bg-white shadow-xl w-full flex flex-col max-h-[100dvh] sm:max-h-[calc(100dvh-4rem)] sm:max-w-md sm:rounded-2xl rounded-t-2xl sheet-slide-up sm:animate-none"
            onClick={e => e.stopPropagation()}
          >
            <div className="sm:hidden flex justify-center pt-2.5 pb-1" aria-hidden="true">
              <span className="block w-10 h-1.5 rounded-full bg-slate-300" />
            </div>
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 sticky top-0 bg-white sm:rounded-t-2xl">
              <h3 className="text-base font-semibold text-slate-900">Edit Market Visit</h3>
              <button
                type="button"
                onClick={() => { setEditingVisit(null); setEditVisitForm(null); }}
                className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div
              className="px-4 sm:px-6 py-5 space-y-4 overflow-y-auto touch-scroll flex-1"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Store name</label>
                <input type="text" value={editVisitForm.store_name} onChange={e => setEditVisitForm(f => f ? { ...f, store_name: e.target.value } : f)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <input type="text" value={editVisitForm.address} onChange={e => setEditVisitForm(f => f ? { ...f, address: e.target.value } : f)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Visit date</label>
                <input type="date" value={editVisitForm.visit_date} onChange={e => setEditVisitForm(f => f ? { ...f, visit_date: e.target.value } : f)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
                <textarea rows={3} value={editVisitForm.note} onChange={e => setEditVisitForm(f => f ? { ...f, note: e.target.value } : f)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none leading-snug" />
              </div>
              <div className="flex gap-3 pt-1 sticky bottom-0 bg-white -mx-4 sm:mx-0 px-4 sm:px-0 py-3 sm:py-0 border-t sm:border-0 border-slate-100">
                <button type="button" onClick={() => { setEditingVisit(null); setEditVisitForm(null); }} className="flex-1 py-3 sm:py-2.5 min-h-[44px] text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button>
                <button type="button" onClick={handleSaveVisitEdit} disabled={savingVisit} className="flex-1 py-3 sm:py-2.5 min-h-[44px] text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {savingVisit ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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

function OtherSummaryCard({ value, breakdown }: { value: number; breakdown: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  const hasBreakdown = entries.length > 0;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => hasBreakdown && setOpen(v => !v)}
        disabled={!hasBreakdown}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`w-full text-left rounded-xl bg-white border border-slate-200 px-4 py-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${hasBreakdown ? 'hover:border-slate-300 hover:shadow-sm cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide truncate">Other</p>
            <p className="text-2xl font-bold text-slate-900 tabular-nums mt-0.5">{value}</p>
            {hasBreakdown && (
              <p className="text-[10px] font-medium text-blue-600 mt-0.5 flex items-center gap-0.5">
                {entries.length} {entries.length === 1 ? 'status' : 'statuses'}
                <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </p>
            )}
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
          </div>
        </div>
      </button>

      {open && hasBreakdown && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Other status breakdown"
          className="absolute z-20 mt-2 left-0 right-0 sm:right-auto sm:min-w-[240px] rounded-xl bg-white border border-slate-200 shadow-lg p-2"
        >
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide px-2 pt-1 pb-1.5">Status breakdown</p>
          <ul className="space-y-0.5">
            {entries.map(([status, count]) => {
              const s = statusStyles[status] || { bg: '#f3f4f6', color: '#374151', dot: '#6b7280' };
              return (
                <li key={status} className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-slate-50">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: s.color }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
                    {status}
                  </span>
                  <span className="text-xs font-semibold text-slate-900 tabular-nums">{count}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
