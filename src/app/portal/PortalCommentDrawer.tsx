'use client';
// TODO: unify with admin CommentDrawer.tsx — this file is a hand-duplicate of
// the admin drawer (Bundle 2 + Bundle 2.5 polish), adapted to the portal's
// comment shape ({ id, text, author, date, updated_at, isOwn, isAdmin }).
// Per project convention we do NOT refactor into a shared drawer yet;
// replicate changes in both and keep them in sync by hand.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { parseCommentMeta } from '@/components/admin/commentMeta';
import { useClientLogos, findLogo } from '@/components/admin/useClientLogos';

// ─── Portal comment shape ─────────────────────────────────────────────────
// Matches `interface Comment` in src/app/portal/page.tsx, plus `updated_at`
// and `isAdmin` which we thread through for edit-indicator + admin pill.
export interface PortalComment {
  id?: string;
  text: string;
  author: string;
  date: string;
  updated_at?: string;
  isOwn?: boolean;
  isAdmin?: boolean;
}

// ─── Progressive-disclosure thresholds ─────────────────────────────────────
const COMMENT_THRESHOLDS = {
  filters: 4,
  groups: 10,
  search: 25,
  condense: 25,
} as const;

const STALE_DAYS = 30;
const CHAIN_BUCKET = '__chain__';

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatRelativeTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  const then = new Date(dateInput).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    if (hr < 12) return `${hr}h ago`;
    return 'today';
  }
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day} days ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return wk === 1 ? '1 week ago' : `${wk} weeks ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return mo === 1 ? '1 month ago' : `${mo} months ago`;
  const yr = Math.floor(day / 365);
  return yr === 1 ? '1 year ago' : `${yr} years ago`;
}

function formatShortDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function daysBetween(a: Date | number, b: Date | number): number {
  return Math.floor((new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24));
}

function daySeparatorLabel(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';
  const diff = daysBetween(Date.now(), d);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function sameLocalDay(a: string | Date, b: string | Date): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function isMarketVisitMeta(c: PortalComment): boolean {
  return parseCommentMeta(c?.text).isMarketVisit;
}

interface CommentGroup {
  key: string;
  label: string;
  comments: PortalComment[];
  lastActivity: number;
  isChainBucket: boolean;
}

function groupCommentsByStore(comments: PortalComment[]): CommentGroup[] {
  const map = new Map<string, CommentGroup>();
  for (const c of comments) {
    const meta = parseCommentMeta(c.text);
    const isChain = !meta.isMarketVisit || !meta.storeName;
    const key = isChain ? CHAIN_BUCKET : (meta.storeName as string);
    const label = isChain ? 'Chain notes' : (meta.storeName as string);
    const createdAt = new Date(c.date).getTime();
    let group = map.get(key);
    if (!group) {
      group = { key, label, comments: [], lastActivity: 0, isChainBucket: isChain };
      map.set(key, group);
    }
    group.comments.push(c);
    if (createdAt > group.lastActivity) group.lastActivity = createdAt;
  }
  for (const g of map.values()) {
    g.comments.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.isChainBucket && !b.isChainBucket) return 1;
    if (!a.isChainBucket && b.isChainBucket) return -1;
    return b.lastActivity - a.lastActivity;
  });
}

function computeSummary(comments: PortalComment[]) {
  if (!comments.length) {
    return {
      lastCreated: null as Date | null,
      storeCount: 0,
      commentCount: 0,
      visitCount: 0,
      noteCount: 0,
      isStale: false,
    };
  }
  const stores = new Set<string>();
  let latest = 0;
  let visitCount = 0;
  let noteCount = 0;
  for (const c of comments) {
    const meta = parseCommentMeta(c.text);
    if (meta.isMarketVisit) {
      visitCount += 1;
      if (meta.storeName) stores.add(meta.storeName);
    } else {
      noteCount += 1;
    }
    const t = new Date(c.date).getTime();
    if (t > latest) latest = t;
  }
  const lastCreated = latest ? new Date(latest) : null;
  const isStale = lastCreated ? daysBetween(Date.now(), lastCreated) > STALE_DAYS : false;
  return {
    lastCreated,
    storeCount: stores.size,
    commentCount: comments.length,
    visitCount,
    noteCount,
    isStale,
  };
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const check = () => {
      const narrow = window.innerWidth < 640;
      const coarse =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches;
      setIsMobile(narrow || coarse);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

// ─── Filter types ──────────────────────────────────────────────────────────
type ViewMode = 'store' | 'all';
type TypeFilter = 'all' | 'market' | 'note';
type DateFilter = 'anytime' | 'week' | 'month' | 'quarter';

interface FilterState {
  view: ViewMode;
  type: TypeFilter;
  date: DateFilter;
  author: string;
  search: string;
}

function filterComments(comments: PortalComment[], f: FilterState): PortalComment[] {
  const now = Date.now();
  const day = 1000 * 60 * 60 * 24;
  const windowMs =
    f.date === 'week'
      ? 7 * day
      : f.date === 'month'
      ? 30 * day
      : f.date === 'quarter'
      ? 90 * day
      : Infinity;

  const q = f.search.trim().toLowerCase();

  return comments.filter(c => {
    if (f.type !== 'all') {
      const mv = isMarketVisitMeta(c);
      if (f.type === 'market' && !mv) return false;
      if (f.type === 'note' && mv) return false;
    }
    if (windowMs !== Infinity) {
      const t = new Date(c.date).getTime();
      if (now - t > windowMs) return false;
    }
    if (f.author !== 'all' && String(c.author || '') !== f.author) return false;
    if (q) {
      const body = parseCommentMeta(c.text).body.toLowerCase();
      const name = String(c.author || '').toLowerCase();
      if (!body.includes(q) && !name.includes(q)) return false;
    }
    return true;
  });
}

// ─── Presentational atoms ──────────────────────────────────────────────────
function StaleDot({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 ${className}`}
      title="No activity in 30+ days"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
      stale
    </span>
  );
}

function CommentEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="relative w-12 h-12 mb-3" aria-hidden="true">
        <span className="absolute inset-0 rounded-full bg-blue-100/60 blur-md" />
        <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100/80 flex items-center justify-center">
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3.75h6m-6 3.75h9M4.5 4.5h15a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-15a1.5 1.5 0 0 1-1.5-1.5V6a1.5 1.5 0 0 1 1.5-1.5Z" />
          </svg>
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-700">No notes yet</p>
      <p className="text-xs text-slate-500 mt-1 max-w-[240px]">Market Visits come from your broker&apos;s photo uploads. Add a chain note below for observations that apply to the whole chain.</p>
    </div>
  );
}

function CommentSummaryHeader({
  lastCreated,
  storeCount,
  commentCount,
  visitCount,
  noteCount,
  isStale,
}: {
  lastCreated: Date | null;
  storeCount: number;
  commentCount: number;
  visitCount: number;
  noteCount: number;
  isStale: boolean;
}) {
  if (!commentCount) return null;
  const parts: string[] = [];
  if (lastCreated) parts.push(`Last activity: ${formatRelativeTime(lastCreated)}`);
  if (storeCount > 0) parts.push(`${storeCount} ${storeCount === 1 ? 'store' : 'stores'}`);
  if (visitCount > 0) parts.push(`${visitCount} ${visitCount === 1 ? 'visit' : 'visits'}`);
  if (noteCount > 0) parts.push(`${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`);
  if (visitCount === 0 && noteCount === 0) {
    parts.push(`${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`);
  }
  return (
    <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
      <span>{parts.join(' · ')}</span>
      {isStale && <StaleDot />}
    </p>
  );
}

// ─── Filter bar ────────────────────────────────────────────────────────────
function FilterPill({
  active,
  onClick,
  children,
  disabled = false,
  ariaLabel,
}: {
  active: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={[
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        'active:scale-[0.98]',
        active
          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function CommentFilterBar({
  filters,
  setFilters,
  authors,
  showSearch,
  showView,
}: {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  authors: Array<{ id: string; name: string }>;
  showSearch: boolean;
  showView: boolean;
}) {
  const update = (patch: Partial<FilterState>) => setFilters({ ...filters, ...patch });
  const dateOptions: Array<{ k: DateFilter; label: string }> = [
    { k: 'anytime', label: 'Anytime' },
    { k: 'week', label: 'This week' },
    { k: 'month', label: 'This month' },
    { k: 'quarter', label: 'This quarter' },
  ];
  const typeOptions: Array<{ k: TypeFilter; label: string }> = [
    { k: 'all', label: 'All' },
    { k: 'market', label: 'Market Visits' },
    { k: 'note', label: 'Chain notes' },
  ];
  const labelCls = 'text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex-shrink-0 mr-1 select-none';
  return (
    <div className="flex flex-col gap-2 pb-3 border-b border-slate-200 mb-3">
      {showView && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={labelCls}>View</span>
          <FilterPill active={filters.view === 'store'} onClick={() => update({ view: 'store' })}>
            By store
          </FilterPill>
          <FilterPill active={filters.view === 'all'} onClick={() => update({ view: 'all' })}>
            All
          </FilterPill>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={labelCls}>Type</span>
        {typeOptions.map(o => (
          <FilterPill key={o.k} active={filters.type === o.k} onClick={() => update({ type: o.k })}>
            {o.label}
          </FilterPill>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={labelCls}>When</span>
        {dateOptions.map(o => (
          <FilterPill key={o.k} active={filters.date === o.k} onClick={() => update({ date: o.k })}>
            {o.label}
          </FilterPill>
        ))}
      </div>
      {authors.length >= 2 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={labelCls}>Who</span>
          <FilterPill active={filters.author === 'all'} onClick={() => update({ author: 'all' })}>
            Everyone
          </FilterPill>
          {authors.map(a => (
            <FilterPill key={a.id} active={filters.author === a.id} onClick={() => update({ author: a.id })}>
              {a.name}
            </FilterPill>
          ))}
        </div>
      )}
      {showSearch && (
        <div className="relative mt-0.5">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={filters.search}
            onChange={e => update({ search: e.target.value })}
            placeholder="Search activity"
            className="w-full pl-8 pr-2.5 py-1.5 rounded-full border border-slate-200 bg-white text-[12px] placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
          />
        </div>
      )}
    </div>
  );
}

// ─── Group header ──────────────────────────────────────────────────────────
function CommentGroupHeader({
  group,
  open,
  onToggle,
}: {
  group: CommentGroup;
  open: boolean;
  onToggle: () => void;
}) {
  const last = group.lastActivity ? new Date(group.lastActivity) : null;
  const stale = last ? daysBetween(Date.now(), last) > STALE_DAYS : false;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="w-full flex items-center gap-2 py-2 px-2.5 rounded-lg hover:bg-white hover:shadow-sm transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <svg
        className={`w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
      </svg>
      {group.isChainBucket ? (
        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
        </svg>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-slate-900 truncate">{group.label}</span>
          {stale && <StaleDot />}
        </div>
        {last && (
          <div className="text-[11px] text-slate-500 truncate">
            Last activity {formatRelativeTime(last)} · {formatShortDate(last)}
          </div>
        )}
      </div>
      <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 flex-shrink-0 tabular-nums">
        {group.comments.length}
      </span>
    </button>
  );
}

// ─── Card bits ─────────────────────────────────────────────────────────────
interface CardCommonProps {
  comment: PortalComment;
  highlightId?: string | null;
  onEdit: (c: PortalComment) => void;
  onDelete: (c: PortalComment) => void;
  editingId: string | null;
  editText: string;
  setEditText: (s: string) => void;
  onSaveEdit: (c: PortalComment) => void;
  onCancelEdit: () => void;
  savingEdit: boolean;
  isLatest?: boolean;
  sameAuthorAsPrev?: boolean;
  suppressStoreAnchor?: boolean;
}

function useCardCommon(c: PortalComment) {
  const displayName = c.author || 'Anonymous';
  const createdAt = new Date(c.date).toLocaleString();
  const isEdited =
    !!c.updated_at &&
    !!c.date &&
    new Date(c.updated_at).getTime() - new Date(c.date).getTime() > 1000;
  const meta = parseCommentMeta(c.text);
  return { displayName, createdAt, isEdited, meta };
}

// Small Admin pill — indicates the comment came from a broker/admin so brand
// users can visually distinguish official commentary from peer notes.
function AdminPill() {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider px-1 py-[1px] rounded bg-indigo-100 text-indigo-700 border border-indigo-200"
      title="Posted by your broker"
    >
      Admin
    </span>
  );
}

function CommentCardExpanded({
  comment: c, isLatest = false, sameAuthorAsPrev = false, suppressStoreAnchor = false,
  highlightId, onEdit, onDelete,
  editingId, editText, setEditText, onSaveEdit, onCancelEdit, savingEdit,
}: CardCommonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { displayName, createdAt, isEdited, meta } = useCardCommon(c);
  const editing = editingId === c.id;
  const showStoreAnchor = meta.isMarketVisit && !!meta.storeName && !suppressStoreAnchor;
  const isHighlighted = highlightId && c.id && highlightId === c.id;

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const relTime = formatRelativeTime(c.date);
  const showChainNoteAnchor = !meta.isMarketVisit && !suppressStoreAnchor;

  return (
    <li
      data-comment-id={c.id || ''}
      className={[
        'group relative rounded-lg border border-slate-200/80 transition-all',
        'border-l-[3px]',
        isLatest
          ? 'border-l-blue-600'
          : meta.isMarketVisit
            ? 'border-l-blue-500'
            : 'border-l-slate-400',
        meta.isMarketVisit ? 'bg-blue-50/30' : 'bg-white',
        'hover:border-slate-300 hover:shadow-[0_1px_2px_rgba(15,23,42,0.05)]',
        sameAuthorAsPrev ? 'pt-2 pb-2.5 pl-3 pr-9' : 'pt-2.5 pb-3 pl-3 pr-9',
        isHighlighted ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-slate-100' : '',
      ].join(' ')}
    >
      {showStoreAnchor && (
        <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
          <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
          </svg>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide truncate" title={meta.storeName}>{meta.storeName}</span>
        </div>
      )}
      {showChainNoteAnchor && !sameAuthorAsPrev && (
        <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
          <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
          </svg>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide truncate">Chain note</span>
        </div>
      )}
      <div className="flex items-start gap-2">
        {!sameAuthorAsPrev ? (
          <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-semibold text-[12px] ring-1 ${c.isAdmin ? 'bg-gradient-to-br from-indigo-100 to-indigo-50 text-indigo-700 ring-indigo-200/60' : 'bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 ring-blue-200/40'}`}>
            {displayName[0]?.toUpperCase() || 'A'}
          </div>
        ) : (
          <div className="flex-shrink-0 w-7 flex justify-center" aria-hidden="true">
            <span className="w-px h-full bg-slate-200" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {!sameAuthorAsPrev && (
            <div className="flex items-center gap-1.5 min-w-0 mb-0.5 flex-wrap">
              <span className="text-[13px] font-medium text-slate-800 truncate">{displayName}</span>
              {c.isAdmin && <AdminPill />}
              <span className="text-slate-300 text-[10px]" aria-hidden="true">·</span>
              <span
                className="text-[11px] text-slate-500 whitespace-nowrap tabular-nums"
                title={createdAt}
              >
                {relTime}
                {isEdited && <span className="italic text-slate-400 ml-1">(edited)</span>}
              </span>
              {isLatest && (
                <span className="inline-flex items-center text-[10px] font-semibold text-blue-600 uppercase tracking-wide">
                  · Latest
                </span>
              )}
            </div>
          )}
          {sameAuthorAsPrev && isEdited && (
            <div className="mb-0.5">
              <span className="text-[10px] italic text-slate-400" title={createdAt}>edited · {relTime}</span>
            </div>
          )}
          {editing ? (
            <div className="flex flex-col gap-2 mt-1">
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                rows={2}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && !savingEdit && editText.trim()) {
                    e.preventDefault();
                    onSaveEdit(c);
                  }
                  if (e.key === 'Escape' && !savingEdit) onCancelEdit();
                }}
              />
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => onSaveEdit(c)}
                  disabled={savingEdit || !editText.trim()}
                  aria-busy={savingEdit}
                  className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600 transition-colors"
                >
                  {savingEdit ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={onCancelEdit}
                  disabled={savingEdit}
                  className="px-3 py-1 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-[14px] leading-relaxed text-slate-900 whitespace-pre-line">
              {meta.body || <span className="text-slate-300 italic">—</span>}
            </div>
          )}
        </div>
      </div>
      {c.isOwn && !editing && c.id && (
        <div ref={menuRef} className="absolute right-1.5 top-1.5">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setMenuOpen(v => !v);
            }}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm6 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm6 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-7 z-10 min-w-[120px] rounded-md border border-slate-200 bg-white shadow-lg py-1"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(c);
                }}
                className="block w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
              >
                Edit
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(c);
                }}
                className="block w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function CommentCardCondensed(props: CardCommonProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { comment: c, onEdit, onDelete } = props;
  const { displayName, meta } = useCardCommon(c);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const preview = (meta.body || '').replace(/\s+/g, ' ').trim();
  const truncated = preview.length > 60 ? preview.slice(0, 59).trimEnd() + '…' : preview;
  const dateLabel = formatShortDate(c.date);

  if (expanded) {
    return <CommentCardExpanded {...props} />;
  }

  return (
    <li className="group relative" data-comment-id={c.id || ''}>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={[
          'w-full flex items-center gap-2 pl-2 pr-8 py-1.5 rounded-md text-left',
          'border-l-2 transition-colors',
          meta.isMarketVisit ? 'border-l-blue-500 hover:bg-blue-50/50' : 'border-l-slate-400 hover:bg-slate-50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        ].join(' ')}
      >
        <span className="text-[11px] text-slate-500 tabular-nums flex-shrink-0 w-12">{dateLabel}</span>
        <span className="text-[11px] text-slate-500 flex-shrink-0 max-w-[80px] truncate">{displayName}</span>
        {c.isAdmin && <AdminPill />}
        <span className="text-[11px] text-slate-300 flex-shrink-0">·</span>
        <span className="text-[12.5px] text-slate-700 truncate min-w-0 flex-1">
          {truncated || <span className="text-slate-300 italic">—</span>}
        </span>
      </button>
      {c.isOwn && c.id && (
        <div ref={menuRef} className="absolute right-1 top-1/2 -translate-y-1/2">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setMenuOpen(v => !v);
            }}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-slate-700 hover:bg-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm6 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm6 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-7 z-10 min-w-[120px] rounded-md border border-slate-200 bg-white shadow-lg py-1"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setExpanded(true);
                  onEdit(c);
                }}
                className="block w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
              >
                Edit
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(c);
                }}
                className="block w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ─── Main comment list ────────────────────────────────────────────────────
function CommentList({
  rowComments,
  filters,
  setFilters,
  highlightId,
  onEdit,
  onDelete,
  editingId,
  editText,
  setEditText,
  onSaveEdit,
  onCancelEdit,
  savingEdit,
}: {
  rowComments: PortalComment[];
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  highlightId?: string | null;
  onEdit: (c: PortalComment) => void;
  onDelete: (c: PortalComment) => void;
  editingId: string | null;
  editText: string;
  setEditText: (s: string) => void;
  onSaveEdit: (c: PortalComment) => void;
  onCancelEdit: () => void;
  savingEdit: boolean;
}) {
  const isMobile = useIsMobile();
  const count = rowComments.length;
  const aboveGroups = count >= COMMENT_THRESHOLDS.groups;
  const aboveFilters = count >= COMMENT_THRESHOLDS.filters;
  const aboveSearch = count >= COMMENT_THRESHOLDS.search;
  const condenseByDefault = aboveSearch || (isMobile && count >= COMMENT_THRESHOLDS.filters);

  useEffect(() => {
    if (!aboveGroups && filters.view === 'store') {
      setFilters(f => ({ ...f, view: 'all' }));
    } else if (aboveGroups && filters.view === 'all') {
      setFilters(f => (f.view === 'all' ? { ...f, view: 'store' } : f));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aboveGroups]);

  const authorsList = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of rowComments) {
      const name = c.author || '';
      if (!name) continue;
      if (!m.has(name)) m.set(name, name);
    }
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [rowComments]);

  const filtered = useMemo(() => filterComments(rowComments, filters), [rowComments, filters]);
  const groups = useMemo(() => groupCommentsByStore(filtered), [filtered]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setOpenGroups(prev => {
      if (Object.keys(prev).length > 0) return prev;
      const init: Record<string, boolean> = {};
      groups.forEach((g, idx) => {
        init[g.key] = idx === 0;
      });
      return init;
    });
  }, [groups]);
  const toggleGroup = (key: string) => setOpenGroups(s => ({ ...s, [key]: !s[key] }));

  const cardProps = {
    highlightId,
    onEdit,
    onDelete,
    editingId,
    editText,
    setEditText,
    onSaveEdit,
    onCancelEdit,
    savingEdit,
  };

  if (count === 0) {
    return <CommentEmptyState />;
  }

  if (!aboveFilters) {
    return (
      <ul className="space-y-2">
        {rowComments.map((c, idx) => {
          const prev = rowComments[idx - 1];
          const sameAuthor = !!prev && String(prev.author || '') === String(c.author || '') && String(c.author || '') !== '';
          const sameDay = !!prev && sameLocalDay(prev.date, c.date);
          const showDivider = !prev || !sameDay;
          return (
            <React.Fragment key={c.id || idx}>
              {showDivider && idx > 0 && (
                <li aria-hidden="true" className="relative flex items-center justify-center py-1">
                  <span className="flex-1 h-px bg-slate-200/80" />
                  <span className="px-2 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                    {daySeparatorLabel(c.date)}
                  </span>
                  <span className="flex-1 h-px bg-slate-200/80" />
                </li>
              )}
              <CommentCardExpanded
                {...cardProps}
                comment={c}
                isLatest={false}
                sameAuthorAsPrev={sameAuthor && !showDivider}
              />
            </React.Fragment>
          );
        })}
      </ul>
    );
  }

  if (!aboveGroups) {
    return (
      <div>
        <CommentFilterBar
          filters={filters}
          setFilters={setFilters}
          authors={authorsList}
          showSearch={false}
          showView={false}
        />
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">Nothing matches these filters.</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((c, idx) => {
              const Card = condenseByDefault ? CommentCardCondensed : CommentCardExpanded;
              const prev = filtered[idx - 1];
              const sameAuthor = !!prev && String(prev.author || '') === String(c.author || '') && String(c.author || '') !== '';
              const sameDay = !!prev && sameLocalDay(prev.date, c.date);
              const showDivider = !prev || !sameDay;
              return (
                <React.Fragment key={c.id || idx}>
                  {showDivider && idx > 0 && (
                    <li aria-hidden="true" className="relative flex items-center justify-center py-1">
                      <span className="flex-1 h-px bg-slate-200/80" />
                      <span className="px-2 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                        {daySeparatorLabel(c.date)}
                      </span>
                      <span className="flex-1 h-px bg-slate-200/80" />
                    </li>
                  )}
                  <Card
                    {...cardProps}
                    comment={c}
                    isLatest={false}
                    sameAuthorAsPrev={sameAuthor && !showDivider}
                  />
                </React.Fragment>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div>
      <CommentFilterBar
        filters={filters}
        setFilters={setFilters}
        authors={authorsList}
        showSearch={aboveSearch}
        showView={true}
      />
      {filtered.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">Nothing matches these filters.</p>
      ) : filters.view === 'all' ? (
        <ul className="space-y-1.5">
          {filtered.map((c, idx) => {
            const Card = condenseByDefault ? CommentCardCondensed : CommentCardExpanded;
            const prev = filtered[idx - 1];
            const sameAuthor = !!prev && String(prev.author || '') === String(c.author || '') && String(c.author || '') !== '';
            const sameDay = !!prev && sameLocalDay(prev.date, c.date);
            const showDivider = !prev || !sameDay;
            return (
              <React.Fragment key={c.id || idx}>
                {showDivider && idx > 0 && !condenseByDefault && (
                  <li aria-hidden="true" className="relative flex items-center justify-center py-1">
                    <span className="flex-1 h-px bg-slate-200/80" />
                    <span className="px-2 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                      {daySeparatorLabel(c.date)}
                    </span>
                    <span className="flex-1 h-px bg-slate-200/80" />
                  </li>
                )}
                <Card
                  {...cardProps}
                  comment={c}
                  isLatest={false}
                  sameAuthorAsPrev={sameAuthor && !showDivider}
                />
              </React.Fragment>
            );
          })}
        </ul>
      ) : (
        <div className="space-y-1">
          {groups.map(g => {
            const open = openGroups[g.key] ?? false;
            const latest = g.comments[0];
            return (
              <section key={g.key} className="rounded-lg">
                <CommentGroupHeader group={g} open={open} onToggle={() => toggleGroup(g.key)} />
                {open && (
                  <ul className="mt-1 mb-2 pl-2 space-y-1.5 border-l border-slate-100 ml-2">
                    {g.comments.map((c, idx) => {
                      const isLatest = c === latest;
                      const prev = g.comments[idx - 1];
                      const sameAuthor = !!prev && String(prev.author || '') === String(c.author || '') && String(c.author || '') !== '';
                      if (isLatest) {
                        return (
                          <CommentCardExpanded
                            key={c.id || idx}
                            {...cardProps}
                            comment={c}
                            isLatest={true}
                            suppressStoreAnchor={!g.isChainBucket}
                          />
                        );
                      }
                      return (
                        <CommentCardCondensed
                          key={c.id || idx}
                          {...cardProps}
                          comment={c}
                          isLatest={false}
                          sameAuthorAsPrev={sameAuthor}
                          suppressStoreAnchor={!g.isChainBucket}
                        />
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────
export interface PortalCommentDrawerProps {
  open: boolean;
  onClose: () => void;
  scorecardId: string;
  rowId: string;
  retailerName: string;
  scorecardName?: string;
  comments: PortalComment[];
  // Initial filter & focus behavior — drives which click opened the drawer.
  initialTypeFilter?: TypeFilter;
  initialView?: ViewMode;
  focusComposer?: boolean;
  // Comment id that should scroll into view & pulse on open (e.g. newly posted).
  highlightCommentId?: string | null;
  // Parent-side state mutations so the preview strip + badge count stay in sync.
  onCommentCreated?: (c: PortalComment) => void;
  onCommentUpdated?: (c: PortalComment) => void;
  onCommentDeleted?: (id: string) => void;
  // Tell parent to mark the row as read when drawer opens.
  onMarkRead?: () => void;
  // Current user's display name (for composer avatar initial).
  currentUserName?: string;
}

export default function PortalCommentDrawer({
  open,
  onClose,
  scorecardId,
  rowId,
  retailerName,
  scorecardName,
  comments,
  initialTypeFilter,
  initialView,
  focusComposer,
  highlightCommentId,
  onCommentCreated,
  onCommentUpdated,
  onCommentDeleted,
  onMarkRead,
  currentUserName,
}: PortalCommentDrawerProps) {
  const clientLogos = useClientLogos();
  const retailerLogoUrl = findLogo(clientLogos, retailerName);
  const brandLogoUrl = findLogo(clientLogos, scorecardName || '');

  // Newest-first (admin convention) — portal page pushes ASC so we flip here.
  const rowComments = useMemo(() => {
    return [...comments].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [comments]);

  const summary = useMemo(() => computeSummary(rowComments), [rowComments]);

  // Composer state
  const [commentInput, setCommentInput] = useState('');
  const [isAddingComment, setIsAddingComment] = useState(false);
  const addingRef = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<Element | null>(null);

  // Edit state — scoped per comment id.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const savingEditRef = useRef(false);

  // Local highlight (e.g. just posted / deep-linked) — fades after a moment.
  const [localHighlightId, setLocalHighlightId] = useState<string | null>(null);

  // Filter state is owned by the drawer (hoisted from CommentList) so the
  // composer can adapt: Market Visit view is admin-authored, so we replace
  // the chain-note composer with a read-only banner in that mode.
  const [filters, setFilters] = useState<FilterState>({
    view: initialView || 'store',
    type: initialTypeFilter || 'all',
    date: 'anytime',
    author: 'all',
    search: '',
  });
  const currentTypeFilter = filters.type;

  // Open/close side effects: capture trigger, focus, body scroll lock, mark read.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    // Mark read as soon as the drawer opens.
    onMarkRead?.();
    // Focus the composer if requested, else the close button (anchors keyboard).
    requestAnimationFrame(() => {
      if (focusComposer && composerRef.current) {
        composerRef.current.focus();
      } else {
        closeBtnRef.current?.focus();
      }
    });
    // Body scroll lock for mobile bottom sheet.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      // Return focus to the trigger.
      const t = triggerRef.current;
      if (t && typeof (t as HTMLElement).focus === 'function') {
        try { (t as HTMLElement).focus(); } catch { /* noop */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Sync the incoming highlight prop into local highlight and scroll to it.
  useEffect(() => {
    if (!open) return;
    if (!highlightCommentId) return;
    setLocalHighlightId(highlightCommentId);
    const t = setTimeout(() => setLocalHighlightId(curr => (curr === highlightCommentId ? null : curr)), 2500);
    // Scroll to the highlighted comment after render (double rAF).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = drawerRef.current?.querySelector(`[data-comment-id="${highlightCommentId}"]`);
        if (el) (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    });
    return () => clearTimeout(t);
  }, [highlightCommentId, open]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Simple focus trap — keep tab cycles inside the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const root = drawerRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const handleAdd = async () => {
    if (addingRef.current) return;
    if (!commentInput.trim()) return;
    addingRef.current = true;
    setIsAddingComment(true);
    try {
      const res = await fetch('/api/portal/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          scorecard_id: scorecardId,
          row_id: rowId,
          text: commentInput.trim(),
        }),
      });
      if (!res.ok) throw new Error('Failed to post note');
      const newComment = await res.json();
      const created: PortalComment = {
        id: newComment.id,
        text: newComment.text || commentInput.trim(),
        author: newComment.author || currentUserName || 'You',
        date: newComment.created_at || new Date().toISOString(),
        isOwn: true,
      };
      onCommentCreated?.(created);
      setCommentInput('');
      // Highlight the newly posted comment briefly.
      if (created.id) {
        setLocalHighlightId(created.id);
        setTimeout(() => setLocalHighlightId(curr => (curr === created.id ? null : curr)), 2500);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const el = drawerRef.current?.querySelector(`[data-comment-id="${created.id}"]`);
            if (el) (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' });
          });
        });
      }
      toast.success('Chain note posted');
    } catch {
      toast.error('Could not post note. Please try again.');
    } finally {
      addingRef.current = false;
      setIsAddingComment(false);
    }
  };

  const handleEdit = (c: PortalComment) => {
    if (!c.id) return;
    setEditingId(c.id);
    // Edit against the raw text (so any prefix round-trips if present).
    setEditText(c.text);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const handleSaveEdit = async (c: PortalComment) => {
    if (!c.id) return;
    if (savingEditRef.current) return;
    if (!editText.trim()) return;
    savingEditRef.current = true;
    setSavingEdit(true);
    try {
      const res = await fetch('/api/portal/comments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: c.id, text: editText.trim() }),
      });
      if (!res.ok) throw new Error();
      onCommentUpdated?.({ ...c, text: editText.trim(), updated_at: new Date().toISOString() });
      setEditingId(null);
      setEditText('');
      toast.success('Note updated');
    } catch {
      toast.error('Could not update note.');
    } finally {
      savingEditRef.current = false;
      setSavingEdit(false);
    }
  };

  const handleDelete = async (c: PortalComment) => {
    if (!c.id) return;
    // Inline confirm — keep the drawer open; portal page handles heavier UX.
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/portal/comments?id=${c.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      onCommentDeleted?.(c.id);
      toast.success('Note deleted');
    } catch {
      toast.error('Could not delete note.');
    }
  };

  if (!open) return null;

  const composerDisabled = isAddingComment || !commentInput.trim();

  return (
    <div
      className="fixed left-0 right-0 bottom-0 top-0 z-50 flex flex-col sm:flex-row"
      role="dialog"
      aria-modal="true"
      aria-label={`Activity for ${retailerName}`}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div
        className="absolute inset-0 bg-black bg-opacity-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        className="relative ml-auto w-full sm:max-w-md bg-white shadow-2xl flex flex-col border-slate-200 mt-auto sm:mt-0 sm:h-full h-[92vh] max-h-[92dvh] sm:rounded-none rounded-t-2xl sm:border-l border-t sm:border-t-0 sheet-slide-up sm:animate-slideInRight"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Mobile drag handle */}
        <div className="sm:hidden pt-2 pb-1 flex justify-center">
          <span className="block w-10 h-1 rounded-full bg-slate-300" aria-hidden="true" />
        </div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 sm:px-6 py-4 sm:py-5 bg-slate-50 rounded-t-2xl sm:rounded-none">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {retailerLogoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={retailerLogoUrl}
                alt=""
                className="flex-shrink-0 w-10 h-10 rounded-lg object-contain bg-white border border-slate-200 p-0.5 mt-0.5"
              />
            ) : (
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center mt-0.5" aria-hidden="true">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
              </div>
            )}
            <div className="min-w-0 flex-1">
              {scorecardName && (
                <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[11px] text-slate-500 mb-0.5 min-w-0">
                  {brandLogoUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={brandLogoUrl} alt="" className="w-4 h-4 rounded object-contain bg-white border border-slate-200 flex-shrink-0" />
                  )}
                  <span className="truncate" title={scorecardName}>{scorecardName}</span>
                </nav>
              )}
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight truncate" title={retailerName}>{retailerName}</h2>
              <CommentSummaryHeader
                lastCreated={summary.lastCreated}
                storeCount={summary.storeCount}
                commentCount={summary.commentCount}
                visitCount={summary.visitCount}
                noteCount={summary.noteCount}
                isStale={summary.isStale}
              />
            </div>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close activity"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {/* Body — activity list above, composer below. */}
        <div className="flex-1 flex flex-col px-5 sm:px-6 py-4 overflow-y-auto bg-slate-100/70">
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Activity</h3>
          <div className="flex-1 overflow-y-auto mb-2 pr-1 -mr-1">
            <CommentList
              rowComments={rowComments}
              filters={filters}
              setFilters={setFilters}
              highlightId={localHighlightId}
              onEdit={handleEdit}
              onDelete={handleDelete}
              editingId={editingId}
              editText={editText}
              setEditText={setEditText}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
              savingEdit={savingEdit}
            />
          </div>
          {currentTypeFilter === 'market' ? (
            /* Market Visits are admin-authored (generated by market-visit
               uploads). Brand users can't post them, so replace the composer
               with a read-only info banner and a one-tap switch back to the
               chain-note composer. */
            <div className="mt-2 pt-4 border-t border-slate-200 bg-white rounded-b-2xl">
              <div className="flex items-start gap-3 px-1 py-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center mt-0.5" aria-hidden="true">
                  <svg className="w-4 h-4 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-slate-700 leading-tight">Store visit notes are added by your broker.</p>
                  <p className="text-[11px] text-slate-500 leading-snug mt-0.5">They&apos;re generated automatically after on-site market visits.</p>
                  <button
                    type="button"
                    onClick={() => { setFilters(f => ({ ...f, type: 'all' })); composerRef.current?.focus(); }}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  >
                    Write a chain-level note instead
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Composer — mirrors the admin chain-note composer exactly. */
            <form
              onSubmit={e => { e.preventDefault(); if (!composerDisabled) handleAdd(); }}
              className="pt-4 border-t border-slate-200 bg-white rounded-b-2xl mt-2"
            >
              <div className="flex items-center gap-1.5 mb-1.5 pl-1">
                <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Chain note</span>
                <span className="text-slate-300 text-[10px]" aria-hidden="true">·</span>
                <span className="text-[11px] text-slate-500">visible across all stores in this chain</span>
              </div>
              <div className="flex gap-3 items-start">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-base mt-1">
                  {(currentUserName || 'A')[0]?.toUpperCase() || 'A'}
                </div>
                <div className="flex-1 rounded-xl border border-slate-200 border-l-[3px] border-l-slate-400 bg-white focus-within:border-blue-500 focus-within:border-l-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-colors">
                  <textarea
                    ref={composerRef}
                    value={commentInput}
                    onChange={e => setCommentInput(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm bg-transparent resize-none min-h-[44px] focus:outline-none placeholder:text-slate-400"
                    placeholder={retailerName ? `Add a note about ${retailerName}…` : 'Write a chain-level note…'}
                    rows={commentInput.length > 60 ? 4 : 2}
                    style={{ minHeight: 44, maxHeight: 140 }}
                    onFocus={e => (e.currentTarget.rows = 4)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!composerDisabled) handleAdd(); } }}
                    disabled={isAddingComment}
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <span className="text-[10px] text-slate-400 hidden sm:inline">Enter to post · Shift+Enter for new line</span>
                <button
                  type="submit"
                  disabled={composerDisabled}
                  aria-busy={isAddingComment}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                >
                  {isAddingComment ? 'Posting…' : 'Post note'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
