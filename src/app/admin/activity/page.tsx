'use client';

import { useEffect, useState, useMemo, Fragment, useCallback } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import { FiClock, FiUser, FiShield, FiUsers, FiRefreshCw } from 'react-icons/fi';

interface Session {
  id: string;
  user_id: string;
  email: string;
  brand_name: string | null;
  login_at: string;
  logout_at: string | null;
  duration_minutes: number | null;
  ip_address: string;
  user_agent: string;
  device_trusted: boolean;
  two_factor_used: boolean;
  user_role: string;
  user_name: string;
  is_active: boolean;
}

type RoleFilter = 'ALL' | 'ADMIN' | 'BRAND';

interface AnalyticsPayload {
  activeNow: number;
  todayLogins: number;
  uniqueTodayUsers: number;
  avgSessionMin: number;
  totalLogins: number;
  roleCounts: Record<RoleFilter, number>;
  sessions: Session[];
}

const EMPTY_PAYLOAD: AnalyticsPayload = {
  activeNow: 0,
  todayLogins: 0,
  uniqueTodayUsers: 0,
  avgSessionMin: 0,
  totalLogins: 0,
  roleCounts: { ALL: 0, ADMIN: 0, BRAND: 0 },
  sessions: [],
};

export default function ActivityPage() {
  const [user, setUser] = useState<any>(null);
  const [data, setData] = useState<AnalyticsPayload>(EMPTY_PAYLOAD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [limit, setLimit] = useState(100);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(limit), days: '30' });
    if (roleFilter !== 'ALL') params.set('role', roleFilter);
    try {
      const res = await fetch(`/api/admin/activity?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        setError('Failed to load activity');
        return;
      }
      const payload = (await res.json()) as Partial<AnalyticsPayload>;
      setData({ ...EMPTY_PAYLOAD, ...payload, roleCounts: { ...EMPTY_PAYLOAD.roleCounts, ...(payload.roleCounts || {}) } });
      setError(null);
    } catch {
      setError('Failed to load activity');
    }
  }, [limit, roleFilter]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) {
          setUser(null);
          setError('Authentication failed');
          setLoading(false);
          return;
        }
        const body = await res.json();
        setUser(body.user);
        await fetchAnalytics();
      } catch {
        setUser(null);
        setError('Failed to load user data');
      }
      setLoading(false);
    };
    init();
  }, [fetchAnalytics]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
  };

  // Search stays client-side — it's interactive and only filters the already-
  // loaded page. Role filter lives on the server so the stat cards and the
  // session list stay consistent with each other.
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return data.sessions;
    const q = searchQuery.toLowerCase();
    return data.sessions.filter(s =>
      s.email.toLowerCase().includes(q) ||
      s.user_name.toLowerCase().includes(q) ||
      (s.brand_name && s.brand_name.toLowerCase().includes(q))
    );
  }, [data.sessions, searchQuery]);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'BRAND': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  const formatDuration = (minutes: number | null) => {
    if (minutes == null) return null;
    if (minutes < 1) return '< 1 min';
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m}m`;
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  // Group sessions by date for visual separation
  const groupedByDate = useMemo(() => {
    const groups: { date: string; sessions: Session[] }[] = [];
    let currentDate = '';
    filtered.forEach(s => {
      const d = formatDate(s.login_at);
      if (d !== currentDate) {
        currentDate = d;
        groups.push({ date: d, sessions: [s] });
      } else {
        groups[groups.length - 1].sessions.push(s);
      }
    });
    return groups;
  }, [filtered]);

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">User Activity</h1>
            <p className="text-sm text-slate-500 mt-1">Track who logged in, when, and for how long.</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <FiRefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-blue-600" />
          </div>
        ) : error ? (
          <div className="bg-white border border-red-200 text-slate-700 px-6 py-5 rounded-xl shadow-sm max-w-md mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <strong className="font-semibold text-slate-900">Connection Error</strong>
            </div>
            <p className="text-sm text-slate-600 mb-4">{error}</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors">
              Retry
            </button>
          </div>
        ) : !user ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400">Unable to load activity data.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard icon={<FiUser className="w-4 h-4 text-green-600" />} label="Active Now" value={data.activeNow} accent="green" />
              <StatCard icon={<FiShield className="w-4 h-4 text-blue-600" />} label="Logins Today" value={data.todayLogins} />
              <StatCard icon={<FiUsers className="w-4 h-4 text-purple-600" />} label="Unique Users Today" value={data.uniqueTodayUsers} />
              <StatCard icon={<FiClock className="w-4 h-4 text-amber-600" />} label="Avg. Session" value={data.avgSessionMin > 0 ? `${data.avgSessionMin} min` : '--'} />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {/* Role Tabs */}
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                {(['ALL', 'ADMIN', 'BRAND'] as RoleFilter[]).map(r => (
                  <button
                    key={r}
                    onClick={() => setRoleFilter(r)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                      roleFilter === r
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                    }`}
                  >
                    {r === 'ALL' ? 'All' : r.charAt(0) + r.slice(1).toLowerCase()}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${roleFilter === r ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/60 text-slate-400'}`}>
                      {data.roleCounts[r] ?? 0}
                    </span>
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative flex-1 max-w-xs">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by name, email, brand..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              {/* Limit */}
              <select
                value={limit}
                onChange={e => setLimit(parseInt(e.target.value))}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value={50}>Last 50</option>
                <option value={100}>Last 100</option>
                <option value={200}>Last 200</option>
                <option value={500}>Last 500</option>
              </select>
            </div>

            {/* Sessions Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Login Sessions</h2>
                <span className="text-xs text-slate-400">{filtered.length} sessions</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Login</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Logout</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Duration</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">IP</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">2FA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {groupedByDate.map((group, gi) => (
                      <Fragment key={`${group.date}-${gi}`}>
                        <tr>
                          <td colSpan={7} className="px-4 py-2 bg-slate-50/80">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{group.date}</span>
                          </td>
                        </tr>
                        {group.sessions.map(s => (
                          <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-semibold ${
                                  s.user_role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                                  s.user_role === 'BRAND' ? 'bg-blue-100 text-blue-700' :
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {(s.user_name || s.email.charAt(0)).charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-slate-800 truncate max-w-[160px]">
                                    {s.user_name || s.email.split('@')[0]}
                                  </p>
                                  <p className="text-[11px] text-slate-400 truncate max-w-[160px]">{s.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getRoleBadge(s.user_role)}`}>
                                {s.user_role === 'ADMIN' ? 'Admin' : s.user_role === 'BRAND' ? s.brand_name || 'Brand' : s.user_role}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap text-xs">{formatTime(s.login_at)}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-xs">
                              {s.logout_at ? (
                                <span className="text-slate-500">{formatTime(s.logout_at)}</span>
                              ) : s.is_active ? (
                                <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                  Active
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">Session expired</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap text-xs font-mono">
                              {s.duration_minutes != null ? (
                                formatDuration(s.duration_minutes)
                              ) : s.is_active ? (
                                <span className="text-green-600">{formatDuration(Math.round((Date.now() - new Date(s.login_at).getTime()) / 60000))}</span>
                              ) : (
                                <span className="text-slate-400">--</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{s.ip_address || '--'}</td>
                            <td className="px-4 py-2.5">
                              {s.two_factor_used ? (
                                <span className="text-green-600 text-xs font-medium">Yes</span>
                              ) : (
                                <span className="text-slate-300 text-xs">No</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                          {data.sessions.length === 0 ? 'No login sessions recorded yet.' : 'No sessions match your filters.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number | string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <p className="text-xs text-slate-500">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${accent === 'green' ? 'text-green-600' : 'text-slate-900'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
