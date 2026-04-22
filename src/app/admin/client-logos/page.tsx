'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { FiTrash2, FiUpload, FiMoreVertical, FiExternalLink, FiEdit2, FiCheck, FiX, FiDownloadCloud } from 'react-icons/fi';
import { toast, Toaster } from 'sonner';
import AdminHeader from '@/components/admin/AdminHeader';
import { RETAILERS, retailerFaviconForUrl } from '@/lib/retailerLogos';

type LogoKind = 'brand' | 'retailer';

interface ClientLogo {
  id: string;
  label: string;
  image_url: string;
  storage_path: string | null;
  website_url: string | null;
  kind: LogoKind;
  sort_order: number;
  created_at: string;
}

const TAB_CONFIG: Record<LogoKind, {
  title: string;
  subtitle: string;
  addCardTitle: string;
  addCtaLabel: string;
  namePlaceholder: string;
  urlPlaceholder: string;
  emptyHint: string;
}> = {
  brand: {
    title: 'Brand Logos',
    subtitle: 'Shown in the "Our Brand Partners" carousel on the landing page.',
    addCardTitle: 'Add Brand Logo',
    addCtaLabel: 'Add Brand',
    namePlaceholder: "Brand name (e.g. JoMomma's)",
    urlPlaceholder: 'https://jomommas.com',
    emptyHint: 'No brand logos yet. Use the form above to add your first one.',
  },
  retailer: {
    title: 'Retailer Logos',
    subtitle: 'Shown in the "Retailer and Distributor Partners" marquee on the landing page.',
    addCardTitle: 'Add Retailer Logo',
    addCtaLabel: 'Add Retailer',
    namePlaceholder: 'Retailer name (e.g. Cub Foods)',
    urlPlaceholder: 'https://www.cub.com/',
    emptyHint: 'No retailer logos yet. Use the form above to add your first one.',
  },
};

export default function LogosAdminPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [logos, setLogos] = useState<ClientLogo[]>([]);
  const [activeKind, setActiveKind] = useState<LogoKind>('brand');

  // Add-form state
  const [uploading, setUploading] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Per-row editing state
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editingUrlId, setEditingUrlId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');

  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) { setLoading(false); return; }
        const data = await res.json();
        setUser(data.user);
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (user?.role === 'ADMIN') fetchLogos();
  }, [user]);

  // Reset the add-form when switching tabs so brand state doesn't leak into
  // retailer uploads (and vice-versa).
  useEffect(() => {
    setNewLabel('');
    setNewUrl('');
    setNewFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setEditingLabelId(null);
    setEditingUrlId(null);
  }, [activeKind]);

  const fetchLogos = async () => {
    try {
      const res = await fetch('/api/client-logos', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        // Back-compat: rows created before the kind column existed have
        // kind === undefined; treat them as brand so the Brand tab still shows
        // every logo that was there before the migration.
        const normalized = (Array.isArray(data) ? data : []).map((l: any) => ({
          ...l,
          kind: (l.kind === 'retailer' ? 'retailer' : 'brand') as LogoKind,
          website_url: l.website_url ?? null,
        }));
        setLogos(normalized);
      }
    } catch {
      toast.error('Failed to load logos');
    }
  };

  const visibleLogos = useMemo(
    () => logos.filter(l => l.kind === activeKind),
    [logos, activeKind]
  );

  const counts = useMemo(() => ({
    brand: logos.filter(l => l.kind === 'brand').length,
    retailer: logos.filter(l => l.kind === 'retailer').length,
  }), [logos]);

  const config = TAB_CONFIG[activeKind];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setNewFile(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFile || !newLabel.trim()) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', newFile);
      formData.append('label', newLabel.trim());
      formData.append('sort_order', String(visibleLogos.length));
      formData.append('kind', activeKind);
      if (newUrl.trim()) formData.append('website_url', newUrl.trim());

      const res = await fetch('/api/client-logos', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Upload failed');
        return;
      }

      toast.success(`${activeKind === 'brand' ? 'Brand' : 'Retailer'} logo added`);
      setNewLabel('');
      setNewUrl('');
      setNewFile(null);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchLogos();
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (logo: ClientLogo) => {
    if (deletingId) return;
    if (!confirm(`Delete "${logo.label}"?`)) return;
    setDeletingId(logo.id);
    try {
      const res = await fetch(`/api/client-logos/${logo.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) { toast.error('Delete failed'); return; }
      toast.success('Logo deleted');
      await fetchLogos();
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const saveField = async (id: string, body: Record<string, unknown>) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/client-logos/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Update failed');
        return false;
      }
      await fetchLogos();
      return true;
    } catch {
      toast.error('Update failed');
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const handleLabelSave = async (id: string) => {
    if (!editLabel.trim()) return;
    const ok = await saveField(id, { label: editLabel.trim() });
    if (ok) {
      toast.success('Name updated');
      setEditingLabelId(null);
    }
  };

  const handleUrlSave = async (id: string) => {
    const ok = await saveField(id, { website_url: editUrl.trim() || null });
    if (ok) {
      toast.success('Website URL updated');
      setEditingUrlId(null);
    }
  };

  const handleImportDefaultRetailers = async () => {
    if (importing) return;
    // Build seed rows from the hardcoded RETAILERS catalogue + bundled favicons.
    // Rows already in the DB are skipped by the unique (kind, lower(label))
    // index; safe to re-run.
    const seed = RETAILERS.map((r, i) => ({
      label: r.name,
      image_url: retailerFaviconForUrl(r.url) || '',
      website_url: r.url,
      kind: 'retailer' as const,
      sort_order: i,
    }));

    setImporting(true);
    try {
      const res = await fetch('/api/client-logos', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logos: seed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Import failed — has the retailer migration been run?');
        return;
      }
      toast.success(`Imported ${seed.length} retailers`);
      await fetchLogos();
    } catch {
      toast.error('Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    if (reorderingId) return;
    const idx = visibleLogos.findIndex(l => l.id === id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= visibleLogos.length) return;
    const a = visibleLogos[idx];
    const b = visibleLogos[swapIdx];

    setReorderingId(id);
    try {
      await Promise.all([
        fetch(`/api/client-logos/${a.id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: b.sort_order }),
        }),
        fetch(`/api/client-logos/${b.id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: a.sort_order }),
        }),
      ]);
      await fetchLogos();
    } catch {
      toast.error('Reorder failed');
    } finally {
      setReorderingId(null);
    }
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
      <Toaster position="top-right" richColors />
      <AdminHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Heading */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Logos</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage the logos that appear on the public landing page. Changes go live immediately.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="inline-flex bg-slate-100 p-1 rounded-xl mb-6 w-full sm:w-auto" role="tablist">
          {(['brand', 'retailer'] as const).map(kind => {
            const isActive = kind === activeKind;
            return (
              <button
                key={kind}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveKind(kind)}
                className={`flex-1 sm:flex-initial px-4 sm:px-5 py-2 text-sm font-semibold rounded-lg transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {TAB_CONFIG[kind].title}
                <span className={`ml-2 inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 text-[11px] font-bold rounded-full ${
                  isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'
                }`}>
                  {counts[kind]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Context subtitle */}
        <p className="text-sm text-slate-500 -mt-2 mb-6">{config.subtitle}</p>

        {/* Add form */}
        <form
          onSubmit={handleUpload}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8"
        >
          <h2 className="text-base font-semibold text-slate-800 mb-4">{config.addCardTitle}</h2>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {/* Upload tile */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-32 h-24 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-400 flex items-center justify-center cursor-pointer transition-colors bg-slate-50 flex-shrink-0 overflow-hidden"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Preview" className="max-h-full max-w-full object-contain" />
              ) : (
                <div className="text-center">
                  <FiUpload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                  <span className="text-xs text-slate-400">Upload</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="flex-1 flex flex-col gap-3 w-full">
              <input
                type="text"
                placeholder={config.namePlaceholder}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="url"
                  placeholder={`Website URL — optional (e.g. ${config.urlPlaceholder})`}
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={uploading || !newFile || !newLabel.trim()}
                  className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {uploading ? 'Uploading...' : config.addCtaLabel}
                </button>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            JPEG, PNG, or WebP. Max 5MB. Recommended: transparent PNG, at least 200px wide. Website URL is optional — when set, clicking the logo on the landing page opens it.
          </p>
        </form>

        {/* List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800">
              Current {config.title} ({visibleLogos.length})
            </h2>
          </div>

          {visibleLogos.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm">
              <p className="text-slate-400">{config.emptyHint}</p>
              {activeKind === 'retailer' && (
                <div className="mt-5 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={handleImportDefaultRetailers}
                    disabled={importing}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/40 border-t-white" />
                        Importing…
                      </>
                    ) : (
                      <>
                        <FiDownloadCloud className="w-4 h-4" />
                        Import {RETAILERS.length} default retailers
                      </>
                    )}
                  </button>
                  <p className="text-xs text-slate-400 max-w-sm">
                    Populates the retailer list from the catalogue already used on the landing page.
                    You can edit, reorder, or delete any of them afterward.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visibleLogos.map((logo, idx) => (
                <li key={logo.id} className="px-4 sm:px-6 py-4 flex items-center gap-3 sm:gap-4 hover:bg-slate-50 transition-colors">
                  {/* Reorder */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => handleReorder(logo.id, 'up')}
                      disabled={idx === 0 || reorderingId !== null}
                      className="text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <FiMoreVertical className="w-4 h-4 text-slate-300" />
                    <button
                      onClick={() => handleReorder(logo.id, 'down')}
                      disabled={idx === visibleLogos.length - 1 || reorderingId !== null}
                      className="text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Thumbnail */}
                  <div className="w-16 h-12 sm:w-20 sm:h-14 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {logo.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logo.image_url}
                        alt={logo.label}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-[10px] text-slate-400 font-semibold">No image</span>
                    )}
                  </div>

                  {/* Label + URL */}
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    {/* Label row */}
                    {editingLabelId === logo.id ? (
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleLabelSave(logo.id);
                            if (e.key === 'Escape') setEditingLabelId(null);
                          }}
                          className="flex-1 border border-slate-200 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                        <button
                          onClick={() => handleLabelSave(logo.id)}
                          disabled={savingId === logo.id || !editLabel.trim()}
                          className="p-1 text-blue-600 hover:text-blue-700 disabled:opacity-50"
                          title="Save"
                        >
                          <FiCheck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingLabelId(null)}
                          disabled={savingId === logo.id}
                          className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                          title="Cancel"
                        >
                          <FiX className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingLabelId(logo.id);
                          setEditLabel(logo.label);
                          setEditingUrlId(null);
                        }}
                        className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-800 hover:text-blue-600 transition-colors text-left"
                        title="Click to edit name"
                      >
                        {logo.label}
                        <FiEdit2 className="w-3 h-3 text-slate-300 group-hover:text-blue-500 transition-colors" />
                      </button>
                    )}

                    {/* URL row */}
                    {editingUrlId === logo.id ? (
                      <div className="flex gap-2 items-center">
                        <input
                          type="url"
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUrlSave(logo.id);
                            if (e.key === 'Escape') setEditingUrlId(null);
                          }}
                          placeholder={config.urlPlaceholder}
                          className="flex-1 border border-slate-200 rounded px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                        <button
                          onClick={() => handleUrlSave(logo.id)}
                          disabled={savingId === logo.id}
                          className="p-1 text-blue-600 hover:text-blue-700 disabled:opacity-50"
                          title="Save"
                        >
                          <FiCheck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingUrlId(null)}
                          disabled={savingId === logo.id}
                          className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                          title="Cancel"
                        >
                          <FiX className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingUrlId(logo.id);
                          setEditUrl(logo.website_url || '');
                          setEditingLabelId(null);
                        }}
                        className="group inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors text-left max-w-full"
                        title="Click to edit website URL"
                      >
                        {logo.website_url ? (
                          <>
                            <FiExternalLink className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{logo.website_url}</span>
                          </>
                        ) : (
                          <span className="italic">No website URL</span>
                        )}
                        <FiEdit2 className="w-3 h-3 text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                      </button>
                    )}
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(logo)}
                    disabled={deletingId === logo.id}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete logo"
                  >
                    {deletingId === logo.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-400" />
                    ) : (
                      <FiTrash2 className="w-4 h-4" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
