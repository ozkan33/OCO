'use client';
import React, { useState, useMemo } from 'react';
import { DataGrid, type Column, type SortColumn, type RenderEditCellProps } from 'react-data-grid';
import { useAdminGrid } from './AdminDataGridContext';
import { AUTHORIZATION_OPTIONS } from './useSubGridHandlers';
import { FaRegCommentDots } from 'react-icons/fa';
import { toast } from 'sonner';

const AUTH_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Authorized': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'Discontinued': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  'Not Authorized': { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200' },
};

interface Row {
  id: number | string;
  isAddRow?: boolean;
  isDummy?: boolean;
  [key: string]: any;
}

type MyColumn = Column<Row> & { locked?: boolean; isDefault?: boolean };

function SubGridHeaderCell({ col, idx, parentId, subgridSortColumns, setSubgridSortColumns, handleSubGridColumnNameChange, handleSubGridDeleteColumn }: {
  col: any; idx: number; parentId: string | number; subgridSortColumns: SortColumn[];
  setSubgridSortColumns: React.Dispatch<React.SetStateAction<SortColumn[]>>;
  handleSubGridColumnNameChange: any; handleSubGridDeleteColumn: any;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(typeof col.name === 'string' ? col.name : '');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { setInputValue(typeof col.name === 'string' ? col.name : ''); }, [col.name]);

  const startEditing = () => { setIsEditing(true); setTimeout(() => inputRef.current?.focus(), 0); };
  const commitChange = () => {
    setIsEditing(false);
    if (inputValue !== col.name && inputValue.trim()) handleSubGridColumnNameChange(parentId, idx, inputValue.trim());
    else setInputValue(typeof col.name === 'string' ? col.name : '');
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitChange();
    else if (e.key === 'Escape') { setIsEditing(false); setInputValue(typeof col.name === 'string' ? col.name : ''); }
  };

  const sortColumn = subgridSortColumns.find((sc: SortColumn) => sc.columnKey === col.key);
  const sortIcon = sortColumn ? (sortColumn.direction === 'ASC' ? '\u2191' : '\u2193') : null;

  const canDelete = !col.isDefault && col.key !== 'name' && col.key !== 'priority' && col.key !== 'retailPrice' &&
    col.key !== 'categoryReviewDate' && col.key !== 'buyer' && col.key !== 'storeContact' && col.key !== 'delete' &&
    col.key !== 'retailerName' && col.key !== 'comments' && typeof col.name === 'string' && !col.name.toLowerCase().includes('retailer') &&
    !col.name.toLowerCase().includes('priority') && !col.name.toLowerCase().includes('price') &&
    !col.name.toLowerCase().includes('category') && !col.name.toLowerCase().includes('buyer') &&
    !col.name.toLowerCase().includes('contact');

  return (
    <div className="group/header flex items-center justify-between w-full gap-0.5 overflow-hidden">
      {isEditing ? (
        <input ref={inputRef} value={inputValue} onChange={e => setInputValue(e.target.value)} onBlur={commitChange} onKeyDown={handleKeyDown}
          className="border border-blue-300 px-1.5 py-0.5 rounded text-xs bg-white w-full" style={{ fontSize: '11px', height: 22 }} maxLength={30} />
      ) : (
        <>
          <span
            className="text-[11px] font-medium text-slate-600 truncate cursor-pointer hover:text-blue-600 flex-1 min-w-0"
            onDoubleClick={startEditing}
            title={`${typeof col.name === 'string' ? col.name : ''} (double-click to rename)`}
          >
            {typeof col.name === 'string' ? col.name : ''}
          </span>
          {sortIcon && <span className="text-blue-500 text-[10px] font-bold flex-shrink-0">{sortIcon}</span>}
          <div className="flex items-center gap-0 flex-shrink-0 opacity-0 group-hover/header:opacity-100 transition-opacity">
            <button onClick={startEditing} className="text-slate-300 hover:text-blue-500 transition-colors p-0.5" title="Rename">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" /></svg>
            </button>
            {canDelete && (
              <button onClick={e => { e.stopPropagation(); handleSubGridDeleteColumn(parentId, col.key); }} className="text-slate-300 hover:text-red-500 transition-colors p-0.5" title="Delete">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
              </button>
            )}
            <button onClick={e => {
              e.stopPropagation();
              const currentSort = subgridSortColumns.find((sc: SortColumn) => sc.columnKey === col.key);
              const newDirection = currentSort?.direction === 'ASC' ? 'DESC' : 'ASC';
              setSubgridSortColumns(prev => [...prev.filter((sc: SortColumn) => sc.columnKey !== col.key), { columnKey: col.key, direction: newDirection }]);
            }} className="text-slate-300 hover:text-blue-500 transition-colors p-0.5" title="Sort">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-3L16.5 18m0 0L12 13.5m4.5 4.5V4.5" /></svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Subgrid Comment Drawer ──────────────────────────────────────────────────
function SubgridCommentDrawer() {
  const ctx = useAdminGrid();
  const {
    openSubgridCommentKey, setOpenSubgridCommentKey,
    subgridCommentInput, setSubgridCommentInput,
    handleAddSubgridComment,
    comments, selectedCategory, user,
    editCommentIdx, editCommentText, setEditCommentIdx, setEditCommentText,
    updateComment, setConfirmDeleteComment,
  } = ctx;

  if (!openSubgridCommentKey) return null;

  // Parse "sub:{parentRowId}:{storeName}"
  const parts = openSubgridCommentKey.match(/^sub:(.+?):(.+)$/);
  if (!parts) return null;
  const storeName = parts[2];

  const rowComments = comments[selectedCategory]?.[openSubgridCommentKey] || [];

  return (
    <div className="fixed inset-0 z-[60] flex">
      <div className="fixed inset-0 bg-black bg-opacity-40 transition-opacity" onClick={() => { setOpenSubgridCommentKey(null); setSubgridCommentInput(''); }} />
      <div className="relative ml-auto w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-slideInRight rounded-l-2xl border-l border-slate-200">
        <div className="flex items-center justify-between border-b px-6 py-4 bg-slate-50 rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{storeName}</h2>
            <p className="text-xs text-slate-400">Store Comments</p>
          </div>
          <button onClick={() => { setOpenSubgridCommentKey(null); setSubgridCommentInput(''); }} className="text-slate-400 hover:text-slate-700 text-2xl font-bold">x</button>
        </div>
        <div className="flex-1 flex flex-col px-6 py-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Comments</h3>
          <div className="flex-1 overflow-y-auto mb-4 space-y-3 pr-1" style={{ maxHeight: '50vh' }}>
            {rowComments.length === 0 ? (
              <div className="text-slate-400 text-center py-8 text-sm">No comments yet. Be the first to comment!</div>
            ) : (
              <ul className="space-y-3">
                {rowComments.map((c: any, i: number) => {
                  const isAuthor = user?.id === c.user_id;
                  const rawName = c.user_email?.split('@')[0] || 'Unknown';
                  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
                  const createdAt = new Date(c.created_at).toLocaleString();
                  const isEdited = c.updated_at && c.created_at && new Date(c.updated_at).getTime() - new Date(c.created_at).getTime() > 1000;
                  return (
                    <li key={c.id || i} className="flex items-start gap-3 bg-white rounded-xl shadow-sm border border-slate-200 p-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                        {displayName[0]?.toUpperCase() || 'A'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="font-semibold text-slate-800 text-sm">{displayName}</span>
                          <span className="text-[10px] text-slate-400 ml-2 whitespace-nowrap">
                            {createdAt}{isEdited && <span className="italic text-slate-300 ml-1">(edited)</span>}
                          </span>
                        </div>
                        {editCommentIdx === i && openSubgridCommentKey ? (
                          <div className="flex flex-col gap-1.5 mt-1">
                            <textarea
                              value={editCommentText}
                              onChange={e => setEditCommentText(e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                              rows={2}
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={async () => {
                                  try {
                                    await updateComment(c.id, editCommentText);
                                    setEditCommentIdx(null);
                                    setEditCommentText('');
                                    toast.success('Comment updated!');
                                  } catch { toast.error('Failed to update comment'); }
                                }}
                                className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs font-semibold"
                              >Save</button>
                              <button
                                onClick={() => { setEditCommentIdx(null); setEditCommentText(''); }}
                                className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded text-xs font-semibold"
                              >Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-slate-700 text-sm whitespace-pre-line">{c.text}</div>
                        )}
                        {isAuthor && editCommentIdx !== i && (
                          <div className="flex gap-2 mt-1">
                            <button onClick={() => { setEditCommentIdx(i); setEditCommentText(c.text); }} className="text-[11px] text-blue-600 hover:underline">Edit</button>
                            <button onClick={() => setConfirmDeleteComment({ rowId: i, commentIdx: i })} className="text-[11px] text-red-500 hover:underline">Delete</button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="pt-3 border-t flex gap-2.5 items-start mt-2">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm mt-1">
              {(user?.name || user?.email || 'A')[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <textarea
                value={subgridCommentInput}
                onChange={e => setSubgridCommentInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-blue-500 px-3 py-2 text-sm bg-white shadow-sm resize-none transition-all"
                placeholder="Add a comment..."
                rows={2}
                style={{ minHeight: 40, maxHeight: 100 }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddSubgridComment(); } }}
              />
              <button
                onClick={handleAddSubgridComment}
                className="mt-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold shadow transition-all float-right"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SubGridRenderer({ parentId }: { parentId: string | number | undefined }) {
  const ctx = useAdminGrid();
  const {
    subGrids, expandedRowId, setExpandedRowId,
    handleSubGridAddColumn, handleSubGridAddRow, handleSubGridRowsChange,
    handleSubGridColumnNameChange, handleSubGridDeleteRow, handleSubGridDeleteColumn,
    handleDeleteSubGrid, handleImportSubgridExcel, handleExportSubgridExcel,
    getCurrentData,
    comments, selectedCategory, setOpenSubgridCommentKey,
  } = ctx;

  const [subgridSortColumns, setSubgridSortColumns] = useState<SortColumn[]>([]);

  const grid = parentId !== undefined ? subGrids[parentId] : null;
  const isVisible = !!grid && expandedRowId === parentId;

  const sortedSubgridRows = useMemo(() => {
    if (!grid || subgridSortColumns.length === 0) return grid?.rows || [];
    return [...grid.rows].sort((a, b) => {
      for (const { columnKey, direction } of subgridSortColumns) {
        const aValue = a[columnKey];
        const bValue = b[columnKey];
        if (aValue === bValue) continue;
        const result = aValue < bValue ? -1 : 1;
        return direction === 'ASC' ? result : -result;
      }
      return 0;
    });
  }, [grid?.rows, subgridSortColumns]);

  if (!isVisible || parentId === undefined || !grid) return null;

  const subgridRows = [...sortedSubgridRows, { isAddRow: true, id: 'add-row' }];

  // Build columns - replace 'comment' column with 'comments' icon column
  const subEditableColumns: MyColumn[] = grid.columns
    .filter((col: any) => col.key !== 'comment') // Remove old plain-text comment column
    .map((col: MyColumn & { isProductAuth?: boolean }, idx: number) => {
    const isProductAuth = !!(col as any).isProductAuth;

    return {
      ...col,
      minWidth: isProductAuth ? 140 : col.key === 'store_name' ? 180 : 120,
      resizable: true,
      renderHeaderCell: () => (
        <SubGridHeaderCell
          col={col} idx={idx} parentId={parentId}
          subgridSortColumns={subgridSortColumns}
          setSubgridSortColumns={setSubgridSortColumns}
          handleSubGridColumnNameChange={handleSubGridColumnNameChange}
          handleSubGridDeleteColumn={handleSubGridDeleteColumn}
        />
      ),
      renderCell: (props: { row: Row }) => {
        if (props.row.isDummy) return null;
        if (props.row.isAddRow) {
          return idx === 0 ? (
            <button onClick={() => handleSubGridAddRow(parentId)} className="w-full h-full flex items-center justify-start text-slate-400 hover:text-blue-600 transition-colors font-medium pl-2" style={{ minHeight: 24, fontSize: '13px', padding: 0 }}>+ Add Row</button>
          ) : null;
        }
        const cellValue = props.row[col.key];

        // Product authorization columns: render as colored badge
        if (isProductAuth && cellValue) {
          const colors = AUTH_COLORS[cellValue as string] || { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' };
          return (
            <div className="flex items-center px-1.5 py-0.5 overflow-hidden" style={{ fontSize: '12px', minHeight: '24px' }}>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${colors.bg} ${colors.text} ${colors.border}`}>
                {cellValue as string}
              </span>
            </div>
          );
        }

        return (
          <div className="flex items-center px-2 py-1 overflow-hidden" style={{ fontSize: '13px', minHeight: '24px', backgroundColor: 'transparent' }} title={cellValue ? String(cellValue) : undefined}>
            <span className="text-slate-800 truncate">{cellValue ? String(cellValue) : ''}</span>
          </div>
        );
      },
      renderEditCell: isProductAuth
        ? ({ row, column, onRowChange, onClose }: RenderEditCellProps<Row>) => (
            <select
              autoFocus
              className="w-full h-full px-1.5 py-0.5 border border-blue-300 rounded bg-white text-[12px]"
              value={row[column.key] || ''}
              onChange={e => {
                onRowChange({ ...row, [column.key]: e.target.value }, true);
              }}
              onBlur={() => onClose(true)}
            >
              <option value="">-- Select --</option>
              {AUTHORIZATION_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )
        : ({ row, column, onRowChange }: RenderEditCellProps<Row>) => (
            <input defaultValue={row[column.key] !== undefined ? String(row[column.key]) : ''} onChange={e => onRowChange({ ...row, [column.key]: e.target.value })}
              className="w-full h-full px-2 py-1 border border-blue-300 rounded bg-white" autoFocus style={{ fontSize: '13px', height: '24px', minHeight: '24px' }} />
          ),
    };
  });

  // Insert comments icon column after store_name (position 1)
  const commentsColumn: MyColumn = {
    key: 'comments',
    name: '',
    width: 44,
    frozen: false,
    renderHeaderCell: () => null,
    renderCell: ({ row }: { row: Row }) => {
      if (row.isAddRow || row.isDummy) return null;
      const storeName = row.store_name || row.name || '';
      if (!storeName) return null;
      const commentKey = `sub:${parentId}:${storeName}`;
      const commentCount = comments[selectedCategory]?.[commentKey]?.length ?? 0;
      return (
        <button
          onClick={e => {
            e.stopPropagation();
            setOpenSubgridCommentKey(commentKey);
          }}
          className="w-full h-full flex items-center justify-center gap-1 text-slate-400 hover:text-blue-600 transition-colors"
          title="View/Add Comments"
          style={{ minHeight: 24 }}
        >
          <FaRegCommentDots size={12} />
          {commentCount > 0 && (
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 rounded-full px-1 min-w-[16px] text-center">{commentCount}</span>
          )}
        </button>
      );
    },
    renderEditCell: () => <></>,
  };

  // Insert after store_name column (index 0)
  const storeNameIdx = subEditableColumns.findIndex(col => col.key === 'store_name');
  if (storeNameIdx !== -1) {
    subEditableColumns.splice(storeNameIdx + 1, 0, commentsColumn);
  } else {
    subEditableColumns.unshift(commentsColumn);
  }

  // Delete column
  subEditableColumns.push({
    key: 'delete', name: '', width: 36, frozen: false,
    renderHeaderCell: () => <></>,
    renderCell: ({ row }: { row: Row }) => {
      if (row.isAddRow) return null;
      return (
        <button onClick={() => handleSubGridDeleteRow(parentId, row.id)} className="text-slate-300 hover:text-red-500 transition-colors text-base" style={{ fontSize: 14, padding: 0 }}>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
        </button>
      );
    },
    renderEditCell: () => <></>,
  });

  const parentRow = getCurrentData()?.rows.find((r: Row) => r.id === parentId);
  const parentName = parentRow?.name || 'Item';

  // Get parent row comments (from brand users or admin) to show in subgrid header
  const parentRowComments = comments[selectedCategory]?.[String(parentId)] || [];

  const gridContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-1 h-5 bg-blue-500 rounded-full shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-800 truncate">{parentName}</h3>
            <p className="text-[11px] text-slate-400">{grid.rows.length} row{grid.rows.length !== 1 ? 's' : ''} · {grid.columns.length} column{grid.columns.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setExpandedRowId(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors" aria-label="Close">&times;</button>
        </div>
      </div>
      {parentRowComments.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 shrink-0">
          <div className="flex items-center gap-1.5 mb-1">
            <FaRegCommentDots size={10} className="text-amber-500" />
            <span className="text-[11px] font-semibold text-amber-700">Customer Notes ({parentRowComments.length})</span>
          </div>
          <div className="space-y-1 max-h-20 overflow-y-auto">
            {parentRowComments.slice(-3).map((c: any) => {
              const author = (c.user_email || '').split('@')[0] || 'Unknown';
              const name = author.charAt(0).toUpperCase() + author.slice(1);
              return (
                <p key={c.id} className="text-[11px] text-amber-900 truncate">
                  <span className="font-medium">{name}:</span> {c.text}
                </p>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-100 shrink-0 flex-wrap">
        <button onClick={() => handleSubGridAddColumn(parentId)} className="grid-toolbar-btn sm primary">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>Column
        </button>
        <button onClick={() => handleSubGridAddRow(parentId)} className="grid-toolbar-btn sm">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>Row
        </button>
        <div className="toolbar-separator" />
        <label className="grid-toolbar-btn sm cursor-pointer" title="Import">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
          <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => handleImportSubgridExcel(e, parentId)} />
        </label>
        <button onClick={() => handleExportSubgridExcel(parentId)} className="grid-toolbar-btn sm" title="Export">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12M12 16.5V3" /></svg>
        </button>
        <div className="flex-1" />
        <button onClick={() => handleDeleteSubGrid(parentId)} className="grid-toolbar-btn sm danger" title="Delete subgrid">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 00-7.5 0" /></svg>
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {grid.rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" /></svg>
            </div>
            <p className="text-sm font-medium text-slate-600 mb-1">No stores found for &ldquo;{parentName}&rdquo;</p>
            <p className="text-xs text-slate-400 max-w-xs">This customer doesn&apos;t have matching chain store data yet. Refer to Chain Store Data.</p>
          </div>
        ) : (
          <DataGrid
            key={parentId + '-' + grid.rows.length + '-' + grid.columns.length}
            columns={subEditableColumns}
            rows={subgridRows}
            onRowsChange={(newRows: Row[]) => handleSubGridRowsChange(parentId, newRows)}
            sortColumns={subgridSortColumns}
            onSortColumnsChange={setSubgridSortColumns}
            className="fill-grid subgrid-with-separators"
            enableVirtualization={false}
            style={{ fontSize: '12px', height: '100%' }}
          />
        )}
      </div>
      <SubgridCommentDrawer />
    </div>
  );

  return gridContent;
}
