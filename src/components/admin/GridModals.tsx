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
      <h3 className="text-lg font-bold mb-4">Save ScoreCard as Template</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Template Name</label>
          <input
            type="text"
            value={templateName}
            onChange={e => onNameChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="e.g., Product Columns"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeRows}
            onChange={e => onIncludeRowsChange(e.target.checked)}
            id="includeRowsInTemplate"
          />
          <label htmlFor="includeRowsInTemplate" className="text-sm">Include row data</label>
        </div>
        {templateError && <p className="text-red-500 text-sm">{templateError}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200">Cancel</button>
          <button onClick={onSave} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Save Template</button>
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
  onDeleteTemplate: (name: string) => void;
}) {
  return (
    <Modal>
      <h3 className="text-lg font-bold mb-4">Import Template</h3>
      <div className="space-y-4">
        {templates.length === 0 ? (
          <div className="text-center text-slate-500 text-sm mb-4">
            No templates available. Please save a template first.
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700">Select Template</label>
              <div className="flex gap-2 items-center">
                <select
                  value={selectedTemplateName}
                  onChange={e => {
                    onTemplateChange(e.target.value);
                  }}
                  className="mt-1 block w-full rounded-md border border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">-- Select --</option>
                  {templates.map(t => (
                    <option key={t.id || t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
                {selectedTemplateName && (
                  <button
                    type="button"
                    className="ml-2 px-2 py-1 bg-red-500 text-white rounded hover:bg-red-700 text-xs"
                    onClick={() => onDeleteTemplate(selectedTemplateName)}
                  >Delete</button>
                )}
              </div>
            </div>
            {selectedTemplateName && templates.find(t => t.name === selectedTemplateName)?.rows && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={importWithRows}
                  onChange={e => onImportWithRowsChange(e.target.checked)}
                  id="importWithRows"
                />
                <label htmlFor="importWithRows" className="text-sm">Import with row data</label>
              </div>
            )}
          </>
        )}
        {templateError && <p className="text-red-500 text-sm">{templateError}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200">Cancel</button>
          <button
            onClick={onImport}
            className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-md hover:bg-cyan-700"
            disabled={!selectedTemplateName || templates.length === 0}
          >Import Template</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Export Excel Modal ───────────────────────────────────────────────────────
export function ExportExcelModal({
  excludeSubgrid,
  onExcludeSubgridChange,
  onExport,
  onCancel,
}: {
  excludeSubgrid: boolean;
  onExcludeSubgridChange: (v: boolean) => void;
  onExport: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal>
      <h3 className="text-lg font-bold mb-4">Export to Excel</h3>
      <div className="space-y-4">
        <div className="bg-blue-50 p-3 rounded text-sm text-blue-700">
          <strong>Modern Hierarchical Export</strong><br />
          Includes all main grid data and any subgrid data with clear parent-child relationships.
        </div>
        <div className="bg-slate-50 p-3 rounded text-xs text-slate-600">
          <strong>Features:</strong>
          <ul className="mt-1 list-disc list-inside space-y-1">
            <li>🔵 PARENT - Rows with children</li>
            <li>🟣 PARENT (No Children) - Standalone parent rows</li>
            <li>├─ CHILD / └─ CHILD - Child rows with tree connectors</li>
            <li>Child counts and parent references</li>
          </ul>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="excludeSubgridExport"
            checked={excludeSubgrid}
            onChange={e => onExcludeSubgridChange(e.target.checked)}
          />
          <label htmlFor="excludeSubgridExport" className="text-sm">Exclude subgrid data (export only main grid)</label>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200">Cancel</button>
          <button onClick={onExport} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700">Export</button>
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
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-1">Review Import</h3>
        <p className="text-sm text-slate-500 mb-5 truncate">{importPreview.filename}</p>
        <div className="space-y-3 mb-6">
          {importPreview.toUpdate > 0 && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <span className="text-blue-600 font-bold text-lg">{importPreview.toUpdate}</span>
              <div>
                <p className="text-sm font-semibold text-blue-800">rows will be updated</p>
                <p className="text-xs text-blue-600">Existing retailers matched by name</p>
              </div>
            </div>
          )}
          {importPreview.toAdd > 0 && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <span className="text-green-600 font-bold text-lg">{importPreview.toAdd}</span>
              <div>
                <p className="text-sm font-semibold text-green-800">new rows will be added</p>
                <p className="text-xs text-green-600">Not found in current scorecard</p>
              </div>
            </div>
          )}
          {importPreview.toSkip > 0 && (
            <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
              <span className="text-yellow-600 font-bold text-lg">{importPreview.toSkip}</span>
              <div>
                <p className="text-sm font-semibold text-yellow-800">rows not in file — kept as-is</p>
                <p className="text-xs text-yellow-600">Existing data not overwritten</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button>
          <button onClick={onApply} className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700">Apply Import</button>
        </div>
      </div>
    </div>
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
