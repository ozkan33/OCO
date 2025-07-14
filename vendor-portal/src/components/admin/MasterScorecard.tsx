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
  }[];
  retailers: string[];
  retailerAverages: Record<string, number>;
  overallAverage: number;
  lastUpdated: string;
  totalCustomers: number;
  totalRetailers: number;
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

  if (!data || data.customers.length === 0) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center justify-center h-32">
          <div className="text-center text-gray-500">
            <div className="mb-2">No customer data available</div>
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
          <h2 className="text-2xl font-bold text-gray-900">Master Scorecard</h2>
          <p className="text-sm text-gray-600">Retailer Penetration Dashboard</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            Last updated: {new Date(data.lastUpdated).toLocaleString()}
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

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{data.totalCustomers}</div>
          <div className="text-sm text-gray-600">Total Customers</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{data.totalRetailers}</div>
          <div className="text-sm text-gray-600">Total Retailers</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">{data.overallAverage}%</div>
          <div className="text-sm text-gray-600">Overall Average</div>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-orange-600">
            {data.customers.reduce((sum, c) => sum + c.productCount, 0)}
          </div>
          <div className="text-sm text-gray-600">Total Products</div>
        </div>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                Customer Name
              </th>
              {data.retailers.map(retailer => (
                <th key={retailer} className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-700">
                  {retailer.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </th>
              ))}
              <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-700">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {data.customers.map(customer => (
              <tr key={customer.id} className="hover:bg-gray-50">
                <td className="border border-gray-300 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCustomerClick(customer.id)}
                      className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
                    >
                      {customer.name}
                    </button>
                    <span className="text-xs text-gray-500">
                      ({customer.productCount} products)
                    </span>
                  </div>
                </td>
                {data.retailers.map(retailer => {
                  const percentage = customer.penetration[retailer] || 0;
                  return (
                    <td key={retailer} className="border border-gray-300 px-4 py-3 text-center">
                      <button
                        onClick={() => handlePercentageClick(customer.id, retailer, percentage)}
                        className={`px-3 py-1 rounded-full text-sm border ${getColorClass(percentage)} ${getColorIntensity(percentage)} hover:shadow-md transition-shadow`}
                      >
                        {percentage}%
                      </button>
                    </td>
                  );
                })}
                <td className="border border-gray-300 px-4 py-3 text-center">
                  <span className={`px-3 py-1 rounded-full text-sm border ${getColorClass(customer.totalPenetration)} ${getColorIntensity(customer.totalPenetration)}`}>
                    {customer.totalPenetration}%
                  </span>
                </td>
              </tr>
            ))}
            {/* Retailer Averages Row */}
            <tr className="bg-gray-100 font-semibold">
              <td className="border border-gray-300 px-4 py-3 text-gray-700">
                Retailer Average
              </td>
              {data.retailers.map(retailer => {
                const average = data.retailerAverages[retailer] || 0;
                return (
                  <td key={retailer} className="border border-gray-300 px-4 py-3 text-center">
                    <span className={`px-3 py-1 rounded-full text-sm border ${getColorClass(average)} ${getColorIntensity(average)}`}>
                      {average}%
                    </span>
                  </td>
                );
              })}
              <td className="border border-gray-300 px-4 py-3 text-center">
                <span className={`px-3 py-1 rounded-full text-sm border ${getColorClass(data.overallAverage)} ${getColorIntensity(data.overallAverage)}`}>
                  {data.overallAverage}%
                </span>
              </td>
            </tr>
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
          <strong>How to read:</strong> Percentages show how many products have "Authorized" status for each retailer. 
          Click on customer names to view their detailed scorecard, or click on percentages to see product counts.
        </div>
      </div>
    </div>
  );
} 