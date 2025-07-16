import React, { useState, useEffect } from 'react';
import { FaSync, FaInfoCircle, FaExternalLinkAlt } from 'react-icons/fa';
import { toast } from 'sonner';

interface MasterScorecardData {
  customers: {
    id: string;
    name: string;
    penetration: Record<string, number>;
    totalPenetration: number;
    productCount: number;
    lastModified: string;
    data?: { // Added for pivot table data
      columns: { key: string; name: string; isDefault: boolean }[];
      rows: Record<string, string | number | null>[];
    };
  }[];
  retailers: string[];
  retailerAverages: Record<string, number>;
  overallAverage: number;
  lastUpdated: string;
  totalCustomers: number;
  totalRetailers: number;
  items: string[]; // Added for pivot table data
  data: Record<string, Record<string, { authorized: number; total: number }>>; // Added for pivot table data
}

interface MasterScorecardProps {
  onCustomerClick?: (customerId: string) => void;
}

export default function MasterScorecard({ onCustomerClick }: MasterScorecardProps) {
  const [data, setData] = useState<MasterScorecardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Color coding function based on penetration percentage
  const getColorClass = (percentage: number): string => {
    if (percentage >= 80) return 'bg-green-100 text-green-800 border-green-300';
    if (percentage >= 50) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    if (percentage >= 25) return 'bg-orange-100 text-orange-800 border-orange-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };

  // Get color intensity based on percentage
  const getColorIntensity = (percentage: number): string => {
    if (percentage >= 80) return 'font-bold';
    if (percentage >= 50) return 'font-semibold';
    return 'font-medium';
  };

  // Fetch master scorecard data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/master-scorecard', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch master scorecard data');
      }

      const result = await response.json();
      setData(result);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error fetching master scorecard:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      toast.error('Failed to load master scorecard data');
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    fetchData();
  }, []);

  // Handle manual refresh
  const handleRefresh = () => {
    fetchData();
    toast.success('Master scorecard refreshed');
  };

  // Handle customer click for drill-down
  const handleCustomerClick = (customerId: string) => {
    if (onCustomerClick) {
      onCustomerClick(customerId);
    }
  };

  // Handle percentage cell click for drill-down
  const handlePercentageClick = (customerId: string, retailer: string, percentage: number) => {
    // For now, just show a tooltip with more info
    const customer = data?.customers.find(c => c.id === customerId);
    if (customer) {
      toast.info(`${customer.name} - ${retailer}: ${percentage}% (${Math.round(percentage * customer.productCount / 100)} of ${customer.productCount} products authorized)`);
    }
  };

  // --- NEW PIVOT TABLE LOGIC FOR UPDATED BACKEND ---
  let sortedRetailers: string[] = [];
  let sortedItems: string[] = [];
  let retailerItemData: Record<string, Record<string, { authorized: number; total: number }>> = {};

  if (data && Array.isArray(data.retailers) && Array.isArray(data.items) && typeof data.data === 'object') {
    sortedRetailers = [...data.retailers].sort();
    sortedItems = [...data.items].sort();
    retailerItemData = data.data;
  }
  // --- END NEW PIVOT TABLE LOGIC ---

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center justify-center h-32">
          <div className="flex items-center gap-2 text-gray-500">
            <FaSync className="animate-spin" />
            <span>Loading Master Scorecard...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <div className="text-red-500 mb-2">Error loading Master Scorecard</div>
            <div className="text-sm text-gray-500 mb-4">{error}</div>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data || !Array.isArray(sortedRetailers) || !Array.isArray(sortedItems) || sortedRetailers.length === 0 || sortedItems.length === 0) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center justify-center h-32">
          <div className="text-center text-gray-500">
            <div className="mb-2">No data available</div>
            <div className="text-sm">Create some scorecards to see the master dashboard</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Master Scorecard (Pivot Table)</h2>
          <p className="text-sm text-gray-600">% of Scorecards with 'Authorized' Status for Each Retailer & Item</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            Last updated: {data ? new Date(data.lastUpdated).toLocaleString() : ''}
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            <FaSync className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>
      {/* Pivot Table */}
      <div className="overflow-x-auto relative">
        {/* Visual cue for horizontal scroll on mobile */}
        <div className="absolute left-0 top-0 h-full w-6 bg-gradient-to-r from-white/90 to-transparent pointer-events-none z-10 block md:hidden" />
        <table className="w-full border-collapse border border-gray-300" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-2 py-2 md:px-4 md:py-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-50 z-20" style={{ minWidth: 120, fontSize: '0.9rem' }}>Retailer Name</th>
              {sortedItems.map(item => (
                <th key={item} className="border border-gray-300 px-2 py-2 md:px-4 md:py-3 text-center font-semibold text-gray-700" style={{ minWidth: 100, fontSize: '0.9rem' }}>{item}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRetailers.map(retailer => (
              <tr key={retailer} className="hover:bg-gray-50">
                <td className="border border-gray-300 px-2 py-2 md:px-4 md:py-3 font-medium text-gray-900 sticky left-0 bg-white z-10" style={{ minWidth: 120, fontSize: '0.95rem' }}>{retailer}</td>
                {sortedItems.map(item => {
                  const cell = retailerItemData[retailer]?.[item];
                  const percent = cell && cell.total > 0 ? Math.round((cell.authorized / cell.total) * 100) : 0;
                  return (
                    <td key={item} className="border border-gray-300 px-2 py-2 md:px-4 md:py-3 text-center" style={{ minWidth: 100, fontSize: '0.95rem' }}>
                      <span className={`px-2 py-1 md:px-3 md:py-1 rounded-full text-xs md:text-sm border ${getColorClass(percent)} ${getColorIntensity(percent)} select-none`} style={{ minWidth: 48, display: 'inline-block' }}>
                        {cell && cell.total > 0 ? `${percent}%` : '-'}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Legend */}
      <div className="mt-6 flex items-center gap-6">
        <div className="text-sm font-medium text-gray-700">Color Legend:</div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-100 border border-green-300"></div>
            <span className="text-sm text-gray-600">80-100% (Excellent)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-300"></div>
            <span className="text-sm text-gray-600">50-79% (Good)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-orange-100 border border-orange-300"></div>
            <span className="text-sm text-gray-600">25-49% (Moderate)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-100 border border-red-300"></div>
            <span className="text-sm text-gray-600">0-24% (Poor)</span>
          </div>
        </div>
      </div>
      {/* Info Note */}
      <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
        <FaInfoCircle className="text-blue-500 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-700">
          <strong>How to read:</strong> Each cell shows the percentage of scorecards where the retailer+item is marked as 'Authorized'.
        </div>
      </div>
    </div>
  );
} 