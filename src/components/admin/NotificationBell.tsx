'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Notification {
  id: string;
  actor_name: string;
  action_type: string;
  scorecard_id: string;
  scorecard_name: string;
  row_id: string;
  row_name: string;
  parent_row_id?: string | null;
  store_name?: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationBellProps {
  onNotificationClick?: (payload: { scorecardId: string; rowId: string; storeName?: string | null }) => void;
  onNewActivity?: (scorecardIds: string[]) => void;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function NotificationBell({ onNotificationClick, onNewActivity }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const isInitialFetchRef = useRef(true);
  const onNewActivityRef = useRef(onNewActivity);
  onNewActivityRef.current = onNewActivity;

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/notifications', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const incoming: Notification[] = data.notifications || [];
      // Detect new notifications since last poll (skip initial fetch to avoid
      // re-refreshing on mount). Add + edit both trigger a scorecard refetch
      // so stale bubbles pick up fresh text.
      if (!isInitialFetchRef.current) {
        const newScorecardIds = new Set<string>();
        const commentActionTypes = new Set([
          'comment_added',
          'comment_updated',
        ]);
        for (const n of incoming) {
          if (
            !knownIdsRef.current.has(n.id) &&
            commentActionTypes.has(n.action_type) &&
            n.scorecard_id
          ) {
            newScorecardIds.add(n.scorecard_id);
          }
        }
        if (newScorecardIds.size > 0) {
          onNewActivityRef.current?.(Array.from(newScorecardIds));
        }
      }
      knownIdsRef.current = new Set(incoming.map(n => n.id));
      isInitialFetchRef.current = false;
      setNotifications(incoming);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Silently fail polling
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, 15000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchNotifications();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const markAsRead = async (ids: string[]) => {
    try {
      await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids }),
      });
      setNotifications(prev =>
        prev.map(n => (ids.includes(n.id) ? { ...n, is_read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - ids.length));
    } catch {
      // Silently fail
    }
  };

  const markAllRead = async () => {
    setLoading(true);
    try {
      await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ markAllRead: true }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // Silently fail
    }
    setLoading(false);
  };

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.is_read) {
      await markAsRead([notif.id]);
    }
    setIsOpen(false);
    onNotificationClick?.({
      scorecardId: notif.scorecard_id,
      rowId: notif.row_id,
      storeName: notif.store_name || null,
    });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-slate-100 transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <svg
          className="w-5 h-5 text-slate-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-fadeInDown"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={loading}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                <p className="text-sm text-slate-400">No notifications yet</p>
              </div>
            ) : (
              notifications.map(notif => (
                <button
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex items-start gap-3 ${
                    !notif.is_read ? 'bg-blue-50/40' : ''
                  }`}
                >
                  {/* Unread dot */}
                  <div className="flex-shrink-0 mt-1.5">
                    <span
                      className={`block w-2 h-2 rounded-full ${
                        !notif.is_read ? 'bg-blue-500' : 'bg-transparent'
                      }`}
                    />
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 leading-snug">
                      <span className="font-semibold text-slate-900">{notif.actor_name}</span>
                      {notif.action_type === 'comment_updated'
                        ? ' edited a note on '
                        : ' added a note on '}
                      <span className="font-medium text-slate-800">{notif.row_name}</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {notif.scorecard_name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{timeAgo(notif.created_at)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

    </div>
  );
}
