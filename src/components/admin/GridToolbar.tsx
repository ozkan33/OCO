'use client';
import React, { useState } from 'react';
import { FaInfoCircle } from 'react-icons/fa';
import { SaveStatus } from '../ui/SaveStatus';
import { toast } from 'sonner';

interface GridToolbarProps {
  userRole: string;
  editingScoreCard: any;
  saveStatus: any;
  lastSaved: Date | null;
  saveError: any;
  hasUnsavedChanges: boolean;
  isOnline: boolean;
  templates: any[];
  onAddColumn: () => void;
  onImportExcel: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportClick: () => void;
  onSaveTemplate: () => void;
  onImportTemplateClick: () => void;
  onForceSave: () => void;
  onFetchTemplates: () => Promise<void>;
}

export default function GridToolbar({
  userRole,
  editingScoreCard,
  saveStatus,
  lastSaved,
  saveError,
  hasUnsavedChanges,
  isOnline,
  templates,
  onAddColumn,
  onImportExcel,
  onExportClick,
  onSaveTemplate,
  onImportTemplateClick,
  onForceSave,
  onFetchTemplates,
}: GridToolbarProps) {
  const [storeImporting, setStoreImporting] = useState(false);

  async function handleStoreImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStoreImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('clear_existing', 'true');
      const res = await fetch('/api/stores/import', { method: 'POST', credentials: 'include', body: formData });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || 'Import failed');
      } else {
        toast.success(`Imported ${result.count} stores from ${result.chains} chains`);
      }
    } catch {
      toast.error('Store import failed');
    } finally {
      setStoreImporting(false);
      e.target.value = '';
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 pb-3 flex-wrap sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 -mx-6 px-6 pt-2 border-b border-slate-100">
      <div className="flex items-center gap-2">
        <button onClick={onAddColumn} className="grid-toolbar-btn primary" disabled={userRole !== 'ADMIN'}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add Column
        </button>
        <span className="relative flex items-center group">
          <FaInfoCircle className="text-slate-400 group-hover:text-blue-500 cursor-pointer" size={14} />
          <div className="absolute left-1/2 top-full mt-2 ml-2 w-64 bg-slate-800 text-white text-xs rounded-lg p-2.5 shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity duration-150" style={{ whiteSpace: 'normal' }}>
            To import data, columns and data types must match exactly.
          </div>
        </span>
        <label htmlFor="main-import-excel" className="grid-toolbar-btn cursor-pointer" onClick={() => toast.info('You\'ll review a preview before any changes are applied.')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
          Import
        </label>
        <input id="main-import-excel" type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onImportExcel} />
        <label htmlFor="store-import-excel" className={`grid-toolbar-btn cursor-pointer ${storeImporting ? 'opacity-50 pointer-events-none' : ''}`} title="Import customer store list (Excel with Chain Name, Store Name, Address, City, State, ZIP)">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" /></svg>
          {storeImporting ? 'Importing...' : 'Import Stores'}
        </label>
        <input id="store-import-excel" type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleStoreImport} disabled={storeImporting} />
        <button onClick={onExportClick} className="grid-toolbar-btn">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12M12 16.5V3" /></svg>
          Export
        </button>
      </div>
      <div className="flex items-center gap-3">
        {editingScoreCard && (
          <SaveStatus
            status={saveStatus}
            lastSaved={lastSaved}
            error={saveError}
            hasUnsavedChanges={hasUnsavedChanges}
            isOnline={isOnline}
            onRetry={onForceSave}
          />
        )}
        <div className="w-px h-5 bg-slate-200" />
        <button onClick={onSaveTemplate} className="grid-toolbar-btn" disabled={userRole !== 'ADMIN'}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
          Save Template
        </button>
        <button
          onClick={async () => {
            await onFetchTemplates();
            if (templates.length === 0) {
              toast.error('No templates available. Please save a template first.');
              return;
            }
            onImportTemplateClick();
          }}
          className="grid-toolbar-btn"
          disabled={userRole !== 'ADMIN'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
          Load Template
        </button>
      </div>
    </div>
  );
}
