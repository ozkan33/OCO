'use client';

import { useEffect, useState, useRef } from 'react';
import AdminDataGrid, { NavigateToPayload } from '@/components/admin/AdminDataGrid';
import AdminHeader from '@/components/admin/AdminHeader';
import { SafariErrorBoundary } from '@/components/ui/SafariErrorBoundary';
import NotificationBell from '@/components/admin/NotificationBell';

export default function AdminDashboard() {
  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigateToRef = useRef<((payload: NavigateToPayload) => void) | null>(null);
  const refreshCommentsRef = useRef<((scorecardId: string) => void) | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      setLoadingUser(true);
      setError(null);
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) {
          setUser(null);
          setError('Authentication failed');
          setLoadingUser(false);
          return;
        }
        const data = await res.json();
        setUser(data.user);
      } catch (err) {
        console.error('Failed to fetch user:', err);
        setUser(null);
        setError('Failed to load user data');
      }
      setLoadingUser(false);
    };
    fetchUser();
  }, []);

  if (loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-blue-600 mx-auto mb-4"></div>
          <p className="text-sm text-slate-500 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white border border-red-200 text-slate-700 px-6 py-5 rounded-xl shadow-sm max-w-md" role="alert">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            <strong className="font-semibold text-slate-900">Connection Error</strong>
          </div>
          <p className="text-sm text-slate-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user || !user.role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white border border-red-200 text-slate-700 px-6 py-5 rounded-xl shadow-sm max-w-md" role="alert">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            <strong className="font-semibold text-slate-900">Unauthorized</strong>
          </div>
          <p className="text-sm text-slate-600">You do not have access to this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hide dense admin nav on phones — it doesn't fit alongside the grid.
          Tablet/desktop (md+) keeps the normal header. Other admin pages are
          unaffected; this is a dashboard-only concession. */}
      <div className="hidden md:block">
        <AdminHeader
          rightContent={
            <NotificationBell
              onNotificationClick={(payload) => {
                navigateToRef.current?.(payload);
              }}
              onNewActivity={(scorecardIds) => {
                scorecardIds.forEach(id => refreshCommentsRef.current?.(id));
              }}
            />
          }
        />
      </div>
      <main className="w-full max-w-none px-0 py-0 flex justify-center">
        <div className="w-full">
          <SafariErrorBoundary>
            <AdminDataGrid
              userRole={user.role}
              key={user.role}
              navigateToRef={navigateToRef}
              refreshCommentsRef={refreshCommentsRef}
            />
          </SafariErrorBoundary>
        </div>
      </main>
    </div>
  );
}
