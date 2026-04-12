'use client';
import React, { useState, useMemo } from 'react';
import { DataGrid, type Column, type SortColumn, type RenderEditCellProps } from 'react-data-grid';
import { useAdminGrid } from './AdminDataGridContext';

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
    col.key !== 'retailerName' && typeof col.name === 'string' && !col.name.toLowerCase().includes('retailer') &&
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

export default function SubGridRenderer({ parentId }: { parentId: string | number | undefined }) {
  const ctx = useAdminGrid();
  const {
    subGrids, expandedRowId, setExpandedRowId, subgridTemplates,
    handleSubGridAddColumn, handleSubGridAddRow, handleSubGridRowsChange,
    handleSubGridColumnNameChange, handleSubGridDeleteRow, handleSubGridDeleteColumn,
    handleDeleteSubGrid, handleImportSubgridExcel, handleExportSubgridExcel,
    setSubgridTemplateModal, getCurrentData,
  } = ctx;

  const [subgridSortColumns, setSubgridSortColumns] = useState<SortColumn[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

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

  const subEditableColumns: MyColumn[] = grid.columns.map((col: MyColumn, idx: number) => ({
    ...col,
    minWidth: 120,
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
      return (
        <div className="flex items-center px-2 py-1 overflow-hidden" style={{ fontSize: '13px', minHeight: '24px', backgroundColor: 'transparent' }} title={cellValue ? String(cellValue) : undefined}>
          <span className="text-slate-800 truncate">{cellValue ? String(cellValue) : ''}</span>
        </div>
      );
    },
    renderEditCell: ({ row, column, onRowChange }: RenderEditCellProps<Row>) => (
      <input defaultValue={row[column.key] !== undefined ? String(row[column.key]) : ''} onChange={e => onRowChange({ ...row, [column.key]: e.target.value })}
        className="w-full h-full px-2 py-1 border border-blue-300 rounded bg-white" autoFocus style={{ fontSize: '13px', height: '24px', minHeight: '24px' }} />
    ),
  }));

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
          <button
            onClick={() => setIsExpanded(e => !e)}
            className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
            aria-label={isExpanded ? 'Collapse' : 'Expand to full screen'}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
            )}
          </button>
          <button onClick={() => { setIsExpanded(false); setExpandedRowId(null); }} className="text-slate-400 hover:text-slate-600 text-xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors" aria-label="Close">&times;</button>
        </div>
      </div>
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
        <div className="toolbar-separator" />
        <button onClick={() => setSubgridTemplateModal({ parentId, mode: 'save' })} className="grid-toolbar-btn sm" title="Save template">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
        </button>
        <button onClick={() => setSubgridTemplateModal({ parentId, mode: 'import' })} className="grid-toolbar-btn sm" disabled={subgridTemplates.length === 0} title="Load template">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
        </button>
        <div className="flex-1" />
        <button onClick={() => handleDeleteSubGrid(parentId)} className="grid-toolbar-btn sm danger" title="Delete subgrid">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
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
      </div>
    </div>
  );

  if (!isExpanded) return gridContent;

  // Expanded: render as full-screen overlay on top of everything
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" style={{ animation: 'slideInRight 0.15s ease-out' }}>
      {gridContent}
    </div>
  );
}
