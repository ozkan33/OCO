'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import MarketVisitUpload from '@/components/admin/MarketVisitUpload';
import MarketVisitGallery from '@/components/admin/MarketVisitGallery';

export default function MarketVisitsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* silent */ }
    window.location.href = '/';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto mb-4" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl max-w-md text-center">
          <p className="font-bold">Unauthorized</p>
          <p className="text-sm mt-1">You do not have access to this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow sticky top-0 z-50">
        <nav className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => router.push('/')}
            >
              <Image src="https://i.hizliresim.com/rm69m47.png" alt="Logo" width={36} height={36} />
              <span className="text-xl font-bold text-gray-800 hidden sm:block">3Brothers</span>
            </div>
            <span className="text-gray-300 hidden sm:inline">|</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => router.push('/admin/dashboard')}
                className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Dashboard
              </button>
              <button
                className="px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 rounded-lg"
              >
                Market Visits
              </button>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 text-sm font-medium transition-colors"
          >
            Logout
          </button>
        </nav>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Market Visits</h1>
          <p className="text-sm text-gray-500 mt-1">Upload shelf photos from store visits. GPS location and date are read automatically from the photo.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 items-start">
          {/* Upload form — sticky on desktop */}
          <div className="lg:sticky lg:top-24">
            <MarketVisitUpload onUploaded={() => setRefreshKey(k => k + 1)} />
          </div>

          {/* Gallery */}
          <MarketVisitGallery refreshKey={refreshKey} />
        </div>
      </main>
    </div>
  );
}
