'use client';

import { useState } from 'react';
import MarketVisitUpload from '@/components/admin/MarketVisitUpload';
import MarketVisitGallery from '@/components/admin/MarketVisitGallery';
import AdminHeader from '@/components/admin/AdminHeader';

export default function MarketVisitsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader />
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
