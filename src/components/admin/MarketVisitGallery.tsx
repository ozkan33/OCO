'use client';

import { useState, useEffect, useCallback } from 'react';
import { useBrands } from '@/hooks/useBrands';
import PhotoLightbox from './PhotoLightbox';

interface Visit {
  id: string;
  photo_url: string;
  visit_date: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  location_source: 'exif' | 'geolocation' | 'manual' | null;
  photo_taken_at: string | null;
  address: string | null;
  store_name: string | null;
  note: string | null;
  brands: string[];
  created_at: string;
}

interface MarketVisitGalleryProps {
  refreshKey: number;
}

const SOURCE_LABEL: Record<NonNullable<Visit['location_source']>, string> = {
  exif: 'from photo',
  geolocation: 'from device',
  manual: 'from address',
};

// Format a DATE string (YYYY-MM-DD) as UTC so the rendered day matches the
// stored day regardless of the viewer's timezone.
function formatVisitDate(d: string): string {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function formatPhotoTakenAt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function MarketVisitGallery({ refreshKey }: MarketVisitGalleryProps) {
  const { brands } = useBrands();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [filterBrand, setFilterBrand] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Visit | null>(null);
  const [editForm, setEditForm] = useState({ store_name: '', address: '', visit_date: '', note: '', brands: [] as string[] });
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Debounce search input → searchQuery
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchVisits = useCallback(async (pageNum: number, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: '18' });
      if (filterBrand) params.set('brand', filterBrand);
      if (filterDateFrom) params.set('date_from', filterDateFrom);
      if (filterDateTo) params.set('date_to', filterDateTo);
      if (searchQuery) params.set('search', searchQuery);

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
  }, [filterBrand, filterDateFrom, filterDateTo, searchQuery]);

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
    setActionError(null);
    try {
      const res = await fetch(`/api/market-visits/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setVisits(prev => prev.filter(v => v.id !== id));
        setTotalCount(prev => prev - 1);
      } else {
        const body = await res.json().catch(() => ({}));
        setActionError(body?.error || `Failed to delete visit (${res.status})`);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete visit');
    } finally {
      setDeleting(null);
    }
  };

  const openEdit = (visit: Visit) => {
    setEditing(visit);
    setEditError(null);
    setEditForm({
      store_name: visit.store_name || '',
      address: visit.address || '',
      visit_date: visit.visit_date || '',
      note: visit.note || '',
      brands: visit.brands || [],
    });
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setEditError(null);
    if (!editForm.visit_date || !/^\d{4}-\d{2}-\d{2}$/.test(editForm.visit_date)) {
      setEditError('Visit date is required.');
      return;
    }
    if (editForm.brands.length === 0) {
      setEditError('Select at least one brand.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/market-visits/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        const updated = await res.json();
        setVisits(prev => prev.map(v => v.id === editing.id ? { ...v, ...updated } : v));
        setEditing(null);
      } else {
        const body = await res.json().catch(() => ({}));
        setEditError(body?.error || `Failed to save (${res.status})`);
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const toggleEditBrand = (brand: string) => {
    setEditForm(prev => ({
      ...prev,
      brands: prev.brands.includes(brand)
        ? prev.brands.filter(b => b !== brand)
        : [...prev.brands, brand],
    }));
  };

  const clearFilters = () => {
    setFilterBrand('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchInput('');
  };

  const hasFilters = filterBrand || filterDateFrom || filterDateTo || searchQuery;
  const hasMore = visits.length < totalCount;

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <input
              type="search"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Store, note, or address…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
            />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Brand</label>
            <select
              value={filterBrand}
              onChange={e => setFilterBrand(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
            >
              <option value="">All Brands</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
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

      {/* Load error */}
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

      {/* Action error (delete failures) */}
      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
          <p className="text-sm text-red-700">{actionError}</p>
          <button
            onClick={() => setActionError(null)}
            className="text-sm text-red-600 hover:text-red-800 ml-4"
            aria-label="Dismiss error"
          >
            ×
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
          {visits.map(visit => {
            const src = visit.location_source;
            const sourceLabel = src ? SOURCE_LABEL[src] : null;
            const hasCoords = visit.latitude !== null && visit.longitude !== null;
            const mapsUrl = hasCoords
              ? `https://www.google.com/maps/search/?api=1&query=${visit.latitude},${visit.longitude}`
              : null;
            return (
            <div
              key={visit.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden group hover:shadow-md transition-shadow"
            >
              {/* Photo */}
              <button
                type="button"
                className="relative aspect-[4/3] w-full bg-gray-100 cursor-pointer overflow-hidden block focus:outline-none focus:ring-2 focus:ring-amber-400"
                onClick={() => setLightbox({ src: visit.photo_url, alt: visit.store_name || 'Visit photo' })}
                aria-label={`Enlarge photo${visit.store_name ? ` from ${visit.store_name}` : ''}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={visit.photo_url}
                  alt={visit.store_name || 'Visit photo'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3 pointer-events-none">
                  <span className="text-white text-xs font-medium">Click to enlarge</span>
                </div>
              </button>

              {/* Info */}
              <div className="p-3 space-y-2">
                {/* Date + Store */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {visit.store_name && (
                      <p className="text-sm font-semibold text-gray-900 leading-tight">{visit.store_name}</p>
                    )}
                    <p className="text-xs text-gray-500">{formatVisitDate(visit.visit_date)}</p>
                    {visit.photo_taken_at && (
                      <p
                        className="text-[10px] text-gray-400 mt-0.5"
                        title={`Photo captured at ${formatPhotoTakenAt(visit.photo_taken_at)}`}
                      >
                        Taken {formatPhotoTakenAt(visit.photo_taken_at)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(visit)}
                      className="text-gray-300 hover:text-blue-500 transition-colors p-1"
                      aria-label="Edit visit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                    </button>
                    <button
                      onClick={() => handleDelete(visit.id)}
                      disabled={deleting === visit.id}
                      className="text-gray-300 hover:text-red-500 transition-colors p-1"
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
                </div>

                {/* Address */}
                {visit.address && (
                  <p className="text-xs text-gray-400 leading-snug line-clamp-2">{visit.address}</p>
                )}

                {/* Location provenance + map link */}
                {(mapsUrl || sourceLabel) && (
                  <div className="flex items-center gap-2 text-[11px] text-gray-400">
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-800 hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                        </svg>
                        Map
                      </a>
                    )}
                    {sourceLabel && (
                      <span>
                        · {sourceLabel}
                        {src === 'geolocation' && visit.accuracy_m != null && ` (±${Math.round(visit.accuracy_m)}m)`}
                      </span>
                    )}
                  </div>
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
            );
          })}
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

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Edit Visit</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="Close">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Photo preview */}
              <div className="rounded-lg overflow-hidden bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={editing.photo_url} alt="Visit" className="w-full h-40 object-cover" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
                  <input type="text" value={editForm.store_name} onChange={e => setEditForm(f => ({ ...f, store_name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none" placeholder="Store name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Visit Date *</label>
                  <input type="date" required value={editForm.visit_date} onChange={e => setEditForm(f => ({ ...f, visit_date: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input type="text" value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none" placeholder="Store address" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                <textarea value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none resize-none" placeholder="Shelf position, stock level..." />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Brands *</label>
                <div className="flex flex-wrap gap-1.5">
                  {brands.map(b => (
                    <button key={b} type="button" onClick={() => toggleEditBrand(b)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${editForm.brands.includes(b) ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-300 hover:border-amber-400'}`}>
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {editError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{editError}</div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditing(null)} className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                <button onClick={handleSaveEdit} disabled={saving} className="flex-1 py-2.5 text-sm font-semibold text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
