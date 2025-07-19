import React, { useState, useEffect } from 'react';
import { FaSync, FaInfoCircle, FaExternalLinkAlt, FaCheckCircle, FaTimesCircle, FaChevronDown } from 'react-icons/fa';
import { toast } from 'sonner';

interface RetailerSummary {
  retailer: string;
  authorized: number;
  total: number;
  percentage: number;
  products: Array<{ name: string; status: string }>;
}

interface MasterScorecardData {
  selectedScorecard: {
    id: string;
    title: string;
  } | null;
  retailers: string[];
  retailerSummary: RetailerSummary[];
  lastUpdated: string;
  hasProducts?: boolean;
  message?: string;
}

interface ScorecardOption {
  id: string;
  title: string;
}

interface MasterScorecardProps {
  onCustomerClick?: (customerId: string) => void;
  selectedScorecardId?: string;
  availableScorecards?: ScorecardOption[];
}

export default function MasterScorecard({ onCustomerClick, selectedScorecardId, availableScorecards = [] }: MasterScorecardProps) {
  const [data, setData] = useState<MasterScorecardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [currentScorecardId, setCurrentScorecardId] = useState<string | undefined>(selectedScorecardId);
  const [showScorecardDropdown, setShowScorecardDropdown] = useState(false);

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
  const fetchData = async (scorecardId?: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const url = scorecardId 
        ? `/api/master-scorecard?scorecardId=${scorecardId}`
        : '/api/master-scorecard';
      
      const response = await fetch(url, {
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

  // Load data on mount and when selectedScorecardId changes
  useEffect(() => {
    const scorecardId = currentScorecardId || selectedScorecardId;
    fetchData(scorecardId);
  }, [currentScorecardId, selectedScorecardId]);

  // Handle manual refresh
  const handleRefresh = () => {
    const scorecardId = currentScorecardId || selectedScorecardId;
    fetchData(scorecardId);
    toast.success('Master scorecard refreshed');
  };

  // Handle customer click for drill-down
  const handleCustomerClick = (customerId: string) => {
    if (onCustomerClick) {
      onCustomerClick(customerId);
    }
  };

  // Handle scorecard selection
  const handleScorecardChange = (scorecardId: string) => {
    setCurrentScorecardId(scorecardId);
    setShowScorecardDropdown(false);
  };

  // Get current scorecard title
  const getCurrentScorecardTitle = () => {
    if (data?.selectedScorecard?.title) {
      return data.selectedScorecard.title;
    }
    const selectedScorecard = availableScorecards.find(sc => sc.id === currentScorecardId);
    return selectedScorecard?.title || 'Select Scorecard';
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

  if (!data || !data.selectedScorecard || data.retailerSummary.length === 0) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center justify-center h-32">
          <div className="text-center text-gray-500">
            <div className="mb-2">No data available</div>
            <div className="text-sm">
              {data?.selectedScorecard ? (
                <div>
                  {data.hasProducts === false ? (
                    <>
                      <p className="mb-2">{data.message || `The selected scorecard "${data.selectedScorecard.title}" has no product columns.`}</p>
                      <p className="text-xs text-gray-400 mb-3">To see master scorecard data, you need to add product columns to this scorecard.</p>
                      <button
                        onClick={() => onCustomerClick?.(data.selectedScorecard!.id)}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                      >
                        Open Scorecard to Add Products
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="mb-2">The selected scorecard "{data.selectedScorecard.title}" has no retailer data.</p>
                      <p className="text-xs text-gray-400">Add retailers to see authorization data.</p>
                    </>
                  )}
                </div>
              ) : (
                "Create some scorecards to see the master dashboard"
              )}
            </div>
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
          <h2 className="text-2xl font-bold text-gray-900">
            Master Scorecard - Retailer Authorization Summary
          </h2>
          <p className="text-sm text-gray-600">
            Product authorization status for each retailer
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Scorecard Selector */}
          <div className="relative">
            <button
              onClick={() => setShowScorecardDropdown(!showScorecardDropdown)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
            >
              <span>{getCurrentScorecardTitle()}</span>
              <FaChevronDown className="w-3 h-3" />
            </button>
            
            {showScorecardDropdown && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                {availableScorecards.length > 0 ? (
                  availableScorecards.map((scorecard) => (
                    <button
                      key={scorecard.id}
                      onClick={() => handleScorecardChange(scorecard.id)}
                      className={`w-full text-left px-4 py-2 hover:bg-gray-100 text-sm ${
                        scorecard.id === currentScorecardId ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                      }`}
                    >
                      {scorecard.title}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-3 text-sm text-gray-500">
                    <p className="mb-2">No scorecards with products found.</p>
                    <p className="text-xs text-gray-400">Add product columns to your scorecards to see them here.</p>
                  </div>
                )}
              </div>
            )}
          </div>

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

      {/* Retailer Summary Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                Retailer
              </th>
              <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-700">
                Authorization Summary
              </th>
              <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-700">
                Percentage
              </th>
              <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-700">
                Products
              </th>
            </tr>
          </thead>
          <tbody>
            {data.retailerSummary.map((retailer, index) => (
              <tr key={retailer.retailer} className="hover:bg-gray-50">
                <td className="border border-gray-300 px-4 py-3 font-medium text-gray-900">
                  {retailer.retailer}
                </td>
                <td className="border border-gray-300 px-4 py-3 text-center">
                  <span className={`px-3 py-1 rounded-full text-sm border ${getColorClass(retailer.percentage)} ${getColorIntensity(retailer.percentage)}`}>
                    {retailer.authorized}/{retailer.total} ({retailer.percentage}%)
                  </span>
                </td>
                <td className="border border-gray-300 px-4 py-3 text-center">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${retailer.percentage >= 80 ? 'bg-green-500' : retailer.percentage >= 50 ? 'bg-yellow-500' : retailer.percentage >= 25 ? 'bg-orange-500' : 'bg-red-500'}`}
                      style={{ width: `${retailer.percentage}%` }}
                    ></div>
                  </div>
                </td>
                <td className="border border-gray-300 px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {retailer.products.map((product, productIndex) => (
                      <span
                        key={productIndex}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                          product.status.toLowerCase() === 'authorized'
                            ? 'bg-green-100 text-green-800'
                            : product.status.toLowerCase() === 'buyer passed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                        title={`${product.name}: ${product.status}`}
                      >
                        {product.status.toLowerCase() === 'authorized' ? (
                          <FaCheckCircle className="w-3 h-3" />
                        ) : product.status.toLowerCase() === 'buyer passed' ? (
                          <FaTimesCircle className="w-3 h-3" />
                        ) : null}
                        {product.name}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <div className="text-sm font-medium text-gray-700 mb-2">Color Legend:</div>
        <div className="flex items-center gap-4 flex-wrap">
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
          <strong>How to read:</strong> Each row shows a retailer and their product authorization status. 
          The percentage indicates how many products are authorized for that retailer.
        </div>
      </div>
    </div>
  );
} 