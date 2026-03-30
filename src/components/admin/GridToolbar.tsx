'use client';
import React from 'react';
import { FaInfoCircle } from 'react-icons/fa';

interface GridToolbarProps {
  userRole: string;
  onAddColumn: () => void;
  onImportExcel: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportExcel: () => void;
  onSaveTemplate: () => void;
  onImportTemplate: () => void;
}

export default function GridToolbar({
  userRole,
  onAddColumn,
  onImportExcel,
  onExportExcel,
  onSaveTemplate,
  onImportTemplate,
}: GridToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      {/* Left group */}
      <div className="flex items-center gap-4">
        <button
          onClick={onAddColumn}
          className="px-3 py-1 rounded text-sm font-medium border bg-green-600 text-white hover:bg-green-700 flex items-center gap-2"
          disabled={userRole !== 'ADMIN'}
        >
          ➕ Add Column
        </button>

        {/* Import info tooltip */}
        <span className="relative flex items-center group ml-2">
          <FaInfoCircle className="text-gray-400 group-hover:text-blue-600 cursor-pointer" />
          <div
            className="absolute left-1/2 top-full mt-2 ml-2 w-64 bg-black text-white text-xs rounded p-2 shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity duration-150"
            style={{ whiteSpace: 'normal' }}
          >
            To import data, columns and data types must match exactly.
          </div>
        </span>

        <label
          htmlFor="main-import-excel"
          className="px-3 py-1 rounded text-sm font-medium border bg-purple-600 text-white hover:bg-purple-700 flex items-center gap-2 cursor-pointer"
          style={{ fontSize: '14px', height: 32, padding: '0 12px' }}
          onClick={() => {
            // Toast warning handled upstream via onImportExcel wrapper
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg
              style={{ width: 16, height: 16, marginRight: 2 }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <path d="M16 16l-4 4-4-4M12 12v8" />
            </svg>
            Import Excel
          </span>
        </label>
        <input
          id="main-import-excel"
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={onImportExcel}
        />

        <button
          onClick={onExportExcel}
          className="px-3 py-1 rounded text-sm font-medium border bg-green-600 text-white hover:bg-green-700 flex items-center gap-2"
        >
          📤 Export Excel
        </button>
      </div>

      {/* Right group */}
      <div className="flex items-center gap-4">
        <button
          onClick={onSaveTemplate}
          className="px-3 py-1 rounded text-sm font-medium border bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
          disabled={userRole !== 'ADMIN'}
        >
          💾 Save Template
        </button>
        <button
          onClick={onImportTemplate}
          className="px-3 py-1 rounded text-sm font-medium border bg-cyan-600 text-white hover:bg-cyan-700 flex items-center gap-2"
          disabled={userRole !== 'ADMIN'}
        >
          📂 Import Template
        </button>
      </div>
    </div>
  );
}
