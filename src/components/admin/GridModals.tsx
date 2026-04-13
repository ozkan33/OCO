'use client';
import React from 'react';
import type { ScoreCard } from './types';

// ─── Shared modal shell ───────────────────────────────────────────────────────
function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 modal-backdrop">
      <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md border border-slate-200 modal-content">{children}</div>
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Delete',
  confirmClass = 'bg-red-600 hover:bg-red-700',
}: {
  title: string;
  message: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  confirmClass?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm modal-backdrop">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm flex flex-col items-center border border-slate-200 modal-content">
        <h2 className="text-lg font-bold mb-2">{title}</h2>
        <p className="mb-4 text-center text-slate-700">{message}</p>
        <div className="flex gap-4 w-full justify-center">
          <button
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
            onClick={onCancel}
          >Cancel</button>
          <button
            className={`px-4 py-2 text-sm font-medium text-white rounded-md ${confirmClass}`}
            onClick={onConfirm}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Column Modal ─────────────────────────────────────────────────────────
export function AddColumnModal({
  newColName,
  colError,
  onNameChange,
  onConfirm,
  onCancel,
}: {
  newColName: string;
  colError: string;
  onNameChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal>
      <h3 className="text-lg font-bold mb-4">Add New Column</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Column Name</label>
          <input type="password" style={{ display: 'none' }} autoComplete="new-password" />
          <input
            type="text"
            value={newColName}
            onChange={e => onNameChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 pr-8"
            placeholder="e.g., Phone Number"
            autoComplete="new-password"
          />
        </div>
        {colError && <p className="text-red-500 text-sm">{colError}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Add Column</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Create ScoreCard Modal ───────────────────────────────────────────────────
export function CreateScoreCardModal({
  name,
  onNameChange,
  onCreate,
  onCancel,
}: {
  name: string;
  onNameChange: (v: string) => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal>
      <h3 className="text-lg font-bold mb-4">Create New ScoreCard</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">ScoreCard Name</label>
          <input
            type="text"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="e.g., Sales Performance"
            onKeyPress={e => e.key === 'Enter' && onCreate()}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200">Cancel</button>
          <button onClick={onCreate} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Create ScoreCard</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Edit ScoreCard Modal ─────────────────────────────────────────────────────
export function EditScoreCardModal({
  scorecard,
  onNameChange,
  onSave,
  onCancel,
}: {
  scorecard: ScoreCard;
  onNameChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal>
      <h3 className="text-lg font-bold mb-4">Edit ScoreCard</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">ScoreCard Name</label>
          <input
            type="text"
            value={scorecard.name}
            onChange={e => onNameChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="e.g., Sales Performance"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200">Cancel</button>
          <button onClick={onSave} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Save Changes</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────
export function DeleteConfirmModal({
  type,
  name,
  onConfirm,
  onCancel,
}: {
  type: 'row' | 'column' | 'scorecard' | 'template' | 'subgrid-template';
  name?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const messages: Record<string, React.ReactNode> = {
    row: 'Are you sure you want to delete this row? This action cannot be undone.',
    column: 'Are you sure you want to delete this column? All data in this column will be lost.',
    scorecard: `Are you sure you want to delete the ScoreCard "${name}"? This action cannot be undone.`,
    template: `Are you sure you want to delete the template "${name}"?`,
    'subgrid-template': `Are you sure you want to delete the subgrid template "${name}"?`,
  };
  return (
    <ConfirmDialog
      title="Confirm Deletion"
      message={messages[type] || 'Are you sure?'}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

// ─── Comment Delete Confirmation ──────────────────────────────────────────────
export function DeleteCommentModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      title="Delete Comment"
      message="Are you sure you want to delete this comment?"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

// ─── Save Template Modal ──────────────────────────────────────────────────────
export function SaveTemplateModal({
  templateName,
  includeRows,
  templateError,
  onNameChange,
  onIncludeRowsChange,
  onSave,
  onCancel,
}: {
  templateName: string;
  includeRows: boolean;
  templateError: string;
  onNameChange: (v: string) => void;
  onIncludeRowsChange: (v: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">Save as Template</h3>
          <p className="text-xs text-slate-500">Reuse this column layout on other scorecards</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Template name</label>
          <input
            type="text"
            value={templateName}
            onChange={e => onNameChange(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all"
            placeholder="e.g., Beverage Scorecard Layout"
            autoFocus
          />
        </div>

        <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 cursor-pointer transition-colors bg-slate-50/50">
          <input
            type="checkbox"
            checked={includeRows}
            onChange={e => onIncludeRowsChange(e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5 h-4 w-4"
          />
          <div>
            <p className="text-sm font-medium text-slate-700">Include retailer data</p>
            <p className="text-xs text-slate-400 mt-0.5">Save all current rows along with the column structure. Uncheck to save columns only.</p>
          </div>
        </label>

        {templateError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="text-sm text-red-700">{templateError}</span>
          </div>
        )}

        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Cancel</button>
          <button onClick={onSave} className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
            </svg>
            Save Template
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Import Template Modal ────────────────────────────────────────────────────
export function ImportTemplateModal({
  templates,
  selectedTemplateName,
  importWithRows,
  templateError,
  onTemplateChange,
  onImportWithRowsChange,
  onImport,
  onCancel,
  onDeleteTemplate,
}: {
  templates: any[];
  selectedTemplateName: string;
  importWithRows: boolean;
  templateError: string;
  onTemplateChange: (name: string) => void;
  onImportWithRowsChange: (v: boolean) => void;
  onImport: () => void;
  onCancel: () => void;
  onDeleteTemplate: (id: string) => void;
}) {
  const selectedTemplate = templates.find(t => t.name === selectedTemplateName);

  return (
    <Modal>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">Load Template</h3>
          <p className="text-xs text-slate-500">Apply a saved column layout to this scorecard</p>
        </div>
      </div>

      <div className="space-y-3">
        {templates.length === 0 ? (
          <div className="text-center py-6">
            <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
            </svg>
            <p className="text-sm font-medium text-slate-500">No templates saved yet</p>
            <p className="text-xs text-slate-400 mt-1">Use &quot;Save Template&quot; to create one from your current scorecard.</p>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Choose a template</label>
              <select
                value={selectedTemplateName}
                onChange={e => onTemplateChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all appearance-none"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
              >
                <option value="">Select a template...</option>
                {templates.map(t => (
                  <option key={t.id || t.name} value={t.name}>
                    {t.name} ({t.columns?.length || 0} cols{t.rows ? `, ${t.rows.length} rows` : ''})
                  </option>
                ))}
              </select>
            </div>

            {/* Template preview */}
            {selectedTemplate && (
              <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-slate-500">Template preview</p>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete template "${selectedTemplateName}"? This cannot be undone.`)) {
                        onDeleteTemplate(selectedTemplate.id || selectedTemplateName);
                      }
                    }}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors"
                  >
                    Delete
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedTemplate.columns || []).slice(0, 8).map((col: any, i: number) => (
                    <span key={i} className="text-[11px] bg-white border border-slate-200 rounded-md px-2 py-0.5 text-slate-600">
                      {String(col.name || col.key)}
                    </span>
                  ))}
                  {(selectedTemplate.columns || []).length > 8 && (
                    <span className="text-[11px] text-slate-400 px-1 py-0.5">+{selectedTemplate.columns.length - 8} more</span>
                  )}
                </div>
                {selectedTemplate.rows && (
                  <p className="text-[11px] text-slate-400 mt-2">{selectedTemplate.rows.length} row{selectedTemplate.rows.length !== 1 ? 's' : ''} saved with this template</p>
                )}
              </div>
            )}

            {selectedTemplate?.rows && (
              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 cursor-pointer transition-colors bg-slate-50/50">
                <input
                  type="checkbox"
                  checked={importWithRows}
                  onChange={e => onImportWithRowsChange(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5 h-4 w-4"
                />
                <div>
                  <p className="text-sm font-medium text-slate-700">Include retailer data</p>
                  <p className="text-xs text-slate-400 mt-0.5">Replace current rows with the {selectedTemplate.rows.length} rows saved in this template.</p>
                </div>
              </label>
            )}
          </>
        )}

        {templateError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="text-sm text-red-700">{templateError}</span>
          </div>
        )}

        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Cancel</button>
          <button
            onClick={onImport}
            disabled={!selectedTemplateName || templates.length === 0}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Apply Template
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Export Excel Modal ───────────────────────────────────────────────────────
export function ExportExcelModal({
  excludeSubgrid,
  onExcludeSubgridChange,
  includeNotes,
  onIncludeNotesChange,
  onExport,
  onCancel,
}: {
  excludeSubgrid: boolean;
  onExcludeSubgridChange: (v: boolean) => void;
  includeNotes: boolean;
  onIncludeNotesChange: (v: boolean) => void;
  onExport: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12M12 16.5V3" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">Export to Excel</h3>
          <p className="text-xs text-slate-500">Download scorecard data as an .xlsx file</p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Data options */}
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">What to include</p>

        <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 cursor-pointer transition-colors bg-slate-50/50">
          <input
            type="checkbox"
            checked={!excludeSubgrid}
            onChange={e => onExcludeSubgridChange(!e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5 h-4 w-4"
          />
          <div>
            <p className="text-sm font-medium text-slate-700">Subgrid data</p>
            <p className="text-xs text-slate-400 mt-0.5">Include child rows with parent-child tree connectors</p>
          </div>
        </label>

        <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 cursor-pointer transition-colors bg-slate-50/50">
          <input
            type="checkbox"
            checked={includeNotes}
            onChange={e => onIncludeNotesChange(e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5 h-4 w-4"
          />
          <div>
            <p className="text-sm font-medium text-slate-700">Notes &amp; comments</p>
            <p className="text-xs text-slate-400 mt-0.5">Adds a &quot;Notes&quot; column with all comments per retailer, including author and date</p>
          </div>
        </label>

        {/* Actions */}
        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Cancel</button>
          <button onClick={onExport} className="px-5 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12M12 16.5V3" />
            </svg>
            Export
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Import Preview Modal ────────────────────────────────────────────────────
export function ImportPreviewModal({
  importPreview,
  onCancel,
  onApply,
}: {
  importPreview: { filename: string; formattedRows: any[]; toUpdate: number; toAdd: number; toSkip: number };
  onCancel: () => void;
  onApply: () => void;
}) {
  const total = importPreview.formattedRows.length;
  return (
    <Modal>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900">Review Import</h3>
          <p className="text-xs text-slate-500 truncate">{importPreview.filename} &middot; {total} row{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="space-y-2 mb-5">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">What will happen</p>
        {importPreview.toUpdate > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-2.5">
            <span className="text-lg font-bold text-blue-600 w-8 text-center">{importPreview.toUpdate}</span>
            <div>
              <p className="text-sm font-medium text-slate-700">updated</p>
              <p className="text-[11px] text-slate-400">Matched existing retailers by name</p>
            </div>
          </div>
        )}
        {importPreview.toAdd > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-green-100 bg-green-50/50 px-4 py-2.5">
            <span className="text-lg font-bold text-green-600 w-8 text-center">{importPreview.toAdd}</span>
            <div>
              <p className="text-sm font-medium text-slate-700">added</p>
              <p className="text-[11px] text-slate-400">New retailers not in current scorecard</p>
            </div>
          </div>
        )}
        {importPreview.toSkip > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-2.5">
            <span className="text-lg font-bold text-slate-400 w-8 text-center">{importPreview.toSkip}</span>
            <div>
              <p className="text-sm font-medium text-slate-700">unchanged</p>
              <p className="text-[11px] text-slate-400">Existing rows not in file are kept</p>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400 mb-4">A backup of your current data will be downloaded automatically before import.</p>

      <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
        <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Cancel</button>
        <button onClick={onApply} className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Apply Import
        </button>
      </div>
    </Modal>
  );
}

// ─── Subgrid Template Modal ─────────────────────────────────────────────────
export function SubgridTemplateModal({
  mode,
  templateName,
  includeRows,
  templateError,
  templates,
  selectedTemplate,
  importWithRows,
  onNameChange,
  onIncludeRowsChange,
  onSave,
  onTemplateChange,
  onImportWithRowsChange,
  onImport,
  onDeleteTemplate,
  onCancel,
}: {
  mode: 'save' | 'import';
  templateName: string;
  includeRows: boolean;
  templateError: string;
  templates: any[];
  selectedTemplate: string;
  importWithRows: boolean;
  onNameChange: (v: string) => void;
  onIncludeRowsChange: (v: boolean) => void;
  onSave: () => void;
  onTemplateChange: (v: string) => void;
  onImportWithRowsChange: (v: boolean) => void;
  onImport: () => void;
  onDeleteTemplate: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-96">
        {mode === 'save' ? (
          <>
            <h3 className="text-lg font-bold mb-4">Save Subgrid as Template</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Template Name</label>
                <input type="text" value={templateName} onChange={e => onNameChange(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" placeholder="e.g., Subgrid Columns" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={includeRows} onChange={e => onIncludeRowsChange(e.target.checked)} id="subgridIncludeRows" />
                <label htmlFor="subgridIncludeRows" className="text-sm">Include row data</label>
              </div>
              {templateError && <p className="text-red-500 text-sm">{templateError}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200">Cancel</button>
                <button onClick={onSave} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Save Template</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold mb-4">Import Subgrid Template</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Select Template</label>
                <div className="flex gap-2 items-center">
                  <select value={selectedTemplate} onChange={e => onTemplateChange(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                    <option value="">-- Select --</option>
                    {templates.map(t => (<option key={t.name} value={t.name}>{t.name}</option>))}
                  </select>
                  {selectedTemplate && (
                    <button type="button" className="ml-2 px-2 py-1 bg-red-500 text-white rounded hover:bg-red-700 text-xs" onClick={() => onDeleteTemplate(selectedTemplate)}>Delete</button>
                  )}
                </div>
              </div>
              {selectedTemplate && templates.find(t => t.name === selectedTemplate)?.rows && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={importWithRows} onChange={e => onImportWithRowsChange(e.target.checked)} id="subgridImportWithRows" />
                  <label htmlFor="subgridImportWithRows" className="text-sm">Import with row data</label>
                </div>
              )}
              {templateError && <p className="text-red-500 text-sm">{templateError}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200">Cancel</button>
                <button onClick={onImport} className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-md hover:bg-cyan-700" disabled={!selectedTemplate}>Import Template</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Contact Card Modal ───────────────────────────────────────────────────────
export function ContactCardModal({
  contactData,
  onContactDataChange,
  onSave,
  onCancel,
}: {
  contactData: { name: string; telephone: string; address: string; notes: string };
  onContactDataChange: (field: string, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 modal-backdrop">
      <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md border border-slate-200 modal-content">
        <h3 className="text-lg font-bold mb-4">Edit 3B Contact</h3>
        <div className="space-y-4">
          {(['name', 'telephone', 'address'] as const).map(field => (
            <div key={field}>
              <label className="block text-sm font-medium text-slate-700 capitalize">{field}</label>
              <input
                type={field === 'telephone' ? 'tel' : 'text'}
                value={contactData[field]}
                onChange={e => onContactDataChange(field, e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-slate-700">Notes</label>
            <textarea
              value={contactData.notes}
              onChange={e => onContactDataChange('notes', e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Notes"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200">Cancel</button>
            <button onClick={onSave} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
