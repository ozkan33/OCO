'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import MarketVisitUpload from '@/components/admin/MarketVisitUpload';
import MarketVisitGallery from '@/components/admin/MarketVisitGallery';
import { FiLogOut } from 'react-icons/fi';

export default function MarketVisitsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) { setLoading(false); return; }
        const data = await res.json();
        setUser(data.user);
      } catch {
        // silent
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
      window.location.href = '/';
    }
  };

  const getUserInitials = () => {
    if (!user) return '?';
    const name = user.name || user.email || '';
    const parts = name.split(/[\s@]+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.charAt(0).toUpperCase() || '?';
  };

  const getDisplayName = () => {
    if (!user) return 'User';
    if (user.name && user.name !== user.email) return user.name;
    const email = user.email || '';
    const local = email.split('@')[0];
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'User';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-blue-600 mx-auto mb-4"></div>
          <p className="text-sm text-slate-500 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') {
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
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-50">
        <nav className="w-full px-4 sm:px-6 py-2.5 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div
              className="flex items-center gap-2.5 cursor-pointer group"
              onClick={() => router.push('/')}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && router.push('/')}
            >
              <Image src="/logo.png" alt="3BrothersMarketing Logo" width={32} height={32} className="rounded-lg" />
              <span className="text-base font-bold text-slate-800 group-hover:text-slate-600 transition-colors hidden sm:inline">
                3Brothers Marketing
              </span>
            </div>
            <div className="hidden sm:block w-px h-5 bg-slate-200"></div>
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => router.push('/admin/dashboard')}
                className="px-3.5 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 rounded-md hover:bg-white/60 transition-all"
              >
                Dashboard
              </button>
              <button
                className="px-3.5 py-1.5 text-sm font-medium rounded-md bg-white text-slate-800 shadow-sm transition-all"
                aria-current="page"
              >
                Market Visits
              </button>
              <button
                onClick={() => router.push('/admin/clients')}
                className="px-3.5 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 rounded-md hover:bg-white/60 transition-all"
              >
                Clients
              </button>
              <button
                onClick={() => router.push('/admin/client-logos')}
                className="px-3.5 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 rounded-md hover:bg-white/60 transition-all"
              >
                Logos
              </button>
            </div>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors group"
              aria-label="User menu"
              aria-expanded={showUserMenu}
              aria-haspopup="true"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                {getUserInitials()}
              </div>
              <span className="text-sm font-medium text-slate-600 group-hover:text-slate-800 transition-colors hidden sm:inline max-w-[120px] truncate">
                {getDisplayName()}
              </span>
              <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50">
                <div className="px-3.5 py-2.5 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-800 truncate">{getDisplayName()}</p>
                  <p className="text-xs text-slate-400 truncate">{user.email}</p>
                </div>
                <div className="py-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-600 hover:bg-red-50 hover:text-red-700 transition-colors text-left"
                  >
                    <FiLogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Market Visits</h1>
          <p className="text-sm text-slate-500 mt-1">Upload shelf photos from store visits. GPS location and date are read automatically from the photo.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 items-start">
          <div className="lg:sticky lg:top-24">
            <MarketVisitUpload onUploaded={() => setRefreshKey(k => k + 1)} />
          </div>
          <MarketVisitGallery refreshKey={refreshKey} />
        </div>
      </main>
    </div>
  );
}
