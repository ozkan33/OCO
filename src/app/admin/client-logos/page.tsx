'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LogoMark } from '@/components/layout/Logo';
import { FiLogOut, FiTrash2, FiUpload, FiMoreVertical } from 'react-icons/fi';
import { toast, Toaster } from 'sonner';

interface ClientLogo {
  id: string;
  label: string;
  image_url: string;
  storage_path: string | null;
  sort_order: number;
  created_at: string;
}

export default function ClientLogosPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [logos, setLogos] = useState<ClientLogo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
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

  const handleSeedExisting = async () => {
    if (!confirm('This will add all 18 current hardcoded logos to the database. Continue?')) return;

    const hardcodedLogos = [
      { label: 'Nature Blessed', image_url: 'https://i.hizliresim.com/4foaurk.jpg' },
      { label: 'Cry Baby Craigs', image_url: 'https://i.hizliresim.com/52p13eh.jpg' },
      { label: 'Buon Giorno Italia', image_url: 'https://i.hizliresim.com/krii546.jpg' },
      { label: 'Northstar Kombucha', image_url: 'https://i.hizliresim.com/qfb79rk.png' },
      { label: 'Taco Terco', image_url: 'https://i.hizliresim.com/tvz3il4.png' },
      { label: "JoMomma's", image_url: '/logos/jomommas.jpg' },
      { label: 'Sturdiwheat', image_url: 'https://i.hizliresim.com/d2zwezj.jpg' },
      { label: 'Big Watt Beverage', image_url: 'https://i.hizliresim.com/gj0kg4t.jpg' },
      { label: 'Seven Bridges', image_url: 'https://i.hizliresim.com/krf2p1g.jpg' },
      { label: 'KenDavis', image_url: 'https://i.hizliresim.com/m4yzvq2.jpg' },
      { label: 'Dinos', image_url: 'https://i.hizliresim.com/69suf7c.jpg' },
      { label: 'Coloma Frozen Foods', image_url: 'https://i.hizliresim.com/q3bhb2t.jpg' },
      { label: "Mama Stoen's", image_url: 'https://i.hizliresim.com/69le7h5.jpg' },
      { label: 'Smude', image_url: 'https://i.hizliresim.com/88g01lk.jpg' },
      { label: 'Superior Water', image_url: 'https://i.hizliresim.com/24tt7vi.jpeg' },
      { label: 'La Perla', image_url: 'https://i.hizliresim.com/mui2jgt.jpg' },
      { label: 'Skinny Sticks', image_url: 'https://i.hizliresim.com/iv5mkd3.jpeg' },
      { label: 'Calvin Cleo', image_url: 'https://i.hizliresim.com/61u7kde.jpeg' },
    ];

    try {
      const res = await fetch('/api/client-logos', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logos: hardcodedLogos.map((l, i) => ({ ...l, sort_order: i })) }),
      });
      if (!res.ok) {
        toast.error('Failed to seed logos');
        return;
      }
      toast.success('Existing logos loaded into database');
      await fetchLogos();
    } catch {
      toast.error('Failed to seed logos');
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
    if (!confirm(`Delete "${label}" logo?`)) return;

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
    }
  };

  const handleEditSave = async (id: string) => {
    if (!editLabel.trim()) return;
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
    }
  };

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    const idx = logos.findIndex(l => l.id === id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= logos.length) return;

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
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      window.location.href = '/';
    } catch {
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
    const name = user.name || '';
    if (name && name !== user.email) return name.charAt(0).toUpperCase() + name.slice(1);
    const local = (user.email || '').split('@')[0];
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
      <Toaster position="top-right" richColors />

      {/* Header — same pattern as other admin pages */}
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
              <LogoMark size={32} />
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
                onClick={() => router.push('/admin/market-visits')}
                className="px-3.5 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 rounded-md hover:bg-white/60 transition-all"
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
                className="px-3.5 py-1.5 text-sm font-medium rounded-md bg-white text-slate-800 shadow-sm transition-all"
                aria-current="page"
              >
                Logos
              </button>
              <button
                onClick={() => router.push('/admin/visitors')}
                className="px-3.5 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 rounded-md hover:bg-white/60 transition-all"
              >
                Visitors
              </button>
            </div>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-all"
              aria-label="User menu"
              aria-expanded={showUserMenu}
              aria-haspopup="true"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-white text-xs font-semibold tracking-tight">
                {getUserInitials()}
              </div>
              <div className="hidden sm:flex flex-col items-start">
                <span className="text-sm font-medium text-slate-700 leading-tight max-w-[120px] truncate">{getDisplayName()}</span>
                <span className="text-[10px] text-slate-400 leading-tight">Admin</span>
              </div>
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
                    onClick={() => router.push('/admin/settings')}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors text-left"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                    Settings
                  </button>
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
              <p className="text-slate-400 mb-4">No logos in database yet.</p>
              <button
                onClick={handleSeedExisting}
                className="px-5 py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-900 transition-colors"
              >
                Load Existing Logos from Landing Page
              </button>
              <p className="text-slate-300 text-xs mt-2">This will import all 18 current logos into the database so you can manage them here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {logos.map((logo, idx) => (
                <li key={logo.id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => handleReorder(logo.id, 'up')}
                      disabled={idx === 0}
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
                      disabled={idx === logos.length - 1}
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
                          className="text-xs text-blue-600 font-medium hover:text-blue-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-slate-400 font-medium hover:text-slate-600"
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
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                    title="Delete logo"
                  >
                    <FiTrash2 className="w-4 h-4" />
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
