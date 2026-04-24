'use client';
// TODO: unify — SimpleCommentDrawer and RetailerDrawer below are ~90% identical.
// Per project convention we do NOT refactor into a shared drawer component;
// replicate changes in both and keep them in sync by hand.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAdminGrid } from './AdminDataGridContext';
import { parseCommentMeta } from './commentMeta';
import { useClientLogos, findLogo } from './useClientLogos';

// ─── Progressive-disclosure thresholds ─────────────────────────────────────
// Keep these as local constants so they can be tuned from one place.
const COMMENT_THRESHOLDS = {
  filters: 4, // below this: flat list, no filter bar
  groups: 10, // at/above: switch to By-store grouping
  search: 25, // at/above: condensed default + search input
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

// Label used for day-separators between cards: "Today", "Yesterday",
// otherwise a short month-day form. Adds reading rhythm to the feed.
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

function isMarketVisitMeta(c: any): boolean {
  return parseCommentMeta(c?.text).isMarketVisit;
}

interface CommentGroup {
  key: string; // storeName or CHAIN_BUCKET
  label: string; // display name
  comments: any[]; // newest-first within the group
  lastActivity: number; // ms epoch of most recent comment in group
  isChainBucket: boolean;
}

function groupCommentsByStore(comments: any[]): CommentGroup[] {
  const map = new Map<string, CommentGroup>();
  for (const c of comments) {
    const meta = parseCommentMeta(c.text);
    const isChain = !meta.isMarketVisit || !meta.storeName;
    const key = isChain ? CHAIN_BUCKET : (meta.storeName as string);
    const label = isChain ? 'Chain notes' : (meta.storeName as string);
    const createdAt = new Date(c.created_at).getTime();
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
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
  return Array.from(map.values()).sort((a, b) => {
    // Chain bucket always last
    if (a.isChainBucket && !b.isChainBucket) return 1;
    if (!a.isChainBucket && b.isChainBucket) return -1;
    return b.lastActivity - a.lastActivity;
  });
}

// Compute summary facts from (already newest-first) comments list.
function computeSummary(comments: any[]) {
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
    const t = new Date(c.created_at).getTime();
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

// Simple coarse-pointer / small-viewport detector. Mirrors patterns already
// present in the codebase (matchMedia + window.innerWidth).
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
  author: string; // user_id or 'all'
  search: string;
}

function filterComments(comments: any[], f: FilterState): any[] {
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
      const t = new Date(c.created_at).getTime();
      if (now - t > windowMs) return false;
    }
    if (f.author !== 'all' && String(c.user_id || '') !== f.author) return false;
    if (q) {
      const body = parseCommentMeta(c.text).body.toLowerCase();
      const name = String(c.author_name || c.user_email || '').toLowerCase();
      if (!body.includes(q) && !name.includes(q)) return false;
    }
    return true;
  });
}

// ─── Presentational atoms ──────────────────────────────────────────────────
function TypePill({ isMarketVisit }: { isMarketVisit: boolean }) {
  // Muted inline label — no heavy pill chrome. Color communicates type.
  if (isMarketVisit) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 uppercase tracking-wide">
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
        </svg>
        Market Visit
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 uppercase tracking-wide">
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3.75h6m-6 3.75h9M4.5 4.5h15a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-15a1.5 1.5 0 0 1-1.5-1.5V6a1.5 1.5 0 0 1 1.5-1.5Z" />
      </svg>
      Chain note
    </span>
  );
}

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
      <p className="text-xs text-slate-500 mt-1 max-w-[240px]">Market Visits come from uploads. Add a chain note below for observations that apply to the whole chain.</p>
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
  if (lastCreated) parts.push(`Last visit: ${formatRelativeTime(lastCreated)}`);
  if (storeCount > 0) parts.push(`${storeCount} ${storeCount === 1 ? 'store' : 'stores'}`);
  if (visitCount > 0) parts.push(`${visitCount} ${visitCount === 1 ? 'visit' : 'visits'}`);
  if (noteCount > 0) parts.push(`${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`);
  // Fallback — shouldn't hit since commentCount>0, but guards zero-split edge.
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
      {/* Store glyph anchor — reinforces that groups are stores */}
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
            Last visit {formatRelativeTime(last)} · {formatShortDate(last)}
          </div>
        )}
      </div>
      <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 flex-shrink-0 tabular-nums">
        {group.comments.length}
      </span>
    </button>
  );
}

// ─── Card (expanded) ───────────────────────────────────────────────────────
interface CardCommonProps {
  rowId: number | string;
  comment: any;
  index: number;
  isAuthor: boolean;
  isLatest: boolean;
  // When true, the previous card (above) is by the same author — we collapse
  // the avatar/name row, iMessage-style, to remove monotony in runs.
  sameAuthorAsPrev?: boolean;
  // When true, we are already inside a group by this store — don't repeat
  // the store anchor in the card itself.
  suppressStoreAnchor?: boolean;
}

function useCardCommon(c: any) {
  const { user } = useAdminGrid();
  const isAuthor = user?.id === c.user_id;
  const authorEmail = c.user_email || c.email || '';
  const fallbackPrefix = authorEmail ? authorEmail.split('@')[0] : 'Anonymous';
  const displayName =
    (c.author_name && String(c.author_name).trim()) ||
    fallbackPrefix.charAt(0).toUpperCase() + fallbackPrefix.slice(1);
  const createdAt = new Date(c.created_at).toLocaleString();
  const isEdited =
    c.updated_at &&
    c.created_at &&
    new Date(c.updated_at).getTime() - new Date(c.created_at).getTime() > 1000;
  const meta = parseCommentMeta(c.text);
  return { isAuthor, displayName, createdAt, isEdited, meta };
}

function CommentCardExpanded({
  rowId, comment: c, index: i, isLatest,
  sameAuthorAsPrev = false, suppressStoreAnchor = false,
}: CardCommonProps) {
  const {
    comments, selectedCategory,
    editCommentIdx, editCommentText, setEditCommentIdx, setEditCommentText,
    updateComment, setConfirmDeleteComment,
  } = useAdminGrid();
  const clientLogos = useClientLogos();
  const [savingEdit, setSavingEdit] = useState(false);
  const savingEditRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { isAuthor, displayName, createdAt, isEdited, meta } = useCardCommon(c);
  const authorBrand: string | null = c.author_brand_name || null;
  const authorBrandLogo = authorBrand ? findLogo(clientLogos, authorBrand) : null;
  const editing = editCommentIdx === i;
  const showStoreAnchor = meta.isMarketVisit && !!meta.storeName && !suppressStoreAnchor;

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  // Relative, compact timestamp top-right — keeps cadence without shouting.
  const relTime = formatRelativeTime(c.created_at);

  // Persistent chain-note anchor when this is a Note card (not a market visit)
  // and we aren't already inside a store group header. Gives Note cards the
  // same visual weight as Market Visit cards.
  const showChainNoteAnchor = !meta.isMarketVisit && !suppressStoreAnchor;

  return (
    <li
      className={[
        'group relative rounded-lg border border-slate-200/80 transition-all',
        // Persistent, saturated left accent — communicates type at rest even
        // when the author row is collapsed on iMessage-style runs.
        'border-l-[3px]',
        isLatest
          ? 'border-l-blue-600'
          : meta.isMarketVisit
            ? 'border-l-blue-500'
            : 'border-l-slate-400',
        // Subtle type-tint so Market Visit vs Note reads without reading.
        meta.isMarketVisit ? 'bg-blue-50/30' : 'bg-white',
        // Gentle lift on hover — gives the feed rhythm.
        'hover:border-slate-300 hover:shadow-[0_1px_2px_rgba(15,23,42,0.05)]',
        // Room on the right so the top-right overflow-menu trigger never
        // collides with the timestamp/author row.
        sameAuthorAsPrev ? 'pt-2 pb-2.5 pl-3 pr-9' : 'pt-2.5 pb-3 pl-3 pr-9',
      ].join(' ')}
    >
      {/* Store anchor — the thing admins actually search for. Lives at the
          top of each card so it reads first, unless we're already inside a
          store group header. Date intentionally dropped here: the relative
          timestamp in the author row is the single source of truth. */}
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
        {/* Avatar — hidden when previous card is by same author (iMessage-style run) */}
        {!sameAuthorAsPrev ? (
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-blue-700 font-semibold text-[12px] ring-1 ring-blue-200/40">
            {displayName[0]?.toUpperCase() || 'A'}
          </div>
        ) : (
          // Reserve the gutter AND draw a subtle thread connector — makes
          // same-author runs visibly belong together (Slack-thread style).
          <div className="flex-shrink-0 w-7 flex justify-center" aria-hidden="true">
            <span className="w-px h-full bg-slate-200" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {/* Author/time row collapses on subsequent cards by the same author.
              Timestamp now rides inline with author (not top-right corner) so
              the overflow menu owns the corner unambiguously. */}
          {!sameAuthorAsPrev && (
            <div className="flex items-center gap-1.5 min-w-0 mb-0.5 flex-wrap">
              <span className="text-[13px] font-medium text-slate-800 truncate">{displayName}</span>
              {authorBrand && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] text-slate-500 max-w-[120px]"
                  title={`Brand user: ${authorBrand}`}
                >
                  {authorBrandLogo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={authorBrandLogo} alt="" className="w-3 h-3 rounded-sm object-contain flex-shrink-0" />
                  ) : (
                    <svg className="w-2.5 h-2.5 flex-shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                    </svg>
                  )}
                  <span className="truncate">{authorBrand}</span>
                </span>
              )}
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
          {/* For collapsed (same-author) cards: no author row, no right-side
              timestamp — the corner belongs to the always-visible ⋯ menu.
              Edit indicator only, if present. */}
          {sameAuthorAsPrev && isEdited && (
            <div className="mb-0.5">
              <span className="text-[10px] italic text-slate-400" title={createdAt}>edited · {relTime}</span>
            </div>
          )}
          {editing ? (
            <div className="flex flex-col gap-2 mt-1">
              <textarea
                value={editCommentText}
                onChange={e => setEditCommentText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                rows={2}
                autoFocus
              />
              <div className="flex gap-2 mt-1">
                <button
                  onClick={async () => {
                    if (savingEditRef.current) return;
                    savingEditRef.current = true;
                    setSavingEdit(true);
                    try {
                      const target = comments[selectedCategory][rowId][i];
                      await updateComment(target.id, editCommentText);
                      setEditCommentIdx(null);
                      setEditCommentText('');
                      toast.success('Note updated');
                    } catch {
                      toast.error('Failed to update note');
                    } finally {
                      savingEditRef.current = false;
                      setSavingEdit(false);
                    }
                  }}
                  disabled={savingEdit || !editCommentText.trim()}
                  aria-busy={savingEdit}
                  className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600 transition-colors"
                >
                  {savingEdit ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditCommentIdx(null);
                    setEditCommentText('');
                  }}
                  disabled={savingEdit}
                  className="px-3 py-1 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            // The content. Bumped to 14px + stronger ink — this is the actual signal.
            <div className="text-[14px] leading-relaxed text-slate-900 whitespace-pre-line">
              {meta.body || <span className="text-slate-300 italic">—</span>}
            </div>
          )}
        </div>
      </div>
      {/* Overflow menu — ALWAYS visible at rest (muted), darkens on hover.
          Hover-to-reveal failed on touch and made Edit/Delete un-discoverable
          on desktop. Pattern: GitHub / Linear / Slack comment menus. */}
      {isAuthor && !editing && (
        <div
          ref={menuRef}
          className="absolute right-1.5 top-1.5"
        >
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
                  setEditCommentIdx(i);
                  setEditCommentText(c.text);
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
                  setConfirmDeleteComment({ rowId, commentIdx: i });
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

// ─── Card (condensed, single-line, click to expand) ───────────────────────
function CommentCardCondensed({ rowId, comment: c, index: i, suppressStoreAnchor = false }: CardCommonProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const {
    setEditCommentIdx, setEditCommentText, setConfirmDeleteComment,
  } = useAdminGrid();
  const { isAuthor, displayName, meta } = useCardCommon(c);

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
  const dateLabel = formatShortDate(c.created_at);

  if (expanded) {
    return <CommentCardExpanded rowId={rowId} comment={c} index={i} isAuthor={isAuthor} isLatest={false} suppressStoreAnchor={suppressStoreAnchor} />;
  }

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={[
          // Right padding reserves space for the always-visible ⋯ trigger,
          // preventing the old collision where the overflow icon sat on top
          // of the preview text.
          'w-full flex items-center gap-2 pl-2 pr-8 py-1.5 rounded-md text-left',
          'border-l-2 transition-colors',
          meta.isMarketVisit ? 'border-l-blue-500 hover:bg-blue-50/50' : 'border-l-slate-400 hover:bg-slate-50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        ].join(' ')}
      >
        <span className="text-[11px] text-slate-500 tabular-nums flex-shrink-0 w-12">{dateLabel}</span>
        <span className="text-[11px] text-slate-500 flex-shrink-0 max-w-[80px] truncate">{displayName}</span>
        <span className="text-[11px] text-slate-300 flex-shrink-0">·</span>
        <span className="text-[12.5px] text-slate-700 truncate min-w-0 flex-1">
          {truncated || <span className="text-slate-300 italic">—</span>}
        </span>
      </button>
      {isAuthor && (
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
                  setEditCommentIdx(i);
                  setEditCommentText(c.text);
                  setExpanded(true);
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
                  setConfirmDeleteComment({ rowId, commentIdx: i });
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

// ─── Main comment list with progressive disclosure ────────────────────────
function CommentList({ rowId }: { rowId: number | string }) {
  const { comments, selectedCategory } = useAdminGrid();
  const raw = useMemo(
    () => comments[selectedCategory]?.[rowId] || [],
    [comments, selectedCategory, rowId]
  );
  // Newest first — flip the API's ASC order client-side.
  const rowComments = useMemo(() => {
    return [...raw].sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [raw]);

  const isMobile = useIsMobile();
  const count = rowComments.length;
  const aboveGroups = count >= COMMENT_THRESHOLDS.groups;
  const aboveFilters = count >= COMMENT_THRESHOLDS.filters;
  const aboveSearch = count >= COMMENT_THRESHOLDS.search;
  const condenseByDefault = aboveSearch || (isMobile && count >= COMMENT_THRESHOLDS.filters);

  const [filters, setFilters] = useState<FilterState>({
    view: 'store',
    type: 'all',
    date: 'anytime',
    author: 'all',
    search: '',
  });
  // Keep view mode aligned with disclosure level.
  useEffect(() => {
    if (!aboveGroups && filters.view === 'store') {
      setFilters(f => ({ ...f, view: 'all' }));
    } else if (aboveGroups && filters.view === 'all') {
      // auto-upgrade on first cross of threshold
      setFilters(f => (f.view === 'all' ? { ...f, view: 'store' } : f));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aboveGroups]);

  const authorsList = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of rowComments) {
      const id = String(c.user_id || '');
      if (!id) continue;
      if (!m.has(id)) {
        const authorEmail = c.user_email || c.email || '';
        const fallback = authorEmail ? authorEmail.split('@')[0] : 'Anonymous';
        const name =
          (c.author_name && String(c.author_name).trim()) ||
          fallback.charAt(0).toUpperCase() + fallback.slice(1);
        m.set(id, name);
      }
    }
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [rowComments]);

  const filtered = useMemo(() => filterComments(rowComments, filters), [rowComments, filters]);

  const groups = useMemo(() => groupCommentsByStore(filtered), [filtered]);

  // Only the most-recent group is expanded by default.
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

  // Map comment id -> original index into rowComments (newest-first order),
  // but the underlying handlers need the ORIGINAL api-order index (the ASC one
  // stored in the context). So we resolve by scanning `raw` each time.
  const originalIndexOf = (c: any): number => {
    const id = c.id;
    if (id == null) return raw.indexOf(c);
    const idx = raw.findIndex((x: any) => x.id === id);
    return idx === -1 ? raw.indexOf(c) : idx;
  };

  if (count === 0) {
    return <CommentEmptyState />;
  }

  // 1–3 comments: flat newest-first, no filter bar, no groups.
  if (!aboveFilters) {
    return (
      <ul className="space-y-2">
        {rowComments.map((c: any, idx: number) => {
          const i = originalIndexOf(c);
          const prev = rowComments[idx - 1];
          const sameAuthor = !!prev && String(prev.user_id || '') === String(c.user_id || '') && String(c.user_id || '') !== '';
          const sameDay = !!prev && sameLocalDay(prev.created_at, c.created_at);
          const showDivider = !prev || !sameDay;
          return (
            <React.Fragment key={c.id || i}>
              {showDivider && idx > 0 && (
                <li aria-hidden="true" className="relative flex items-center justify-center py-1">
                  <span className="flex-1 h-px bg-slate-200/80" />
                  <span className="px-2 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                    {daySeparatorLabel(c.created_at)}
                  </span>
                  <span className="flex-1 h-px bg-slate-200/80" />
                </li>
              )}
              <CommentCardExpanded
                rowId={rowId}
                comment={c}
                index={i}
                isAuthor={false}
                isLatest={false}
                sameAuthorAsPrev={sameAuthor && !showDivider}
              />
            </React.Fragment>
          );
        })}
      </ul>
    );
  }

  // 4–9 comments: flat + simple chip filters (no grouping).
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
            {filtered.map((c: any, idx: number) => {
              const i = originalIndexOf(c);
              const condensed = condenseByDefault;
              const Card = condensed ? CommentCardCondensed : CommentCardExpanded;
              const prev = filtered[idx - 1];
              const sameAuthor = !!prev && String(prev.user_id || '') === String(c.user_id || '') && String(c.user_id || '') !== '';
              const sameDay = !!prev && sameLocalDay(prev.created_at, c.created_at);
              const showDivider = !prev || !sameDay;
              return (
                <React.Fragment key={c.id || i}>
                  {showDivider && idx > 0 && (
                    <li aria-hidden="true" className="relative flex items-center justify-center py-1">
                      <span className="flex-1 h-px bg-slate-200/80" />
                      <span className="px-2 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                        {daySeparatorLabel(c.created_at)}
                      </span>
                      <span className="flex-1 h-px bg-slate-200/80" />
                    </li>
                  )}
                  <Card
                    rowId={rowId}
                    comment={c}
                    index={i}
                    isAuthor={false}
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

  // 10+ comments: grouped by store (if view=store) OR flat (if view=all).
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
          {filtered.map((c: any, idx: number) => {
            const i = originalIndexOf(c);
            const Card = condenseByDefault ? CommentCardCondensed : CommentCardExpanded;
            const prev = filtered[idx - 1];
            const sameAuthor = !!prev && String(prev.user_id || '') === String(c.user_id || '') && String(c.user_id || '') !== '';
            const sameDay = !!prev && sameLocalDay(prev.created_at, c.created_at);
            const showDivider = !prev || !sameDay;
            return (
              <React.Fragment key={c.id || i}>
                {showDivider && idx > 0 && !condenseByDefault && (
                  <li aria-hidden="true" className="relative flex items-center justify-center py-1">
                    <span className="flex-1 h-px bg-slate-200/80" />
                    <span className="px-2 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                      {daySeparatorLabel(c.created_at)}
                    </span>
                    <span className="flex-1 h-px bg-slate-200/80" />
                  </li>
                )}
                <Card
                  rowId={rowId}
                  comment={c}
                  index={i}
                  isAuthor={false}
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
                    {g.comments.map((c: any, idx: number) => {
                      const i = originalIndexOf(c);
                      const isLatest = c === latest;
                      const prev = g.comments[idx - 1];
                      const sameAuthor = !!prev && String(prev.user_id || '') === String(c.user_id || '') && String(c.user_id || '') !== '';
                      if (isLatest) {
                        // Latest = expanded + Latest accent. Inside a store group, the
                        // header already shows the store — don't repeat it in the card.
                        return (
                          <CommentCardExpanded
                            key={c.id || i}
                            rowId={rowId}
                            comment={c}
                            index={i}
                            isAuthor={false}
                            isLatest={true}
                            suppressStoreAnchor={!g.isChainBucket}
                          />
                        );
                      }
                      // Non-latest — condensed within group
                      return (
                        <CommentCardCondensed
                          key={c.id || i}
                          rowId={rowId}
                          comment={c}
                          index={i}
                          isAuthor={false}
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

// Shared comment input form.
// NOTE: everything typed here becomes a CHAIN NOTE (no store metadata).
// The composer visually mirrors chain-note cards (slate left-rail) so users
// understand at-a-glance what their post will look like after it lands.
function CommentInput({ onSubmit, chainName }: { onSubmit: () => void; chainName?: string }) {
  const { user, commentInput, setCommentInput, isAddingComment } = useAdminGrid();
  const disabled = isAddingComment || !commentInput.trim();
  const placeholder = chainName
    ? `Add a note about ${chainName}…`
    : 'Write a chain-level note…';

  return (
    <form
      onSubmit={e => { e.preventDefault(); if (!disabled) onSubmit(); }}
      className="pt-4 border-t border-slate-200 bg-white rounded-b-2xl mt-2"
    >
      {/* Scope caption — mirrors the CHAIN NOTE accent label shown on chain-note cards.
          Signals exactly what "Post note" will produce before the user types. */}
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
          {(user?.name || user?.username || 'A')[0].toUpperCase()}
        </div>
        {/* Slate left-rail around the textarea — the same accent chain-note cards use,
            so the composer previews its output. */}
        <div className="flex-1 rounded-xl border border-slate-200 border-l-[3px] border-l-slate-400 bg-white focus-within:border-blue-500 focus-within:border-l-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-colors">
          <textarea
            value={commentInput}
            onChange={e => setCommentInput(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm bg-transparent resize-none min-h-[44px] focus:outline-none placeholder:text-slate-400"
            placeholder={placeholder}
            rows={commentInput.length > 60 ? 4 : 2}
            style={{ minHeight: 44, maxHeight: 140 }}
            onFocus={e => e.currentTarget.rows = 4}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!disabled) onSubmit(); } }}
            disabled={isAddingComment}
          />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="text-[10px] text-slate-400 hidden sm:inline">Enter to post · Shift+Enter for new line</span>
        <button
          type="submit"
          disabled={disabled}
          aria-busy={isAddingComment}
          className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
        >
          {isAddingComment ? 'Posting…' : 'Post note'}
        </button>
      </div>
    </form>
  );
}

// ─── Simple Comment Drawer (opened from comment icon) ───────────────────────
// TODO: unify — see note at the top of the file.
export function SimpleCommentDrawer() {
  const {
    openCommentRowId, handleCloseCommentModal, handleAddComment,
    getCurrentData, editingScoreCard, comments, selectedCategory,
  } = useAdminGrid();
  const clientLogos = useClientLogos();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // iOS Safari keyboard handling — see PortalCommentDrawer for full rationale.
  // Admin subtracts 56px (top-14) so the drawer stays below the sticky header.
  useEffect(() => {
    if (openCommentRowId === null) return;
    const root = containerRef.current;
    if (!root) return;
    const vv = (typeof window !== 'undefined') ? window.visualViewport : null;
    if (!vv) return;
    const sync = () => {
      const delta = window.innerHeight - vv.height;
      if (delta > 80) {
        root.style.setProperty('--drawer-h', `${vv.height - 56}px`);
      } else {
        root.style.removeProperty('--drawer-h');
      }
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      root.style.removeProperty('--drawer-h');
    };
  }, [openCommentRowId]);

  if (openCommentRowId === null) return null;

  const row = getCurrentData()?.rows.find((r: any) => r.id === openCommentRowId) || {};
  const scorecardName = editingScoreCard?.name || '';
  const brandLogoUrl = findLogo(clientLogos, scorecardName);
  const retailerLogoUrl = findLogo(clientLogos, row.name);

  const rowComments = comments[selectedCategory]?.[row.id] || [];
  const summary = computeSummary(rowComments);

  return (
    // Drawer sits below the sticky AdminHeader (~56px / top-14, z-50). Height
    // uses `var(--drawer-h, calc(100dvh - 3.5rem))` (tracks URL-bar + keyboard)
    // with a `calc(100vh - 3.5rem)` class fallback for iOS <15.4.
    <div
      ref={containerRef}
      className="fixed left-0 right-0 bottom-0 z-40 flex flex-col sm:flex-row h-[calc(100vh-3.5rem)]"
      style={{ height: 'var(--drawer-h, calc(100dvh - 3.5rem))' }}
    >
      <div className="absolute inset-0 bg-black bg-opacity-40 transition-opacity" onClick={handleCloseCommentModal}></div>
      <div
        className="relative ml-auto w-full sm:max-w-md bg-white shadow-2xl flex flex-col border-slate-200 mt-auto sm:mt-0 sm:h-full h-[92%] max-h-full rounded-t-2xl sm:rounded-t-none sm:rounded-l-2xl sm:border-l border-t sm:border-t-0 sheet-slide-up sm:animate-slideInRight"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="sm:hidden pt-2 pb-1 flex justify-center">
          <span className="block w-10 h-1 rounded-full bg-slate-300" aria-hidden="true" />
        </div>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 sm:px-6 py-4 sm:py-5 bg-slate-50 rounded-t-2xl">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {/* Scope badge: retailer logo when available, else chain icon (indigo) */}
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
              <h2 className="text-xl font-bold text-slate-900 leading-tight truncate" title={row.name || 'Row'}>{row.name || 'Row'}</h2>
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
            onClick={handleCloseCommentModal}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close activity"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 flex flex-col px-5 sm:px-6 py-4 overflow-y-auto bg-slate-100/70">
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Activity</h3>
          <div className="flex-1 overflow-y-auto mb-2 pr-1 -mr-1">
            {row.id != null && <CommentList rowId={row.id} />}
          </div>
          <CommentInput onSubmit={handleAddComment} />
        </div>
      </div>
    </div>
  );
}

// ─── Retailer Drawer (opened from row click — has address + comments) ───────
// TODO: unify — see note at the top of the file.
export function RetailerDrawer() {
  const ctx = useAdminGrid();
  const {
    openRetailerDrawer, selectedCategory, user,
    commentInput, setCommentInput, editingScoreCard,
    getCurrentData, updateCurrentData, isScorecard,
    setScorecards, setEditingScoreCard, setSelectedCategory,
    setOpenRetailerDrawer, setComments, comments,
  } = ctx;

  const [isAddingRetailerComment, setIsAddingRetailerComment] = useState(false);
  const addingRetailerRef = useRef(false);
  const clientLogos = useClientLogos();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // iOS keyboard handling — mirror of SimpleCommentDrawer above.
  useEffect(() => {
    if (openRetailerDrawer === null) return;
    const root = containerRef.current;
    if (!root) return;
    const vv = (typeof window !== 'undefined') ? window.visualViewport : null;
    if (!vv) return;
    const sync = () => {
      const delta = window.innerHeight - vv.height;
      if (delta > 80) {
        root.style.setProperty('--drawer-h', `${vv.height - 56}px`);
      } else {
        root.style.removeProperty('--drawer-h');
      }
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      root.style.removeProperty('--drawer-h');
    };
  }, [openRetailerDrawer]);

  if (openRetailerDrawer === null || !selectedCategory || !isScorecard(selectedCategory)) return null;

  const currentData = getCurrentData();
  // Flexible match: support both numeric and string row IDs
  const row = currentData?.rows.find((r: any) => r.id === openRetailerDrawer || String(r.id) === String(openRetailerDrawer)) || {};

  const handleAddRetailerComment = async () => {
    if (addingRetailerRef.current) return;
    if (!commentInput.trim() || openRetailerDrawer == null || !selectedCategory || !user) return;

    addingRetailerRef.current = true;
    setIsAddingRetailerComment(true);
    try {
      const currentScorecard = editingScoreCard;
      const requestBody: any = {
        scorecard_id: selectedCategory,
        user_id: openRetailerDrawer,
        text: commentInput.trim(),
        scorecard_data: selectedCategory.startsWith('scorecard_') ? {
          name: currentScorecard?.name || 'Untitled Scorecard',
          columns: currentScorecard?.columns || [],
          rows: currentScorecard?.rows || []
        } : undefined
      };

      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to post note');
      }

      const newComment = await response.json();

      if (newComment.migrated_scorecard) {
        const { old_id, new_id, title } = newComment.migrated_scorecard;
        const migratedScorecard = {
          ...currentScorecard!,
          id: new_id,
          name: title,
          columns: currentScorecard?.columns || [],
          rows: currentScorecard?.rows || [],
          createdAt: currentScorecard?.createdAt || new Date(),
          lastModified: new Date()
        };

        setScorecards((prev: any[]) => prev.map(sc =>
          sc.id === old_id ? migratedScorecard : sc
        ).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')));

        setEditingScoreCard(migratedScorecard);
        setSelectedCategory(new_id);

        const allScorecards = JSON.parse(localStorage.getItem('scorecards') || '[]');
        const updatedLocalScorecards = allScorecards.map((sc: any) =>
          sc.id === old_id ? migratedScorecard : sc
        );
        localStorage.setItem('scorecards', JSON.stringify(updatedLocalScorecards));
        setOpenRetailerDrawer(null);
        toast.success('Scorecard migrated to database and chain note posted');

        setComments((prev: any) => ({
          ...prev,
          [new_id]: {
            ...(prev[new_id] || {}),
            [openRetailerDrawer]: [...((prev[new_id] || {})[openRetailerDrawer] || []), newComment],
          }
        }));
      } else {
        setComments((prev: any) => ({
          ...prev,
          [selectedCategory]: {
            ...(prev[selectedCategory] || {}),
            [openRetailerDrawer]: [...((prev[selectedCategory] || {})[openRetailerDrawer] || []), newComment],
          }
        }));
        toast.success('Chain note posted');
      }

      setCommentInput('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to post note');
    } finally {
      addingRetailerRef.current = false;
      setIsAddingRetailerComment(false);
    }
  };

  const retailerSubmitDisabled = isAddingRetailerComment || !commentInput.trim();

  const scorecardName = editingScoreCard?.name || '';
  const brandLogoUrl = findLogo(clientLogos, scorecardName);
  const retailerLogoUrl = findLogo(clientLogos, row.name);

  const rowComments = comments[selectedCategory]?.[row.id] || [];
  const summary = computeSummary(rowComments);

  return (
    // Drawer sits below the sticky AdminHeader (~56px / top-14, z-50). See
    // SimpleCommentDrawer above for the height-resolution rationale.
    <div
      ref={containerRef}
      className="fixed left-0 right-0 bottom-0 z-40 flex flex-col sm:flex-row h-[calc(100vh-3.5rem)]"
      style={{ height: 'var(--drawer-h, calc(100dvh - 3.5rem))' }}
    >
      <div className="absolute inset-0 bg-black bg-opacity-40 transition-opacity" onClick={() => setOpenRetailerDrawer(null)}></div>
      <div
        className="relative ml-auto w-full sm:max-w-md bg-white shadow-2xl flex flex-col border-slate-200 mt-auto sm:mt-0 sm:h-full h-[92%] max-h-full rounded-t-2xl sm:rounded-t-none sm:rounded-l-2xl sm:border-l border-t sm:border-t-0 sheet-slide-up sm:animate-slideInRight"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="sm:hidden pt-2 pb-1 flex justify-center">
          <span className="block w-10 h-1 rounded-full bg-slate-300" aria-hidden="true" />
        </div>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 bg-slate-50 rounded-t-2xl">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {/* Scope badge: retailer logo when available, else chain icon (indigo) */}
            {retailerLogoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={retailerLogoUrl}
                alt=""
                className="flex-shrink-0 w-9 h-9 rounded-lg object-contain bg-white border border-slate-200 p-0.5 mt-0.5"
              />
            ) : (
              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center mt-0.5" aria-hidden="true">
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
              <h2 className="text-base font-bold text-slate-900 leading-tight truncate" title={row.name || 'Row'}>{row.name || 'Row'}</h2>
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
            onClick={() => setOpenRetailerDrawer(null)}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close activity"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 flex flex-col px-6 py-4 overflow-y-auto bg-slate-100/70">
          <div className="mb-4">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Address</label>
            <input
              type="text"
              value={row.address || ''}
              onChange={e => {
                if (!currentData || row.id === undefined) return;
                const updatedRows = currentData.rows.map((r: any) => r.id === row.id ? { ...r, address: e.target.value } : r);
                updateCurrentData({ rows: updatedRows });
              }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
              placeholder="Enter address..."
            />
          </div>
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Activity</h3>
          <div className="flex-1 overflow-y-auto mb-2 pr-1 -mr-1">
            {row.id != null && <CommentList rowId={row.id} />}
          </div>
          <div className="pt-4 border-t border-slate-200 bg-white rounded-b-2xl mt-2">
            {/* Scope caption — mirrors the CHAIN NOTE accent label on chain-note cards. */}
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
                {(user?.name || user?.username || 'A')[0].toUpperCase()}
              </div>
              <div className="flex-1 rounded-xl border border-slate-200 border-l-[3px] border-l-slate-400 bg-white focus-within:border-blue-500 focus-within:border-l-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-colors">
                <textarea
                  value={commentInput}
                  onChange={e => setCommentInput(e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-sm bg-transparent resize-none min-h-[44px] focus:outline-none placeholder:text-slate-400"
                  placeholder={row.name ? `Add a note about ${row.name}…` : 'Write a chain-level note…'}
                  rows={commentInput.length > 60 ? 4 : 2}
                  style={{ minHeight: 44, maxHeight: 140 }}
                  onFocus={e => e.currentTarget.rows = 4}
                  onBlur={e => e.currentTarget.rows = commentInput.length > 60 ? 4 : 2}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!retailerSubmitDisabled) handleAddRetailerComment(); } }}
                  disabled={isAddingRetailerComment}
                />
              </div>
            </div>
            <div className="mt-2 flex items-center justify-end gap-2">
              <span className="text-[10px] text-slate-400 hidden sm:inline">Enter to post · Shift+Enter for new line</span>
              <button
                onClick={handleAddRetailerComment}
                disabled={retailerSubmitDisabled}
                aria-busy={isAddingRetailerComment}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
              >
                {isAddingRetailerComment ? 'Posting…' : 'Post note'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SimpleCommentDrawer;
