'use client';

import { useEffect, useState } from 'react';
import { useBrands } from '@/hooks/useBrands';
import AdminHeader from '@/components/admin/AdminHeader';
import { FiPlus, FiEdit2, FiTrash2, FiCopy, FiCheck, FiEye, FiEyeOff, FiClock, FiUserX, FiUserCheck, FiRefreshCw, FiX } from 'react-icons/fi';
import { Fragment } from 'react';
import WeeklySummaryCard from '@/components/portal/WeeklySummaryCard';

interface Assignment { scorecardId: string; productColumns: string[]; }
interface BrandUser {
  id: string; brand_name: string; contact_name: string; email: string;
  is_active: boolean; must_change_password: boolean; created_at: string; last_login: string | null;
  assignments: { scorecard_id: string; product_columns: string[]; brand_name: string }[];
}
interface Scorecard { id: string; title: string; columns: any[]; rowCount: number; }

export default function ClientsPage() {
  const { brands } = useBrands();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [brandUsers, setBrandUsers] = useState<BrandUser[]>([]);
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state (shared between create and edit)
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formAssignments, setFormAssignments] = useState<Assignment[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [createdUser, setCreatedUser] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Password confirmation state
  const [confirmAction, setConfirmAction] = useState<{ type: 'create' | 'delete' | 'permanent-delete'; id?: string; name?: string } | null>(null);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Login sessions state
  const [selectedUserSessions, setSelectedUserSessions] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Weekly summary regeneration state
  // Keyed on brand_name because the summary is brand-scoped — so sibling
  // rows of the same brand can reflect the shared "updating" state in a
  // subtle way (muted hint) while only the clicked anchor row spins.
  const [regeneratingBrand, setRegeneratingBrand] = useState<string | null>(null);
  const [regenPickerFor, setRegenPickerFor] = useState<string | null>(null);
  const [regenResult, setRegenResult] = useState<{
    brand: string;
    weekOf: string;
    stats: { visitCount?: number; storeCount?: number; statusChangeCount?: number; scorecardNoteCount?: number };
    summary: string;
  } | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);

  // Returns the Monday on or before the given date, as YYYY-MM-DD (UTC).
  const mondayOfISO = (date: Date): string => {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay();
    const diff = (day + 6) % 7;
    d.setUTCDate(d.getUTCDate() - diff);
    return d.toISOString().slice(0, 10);
  };
  const thisWeekMonday = mondayOfISO(new Date());
  const lastWeekMonday = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 7);
    return mondayOfISO(d);
  })();

  const runRegenerate = async (brandName: string, weekOf: string) => {
    if (regeneratingBrand) return;
    setRegeneratingBrand(brandName);
    setRegenError(null);
    setRegenPickerFor(null);
    try {
      const res = await fetch('/api/admin/weekly-summary/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ brand_name: brandName, week_of: weekOf }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to regenerate');
      setRegenResult({
        brand: body.brand,
        weekOf: body.week_of,
        stats: body.stats || {},
        summary: body.summary || '',
      });
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRegeneratingBrand(null);
    }
  };

  const handleRegenerateSummary = (brandName: string) => {
    setRegenPickerFor(brandName);
  };

  // Edit-specific state
  const [editResetPassword, setEditResetPassword] = useState(false);
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [userRes, usersRes, scRes] = await Promise.all([
          fetch('/api/auth/me', { credentials: 'include' }),
          fetch('/api/admin/brand-users', { credentials: 'include' }),
          fetch('/api/scorecards', { credentials: 'include' }),
        ]);
        if (userRes.ok) { const d = await userRes.json(); setUser(d.user); }
        if (usersRes.ok) setBrandUsers(await usersRes.json());
        // Always use API as primary source for scorecard IDs (needed for portal).
        // Enrich with localStorage titles if available (localStorage has
        // user-friendly names that match the dashboard sidebar).
        if (scRes.ok) {
          const apiData = await scRes.json();
          let localNames = new Map<string, string>();
          try {
            const local = JSON.parse(localStorage.getItem('scorecards') || '[]');
            local.forEach((s: any) => { if (s.id && (s.name || s.title)) localNames.set(s.id, s.name || s.title); });
          } catch { /* */ }

          const all = apiData.map((s: any) => ({
            id: s.id,
            title: localNames.get(s.id) || s.title || 'Untitled',
            columns: s.data?.columns || [],
            rowCount: s.data?.rows?.length || 0,
          }));

          // Filter out ghost scorecards (auto-save artifacts with no real data)
          const filtered = all.filter((sc: Scorecard) => {
            const t = sc.title.toLowerCase().trim();
            if (/^\d+\s*retailers?$/i.test(t)) return false;
            if (t === 'untitled' || t === 'untitled scorecard') return false;
            return true;
          });

          setScorecards(filtered.sort((a: Scorecard, b: Scorecard) => a.title.localeCompare(b.title)));
        }
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  const resetForm = () => {
    setFormEmail(''); setFormName(''); setFormBrand(''); setFormPassword('');
    setFormAssignments([]); setShowPassword(false); setError(null);
  };

  const handleCreateWithConfirm = () => {
    setError(null);
    if (!formEmail || !formName || !formBrand || !formPassword) {
      setError('All fields are required.'); return;
    }
    if (formPassword.length < 8) {
      setError('Password must be at least 8 characters.'); return;
    }
    setConfirmAction({ type: 'create' });
    setConfirmPassword('');
    setConfirmError('');
  };

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/brand-users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          email: formEmail, contactName: formName, brandName: formBrand,
          tempPassword: formPassword, scorecardAssignments: formAssignments,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); setSubmitting(false); return; }
      const created = await res.json();
      setCreatedUser({ email: created.email, tempPassword: created.tempPassword });
      // Refresh list
      const listRes = await fetch('/api/admin/brand-users', { credentials: 'include' });
      if (listRes.ok) setBrandUsers(await listRes.json());
    } catch { setError('Failed to create user.'); }
    setSubmitting(false);
  };

  const openEditModal = (bu: BrandUser) => {
    setFormName(bu.contact_name);
    setFormBrand(bu.brand_name);
    setFormEmail(bu.email);
    setFormAssignments((bu.assignments || []).map(a => ({ scorecardId: a.scorecard_id, productColumns: a.product_columns || [] })));
    setEditIsActive(bu.is_active);
    setEditResetPassword(false);
    setEditNewPassword('');
    setShowPassword(false);
    setError(null);
    setShowEditModal(bu.id);
  };

  const handleEdit = async () => {
    if (!showEditModal) return;
    setError(null);
    if (!formName.trim()) { setError('Contact name is required.'); return; }
    if (editResetPassword && editNewPassword.length < 8) { setError('New password must be at least 8 characters.'); return; }
    setSubmitting(true);
    try {
      // Update profile and assignments
      const res = await fetch(`/api/admin/brand-users/${showEditModal}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          contactName: formName, brandName: formBrand, isActive: editIsActive,
          scorecardAssignments: formAssignments,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Update failed'); setSubmitting(false); return; }

      // Reset password if requested
      if (editResetPassword && editNewPassword) {
        const pwRes = await fetch(`/api/admin/brand-users/${showEditModal}/reset-password`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ newPassword: editNewPassword }),
        });
        if (!pwRes.ok) { setError('Profile updated but password reset failed.'); }
      }

      // Refresh list
      const listRes = await fetch('/api/admin/brand-users', { credentials: 'include' });
      if (listRes.ok) setBrandUsers(await listRes.json());
      setShowEditModal(null); resetForm();
    } catch { setError('Update failed.'); }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    setConfirmAction({ type: 'delete', id });
    setConfirmPassword('');
    setConfirmError('');
  };

  const executeDelete = async (id: string) => {
    await fetch(`/api/admin/brand-users/${id}`, { method: 'DELETE', credentials: 'include' });
    setBrandUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: false } : u));
  };

  const viewSessions = async (userId: string) => {
    if (selectedUserSessions === userId) { setSelectedUserSessions(null); return; }
    setSelectedUserSessions(userId);
    setLoadingSessions(true);
    try {
      const res = await fetch(`/api/admin/login-sessions?user_id=${userId}&limit=20`, { credentials: 'include' });
      if (res.ok) setSessions(await res.json());
    } catch { /* silent */ }
    setLoadingSessions(false);
  };

  const handlePermanentDelete = (bu: BrandUser) => {
    setConfirmAction({ type: 'permanent-delete', id: bu.id, name: `${bu.contact_name} (${bu.brand_name})` });
    setConfirmPassword('');
    setConfirmError('');
  };

  const executePermanentDelete = async (id: string) => {
    const res = await fetch(`/api/admin/brand-users/${id}`, { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permanent: true }) });
    if (res.ok) setBrandUsers(prev => prev.filter(u => u.id !== id));
  };

  const handleReactivate = async (id: string) => {
    const res = await fetch(`/api/admin/brand-users/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ isActive: true }),
    });
    if (res.ok) setBrandUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: true } : u));
  };

  const handleConfirmAction = async () => {
    if (!confirmPassword.trim()) { setConfirmError('Please enter your password.'); return; }
    setConfirmLoading(true);
    setConfirmError('');
    try {
      const res = await fetch('/api/auth/verify-password', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: confirmPassword }),
      });
      if (!res.ok) { setConfirmError('Incorrect password.'); setConfirmLoading(false); return; }

      // Password verified — execute the action
      if (confirmAction?.type === 'create') {
        await handleCreate();
      } else if (confirmAction?.type === 'delete' && confirmAction.id) {
        await executeDelete(confirmAction.id);
      } else if (confirmAction?.type === 'permanent-delete' && confirmAction.id) {
        await executePermanentDelete(confirmAction.id);
      }
      setConfirmAction(null);
      setConfirmPassword('');
    } catch {
      setConfirmError('Verification failed.');
    }
    setConfirmLoading(false);
  };

  const getProductColumns = (scorecardId: string) => {
    const sc = scorecards.find(s => s.id === scorecardId);
    if (!sc) return [];
    return sc.columns.filter((c: any) => c.isDefault !== true && c.key !== 'comments' && c.key !== '_delete_row');
  };

  const toggleScorecardAssignment = (scorecardId: string) => {
    setFormAssignments(prev => {
      const exists = prev.find(a => a.scorecardId === scorecardId);
      if (exists) return prev.filter(a => a.scorecardId !== scorecardId);
      return [...prev, { scorecardId, productColumns: getProductColumns(scorecardId).map((c: any) => c.key) }];
    });
  };

  const toggleProductColumn = (scorecardId: string, colKey: string) => {
    setFormAssignments(prev => prev.map(a => {
      if (a.scorecardId !== scorecardId) return a;
      const has = a.productColumns.includes(colKey);
      return { ...a, productColumns: has ? a.productColumns.filter(k => k !== colKey) : [...a.productColumns, colKey] };
    }));
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-blue-600" /></div>;
  if (!user) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><p className="text-slate-500">Unauthorized</p></div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Client Management</h1>
            <p className="text-sm text-slate-500 mt-1">Create and manage brand portal accounts</p>
          </div>
          <button onClick={() => { resetForm(); setCreatedUser(null); setShowCreateModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            <FiPlus className="w-4 h-4" /> Add Client
          </button>
        </div>

        {/* Users table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Brand</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Scorecards</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Last Login</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {brandUsers.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No brand users yet. Click &ldquo;Add Client&rdquo; to create one.</td></tr>
              ) : (() => {
                // Sort so same-brand users are adjacent, then contact name.
                // The first user of each brand is the "anchor" — it owns the
                // Regenerate button. Other users of the same brand show a
                // muted "shared" indicator instead, since the summary is
                // brand-scoped in the DB and regenerating once updates it
                // for everyone on that brand.
                const sorted = [...brandUsers].sort((a, b) => {
                  const brandCmp = a.brand_name.localeCompare(b.brand_name);
                  return brandCmp !== 0 ? brandCmp : a.contact_name.localeCompare(b.contact_name);
                });
                const brandCounts = new Map<string, number>();
                sorted.forEach(u => brandCounts.set(u.brand_name, (brandCounts.get(u.brand_name) || 0) + 1));
                const seenBrands = new Set<string>();
                return sorted.map(bu => {
                  const isAnchor = !seenBrands.has(bu.brand_name);
                  if (isAnchor) seenBrands.add(bu.brand_name);
                  const brandUserCount = brandCounts.get(bu.brand_name) || 1;
                  const isShared = brandUserCount > 1;
                  const isThisBrandRegenerating = regeneratingBrand === bu.brand_name;
                  return (
                <Fragment key={bu.id}>
                  <tr className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{bu.brand_name}</td>
                    <td className="px-4 py-3 text-slate-700">{bu.contact_name}</td>
                    <td className="px-4 py-3 text-slate-500">{bu.email}</td>
                    <td className="px-4 py-3 text-slate-500">{bu.assignments?.length || 0}</td>
                    <td className="px-4 py-3">
                      {bu.is_active
                        ? bu.must_change_password
                          ? <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pending</span>
                          : <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Active</span>
                        : <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Inactive</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{bu.last_login ? new Date(bu.last_login).toLocaleDateString() : 'Never'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => viewSessions(bu.id)} className={`transition-colors p-1.5 rounded-md ${selectedUserSessions === bu.id ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-100'}`} title="Login History"><FiClock className="w-4 h-4" /></button>
                        {isAnchor ? (
                          <button
                            onClick={() => handleRegenerateSummary(bu.brand_name)}
                            disabled={isThisBrandRegenerating}
                            className="text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors p-1.5 rounded-md disabled:opacity-50"
                            title={isShared
                              ? `Regenerate this week's AI summary (shared across ${brandUserCount} ${bu.brand_name} users)`
                              : "Regenerate this week's AI summary"}
                          >
                            <FiRefreshCw className={`w-4 h-4 ${isThisBrandRegenerating ? 'animate-spin' : ''}`} />
                          </button>
                        ) : (
                          <span
                            className="inline-flex items-center justify-center p-1.5 rounded-md text-slate-300"
                            title={`Weekly summary is shared with ${bu.brand_name}. Regenerate it from the first row of this brand.`}
                            aria-label={`Summary shared with ${bu.brand_name}`}
                          >
                            {isThisBrandRegenerating ? (
                              <FiRefreshCw className="w-4 h-4 animate-spin text-purple-300" />
                            ) : (
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                              </svg>
                            )}
                          </span>
                        )}
                        <button onClick={() => openEditModal(bu)} className="text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-colors p-1.5 rounded-md" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
                        {bu.is_active
                          ? <button onClick={() => handleDelete(bu.id)} className="text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors p-1.5 rounded-md" title="Deactivate (user can't log in)"><FiUserX className="w-4 h-4" /></button>
                          : <button onClick={() => handleReactivate(bu.id)} className="text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors p-1.5 rounded-md" title="Reactivate user"><FiUserCheck className="w-4 h-4" /></button>
                        }
                        <button onClick={() => handlePermanentDelete(bu)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors p-1.5 rounded-md" title="Delete permanently"><FiTrash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                  {selectedUserSessions === bu.id && (
                    <tr>
                      <td colSpan={7} className="px-4 py-3 bg-slate-50">
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Login History — {bu.contact_name}</h4>
                            <button onClick={() => setSelectedUserSessions(null)} className="text-xs text-slate-400 hover:text-slate-600">&times; Close</button>
                          </div>
                          {loadingSessions ? (
                            <div className="px-4 py-6 text-center"><div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-200 border-t-blue-600 mx-auto" /></div>
                          ) : sessions.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-slate-400">No login sessions recorded yet.</div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-slate-100">
                                  <th className="text-left px-3 py-2 font-semibold text-slate-500">Login Time</th>
                                  <th className="text-left px-3 py-2 font-semibold text-slate-500">Logout Time</th>
                                  <th className="text-left px-3 py-2 font-semibold text-slate-500">Duration</th>
                                  <th className="text-left px-3 py-2 font-semibold text-slate-500">IP</th>
                                  <th className="text-left px-3 py-2 font-semibold text-slate-500">2FA</th>
                                  <th className="text-left px-3 py-2 font-semibold text-slate-500">Trusted</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sessions.map((s: any) => (
                                  <tr key={s.id} className="border-b border-slate-50">
                                    <td className="px-3 py-2 text-slate-700">{new Date(s.login_at).toLocaleString()}</td>
                                    <td className="px-3 py-2 text-slate-500">{s.logout_at ? new Date(s.logout_at).toLocaleString() : <span className="text-green-600 font-medium">Active</span>}</td>
                                    <td className="px-3 py-2 text-slate-500">{s.duration_minutes != null ? `${Math.round(s.duration_minutes)} min` : '—'}</td>
                                    <td className="px-3 py-2 text-slate-400 font-mono">{s.ip_address || '—'}</td>
                                    <td className="px-3 py-2">{s.two_factor_used ? <span className="text-green-600">Yes</span> : <span className="text-slate-300">No</span>}</td>
                                    <td className="px-3 py-2">{s.device_trusted ? <span className="text-blue-600">Yes</span> : <span className="text-slate-300">No</span>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </main>

      {/* Regenerate Summary — Week Picker */}
      {regenPickerFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">Regenerate weekly summary</h3>
              <p className="text-xs text-slate-500 mt-0.5">Pick the week to summarize for <span className="font-medium text-slate-700">{regenPickerFor}</span>.</p>
            </div>
            <div className="p-4 space-y-2">
              <button
                onClick={() => runRegenerate(regenPickerFor, thisWeekMonday)}
                className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:border-purple-300 hover:bg-purple-50/40 transition-colors"
              >
                <div className="text-sm font-semibold text-slate-900">This week</div>
                <div className="text-xs text-slate-500 mt-0.5">Monday {thisWeekMonday} onwards (in progress)</div>
              </button>
              <button
                onClick={() => runRegenerate(regenPickerFor, lastWeekMonday)}
                className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:border-purple-300 hover:bg-purple-50/40 transition-colors"
              >
                <div className="text-sm font-semibold text-slate-900">Last completed week</div>
                <div className="text-xs text-slate-500 mt-0.5">Monday {lastWeekMonday} — what the Monday cron would generate</div>
              </button>
            </div>
            <div className="px-6 py-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setRegenPickerFor(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Regenerate Summary — Error Toast */}
      {regenError && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-red-50 border border-red-200 rounded-xl shadow-lg p-4 flex items-start gap-3">
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-red-900">Summary regeneration failed</h4>
            <p className="text-xs text-red-700 mt-0.5">{regenError}</p>
          </div>
          <button onClick={() => setRegenError(null)} className="text-red-400 hover:text-red-600 p-1 rounded-md">
            <FiX className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Regenerate Summary — Preview Modal */}
      {regenResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Summary regenerated</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {regenResult.brand} · week of {regenResult.weekOf} · this is what your client will see on their portal
                </p>
              </div>
              <button
                onClick={() => setRegenResult(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100"
                title="Close"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              <WeeklySummaryCard
                summary={{
                  weekOf: regenResult.weekOf,
                  markdown: regenResult.summary,
                  stats: regenResult.stats,
                  generatedAt: new Date().toISOString(),
                }}
              />
            </div>
            <div className="px-6 py-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setRegenResult(null)}
                className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">{createdUser ? 'Client Created' : 'Add New Client'}</h2>
            </div>

            {createdUser ? (
              <div className="px-6 py-6 space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-green-800 mb-2">Account created successfully!</p>
                  <p className="text-sm text-green-700">Share these credentials with your client:</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                    <p className="text-sm font-mono text-slate-900 bg-slate-50 rounded px-3 py-2">{createdUser.email}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Temporary Password</label>
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-sm font-mono text-slate-900 bg-slate-50 rounded px-3 py-2">{createdUser.tempPassword}</p>
                      <button onClick={() => { navigator.clipboard.writeText(createdUser.tempPassword); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="p-2 text-slate-500 hover:text-blue-600 transition-colors">
                        {copied ? <FiCheck className="w-4 h-4 text-green-600" /> : <FiCopy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">The user will be asked to change this password on first login. This is the only time the password will be shown.</p>
                </div>
                <button onClick={() => { setShowCreateModal(false); setCreatedUser(null); resetForm(); }} className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">Done</button>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Brand *</label>
                    <select value={formBrand} onChange={e => setFormBrand(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                      <option value="">Select brand...</option>
                      {brands.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Contact Name *</label>
                    <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Jane Doe" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                  <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="jane@brand.com" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Temporary Password *</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={formPassword} onChange={e => setFormPassword(e.target.value)} placeholder="Min 8 characters" className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-10 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Scorecard Assignments */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Assign Scorecards</label>
                  {scorecards.length === 0 ? (
                    <p className="text-xs text-slate-400">No scorecards available. Create one in the Dashboard first.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-3">
                      {scorecards.map(sc => {
                        const isAssigned = formAssignments.some(a => a.scorecardId === sc.id);
                        const productCols = getProductColumns(sc.id);
                        return (
                          <div key={sc.id} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={isAssigned} onChange={() => toggleScorecardAssignment(sc.id)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-slate-700">{sc.title}</span>
                                <span className="text-xs text-slate-400 ml-1">({sc.rowCount} retailers, {productCols.length} products)</span>
                              </div>
                            </label>
                            {isAssigned && productCols.length > 0 && (
                              <div className="ml-6 mt-1 flex flex-wrap gap-1">
                                {productCols.map((col: any) => {
                                  const assignment = formAssignments.find(a => a.scorecardId === sc.id);
                                  const isSelected = assignment?.productColumns.includes(col.key);
                                  return (
                                    <button key={col.key} type="button" onClick={() => toggleProductColumn(sc.id, col.key)}
                                      className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${isSelected ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'}`}>
                                      {col.name}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

                <div className="flex gap-3 pt-2">
                  <button onClick={() => { setShowCreateModal(false); resetForm(); }} className="flex-1 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button>
                  <button onClick={handleCreateWithConfirm} disabled={submitting} className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {submitting ? 'Creating...' : 'Create Client'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Edit Client</h2>
              <button onClick={() => { setShowEditModal(null); resetForm(); }} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Brand</label>
                  <select value={formBrand} onChange={e => setFormBrand(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                    <option value="">Select brand...</option>
                    {brands.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contact Name</label>
                  <input type="text" value={formName} onChange={e => setFormName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <p className="text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2">{formEmail}</p>
              </div>

              {/* Status toggle */}
              <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">Account Status</p>
                  <p className="text-xs text-slate-400">{editIsActive ? 'User can log in' : 'User is blocked from logging in'}</p>
                </div>
                <button onClick={() => setEditIsActive(!editIsActive)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${editIsActive ? 'bg-green-500' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${editIsActive ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              {/* Reset Password */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button onClick={() => setEditResetPassword(!editResetPassword)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                  <span>Reset Password</span>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${editResetPassword ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>
                {editResetPassword && (
                  <div className="px-4 pb-3 pt-1 border-t border-slate-100">
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} value={editNewPassword} onChange={e => setEditNewPassword(e.target.value)} placeholder="New password (min 8 chars)" className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-10 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-amber-600 mt-2">User will be forced to change this password on next login.</p>
                  </div>
                )}
              </div>

              {/* Scorecard Assignments */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Scorecard Access</label>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-3">
                  {scorecards.map(sc => {
                    const isAssigned = formAssignments.some(a => a.scorecardId === sc.id);
                    const productCols = getProductColumns(sc.id);
                    return (
                      <div key={sc.id} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={isAssigned} onChange={() => toggleScorecardAssignment(sc.id)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-slate-700">{sc.title}</span>
                            {productCols.length > 0 && (
                              <span className="text-xs text-slate-400 ml-1">— {productCols.slice(0, 3).map((c: any) => c.name).join(', ')}{productCols.length > 3 ? ` +${productCols.length - 3} more` : ''}</span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 shrink-0">({productCols.length} products)</span>
                        </label>
                        {isAssigned && productCols.length > 0 && (
                          <div className="ml-6 mt-1 flex flex-wrap gap-1">
                            {productCols.map((col: any) => {
                              const assignment = formAssignments.find(a => a.scorecardId === sc.id);
                              const isSelected = assignment?.productColumns.includes(col.key);
                              return (
                                <button key={col.key} type="button" onClick={() => toggleProductColumn(sc.id, col.key)}
                                  className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${isSelected ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'}`}>
                                  {col.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowEditModal(null); resetForm(); }} className="flex-1 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button>
                <button onClick={handleEdit} disabled={submitting} className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirm with Password</h3>
                <p className="text-xs text-slate-500">
                  {confirmAction.type === 'create' && 'Enter your password to create this user.'}
                  {confirmAction.type === 'delete' && 'Enter your password to deactivate this user.'}
                  {confirmAction.type === 'permanent-delete' && `Enter your password to permanently delete ${confirmAction.name}.`}
                </p>
              </div>
            </div>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setConfirmError(''); }}
              placeholder="Your admin password"
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleConfirmAction()}
            />
            {confirmError && <p className="text-xs text-red-500 mb-2">{confirmError}</p>}
            <div className="flex gap-3 mt-3">
              <button
                onClick={() => { setConfirmAction(null); setConfirmPassword(''); setConfirmError(''); }}
                className="flex-1 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
              >Cancel</button>
              <button
                onClick={handleConfirmAction}
                disabled={confirmLoading || !confirmPassword.trim()}
                className={`flex-1 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 ${
                  confirmAction.type === 'permanent-delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {confirmLoading ? 'Verifying...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
