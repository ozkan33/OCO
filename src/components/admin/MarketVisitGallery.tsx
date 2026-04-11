'use client';

import { useState, useEffect, useCallback } from 'react';
import { BRANDS } from '@/constants/brands';
import PhotoLightbox from './PhotoLightbox';

interface Visit {
  id: string;
  photo_url: string;
  visit_date: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  store_name: string | null;
  note: string | null;
  brands: string[];
  created_at: string;
}

interface MarketVisitGalleryProps {
  refreshKey: number;
}

export default function MarketVisitGallery({ refreshKey }: MarketVisitGalleryProps) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [filterBrand, setFilterBrand] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchVisits = useCallback(async (pageNum: number, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: '18' });
      if (filterBrand) params.set('brand', filterBrand);
      if (filterDateFrom) params.set('date_from', filterDateFrom);
      if (filterDateTo) params.set('date_to', filterDateTo);

      const res = await fetch(`/api/market-visits?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load visits (${res.status})`);
      const json = await res.json();

      setVisits(prev => append ? [...prev, ...json.data] : json.data);
      setTotalCount(json.count ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load visits');
    } finally {
      setLoading(false);
    }
  }, [filterBrand, filterDateFrom, filterDateTo]);

  // Refetch on filter change or external refresh
  useEffect(() => {
    setPage(1);
    fetchVisits(1);
  }, [fetchVisits, refreshKey]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchVisits(next, true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this visit photo? This cannot be undone.')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/market-visits/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setVisits(prev => prev.filter(v => v.id !== id));
        setTotalCount(prev => prev - 1);
      }
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  };

  const clearFilters = () => {
    setFilterBrand('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const hasFilters = filterBrand || filterDateFrom || filterDateTo;
  const hasMore = visits.length < totalCount;

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Brand</label>
            <select
              value={filterBrand}
              onChange={e => setFilterBrand(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
            >
              <option value="">All Brands</option>
              {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
            />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
            />
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => fetchVisits(1)}
            className="text-sm font-medium text-red-600 hover:text-red-800 underline ml-4"
          >
            Retry
          </button>
        </div>
      )}

      {/* Results count */}
      {!loading && !error && (
        <p className="text-sm text-gray-500">
          {totalCount === 0 ? 'No visits yet' : `${totalCount} visit${totalCount === 1 ? '' : 's'} found`}
        </p>
      )}

      {/* Gallery grid */}
      {loading && visits.length === 0 ? (
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading visits...</p>
        </div>
      ) : visits.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <svg className="mx-auto h-12 w-12 text-gray-300 mb-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
          </svg>
          <p className="text-gray-500 font-medium">No market visits yet</p>
          <p className="text-sm text-gray-400 mt-1">Upload your first store visit photo above</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visits.map(visit => (
            <div
              key={visit.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden group hover:shadow-md transition-shadow"
            >
              {/* Photo */}
              <div
                className="relative aspect-[4/3] bg-gray-100 cursor-pointer overflow-hidden"
                onClick={() => setLightbox({ src: visit.photo_url, alt: visit.store_name || 'Visit photo' })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={visit.photo_url}
                  alt={visit.store_name || 'Visit photo'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
                  <span className="text-white text-xs font-medium">Click to enlarge</span>
                </div>
              </div>

              {/* Info */}
              <div className="p-3 space-y-2">
                {/* Date + Store */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {visit.store_name && (
                      <p className="text-sm font-semibold text-gray-900 leading-tight">{visit.store_name}</p>
                    )}
                    <p className="text-xs text-gray-500">
                      {new Date(visit.visit_date + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(visit.id)}
                    disabled={deleting === visit.id}
                    className="text-gray-300 hover:text-red-500 transition-colors shrink-0 p-1"
                    aria-label={`Delete visit${visit.store_name ? ` from ${visit.store_name}` : ''}`}
                  >
                    {deleting === visit.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-400" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Address */}
                {visit.address && (
                  <p className="text-xs text-gray-400 leading-snug line-clamp-2">{visit.address}</p>
                )}

                {/* Brands */}
                <div className="flex flex-wrap gap-1">
                  {visit.brands.map(b => (
                    <span key={b} className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700">
                      {b}
                    </span>
                  ))}
                </div>

                {/* Note */}
                {visit.note && (
                  <p className="text-xs text-gray-500 italic line-clamp-2">{visit.note}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <div className="text-center pt-2">
          <button
            onClick={loadMore}
            className="px-6 py-2.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
          >
            Load More
          </button>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <PhotoLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
