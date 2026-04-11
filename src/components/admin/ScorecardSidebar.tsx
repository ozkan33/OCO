'use client';
import React from 'react';
import { FaPlus, FaEdit, FaTrash, FaTachometerAlt } from 'react-icons/fa';
import { SaveStatusCompact } from '../ui/SaveStatus';
import type { ScoreCard } from './types';

interface ScorecardSidebarProps {
  scorecards: ScoreCard[];
  selectedCategory: string;
  userRole: string;
  saveStatus: any;
  lastSaved: Date | null;
  saveError: any;
  hasUnsavedChanges: boolean;
  isOnline: boolean;
  editingScoreCardId: string | null;
  onCategoryChange: (id: string) => void;
  onCreateScoreCard: () => void;
  onEditScoreCard: (sc: ScoreCard) => void;
  onDeleteScoreCard: (id: string) => void;
}

export default function ScorecardSidebar({
  scorecards,
  selectedCategory,
  userRole,
  saveStatus,
  lastSaved,
  saveError,
  hasUnsavedChanges,
  isOnline,
  editingScoreCardId,
  onCategoryChange,
  onCreateScoreCard,
  onEditScoreCard,
  onDeleteScoreCard,
}: ScorecardSidebarProps) {
  return (
    <aside className="w-56 h-full bg-white border-r border-gray-200 py-6 px-4 flex flex-col gap-2">
      <h3 className="text-lg font-bold text-black mb-4">Workspaces</h3>

      {/* Master Scorecard */}
      <div className="mb-4">
        <button
          onClick={() => onCategoryChange('master-scorecard')}
          className={`w-full text-left px-3 py-2 rounded font-medium transition-all flex items-center gap-2 ${
            selectedCategory === 'master-scorecard'
              ? 'bg-blue-100 text-blue-800 border border-blue-300'
              : 'hover:bg-gray-100 text-gray-700 border border-transparent'
          }`}
        >
          <FaTachometerAlt size={14} />
          <span>Master Scorecard</span>
          <span className="ml-auto text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
            Dashboard
          </span>
        </button>
      </div>

      {/* ScoreCard Section */}
      <div className="mt-2">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-md font-semibold text-gray-800">ScoreCards</h4>
          {userRole === 'ADMIN' && (
            <button
              onClick={onCreateScoreCard}
              className="p-1 text-blue-600 hover:text-blue-800"
              title="Create New ScoreCard"
            >
              <FaPlus size={14} />
            </button>
          )}
        </div>

        {scorecards.map(scorecard => (
          <div key={scorecard.id} className="mb-2">
            <div className="flex items-center justify-between group">
              <button
                onClick={() => onCategoryChange(scorecard.id)}
                className={`flex-1 text-left px-3 py-2 rounded font-medium transition-all ${
                  selectedCategory === scorecard.id
                    ? 'bg-gray-200 text-black'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <div className="flex items-center">
                  {scorecard.name}
                  {selectedCategory === scorecard.id && editingScoreCardId === scorecard.id && (
                    <SaveStatusCompact
                      status={saveStatus}
                      lastSaved={lastSaved}
                      error={saveError}
                      hasUnsavedChanges={hasUnsavedChanges}
                      isOnline={isOnline}
                      className="ml-2"
                    />
                  )}
                </div>
              </button>
              {userRole === 'ADMIN' && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEditScoreCard(scorecard)}
                    className="p-1 text-gray-500 hover:text-blue-600"
                    title="Edit ScoreCard"
                  >
                    <FaEdit size={12} />
                  </button>
                  <button
                    onClick={() => onDeleteScoreCard(scorecard.id)}
                    className="p-1 text-gray-500 hover:text-red-600"
                    title="Delete ScoreCard"
                  >
                    <FaTrash size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {scorecards.length === 0 && (
          <p className="text-sm text-gray-500 italic px-3 py-2">
            No scorecards yet.{userRole === 'ADMIN' && ' Click the + button to create one.'}
          </p>
        )}
      </div>
    </aside>
  );
}
