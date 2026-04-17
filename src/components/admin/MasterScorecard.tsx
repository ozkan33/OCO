import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FaSync, FaInfoCircle, FaSortUp, FaSortDown, FaSort, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { toast } from 'sonner';

interface ProductDetail {
  name: string;
  status: string;
}

interface StoreDetail {
  name: string;
  location?: string;
  products: ProductDetail[];
  authorized: number;
  total: number;
  percentage: number;
}

interface BrandCell {
  authorized: number;
  total: number;
  percentage: number;
  products: ProductDetail[];
  stores?: StoreDetail[];
  storeAuthorized?: number;
  storeTotal?: number;
}

interface PivotRow {
  retailer: string;
  brands: Record<string, BrandCell>;
}

interface PivotData {
  brands: string[];
  pivotRows: PivotRow[];
  lastUpdated: string;
}

interface MasterScorecardProps {
  /** Override the API endpoint (e.g. "/api/portal/master-scorecard" for brand users) */
  apiUrl?: string;
  onCustomerClick?: (customerId: string) => void;
  selectedScorecardId?: string;
  availableScorecards?: { id: string; title: string }[];
}

type SortDir = 'asc' | 'desc' | null;

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Authorized':       { bg: '#e6f4ea', text: '#14532d', dot: '#16a34a' },
  'In Process':       { bg: '#e0e7ff', text: '#1e3a8a', dot: '#3b82f6' },
  'Buyer Passed':     { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444' },
  'Presented':        { bg: '#ede9fe', text: '#6d28d9', dot: '#8b5cf6' },
  'Discontinued':     { bg: '#f3f4f6', text: '#374151', dot: '#6b7280' },
  'Meeting Secured':  { bg: '#fff7ed', text: '#b45309', dot: '#f59e0b' },
  'On Hold':          { bg: '#fdf2f8', text: '#be185d', dot: '#ec4899' },
  'Category Review':  { bg: '#f0fdfa', text: '#0f766e', dot: '#14b8a6' },
  'Open Review':      { bg: '#e0f2fe', text: '#0369a1', dot: '#0ea5e9' },
  'In/Out':           { bg: '#fef9c3', text: '#92400e', dot: '#eab308' },
};

function getCellColor(pct: number): string {
  if (pct >= 80) return 'bg-green-100 text-green-800';
  if (pct >= 50) return 'bg-yellow-100 text-yellow-800';
  if (pct >= 25) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}

function getBarColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 50) return 'bg-yellow-500';
  if (pct >= 25) return 'bg-orange-500';
  return 'bg-red-500';
}

export default function MasterScorecard({ apiUrl = '/api/master-scorecard', onCustomerClick }: MasterScorecardProps) {
  const [data, setData] = useState<PivotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sorting
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // Expanded rows — track which retailer rows are expanded
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Column resize
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizing = useRef<{ col: string; startX: number; startW: number } | null>(null);

  const DEFAULT_COL_W = 160;
  const RETAILER_COL_W = 200;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(apiUrl, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch master scorecard data');
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      toast.error('Failed to load master scorecard data');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = () => { fetchData(); toast.success('Master scorecard refreshed'); };

  // ── Sorting ──
  const handleSort = (col: string) => {
    if (sortCol === col) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortCol(null); setSortDir(null); }
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const getSortedRows = (rows: PivotRow[]): PivotRow[] => {
    if (!sortCol || !sortDir) return rows;
    return [...rows].sort((a, b) => {
      let aVal: number | string, bVal: number | string;
      if (sortCol === '__retailer') {
        aVal = a.retailer.toLowerCase();
        bVal = b.retailer.toLowerCase();
      } else {
        aVal = a.brands[sortCol]?.percentage ?? -1;
        bVal = b.brands[sortCol]?.percentage ?? -1;
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <FaSort className="w-3 h-3 text-slate-300" />;
    if (sortDir === 'asc') return <FaSortUp className="w-3 h-3 text-blue-600" />;
    return <FaSortDown className="w-3 h-3 text-blue-600" />;
  };

  // ── Row expand ──
  const toggleRow = (retailer: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(retailer)) next.delete(retailer); else next.add(retailer);
      return next;
    });
  };

  // ── Column resize ──
  const onResizeStart = (col: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startW = colWidths[col] || DEFAULT_COL_W;
    resizing.current = { col, startX: e.clientX, startW };
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      setColWidths(prev => ({ ...prev, [resizing.current!.col]: Math.max(80, resizing.current!.startW + ev.clientX - resizing.current!.startX) }));
    };
    const onUp = () => { resizing.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ── States ──
  if (loading) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center justify-center h-32 gap-2 text-slate-500">
          <FaSync className="animate-spin" /><span>Loading Master Scorecard...</span>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-lg">
        <div className="flex flex-col items-center justify-center h-32 gap-3">
          <div className="text-red-500">Error loading Master Scorecard</div>
          <div className="text-sm text-slate-500">{error}</div>
          <button onClick={handleRefresh} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Try Again</button>
        </div>
      </div>
    );
  }
  if (!data || data.brands.length === 0 || data.pivotRows.length === 0) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center justify-center h-32 text-center text-slate-500">
          <div>
            <div className="mb-2">No data available</div>
            <div className="text-sm">Add product columns to your scorecards and assign retailer statuses to see the pivot view.</div>
          </div>
        </div>
      </div>
    );
  }

  const sortedRows = getSortedRows(data.pivotRows);
  const { brands } = data;

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Master Scorecard</h2>
          <p className="text-sm text-slate-600">
            {brands.length} brand{brands.length !== 1 ? 's' : ''}, {data.pivotRows.length} retailer{data.pivotRows.length !== 1 ? 's' : ''} &mdash; click a row to expand product details
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500">Updated: {new Date(data.lastUpdated).toLocaleString()}</span>
          <button onClick={handleRefresh} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
            <FaSync className="w-3 h-3" /> Refresh
          </button>
        </div>
      </div>

      {/* Pivot Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="border-collapse" style={{ minWidth: '100%' }}>
          <thead>
            <tr className="bg-slate-50">
              {/* Expand + Retailer */}
              <th
                className="border-b border-r border-slate-200 px-4 py-3 text-left text-xs uppercase tracking-wider font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors sticky left-0 bg-slate-50 z-10"
                style={{ width: RETAILER_COL_W, minWidth: RETAILER_COL_W }}
                onClick={() => handleSort('__retailer')}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-4" /> {/* spacer for expand icon */}
                  Customer
                  <SortIcon col="__retailer" />
                </div>
              </th>
              {brands.map(brand => (
                <th
                  key={brand}
                  className="border-b border-r border-slate-200 px-3 py-3 text-center text-xs uppercase tracking-wider font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors relative group"
                  style={{ width: colWidths[brand] || DEFAULT_COL_W, minWidth: 80 }}
                  onClick={() => handleSort(brand)}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="truncate">{brand}</span>
                    <SortIcon col={brand} />
                  </div>
                  <div
                    className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => { e.stopPropagation(); onResizeStart(brand, e); }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map(row => {
              const isExpanded = expandedRows.has(row.retailer);
              return (
                <React.Fragment key={row.retailer}>
                  {/* Summary row */}
                  <tr
                    className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                    onClick={() => toggleRow(row.retailer)}
                  >
                    <td className="border-r border-slate-200 px-4 py-2.5 font-medium text-slate-900 text-sm sticky left-0 bg-white z-10">
                      <div className="flex items-center gap-1.5">
                        {isExpanded
                          ? <FaChevronDown className="w-3 h-3 text-slate-400" />
                          : <FaChevronRight className="w-3 h-3 text-slate-400" />
                        }
                        {row.retailer}
                      </div>
                    </td>
                    {brands.map(brand => {
                      const cell = row.brands[brand];
                      if (!cell) {
                        return <td key={brand} className="border-r border-slate-100 px-3 py-2.5 text-center"><span className="text-slate-300 text-xs">&mdash;</span></td>;
                      }
                      return (
                        <td key={brand} className="border-r border-slate-100 px-3 py-2.5 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${getCellColor(cell.percentage)}`}>
                              {cell.percentage}%
                              <span className="ml-1 font-normal opacity-75">({cell.authorized}/{cell.total})</span>
                            </span>
                            <div className="w-full max-w-[80px] bg-slate-200 rounded-full h-1">
                              <div className={`h-1 rounded-full ${getBarColor(cell.percentage)}`} style={{ width: `${cell.percentage}%` }} />
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Expanded detail row — product- and store-level breakdown */}
                  {isExpanded && (
                    <tr className="bg-slate-50/70">
                      <td className="border-r border-slate-200 px-4 py-2 sticky left-0 bg-slate-50/70 z-10" />
                      {brands.map(brand => {
                        const cell = row.brands[brand];
                        if (!cell || ((!cell.products || cell.products.length === 0) && (!cell.stores || cell.stores.length === 0))) {
                          return <td key={brand} className="border-r border-slate-100 px-3 py-2" />;
                        }
                        const stores = cell.stores || [];
                        return (
                          <td key={brand} className="border-r border-slate-100 px-3 py-2 align-top">
                            <div className="flex flex-col gap-2">
                              {cell.products && cell.products.length > 0 && (
                                <div className="flex flex-col gap-1">
                                  {cell.products.map((p, i) => {
                                    const sc = STATUS_COLORS[p.status] || { bg: '#f3f4f6', text: '#374151', dot: '#6b7280' };
                                    return (
                                      <div key={i} className="flex items-center gap-1.5 text-xs">
                                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: sc.dot }} />
                                        <span className="font-medium text-slate-700 truncate">{p.name}</span>
                                        <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap" style={{ background: sc.bg, color: sc.text }}>
                                          {p.status}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {stores.length > 0 && (
                                <div className="border-t border-slate-200 pt-2 flex flex-col gap-1.5">
                                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                                    <span>Stores ({stores.length})</span>
                                    {typeof cell.storeAuthorized === 'number' && typeof cell.storeTotal === 'number' && cell.storeTotal > 0 && (
                                      <span className="text-slate-400 normal-case tracking-normal">
                                        {cell.storeAuthorized}/{cell.storeTotal} authorized
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    {stores.map((s, i) => (
                                      <div key={i} className="rounded border border-slate-200 bg-white px-2 py-1.5">
                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                          <div className="min-w-0 flex-1">
                                            <div className="text-[11px] font-semibold text-slate-800 truncate" title={s.name}>{s.name}</div>
                                            {s.location && (
                                              <div className="text-[10px] text-slate-400 truncate">{s.location}</div>
                                            )}
                                          </div>
                                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${getCellColor(s.percentage)}`}>
                                            {s.percentage}%
                                            <span className="ml-1 font-normal opacity-75">({s.authorized}/{s.total})</span>
                                          </span>
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {s.products.map((p, j) => {
                                            const sc = STATUS_COLORS[p.status] || { bg: '#f3f4f6', text: '#374151', dot: '#6b7280' };
                                            return (
                                              <span
                                                key={j}
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                                                style={{ background: sc.bg, color: sc.text }}
                                                title={`${p.name}: ${p.status}`}
                                              >
                                                <span className="w-1 h-1 rounded-full" style={{ background: sc.dot }} />
                                                {p.name}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-6 p-4 bg-slate-50 rounded-lg">
        <div className="text-sm font-medium text-slate-700 mb-2">Color Legend:</div>
        <div className="flex items-center gap-4 flex-wrap">
          {[
            { color: 'bg-green-100 border-green-300', label: '80-100%' },
            { color: 'bg-yellow-100 border-yellow-300', label: '50-79%' },
            { color: 'bg-orange-100 border-orange-300', label: '25-49%' },
            { color: 'bg-red-100 border-red-300', label: '0-24%' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded border ${l.color}`} />
              <span className="text-sm text-slate-600">{l.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="text-slate-300 text-sm">&mdash;</span>
            <span className="text-sm text-slate-600">Not carried</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
        <FaInfoCircle className="text-blue-500 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-700">
          <strong>How to read:</strong> Columns = brands. Rows = customers. Cells show authorization % (authorized/total), combining parent product statuses with per-store authorizations from the subgrid.
          Click any row to expand and see individual product statuses plus the store-by-store breakdown. Click headers to sort. Drag column edges to resize.
        </div>
      </div>
    </div>
  );
}
