'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import { toast } from 'sonner';
import { FiPlus, FiEdit2, FiTrash2, FiSearch, FiUpload, FiX, FiChevronLeft, FiChevronRight, FiAlertTriangle } from 'react-icons/fi';

interface Store {
  id: number;
  chain_name: string;
  store_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
}

const EMPTY_FORM: Omit<Store, 'id'> = {
  chain_name: '',
  store_name: '',
  address: '',
  city: '',
  state: '',
  zipcode: '',
};

const PAGE_SIZE = 50;

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<Store | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Omit<Store, 'id'>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadStores = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        all: '1',
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (query) params.set('q', query);
      const res = await fetch(`/api/stores?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Failed to load stores');
        return;
      }
      const data = await res.json();
      setStores(data.stores || []);
      setTotal(data.total || 0);
    } catch {
      toast.error('Failed to load stores');
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setCreating(true);
  };

  const openEdit = (s: Store) => {
    setForm({
      chain_name: s.chain_name,
      store_name: s.store_name,
      address: s.address || '',
      city: s.city || '',
      state: s.state || '',
      zipcode: s.zipcode || '',
    });
    setEditing(s);
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    if (!form.chain_name.trim() || !form.store_name.trim()) {
      toast.error('Chain Name and Store Name are required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/stores/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || 'Failed to update store');
          return;
        }
        setStores(prev => prev.map(s => (s.id === editing.id ? data.store : s)));
        toast.success('Store updated');
      } else {
        const res = await fetch('/api/stores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ store: form }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || 'Failed to create store');
          return;
        }
        toast.success('Store added');
        await loadStores();
      }
      closeModal();
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: Store) => {
    const ok = window.confirm(
      `Delete "${s.store_name}" (${s.chain_name})?\n\nThis removes the store from the master directory. Market visits and comments that reference it by name will stay, but dropdown lookups will no longer find it.`
    );
    if (!ok) return;
    setDeletingId(s.id);
    try {
      const res = await fetch(`/api/stores/${s.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Failed to delete store');
        return;
      }
      setStores(prev => prev.filter(x => x.id !== s.id));
      setTotal(t => Math.max(0, t - 1));
      toast.success('Store deleted');
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const runImport = async () => {
    if (!importFile) {
      toast.error('Choose a file first');
      return;
    }
    const ok = window.confirm(
      'This will DELETE every store in the directory and replace them with the contents of your file.\n\n' +
      'This cannot be undone. Continue?'
    );
    if (!ok) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('clear_existing', 'true');
      const res = await fetch('/api/stores/import', { method: 'POST', credentials: 'include', body: formData });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || 'Import failed');
        return;
      }
      toast.success(`Imported ${result.count} stores from ${result.chains} chains`);
      setImportFile(null);
      setShowImport(false);
      setPage(1);
      setSearchInput('');
      setQuery('');
      await loadStores();
    } catch {
      toast.error('Import failed');
    } finally {
      setImporting(false);
    }
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, page * PAGE_SIZE);

  const modalOpen = creating || editing !== null;
  const modalTitle = editing ? 'Edit Store' : 'Add Store';

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Store Directory</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Master list of every chain and its stores. Market visits, scorecard rows, and comments reference this data — edits here affect lookups across the app.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(v => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              <FiUpload size={14} />
              Bulk replace
            </button>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors"
            >
              <FiPlus size={14} />
              Add Store
            </button>
          </div>
        </div>

        {showImport && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <FiAlertTriangle className="text-amber-600 mt-0.5 shrink-0" size={18} />
              <div className="text-sm text-amber-900">
                <p className="font-semibold">Bulk replace wipes the entire directory.</p>
                <p className="mt-1 text-amber-800">
                  Every existing store is deleted before inserting. Use this only when seeding from scratch or replacing the whole customer list. For individual edits, use <span className="font-medium">Add Store</span> or the edit button on a row.
                </p>
                <p className="mt-1 text-amber-800">
                  Required columns: <span className="font-mono text-xs">Chain Name, Store Name, Address, City, State, ZIP</span>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-7">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={e => setImportFile(e.target.files?.[0] || null)}
                disabled={importing}
                className="text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-white file:text-slate-700 file:border-slate-300 file:text-xs file:font-medium hover:file:bg-slate-50 file:cursor-pointer"
              />
              <button
                onClick={runImport}
                disabled={!importFile || importing}
                className="px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {importing ? 'Importing...' : 'Replace all stores'}
              </button>
              <button
                onClick={() => { setShowImport(false); setImportFile(null); }}
                disabled={importing}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search chain, store, city, state, ZIP..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 focus:bg-white transition-all"
              />
            </div>
            <div className="text-xs text-slate-500 tabular-nums">
              {loading ? 'Loading...' : total === 0 ? 'No stores' : `${rangeStart}–${rangeEnd} of ${total.toLocaleString()}`}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-semibold">Chain</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Store</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Address</th>
                  <th className="text-left px-4 py-2.5 font-semibold">City</th>
                  <th className="text-left px-4 py-2.5 font-semibold">State</th>
                  <th className="text-left px-4 py-2.5 font-semibold">ZIP</th>
                  <th className="text-right px-4 py-2.5 font-semibold w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && stores.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-sm">Loading stores...</td></tr>
                ) : stores.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-sm">
                    {query ? 'No stores match your search.' : 'No stores yet. Add your first store or bulk-import from Excel.'}
                  </td></tr>
                ) : stores.map(s => (
                  <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-2.5 text-slate-800 font-medium">{s.chain_name}</td>
                    <td className="px-4 py-2.5 text-slate-700">{s.store_name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{s.address || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-slate-600">{s.city || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-slate-600">{s.state || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-slate-600 tabular-nums">{s.zipcode || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEdit(s)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                          title="Edit"
                        >
                          <FiEdit2 size={14} />
                        </button>
                        <button
                          onClick={() => remove(s)}
                          disabled={deletingId === s.id}
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500 tabular-nums">Page {page} of {totalPages}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Previous page"
                >
                  <FiChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Next page"
                >
                  <FiChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeModal}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">{modalTitle}</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-700 transition-colors" aria-label="Close">
                <FiX size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <Field
                label="Chain Name"
                required
                value={form.chain_name}
                onChange={v => setForm(f => ({ ...f, chain_name: v }))}
              />
              <Field
                label="Store Name"
                required
                value={form.store_name}
                onChange={v => setForm(f => ({ ...f, store_name: v }))}
              />
              <Field
                label="Address"
                value={form.address || ''}
                onChange={v => setForm(f => ({ ...f, address: v }))}
              />
              <div className="grid grid-cols-3 gap-3">
                <Field
                  label="City"
                  value={form.city || ''}
                  onChange={v => setForm(f => ({ ...f, city: v }))}
                />
                <Field
                  label="State"
                  value={form.state || ''}
                  onChange={v => setForm(f => ({ ...f, state: v }))}
                />
                <Field
                  label="ZIP"
                  value={form.zipcode || ''}
                  onChange={v => setForm(f => ({ ...f, zipcode: v }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-slate-50 border-t border-slate-100 rounded-b-xl">
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-1.5 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : editing ? 'Save changes' : 'Add store'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all"
      />
    </label>
  );
}
