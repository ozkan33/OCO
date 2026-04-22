'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';

interface SiteVisitorRow {
  id: string;
  visited_at: string;
  page_url: string;
  referrer: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  device_type: 'desktop' | 'mobile' | 'tablet' | null;
  browser: string | null;
  os: string | null;
}

interface VisitorData {
  totalVisits: number;
  uniqueVisits: number;
  prevTotalVisits?: number;
  prevUniqueVisits?: number;
  topReferrers: { source: string; count: number }[];
  topPages: { page: string; count: number }[];
  deviceCounts: { desktop: number; mobile: number; tablet: number };
  topCountries: { country: string; count: number }[];
  dailyVisits: { date: string; total: number; unique: number }[];
  topCampaigns?: { label: string; count: number }[];
  hourlyVisits?: { hour: number; count: number }[];
  recentVisitors: SiteVisitorRow[];
}

type SortKey = 'visited_at' | 'page_url' | 'device_type' | 'country';
type SortDir = 'asc' | 'desc';

const DEV_REFERRER_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;
const isDevReferrer = (src: string) => DEV_REFERRER_RE.test(src);

export default function VisitorTrackerPage() {
  const [data, setData] = useState<VisitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'desktop' | 'mobile' | 'tablet'>('all');
  const [tableSearch, setTableSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('visited_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showDevTraffic, setShowDevTraffic] = useState(false);

  useEffect(() => {
    setLoading(true);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    fetch(`/api/visitors?days=${days}&tz=${encodeURIComponent(tz)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [days]);

  const totalDevices = data ? data.deviceCounts.desktop + data.deviceCounts.mobile + data.deviceCounts.tablet : 0;
  const uniqueRate = data && data.totalVisits > 0 ? Math.round((data.uniqueVisits / data.totalVisits) * 100) : 0;

  const totalTrend = useMemo(() => {
    if (!data || data.prevTotalVisits == null) return null;
    const prev = data.prevTotalVisits;
    const curr = data.totalVisits;
    if (prev === 0) return curr > 0 ? { pct: 100, dir: 'up' as const } : null;
    const pct = Math.round(((curr - prev) / prev) * 100);
    return { pct, dir: pct >= 0 ? 'up' as const : 'down' as const };
  }, [data]);

  const uniqueTrend = useMemo(() => {
    if (!data || data.prevUniqueVisits == null) return null;
    const prev = data.prevUniqueVisits;
    const curr = data.uniqueVisits;
    if (prev === 0) return curr > 0 ? { pct: 100, dir: 'up' as const } : null;
    const pct = Math.round(((curr - prev) / prev) * 100);
    return { pct, dir: pct >= 0 ? 'up' as const : 'down' as const };
  }, [data]);

  const visibleReferrers = useMemo(() => {
    if (!data) return [];
    return showDevTraffic
      ? data.topReferrers.slice(0, 10)
      : data.topReferrers.filter(r => !isDevReferrer(r.source)).slice(0, 10);
  }, [data, showDevTraffic]);

  const devReferrerCount = useMemo(() => {
    if (!data) return 0;
    return data.topReferrers.filter(r => isDevReferrer(r.source)).reduce((s, r) => s + r.count, 0);
  }, [data]);

  const { knownCountries, unknownCount, countryTotal, identifiedPct } = useMemo(() => {
    if (!data) return { knownCountries: [], unknownCount: 0, countryTotal: 0, identifiedPct: 0 };
    const known = data.topCountries.filter(c => c.country && c.country !== 'Unknown');
    const unknown = data.topCountries.find(c => c.country === 'Unknown')?.count ?? 0;
    const total = data.topCountries.reduce((s, c) => s + c.count, 0);
    const identified = total > 0 ? Math.round(((total - unknown) / total) * 100) : 0;
    return { knownCountries: known, unknownCount: unknown, countryTotal: total, identifiedPct: identified };
  }, [data]);

  const browserBreakdown = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const v of data.recentVisitors) {
      const key = v.browser || 'Other';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const osBreakdown = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const v of data.recentVisitors) {
      const key = v.os || 'Other';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const filteredVisitors = useMemo(() => {
    if (!data) return [];
    const q = tableSearch.trim().toLowerCase();
    const rows = data.recentVisitors.filter(v => {
      if (deviceFilter !== 'all' && v.device_type !== deviceFilter) return false;
      if (!q) return true;
      return (
        (v.page_url || '').toLowerCase().includes(q) ||
        (v.country || '').toLowerCase().includes(q) ||
        (v.city || '').toLowerCase().includes(q) ||
        (v.region || '').toLowerCase().includes(q) ||
        (v.browser || '').toLowerCase().includes(q) ||
        (v.referrer || '').toLowerCase().includes(q)
      );
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = (a[sortKey] ?? '') as string;
      const bv = (b[sortKey] ?? '') as string;
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return rows;
  }, [data, tableSearch, deviceFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'visited_at' ? 'desc' : 'asc'); }
  };

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

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
              <StatCard
                label="Total Visits"
                value={data.totalVisits}
                trend={totalTrend}
                trendLabel={`vs prior ${days}d`}
              />
              <StatCard
                label="Unique Visitors"
                value={data.uniqueVisits}
                trend={uniqueTrend}
                trendLabel={`vs prior ${days}d`}
              />
              <StatCard
                label="Unique Rate"
                value={uniqueRate}
                suffix="%"
                subtitle={`${data.uniqueVisits.toLocaleString()} of ${data.totalVisits.toLocaleString()}`}
              />
              <StatCard
                label={data.deviceCounts.mobile > data.deviceCounts.desktop ? 'Mobile-first' : 'Desktop-first'}
                value={totalDevices ? Math.round(Math.max(data.deviceCounts.desktop, data.deviceCounts.mobile) / totalDevices * 100) : 0}
                suffix="%"
                subtitle={`${data.deviceCounts.desktop} desktop · ${data.deviceCounts.mobile} mobile${data.deviceCounts.tablet ? ` · ${data.deviceCounts.tablet} tablet` : ''}`}
              />
            </div>

            {/* Daily Traffic Chart */}
            {data.dailyVisits.length > 0 && (
              <DailyTrafficChart dailyVisits={data.dailyVisits} />
            )}

            {/* Three-column: Referrers + Campaigns/Browsers + Countries */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <ListCard
                title="Where They Come From"
                empty={showDevTraffic ? 'No referrer data yet.' : devReferrerCount > 0 ? 'Only dev traffic in this range.' : 'No referrer data yet.'}
                headerRight={devReferrerCount > 0 ? (
                  <button
                    onClick={() => setShowDevTraffic(v => !v)}
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1"
                    title={`${devReferrerCount} dev visits hidden`}
                  >
                    <span className={`inline-block w-3 h-3 rounded-full border transition-colors ${showDevTraffic ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300'}`}>
                      {showDevTraffic && (
                        <svg viewBox="0 0 12 12" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 6.5l2 2 4-4" />
                        </svg>
                      )}
                    </span>
                    Show dev traffic
                  </button>
                ) : undefined}
                items={visibleReferrers.length}
              >
                {visibleReferrers.map(r => (
                  <ListRow
                    key={r.source}
                    label={r.source}
                    count={r.count}
                    max={visibleReferrers[0]?.count ?? 0}
                    muted={isDevReferrer(r.source)}
                  />
                ))}
              </ListCard>

              {/* Campaigns + Browsers column */}
              <div className="space-y-6">
                <ListCard
                  title="Tagged Links"
                  empty='Append "?utm_source=instagram_bio" (or email_signature, linkedin, etc.) to any link you share, and visits from that link will show up here grouped by source.'
                  items={(data.topCampaigns || []).length}
                  headerRight={
                    <span
                      className="text-slate-400 cursor-help select-none text-sm leading-none"
                      title={'Shows where shared links were clicked from, when you tag them.\n\nExample: https://3brothersmarketing.com/?utm_source=instagram_bio\n\nAdd ?utm_source=… to a link before sharing it (Instagram bio, email signature, a partner\'s site). Anyone who clicks gets grouped here so you can see which channel actually sent people — without needing to "run a campaign".'}
                      aria-label="What is a tagged link?"
                    >
                      ⓘ
                    </span>
                  }
                >
                  {(data.topCampaigns || []).map(c => (
                    <ListRow
                      key={c.label}
                      label={c.label}
                      count={c.count}
                      max={(data.topCampaigns || [])[0]?.count ?? 0}
                    />
                  ))}
                </ListCard>
                <ListCard
                  title="Browsers (recent 50)"
                  empty="No browser data."
                  items={browserBreakdown.length}
                >
                  {browserBreakdown.map(b => (
                    <ListRow
                      key={b.label}
                      label={b.label}
                      count={b.count}
                      max={browserBreakdown[0]?.count ?? 0}
                    />
                  ))}
                </ListCard>
              </div>

              <ListCard
                title="Countries"
                empty="No geo data yet."
                items={knownCountries.length + (unknownCount ? 1 : 0)}
                headerRight={countryTotal > 0 ? (
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${identifiedPct >= 50 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                    title={`${countryTotal - unknownCount} of ${countryTotal} visits have geo data`}
                  >
                    {identifiedPct}% identified
                  </span>
                ) : undefined}
              >
                {knownCountries.map(c => (
                  <ListRow
                    key={c.country}
                    label={c.country}
                    count={c.count}
                    max={knownCountries[0]?.count ?? Math.max(unknownCount, 1)}
                  />
                ))}
                {unknownCount > 0 && (
                  <ListRow label="Unknown" count={unknownCount} max={Math.max(knownCountries[0]?.count ?? 0, unknownCount)} muted />
                )}
              </ListCard>
            </div>

            {/* Recent Visitors Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3 justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Recent Visitors</h2>
                <div className="flex items-center gap-2">
                  <input
                    type="search"
                    placeholder="Search page, country, browser…"
                    value={tableSearch}
                    onChange={e => setTableSearch(e.target.value)}
                    className="text-xs border border-slate-200 rounded-md px-2 py-1 w-56 focus:ring-1 focus:ring-blue-400 outline-none"
                  />
                  <select
                    value={deviceFilter}
                    onChange={e => setDeviceFilter(e.target.value as typeof deviceFilter)}
                    className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
                  >
                    <option value="all">All devices</option>
                    <option value="desktop">Desktop</option>
                    <option value="mobile">Mobile</option>
                    <option value="tablet">Tablet</option>
                  </select>
                  <span className="text-xs text-slate-400">{filteredVisitors.length} of {data.recentVisitors.length}</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <Th onClick={() => toggleSort('visited_at')}>Time{sortArrow('visited_at')}</Th>
                      <Th onClick={() => toggleSort('page_url')}>Page{sortArrow('page_url')}</Th>
                      <Th>Referrer</Th>
                      <Th onClick={() => toggleSort('country')}>Location{sortArrow('country')}</Th>
                      <Th onClick={() => toggleSort('device_type')}>Device{sortArrow('device_type')}</Th>
                      <Th>Browser</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredVisitors.map((v, i) => (
                      <tr key={v.id || i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                          {new Date(v.visited_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-2.5 text-slate-800 font-medium">
                          {v.page_url === '/' ? <span title="Homepage (/)">Home</span> : v.page_url}
                        </td>
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
                        <td className="px-4 py-2.5 text-slate-500">{v.browser} / {v.os}{osBreakdown.length > 0 ? '' : ''}</td>
                      </tr>
                    ))}
                    {filteredVisitors.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        {data.recentVisitors.length === 0
                          ? 'No visitors recorded yet. Traffic will appear here once people start visiting your site.'
                          : 'No visitors match your filters.'}
                      </td></tr>
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

function StatCard({
  label,
  value,
  subtitle,
  suffix,
  trend,
  trendLabel,
}: {
  label: string;
  value: number;
  subtitle?: string;
  suffix?: string;
  trend?: { pct: number; dir: 'up' | 'down' } | null;
  trendLabel?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold text-slate-900">
          {value.toLocaleString()}{suffix}
        </p>
        {trend && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded ${
              trend.dir === 'up'
                ? (trend.pct === 0 ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700')
                : 'bg-red-50 text-red-700'
            }`}
            title={trendLabel}
          >
            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="currentColor" aria-hidden>
              {trend.dir === 'up'
                ? <path d="M6 2 L10 8 L2 8 Z" />
                : <path d="M6 10 L2 4 L10 4 Z" />}
            </svg>
            {trend.dir === 'up' ? '+' : ''}{trend.pct}%
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-0.5">
        {label}
        {subtitle && <span className="ml-1 text-slate-400">· {subtitle}</span>}
      </p>
    </div>
  );
}

function DailyTrafficChart({ dailyVisits }: { dailyVisits: { date: string; total: number; unique: number }[] }) {
  const max = Math.max(...dailyVisits.map(v => v.total), 1);
  // "Nice" round axis max so gridlines land on even numbers
  const niceMax = niceCeil(max);
  const peak = Math.max(...dailyVisits.map(v => v.total), 0);
  // Buckets come back keyed by the viewer's local date (server aggregates
  // with their tz). Use local date here too — toISOString() would give UTC
  // and cause the "today" ring to land on the wrong bar around midnight.
  const todayISO = localDateISO(new Date());

  const CHART_H = 160;
  const Y_STEPS = 4;
  const step = niceMax / Y_STEPS;

  // Label every ~7 days: show first, last, and every 7th
  const labelIndices = new Set<number>();
  labelIndices.add(0);
  labelIndices.add(dailyVisits.length - 1);
  for (let i = 0; i < dailyVisits.length; i += 7) labelIndices.add(i);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-800">Daily Traffic</h2>
        <div className="flex items-center gap-4 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Total
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-300" /> Unique
          </span>
          <span className="text-slate-400">peak {peak}/day</span>
        </div>
      </div>

      <div className="flex gap-3">
        {/* Y-axis labels */}
        <div className="flex flex-col justify-between text-[10px] text-slate-400 font-mono pr-1" style={{ height: CHART_H }}>
          {Array.from({ length: Y_STEPS + 1 }).map((_, i) => (
            <span key={i} className="leading-none">{Math.round(niceMax - step * i)}</span>
          ))}
        </div>

        {/* Chart area */}
        <div className="flex-1 relative">
          {/* Gridlines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" style={{ height: CHART_H }}>
            {Array.from({ length: Y_STEPS + 1 }).map((_, i) => (
              <div key={i} className={`border-t ${i === Y_STEPS ? 'border-slate-200' : 'border-slate-100'}`} />
            ))}
          </div>

          {/* Bars */}
          <div className="relative flex items-end gap-1" style={{ height: CHART_H }}>
            {dailyVisits.map(d => {
              const totalH = (d.total / niceMax) * CHART_H;
              const uniqueH = (d.unique / niceMax) * CHART_H;
              // Parse as local midnight so weekend shading / day-of-week
              // aligns with the viewer's calendar (matches server tz bucketing).
              const dt = new Date(d.date + 'T00:00:00');
              const dow = dt.getDay(); // 0=Sun 6=Sat
              const isWeekend = dow === 0 || dow === 6;
              const isToday = d.date === todayISO;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                  <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] leading-tight px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10 shadow-lg">
                    <div className="font-semibold">{d.date}{isToday ? ' · today' : ''}</div>
                    <div>{d.total} total · {d.unique} unique</div>
                  </div>
                  {/* Weekend background tint */}
                  {isWeekend && (
                    <div className="absolute inset-x-0 top-0 bottom-0 bg-slate-50/60 rounded-sm pointer-events-none" aria-hidden />
                  )}
                  {/* Total bar (background) */}
                  <div
                    className={`relative w-full rounded-t transition-colors cursor-default ${isToday ? 'bg-blue-600 ring-1 ring-blue-700' : 'bg-blue-500 group-hover:bg-blue-600'}`}
                    style={{ height: `${totalH}px`, minHeight: d.total > 0 ? 2 : 0 }}
                  >
                    {/* Unique bar overlay */}
                    {d.unique > 0 && (
                      <div
                        className={`absolute bottom-0 left-0 right-0 rounded-t ${isToday ? 'bg-blue-400' : 'bg-blue-300'}`}
                        style={{ height: `${Math.min(uniqueH, totalH)}px` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div className="flex gap-1 mt-2">
            {dailyVisits.map((d, i) => (
              <div key={d.date} className="flex-1 text-center">
                <span className={`text-[10px] ${d.date === todayISO ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>
                  {labelIndices.has(i) ? formatShortDate(d.date) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function niceCeil(n: number): number {
  if (n <= 1) return 1;
  if (n <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const rel = n / pow;
  const step = rel <= 1 ? 1 : rel <= 2 ? 2 : rel <= 5 ? 5 : 10;
  return step * pow;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function localDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ListCard({
  title,
  empty,
  children,
  headerRight,
  items,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  items?: number;
}) {
  const isEmpty = (items ?? 0) === 0;
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {headerRight}
      </div>
      {isEmpty ? (
        <p className="px-5 py-8 text-sm text-slate-400 text-center">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-50">{children}</ul>
      )}
    </div>
  );
}

function ListRow({ label, count, max, muted }: { label: string; count: number; max?: number; muted?: boolean }) {
  const pct = max && max > 0 ? Math.max(2, Math.round((count / max) * 100)) : 0;
  return (
    <li className={`px-5 py-2.5 hover:bg-slate-50 transition-colors ${muted ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`text-sm truncate ${muted ? 'text-slate-500 italic' : 'text-slate-700 font-medium'}`}>{label}</span>
        <span className="text-sm text-slate-500 font-mono tabular-nums shrink-0">{count.toLocaleString()}</span>
      </div>
      {max !== undefined && (
        <div className="mt-1.5 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${muted ? 'bg-slate-300' : 'bg-blue-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </li>
  );
}

function Th({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <th
      className={`text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide ${onClick ? 'cursor-pointer select-none hover:text-slate-700' : ''}`}
      onClick={onClick}
    >
      {children}
    </th>
  );
}
