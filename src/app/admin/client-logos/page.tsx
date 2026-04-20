'use client';

import { useEffect, useState, useRef } from 'react';
import { FiTrash2, FiUpload, FiMoreVertical } from 'react-icons/fi';
import { toast, Toaster } from 'sonner';
import AdminHeader from '@/components/admin/AdminHeader';

interface ClientLogo {
  id: string;
  label: string;
  image_url: string;
  storage_path: string | null;
  sort_order: number;
  created_at: string;
}

export default function ClientLogosPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [logos, setLogos] = useState<ClientLogo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (user?.role === 'ADMIN') fetchLogos();
  }, [user]);

  const fetchLogos = async () => {
    try {
      const res = await fetch('/api/client-logos', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLogos(data);
      }
    } catch {
      toast.error('Failed to load logos');
    }
  };


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setNewFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setPreview(url);
    } else {
      setPreview(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFile || !newLabel.trim()) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', newFile);
      formData.append('label', newLabel.trim());
      formData.append('sort_order', String(logos.length));

      const res = await fetch('/api/client-logos', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Upload failed');
        return;
      }

      toast.success('Logo added successfully');
      setNewLabel('');
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

  const handleDelete = async (id: string, label: string) => {
    if (deletingId) return;
    if (!confirm(`Delete "${label}" logo?`)) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/client-logos/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        toast.error('Delete failed');
        return;
      }
      toast.success('Logo deleted');
      await fetchLogos();
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditSave = async (id: string) => {
    if (savingEditId) return;
    if (!editLabel.trim()) return;
    setSavingEditId(id);
    try {
      const res = await fetch(`/api/client-logos/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editLabel.trim() }),
      });
      if (!res.ok) {
        toast.error('Update failed');
        return;
      }
      toast.success('Label updated');
      setEditingId(null);
      await fetchLogos();
    } catch {
      toast.error('Update failed');
    } finally {
      setSavingEditId(null);
    }
  };

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    if (reorderingId) return;
    const idx = logos.findIndex(l => l.id === id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= logos.length) return;

    setReorderingId(id);
    try {
      await Promise.all([
        fetch(`/api/client-logos/${logos[idx].id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: logos[swapIdx].sort_order }),
        }),
        fetch(`/api/client-logos/${logos[swapIdx].id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: logos[idx].sort_order }),
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

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Landing Page Logos</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage the client logos displayed on the landing page carousel. Changes go live immediately.
          </p>
        </div>

        {/* Upload form */}
        <form
          onSubmit={handleUpload}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8"
        >
          <h2 className="text-base font-semibold text-slate-800 mb-4">Add New Logo</h2>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {/* Image preview / upload area */}
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

            <div className="flex-1 flex flex-col sm:flex-row gap-3 w-full">
              <input
                type="text"
                placeholder="Brand name (e.g. JoMomma's)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="flex-1 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="submit"
                disabled={uploading || !newFile || !newLabel.trim()}
                className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {uploading ? 'Uploading...' : 'Add Logo'}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Accepted formats: JPEG, PNG, WebP. Max 5MB. Recommended: transparent PNG, at least 200px wide.
          </p>
        </form>

        {/* Logo list */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800">
              Current Logos ({logos.length})
            </h2>
          </div>

          {logos.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm">
              <p className="text-slate-400">No logos in database yet. Use the form above to add your first logo.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {logos.map((logo, idx) => (
                <li key={logo.id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                  {/* Reorder buttons */}
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
                      disabled={idx === logos.length - 1 || reorderingId !== null}
                      className="text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Logo thumbnail */}
                  <div className="w-20 h-14 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logo.image_url}
                      alt={logo.label}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>

                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    {editingId === logo.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEditSave(logo.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="flex-1 border border-slate-200 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                        <button
                          onClick={() => handleEditSave(logo.id)}
                          disabled={savingEditId === logo.id || !editLabel.trim()}
                          aria-busy={savingEditId === logo.id}
                          className="text-xs text-blue-600 font-medium hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {savingEditId === logo.id ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          disabled={savingEditId === logo.id}
                          className="text-xs text-slate-400 font-medium hover:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingId(logo.id);
                          setEditLabel(logo.label);
                        }}
                        className="text-sm font-medium text-slate-800 hover:text-blue-600 transition-colors text-left"
                        title="Click to edit label"
                      >
                        {logo.label}
                      </button>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">
                      Order: {logo.sort_order}
                    </p>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(logo.id, logo.label)}
                    disabled={deletingId === logo.id}
                    aria-busy={deletingId === logo.id}
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
