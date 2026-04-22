'use client';
import React, { useState } from 'react';
import { FaPlus, FaEdit, FaTrash } from 'react-icons/fa';
import { SaveStatusCompact } from '../ui/SaveStatus';
import type { ScoreCard } from './types';

interface ScorecardSidebarProps {
  scorecards: ScoreCard[];
  selectedCategory: string;
  sidebarCollapsed: boolean;
  userRole: string;
  saveStatus: any;
  lastSaved: Date | null;
  saveError: any;
  hasUnsavedChanges: boolean;
  isOnline: boolean;
  editingScoreCardId: string | null;
  dataCategories: string[];
  onCategoryChange: (id: string) => void;
  onCreateScoreCard: () => void;
  onEditScoreCard: (sc: ScoreCard) => void;
  onDeleteScoreCard: (id: string) => void;
  onCollapse: () => void;
  onExpand: () => void;
}

export default function ScorecardSidebar({
  scorecards,
  selectedCategory,
  sidebarCollapsed,
  userRole,
  saveStatus,
  lastSaved,
  saveError,
  hasUnsavedChanges,
  isOnline,
  editingScoreCardId,
  dataCategories,
  onCategoryChange,
  onCreateScoreCard,
  onEditScoreCard,
  onDeleteScoreCard,
  onCollapse,
  onExpand,
}: ScorecardSidebarProps) {
  const [sidebarSearch, setSidebarSearch] = useState('');
  // KAMs share write access with admins; only admins may delete scorecards.
  const canEdit = userRole === 'ADMIN' || userRole === 'KEY_ACCOUNT_MANAGER';
  const canDelete = userRole === 'ADMIN';

  if (sidebarCollapsed) {
    return (
      <button
        onClick={onExpand}
        className="h-full w-10 shrink-0 bg-white border-r border-slate-200 flex flex-col items-center pt-4 hover:bg-slate-50 transition-colors group"
        title="Expand sidebar"
      >
        <svg className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" /></svg>
      </button>
    );
  }

  return (
    <>
    {/* Mobile backdrop */}
    <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={onCollapse} />
    <aside
      className="h-full bg-white border-r border-slate-200 shadow-sm flex flex-col shrink-0 transition-all duration-200 ease-in-out overflow-hidden fixed md:relative z-50 md:z-auto"
      style={{ width: 240, opacity: 1 }}
    >
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Workspaces</h3>
        <button
          onClick={onCollapse}
          className="w-11 h-11 md:w-7 md:h-7 -mr-2 md:mr-0 flex items-center justify-center text-slate-400 [@media(hover:hover)]:hover:text-slate-600 [@media(hover:hover)]:hover:bg-slate-100 active:text-slate-600 active:bg-slate-100 rounded-lg md:rounded transition-colors"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <svg className="w-5 h-5 md:w-4 md:h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" /></svg>
        </button>
      </div>

      <div className="px-3 mb-2">
        <button
          onClick={() => onCategoryChange('master-scorecard')}
          className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-all flex items-center gap-2 text-sm ${selectedCategory === 'master-scorecard' ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-600'}`}
          style={{ borderLeft: selectedCategory === 'master-scorecard' ? '3px solid #3b82f6' : '3px solid transparent' }}
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
          <span>Master Scorecard</span>
          <span className="ml-auto text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-semibold">Dashboard</span>
        </button>
      </div>

      <div className="px-3">
        {dataCategories.map(cat => (
          <button
            key={cat}
            onClick={() => onCategoryChange(cat)}
            className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-all text-sm ${selectedCategory === cat ? 'bg-slate-100 text-slate-900' : 'hover:bg-slate-50 text-slate-600'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="mx-4 my-3 border-t border-slate-100"></div>

      <div className="px-4 mb-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">ScoreCards</h4>
          {canEdit && (
            <button onClick={onCreateScoreCard} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Create New ScoreCard">
              <FaPlus size={12} />
            </button>
          )}
        </div>
      </div>

      {scorecards.length > 3 && (
        <div className="px-3 mb-2">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              type="text"
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              placeholder="Filter scorecards..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 transition-colors"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
        {scorecards
          .filter((sc, idx, arr) => arr.findIndex(s => s.id === sc.id) === idx) // deduplicate by id
          .filter(sc => !sidebarSearch || sc.name.toLowerCase().includes(sidebarSearch.toLowerCase()))
          .map(scorecard => (
          <div key={scorecard.id} className="mb-0.5">
            <div className="flex items-center justify-between group">
              <button
                onClick={() => onCategoryChange(scorecard.id)}
                className={`flex-1 text-left px-3 py-2 rounded-lg font-medium transition-all text-sm truncate ${selectedCategory === scorecard.id ? 'bg-slate-100 text-slate-900' : 'hover:bg-slate-50 text-slate-600'}`}
                style={{ borderLeft: selectedCategory === scorecard.id ? '3px solid #3b82f6' : '3px solid transparent' }}
                title={scorecard.name}
              >
                <div className="flex items-center">
                  <span className="truncate">{scorecard.name}</span>
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
              {canEdit && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => onEditScoreCard(scorecard)} className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors" title="Edit ScoreCard">
                    <FaEdit size={11} />
                  </button>
                  {canDelete && (
                    <button onClick={() => onDeleteScoreCard(scorecard.id)} className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors" title="Delete ScoreCard">
                      <FaTrash size={11} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {scorecards.length === 0 && (
          <p className="text-xs text-slate-400 italic px-3 py-3">
            No scorecards yet.{canEdit && ' Click + to create one.'}
          </p>
        )}

        {sidebarSearch && scorecards.filter(sc => sc.name.toLowerCase().includes(sidebarSearch.toLowerCase())).length === 0 && scorecards.length > 0 && (
          <p className="text-xs text-slate-400 italic px-3 py-3">
            No match for &ldquo;{sidebarSearch}&rdquo;
          </p>
        )}
      </div>
    </aside>
    </>
  );
}
