'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';

interface VisitorData {
  totalVisits: number;
  uniqueVisits: number;
  topReferrers: { source: string; count: number }[];
  topPages: { page: string; count: number }[];
  deviceCounts: { desktop: number; mobile: number; tablet: number };
  topCountries: { country: string; count: number }[];
  dailyVisits: { date: string; total: number; unique: number }[];
  recentVisitors: any[];
}

export default function VisitorTrackerPage() {
  const [data, setData] = useState<VisitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/visitors?days=${days}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [days]);

  const totalDevices = data ? data.deviceCounts.desktop + data.deviceCounts.mobile + data.deviceCounts.tablet : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Visitor Tracker</h1>
            <p className="text-sm text-slate-500 mt-1">See who is landing on your site and where they come from.</p>
          </div>
          <div className="flex items-center gap-2">
            {[7, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${days === d ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-blue-600" />
          </div>
        ) : !data ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400">Unable to load visitor data.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Total Visits" value={data.totalVisits} />
              <StatCard label="Unique Visitors" value={data.uniqueVisits} />
              <StatCard label="Desktop" value={data.deviceCounts.desktop} subtitle={totalDevices ? `${Math.round(data.deviceCounts.desktop / totalDevices * 100)}%` : ''} />
              <StatCard label="Mobile" value={data.deviceCounts.mobile} subtitle={totalDevices ? `${Math.round(data.deviceCounts.mobile / totalDevices * 100)}%` : ''} />
            </div>

            {/* Daily Traffic Chart */}
            {data.dailyVisits.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-sm font-semibold text-slate-800 mb-4">Daily Traffic</h2>
                <div className="flex items-end gap-1 h-32">
                  {data.dailyVisits.map(d => {
                    const max = Math.max(...data.dailyVisits.map(v => v.total), 1);
                    const height = Math.max((d.total / max) * 100, 4);
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
                          {d.date}: {d.total} visits
                        </div>
                        <div
                          className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-default"
                          style={{ height: `${height}%`, minHeight: 2 }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-slate-400">
                  <span>{data.dailyVisits[0]?.date}</span>
                  <span>{data.dailyVisits[data.dailyVisits.length - 1]?.date}</span>
                </div>
              </div>
            )}

            {/* Two-column: Referrers + Countries */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Top Referrers */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-800">Where They Come From</h2>
                </div>
                {data.topReferrers.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-slate-400 text-center">No referrer data yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-50">
                    {data.topReferrers.map(r => (
                      <li key={r.source} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <span className="text-sm text-slate-700 font-medium truncate">{r.source}</span>
                        <span className="text-sm text-slate-500 font-mono ml-3">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Top Countries */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-800">Countries</h2>
                </div>
                {data.topCountries.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-slate-400 text-center">No geo data yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-50">
                    {data.topCountries.map(c => (
                      <li key={c.country} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <span className="text-sm text-slate-700 font-medium">{c.country}</span>
                        <span className="text-sm text-slate-500 font-mono ml-3">{c.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Recent Visitors Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Recent Visitors</h2>
                <span className="text-xs text-slate-400">Last 50</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Time</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Page</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Referrer</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Device</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Browser</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.recentVisitors.map((v, i) => (
                      <tr key={v.id || i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                          {new Date(v.visited_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-2.5 text-slate-800 font-medium">{v.page_url}</td>
                        <td className="px-4 py-2.5 text-slate-500 truncate max-w-[200px]">
                          {v.referrer ? (() => { try { return new URL(v.referrer).hostname; } catch { return v.referrer; } })() : <span className="text-slate-300">Direct</span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                          {[v.city, v.region, v.country].filter(Boolean).join(', ') || <span className="text-slate-300">Unknown</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${v.device_type === 'mobile' ? 'bg-amber-50 text-amber-700' : v.device_type === 'tablet' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                            {v.device_type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{v.browser} / {v.os}</td>
                      </tr>
                    ))}
                    {data.recentVisitors.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No visitors recorded yet. Traffic will appear here once people start visiting your site.</td></tr>
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

function StatCard({ label, value, subtitle }: { label: string; value: number; subtitle?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
      <p className="text-2xl font-bold text-slate-900">{value.toLocaleString()}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}{subtitle && <span className="ml-1 text-slate-400">({subtitle})</span>}</p>
    </div>
  );
}
