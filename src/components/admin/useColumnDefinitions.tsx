'use client';
import React from 'react';
import { type Column, type SortColumn, type RenderEditCellProps } from 'react-data-grid';
import { FaSort, FaSortUp, FaSortDown, FaRegCommentDots } from 'react-icons/fa';
import Select, { components } from 'react-select';
import { format } from 'date-fns';
import EditableColumnHeader from './EditableColumnHeader';
import { productStatusOptions, statusIcons, priorityOptions, contactOptions } from './constants';
import type { PickerState } from './types';

interface Row { id: number | string; name?: string; isAddRow?: boolean; [key: string]: any; }
type MyColumn = Column<Row> & { locked?: boolean; isDefault?: boolean };

export function useColumnDefinitions({
  editingScoreCard, selectedCategory, userRole,
  statusPicker, setStatusPicker,
  priorityPicker, setPriorityPicker,
  contactPicker, setContactPicker,
  categoryReviewDatePicker, setCategoryReviewDatePicker,
  expandedRowId, subGrids, comments, sortColumns, setSortColumns,
  gridContainerRef, scrollPositionRef, preventScrollRef,
  getCurrentData, updateCurrentData, isScorecard,
  setConfirmDelete, handleColumnNameChange,
  handleDeleteRow, handleToggleSubGrid, handleAddSubGrid,
  setOpenCommentRowId, setOpenRetailerDrawer,
  loadScorecardComments, openCommentRowId,
  columnsWithDeleteRef,
}: any) {
  const defaultColumnKeys = ['name', 'retail_price', 'buyer', 'store_count', 'hq_location', 'cmg'];
  const retailersColumns: MyColumn[] = [
    {
      key: 'name', name: 'Customer', editable: true, sortable: true, isDefault: true, frozen: true, width: 220,
      renderCell: (props) => <div className="retailer-col">{props.row["name"]}</div>
    },
    // Priority dropdown column
    {
      key: 'priority', name: 'Priority', editable: true, sortable: true, isDefault: true,
      renderCell: ({ row }) => <PriorityLabel value={row['priority']} />,
      renderEditCell: (props: RenderEditCellProps<Row>) => <PriorityDropdownEditCell {...props} />
    },
    {
      key: 'retail_price', name: 'Retail Price', editable: true, sortable: true, isDefault: true,
      renderCell: ({ row }) => {
        const value = row['retail_price'];
        if (value === undefined || value === null || value === '') {
          return '';
        }
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        return isNaN(numValue) ? '' : `$${numValue.toFixed(2)}`;
      },
      renderEditCell: ({ row, column, onRowChange }) => (
        <div className="relative w-full h-full">
          <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-slate-500 z-10">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            defaultValue={row[column.key] !== undefined && row[column.key] !== null ? String(row[column.key]) : ''}
            onChange={e => {
              const value = e.target.value;
              if (value === '' || /^\d*\.?\d*$/.test(value)) {
                onRowChange({ ...row, [column.key]: value === '' ? '' : parseFloat(value) });
              }
            }}
            className="w-full h-full pl-6 pr-2 py-1 border-none outline-none"
            autoFocus
            placeholder="0.00"
          />
        </div>
      )
    },
    // CategoryReviewDate column
    {
      key: 'category_review_date', name: 'CategoryReviewDate', editable: false, sortable: true, isDefault: true,
      renderCell: ({ row }) => {
        const value = row['category_review_date'];
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', width: '100%' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={value ? '#64748b' : '#cbd5e1'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span style={{ fontSize: 13, color: value ? '#334155' : '#94a3b8' }}>
              {value ? format(new Date(value), 'MM/dd/yyyy') : '\u2014'}
            </span>
          </div>
        );
      },
    },
    {
      key: 'buyer', name: 'Buyer', editable: true, sortable: true, isDefault: true, renderEditCell: ({ row, column, onRowChange }) => (
        <input
          type="text"
          defaultValue={row[column.key] !== undefined ? String(row[column.key]) : ''}
          onChange={e => onRowChange({ ...row, [column.key]: e.target.value })}
          className="w-full h-full px-2 py-1"
          autoFocus
          placeholder="Enter buyer name"
        />
      )
    },
    // Product columns will be added dynamically after this (do NOT set isDefault)
    {
      key: 'store_count', name: 'Store Count', editable: false, sortable: true, isDefault: true,
      renderCell: ({ row }: { row: Row }) => {
        const count = row['store_count'];
        return count !== undefined && count !== null && count !== '' ? String(count) : '';
      },
    },
    // Route To Market column
    {
      key: 'route_to_market', name: 'Route To Market', editable: true, sortable: true, isDefault: true, renderEditCell: ({ row, column, onRowChange }: RenderEditCellProps<Row>) => (
        <input
          type="text"
          defaultValue={row[column.key] !== undefined ? String(row[column.key]) : ''}
          onChange={e => onRowChange({ ...row, [column.key]: e.target.value })}
          className="w-full h-full px-2 py-1"
          autoFocus
          placeholder="Enter route to market"
        />
      )
    },
    {
      key: 'hq_location', name: 'HQ Location', editable: true, sortable: true, isDefault: true, renderEditCell: ({ row, column, onRowChange }: RenderEditCellProps<Row>) => (
        <div className="flex items-center gap-2 w-full">
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>
          <input
            type="text"
            value={row[column.key] || ''}
            onChange={e => onRowChange({ ...row, [column.key]: e.target.value })}
            className="w-full h-full px-2 py-1"
            autoFocus
            placeholder="Enter address..."
          />
        </div>
      )
    },
    {
      key: 'cmg', name: '3B Contact', editable: true, sortable: true, isDefault: true,
      renderCell: ({ row }: { row: Row }) => <ContactLabel value={row['cmg']} />,
      renderEditCell: (props: RenderEditCellProps<Row>) => <ContactDropdownEditCell {...props} />
    },
  ];

  // Add RouteToMarket and Priority columns after Buyer
  const routeToMarketColumn: MyColumn = {
    key: 'route_to_market',
    name: 'RouteToMarket',
    editable: true,
    sortable: true,
    renderEditCell: ({ row, column, onRowChange }) => (
      <input
        type="text"
        defaultValue={row[column.key] !== undefined ? String(row[column.key]) : ''}
        onChange={e => onRowChange({ ...row, [column.key]: e.target.value })}
        className="w-full h-full px-2 py-1"
        autoFocus
        placeholder="Enter route to market"
      />
    )
  };
  // Helper to get cell position
  function getCellPosition(rowIdx: number, colIdx: number) {
    if (!gridContainerRef.current) return { top: 0, left: 0, width: 200, openUpward: false, maxHeight: 220 };
    const cell = gridContainerRef.current.querySelector(
      `.rdg-row[aria-rowindex='${rowIdx + 2}'] > .rdg-cell[aria-colindex='${colIdx + 1}']`
    );
    if (!cell) return { top: 0, left: 0, width: 200, openUpward: false, maxHeight: 220 };
    const rect = (cell as HTMLElement).getBoundingClientRect();

    const menuHeight = 220;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    let openUpward = false;
    let maxHeight = menuHeight;

    if (spaceBelow >= menuHeight) {
      openUpward = false;
      maxHeight = menuHeight;
    } else if (spaceAbove >= menuHeight) {
      openUpward = true;
      maxHeight = menuHeight;
    } else if (spaceBelow >= spaceAbove) {
      openUpward = false;
      maxHeight = Math.max(spaceBelow, 80);
    } else {
      openUpward = true;
      maxHeight = Math.max(spaceAbove, 80);
    }

    let left = rect.left;
    const menuWidth = Math.max(rect.width, 200);

    // Simple viewport constraints - just keep dropdown within bounds
    if (left + menuWidth > window.innerWidth - 20) {
      left = window.innerWidth - menuWidth - 20;
    }
    if (left < 20) {
      left = 20;
    }

    let top = openUpward ? rect.top - 4 - maxHeight : rect.bottom + 4;
    if (top + maxHeight > window.innerHeight - 20) {
      top = window.innerHeight - maxHeight - 20;
    }
    if (top < 20) {
      top = 20;
    }

    const finalPosition = {
      top: top,
      left: left,
      width: rect.width,
      openUpward,
      maxHeight
    };


    return finalPosition;
  }


  // Sorting icon logic
  function getSortIcon(columnKey: string) {
    const sort = sortColumns.find((sc: any) => sc.columnKey === columnKey);
    if (!sort) return <FaSort style={{ marginLeft: 4, color: '#888' }} />;
    if (sort.direction === 'ASC') return <FaSortUp style={{ marginLeft: 4, color: '#2563eb' }} />;
    if (sort.direction === 'DESC') return <FaSortDown style={{ marginLeft: 4, color: '#2563eb' }} />;
    return <FaSort style={{ marginLeft: 4, color: '#888' }} />;
  }

  function handleSortClick(columnKey: string) {
    setSortColumns((prev: any[]) => {
      const existing = prev.find((sc: any) => sc.columnKey === columnKey);
      if (!existing) return [{ columnKey, direction: 'ASC' }];
      if (existing.direction === 'ASC') return [{ columnKey, direction: 'DESC' }];
      return [];
    });
  }

  // Render colored label for product status
  function ProductStatusLabel({ value }: { value: string }) {
    const selected = productStatusOptions.find(opt => opt.value === value);
    if (!selected) return <span className="text-slate-300 text-xs">—</span>;
    return (
      <div
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
        style={{ background: selected.bg, color: selected.color }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: selected.color, opacity: 0.7 }} />
        {selected.label}
      </div>
    );
  }

  // Helper to get custom styles for each option
  function getOptionStyle(option: { value: string }) {
    const found = productStatusOptions.find(opt => opt.value === option.value);
    return found
      ? { backgroundColor: found.bg, color: found.color, fontWeight: 500 }
      : {};
  }

  // Custom Option with icon, colored dot, and highlight
  const ModernOption = (props: any) => {
    const { data, isSelected, isFocused, innerProps } = props;
    const found = productStatusOptions.find(opt => opt.value === data.value);
    return (
      <components.Option {...props} innerProps={innerProps}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px',
          borderRadius: 8,
          cursor: 'pointer',
          background: isSelected ? (found?.bg || '#f3f4f6') : isFocused ? '#f3f4f6' : 'transparent',
          fontWeight: isSelected ? 700 : 400,
          color: found?.color,
          boxShadow: isSelected ? '0 2px 8px #0001' : undefined,
          transition: 'background 0.15s',
        }}>
          {/* Status icon */}
          <span style={{ fontSize: 18, width: 22, display: 'flex', justifyContent: 'center' }}>{statusIcons[data.value] || ''}</span>
          {/* Colored dot */}
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: found?.bg, border: `2px solid ${found?.color}`, display: 'inline-block' }}></span>
          {/* Label */}
          <span style={{ color: found?.color, fontWeight: isSelected ? 700 : 500 }}>{data.label}</span>
          {/* Checkmark if selected */}
          {isSelected && <span style={{ marginLeft: 'auto', color: found?.color, fontSize: 20 }}>&#10003;</span>}
        </div>
      </components.Option>
    );
  };

  // Custom SingleValue with icon and colored dot
  const ModernSingleValue = (props: any) => {
    const { data } = props;
    const found = productStatusOptions.find(opt => opt.value === data.value);
    return (
      <components.SingleValue {...props}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <span style={{ fontSize: 16, width: 18, display: 'flex', justifyContent: 'center' }}>{statusIcons[data.value] || ''}</span>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: found?.bg, border: `2px solid ${found?.color}`, display: 'inline-block' }}></span>
          <span style={{ color: found?.color }}>{data.label}</span>
        </div>
      </components.SingleValue>
    );
  };

  // Hide the search box
  const NoInput = () => null;

  // --- Product Status Dropdown Edit Cell ---
  function ProductStatusDropdownEditCell({ row, column, onRowChange }: RenderEditCellProps<Row>) {
    const value = row[column.key] || '';
    const options = productStatusOptions.map(opt => ({ value: opt.value, label: opt.label }));
    return (
      <Select
        autoFocus
        tabIndex={0}
        menuPortalTarget={typeof window !== 'undefined' ? document.body : null}
        styles={{
          menuPortal: base => ({ ...base, zIndex: 99999 }),
          menu: base => ({ ...base, zIndex: 99999, minWidth: 180, fontSize: 14, padding: 0 }),
          option: base => ({ ...base, padding: '2px 8px' }),
          control: base => ({ ...base, minHeight: 32, height: 32, fontSize: 14 }),
          valueContainer: base => ({ ...base, padding: '0 8px' }),
          indicatorsContainer: base => ({ ...base, height: 32 }),
          dropdownIndicator: base => ({ ...base, padding: 4 }),
          input: base => ({ ...base, margin: 0, padding: 0 }),
        }}
        value={options.find(opt => opt.value === value) || null}
        onChange={newValue => {
          onRowChange({ ...row, [column.key]: newValue ? newValue.value : '' });
        }}
        options={options}
        components={{ Option: ModernOption, SingleValue: ModernSingleValue, Input: NoInput }}
        isSearchable={false}
        placeholder={null}
      />
    );
  }

  // --- Priority Dropdown Edit Cell ---
  function PriorityDropdownEditCell({ row, column, onRowChange }: RenderEditCellProps<Row>) {
    const value = row[column.key] || '';
    const options = priorityOptions.map(opt => ({ value: opt.value, label: opt.label }));
    const [menuOpen, setMenuOpen] = React.useState(true);
    const selectRef = React.useRef<any>(null);

    React.useEffect(() => {
      setMenuOpen(true); // Open menu on mount
      if (selectRef.current) {
        selectRef.current.focus();
      }
    }, []);

    return (
      <Select
        ref={selectRef}
        autoFocus
        tabIndex={0}
        menuPortalTarget={typeof window !== 'undefined' ? document.body : null}
        styles={{
          menuPortal: base => ({ ...base, zIndex: 99999 }),
          menu: base => ({ ...base, zIndex: 99999, minWidth: 120, fontSize: 14, padding: 0 }),
          option: base => ({ ...base, padding: '2px 8px' }),
          control: base => ({ ...base, minHeight: 32, height: 32, fontSize: 14 }),
          valueContainer: base => ({ ...base, padding: '0 8px' }),
          indicatorsContainer: base => ({ ...base, height: 32 }),
          dropdownIndicator: base => ({ ...base, padding: 4 }),
          input: base => ({ ...base, margin: 0, padding: 0 }),
        }}
        value={options.find(opt => opt.value === value) || null}
        onChange={newValue => {
          onRowChange({ ...row, [column.key]: newValue ? newValue.value : '' });
          setMenuOpen(false); // Close menu after selection
        }}
        options={options}
        components={{ Option: PriorityOption, SingleValue: PrioritySingleValue, Input: NoInput }}
        isSearchable={false}
        placeholder={null}
        menuIsOpen={menuOpen}
        onBlur={() => setMenuOpen(false)}
      />
    );
  }

  // --- Contact Dropdown Edit Cell ---
  function ContactDropdownEditCell({ row, column, onRowChange }: RenderEditCellProps<Row>) {
    const value = row[column.key] || '';
    const options = contactOptions.map(opt => ({ value: opt.value, label: opt.label }));
    const [menuOpen, setMenuOpen] = React.useState(true);
    const selectRef = React.useRef<any>(null);

    React.useEffect(() => {
      setMenuOpen(true); // Open menu on mount
      if (selectRef.current) {
        selectRef.current.focus();
      }
    }, []);

    return (
      <Select
        ref={selectRef}
        autoFocus
        tabIndex={0}
        menuPortalTarget={typeof window !== 'undefined' ? document.body : null}
        styles={{
          menuPortal: base => ({ ...base, zIndex: 99999 }),
          menu: base => ({ ...base, zIndex: 99999, minWidth: 120, fontSize: 14, padding: 0 }),
          option: base => ({ ...base, padding: '2px 8px' }),
          control: base => ({ ...base, minHeight: 32, height: 32, fontSize: 14 }),
          valueContainer: base => ({ ...base, padding: '0 8px' }),
          indicatorsContainer: base => ({ ...base, height: 32 }),
          dropdownIndicator: base => ({ ...base, padding: 4 }),
          input: base => ({ ...base, margin: 0, padding: 0 }),
        }}
        value={options.find(opt => opt.value === value) || null}
        onChange={newValue => {
          onRowChange({ ...row, [column.key]: newValue ? newValue.value : '' });
          setMenuOpen(false); // Close menu after selection
        }}
        options={options}
        components={{ Option: ContactOption, SingleValue: ContactSingleValue, Input: NoInput }}
        isSearchable={false}
        placeholder={null}
        menuIsOpen={menuOpen}
        onBlur={() => setMenuOpen(false)}
      />
    );
  }

  // --- Column Mapping ---
  const currentData = getCurrentData();
  const editableColumns = (currentData?.columns.map((col: MyColumn, idx: number) => {
    if (col.key === 'priority') {
      return {
        ...col,
        editable: true,
        renderCell: ({ row }: { row: Row }) => <PriorityLabel value={row['priority']} />, // Only High/Medium/Low
        renderEditCell: (props: RenderEditCellProps<Row>) => <PriorityDropdownEditCell {...props} />, // Only High/Medium/Low
      };
    }
    if (col.isDefault !== true && col.key !== 'priority') {
      return {
        ...col,
        editable: true,
        renderCell: ({ row }: { row: Row }) => <ProductStatusLabel value={row[col.key]} />, // Product status options
        renderEditCell: (props: RenderEditCellProps<Row>) => <ProductStatusDropdownEditCell {...props} />,
      };
    }
    if (col.key === 'retail_price') {
      return {
        ...col,
        editable: true,
        renderCell: ({ row }: { row: Row }) => {
          const value = row['retail_price'];
          if (value === undefined || value === null || value === '') {
            return '';
          }
          const numValue = typeof value === 'string' ? parseFloat(value) : value;
          return isNaN(numValue) ? '' : `$${numValue.toFixed(2)}`;
        },
        renderEditCell: ({ row, column, onRowChange }: RenderEditCellProps<Row>) => (
          <div className="relative w-full h-full">
            <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-slate-500 z-10">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              defaultValue={row[column.key] !== undefined && row[column.key] !== null ? String(row[column.key]) : ''}
              onChange={e => {
                const value = e.target.value;
                if (value === '' || /^\d*\.?\d*$/.test(value)) {
                  onRowChange({ ...row, [column.key]: value === '' ? '' : parseFloat(value) });
                }
              }}
              className="w-full h-full pl-6 pr-2 py-1 border-none outline-none"
              autoFocus
              placeholder="0.00"
            />
          </div>
        ),
      };
    }
    if (col.key === 'hq_location') {
      return {
        ...col,
        editable: true,
        renderEditCell: ({ row, column, onRowChange }: RenderEditCellProps<Row>) => (
          <div className="flex items-center gap-2 w-full">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>
            <input
              type="text"
              value={row[column.key] || ''}
              onChange={e => onRowChange({ ...row, [column.key]: e.target.value })}
              className="w-full h-full px-2 py-1"
              autoFocus
              placeholder="Enter address..."
            />
          </div>
        ),
      };
    }
    if (col.key === 'cmg') {
      return {
        ...col,
        editable: true,
        renderCell: ({ row }: { row: Row }) => <ContactLabel value={row['cmg']} />,
        renderEditCell: (props: RenderEditCellProps<Row>) => <ContactDropdownEditCell {...props} />,
      };
    }
    if (col.key === 'store_count') {
      return {
        ...col,
        editable: true,
        renderEditCell: ({ row, column, onRowChange }: RenderEditCellProps<Row>) => (
          <input
            type="number"
            step="1"
            min="0"
            defaultValue={row[column.key] !== undefined ? String(row[column.key]) : ''}
            onChange={e => {
              const value = e.target.value;
              if (/^\d*$/.test(value)) {
                onRowChange({ ...row, [column.key]: value === '' ? '' : parseInt(value, 10) });
              }
            }}
            className="w-full h-full px-2 py-1"
            autoFocus
            placeholder="Enter store count (integer)"
          />
        ),
      };
    }
    // Default: fallback to text input
    return {
      ...col,
      editable: userRole === 'ADMIN' && col.key !== 'id' && col.key !== 'delete',
      renderEditCell: col.renderEditCell || (userRole === 'ADMIN' && col.key !== 'id' && col.key !== 'delete'
        ? ({ row, column, onRowChange }: RenderEditCellProps<Row>) => (
          <input
            defaultValue={row[column.key] !== undefined ? String(row[column.key]) : ''}
            onChange={e => onRowChange({ ...row, [column.key]: e.target.value })}
            className="w-full h-full px-2 py-1"
            autoFocus
          />
        )
        : undefined),
    };
  })) || [];

  // Insert a new first column for comments
  const commentColumn: MyColumn = {
    key: 'comments',
    name: '',
    width: 48,
    frozen: false,
    isDefault: true,
    renderHeaderCell: () => null,
    renderCell: ({ row }) => {
      if (row.isAddRow) return null;
      const commentCount = typeof row.id === 'number' ? (comments[selectedCategory]?.[row.id]?.length ?? 0) : 0;
      return (
        <div className="comments-col">
          <button
            onClick={e => {
              e.stopPropagation();
              setOpenCommentRowId(typeof row.id === 'number' ? row.id : null);
            }}
            title="View/Add Comments"
            style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}
          >
            <FaRegCommentDots />
            <span style={{ marginLeft: 2, fontSize: '0.85em', color: '#2563eb', fontWeight: 600 }}>
              {commentCount}
            </span>
          </button>
        </div>
      );
    },
  };

  let columnsWithDelete: MyColumn[] = [...editableColumns];
  // For ScoreCards, insert comment column and user-added columns after Customer
  if (selectedCategory && isScorecard(selectedCategory)) {
    const nameIdx = columnsWithDelete.findIndex(col => col.key === 'name');
    // Extract user-added columns (not isDefault)
    const userAddedCols = columnsWithDelete.filter(col => col.isDefault !== true && col.key !== 'comments' && col.key !== 'name');
    // Remove user-added columns from the array
    columnsWithDelete = columnsWithDelete.filter(col => col.isDefault === true || col.key === 'comments' || col.key === 'name');
    if (nameIdx !== -1) {
      columnsWithDelete = [
        ...columnsWithDelete.slice(0, nameIdx + 1),
        commentColumn,
        ...userAddedCols,
        ...columnsWithDelete.slice(nameIdx + 1)
      ];
    } else {
      columnsWithDelete = [commentColumn, ...userAddedCols, ...columnsWithDelete];
    }
  }

  // Build columnsWithDelete with details column for Retailers
  if (selectedCategory === 'Retailers') {
    columnsWithDelete = [
      ...columnsWithDelete,
      {
        key: 'delete',
        name: '',
        width: 50,
        frozen: false,
        renderHeaderCell: () => null,
        renderCell: ({ row }) => (
          <button
            onClick={() => setConfirmDelete({ type: 'row', id: row.id })}
            className="text-slate-400 hover:text-red-600"
            style={{ fontSize: 14 }}
            title="Delete row"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
          </button>
        ),
      }
    ];
  } else {
    columnsWithDelete = [
      ...columnsWithDelete,
      {
        key: 'delete',
        name: '',
        width: 50,
        frozen: false,
        renderHeaderCell: () => null,
        renderCell: ({ row }) => (
          <button
            onClick={() => setConfirmDelete({ type: 'row', id: row.id })}
            className="text-slate-400 hover:text-red-600"
            style={{ fontSize: 14 }}
            title="Delete row"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
          </button>
        ),
      }
    ];
  }

  // After building columnsWithDelete, remove any column with key 'delete' before adding the delete_row column
  columnsWithDelete = columnsWithDelete.filter(col => col.key !== 'delete');
  columnsWithDelete = [
    ...columnsWithDelete,
    {
      key: '_delete_row',
      name: ' ',
      width: 50,
      frozen: false,
      renderHeaderCell: () => <span style={{ visibility: 'hidden' }}>-</span>,
      renderCell: ({ row }) => (
        <button
          onClick={() => setConfirmDelete({ type: 'row', id: row.id })}
          className="text-slate-300 hover:text-red-500 transition-colors"
          style={{ fontSize: 14 }}
          title="Delete row"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
        </button>
      ),
      renderEditCell: () => null,
    }
  ];

  // Keep ref in sync with latest columns for auto-focus effect
  columnsWithDeleteRef.current = columnsWithDelete;

  // Debug: log columnsWithDelete to check editable property
  //   key: col.key,
  //   name: col.name,
  //   editable: col.editable
  // })));

  // Sorting logic
  function getSortedRows(): Row[] {
    if (sortColumns.length === 0) return getCurrentData()?.rows || [];
    const [{ columnKey, direction }] = sortColumns;
    const sortedRows = [...(getCurrentData()?.rows || [])].sort((a, b) => {
      const aValue = a[columnKey as keyof Row];
      const bValue = b[columnKey as keyof Row];
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      if (aValue === bValue) return 0;
      return (aValue > bValue ? 1 : -1) * (direction === 'ASC' ? 1 : -1);
    });
    return sortedRows;
  }

  // In main grid columnsWithDelete, add delete button for product columns only (between Customer and Retail Price)
  columnsWithDelete = columnsWithDelete.map((col, idx) => {
    // Always use special logic for 'Customer' column
    if (col.key === 'name') {
      return {
        ...col,
        renderCell: (props: { row: Row }) => {
          if (props.row.isAddRow) return null;
          const isExpanded = expandedRowId === props.row.id;
          // Add highlight style to the row container if expanded
          return (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: isExpanded ? '#f0f7ff' : undefined,
                borderRadius: isExpanded ? 6 : undefined,
                padding: isExpanded ? '2px 0' : undefined
              }}
            >
              <button
                onClick={e => {
                  e.stopPropagation();
                  if (!subGrids[props.row.id]) {
                    handleAddSubGrid(props.row.id);
                  } else {
                    handleToggleSubGrid(props.row.id);
                  }
                }}
                title={isExpanded ? 'Collapse Subgrid' : 'Expand Subgrid'}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: isExpanded ? '#3b82f6' : '#94a3b8',
                  padding: 0,
                  marginRight: 2
                }}
              >
                <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </button>
              <span style={{ fontWeight: isExpanded ? 600 : 400 }}>{props.row.name}</span>
            </div>
          );
        }
      };
    }
    // User-added columns: allow renaming (but not for 'name' column)
    const isUserAdded = col.isDefault === false && col.key !== 'priority' && col.key !== '_delete_row' && col.key !== 'comments' && col.key !== 'name';
    if (isUserAdded) {
      return {
        ...col,
        renderHeaderCell: (props?: any) => (
          <EditableColumnHeader
            col={col}
            idx={idx}
            isUserAdded={true}
            onNameChange={newName => handleColumnNameChange(idx, newName)}
            sortIcon={getSortIcon ? getSortIcon(col.key) : null}
            onSort={() => handleSortClick(col.key)}
            onDeleteColumn={(key) => setConfirmDelete({ type: 'column', id: key })}
          />
        )
      };
    }
    return col;
  });

  // PriorityLabel and PriorityDropdownEditCell
  function PriorityLabel({ value }: { value: string }) {
    const selected = priorityOptions.find(opt => opt.value === value);
    if (!selected) return <span className="text-slate-300 text-xs">—</span>;
    return (
      <div
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
        style={{ background: selected.bg, color: selected.color }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: selected.color, opacity: 0.7 }} />
        {selected.label}
      </div>
    );
  }

  // 3. Add ContactLabel and ContactDropdownEditCell
  function ContactLabel({ value }: { value: string }) {
    const selected = contactOptions.find(opt => opt.value === value);
    if (!selected) return <span className="text-slate-300 text-xs">—</span>;
    return (
      <div
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
        style={{ background: selected.bg, color: selected.color }}
      >
        {selected.label}
      </div>
    );
  }

  // Priority dropdown custom components
  const PriorityOption = (props: any) => {
    const { data, isSelected, isFocused, innerProps } = props;
    const found = priorityOptions.find(opt => opt.value === data.value);
    return (
      <components.Option {...props} innerProps={innerProps}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px',
          borderRadius: 8,
          cursor: 'pointer',
          background: isSelected ? (found?.bg || '#f3f4f6') : isFocused ? '#f3f4f6' : 'transparent',
          fontWeight: isSelected ? 700 : 400,
          color: found?.color,
          boxShadow: isSelected ? '0 2px 8px #0001' : undefined,
          transition: 'background 0.15s',
        }}>
          <span style={{ color: found?.color, fontWeight: isSelected ? 700 : 500 }}>{data.label}</span>
          {isSelected && <span style={{ marginLeft: 'auto', color: found?.color, fontSize: 20 }}>&#10003;</span>}
        </div>
      </components.Option>
    );
  };
  const PrioritySingleValue = (props: any) => {
    const { data } = props;
    const found = priorityOptions.find(opt => opt.value === data.value);
    return (
      <components.SingleValue {...props}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <span style={{ color: found?.color, fontWeight: 700 }}>{data.label}</span>
        </div>
      </components.SingleValue>
    );
  };

  // Contact dropdown custom components
  const ContactOption = (props: any) => {
    const { data, isSelected, isFocused, innerProps } = props;
    const found = contactOptions.find(opt => opt.value === data.value);
    return (
      <components.Option {...props} innerProps={innerProps}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px',
          borderRadius: 8,
          cursor: 'pointer',
          background: isSelected ? (found?.bg || '#f3f4f6') : isFocused ? '#f3f4f6' : 'transparent',
          fontWeight: isSelected ? 700 : 400,
          color: found?.color,
          boxShadow: isSelected ? '0 2px 8px #0001' : undefined,
          transition: 'background 0.15s',
        }}>
          <span style={{ color: found?.color, fontWeight: isSelected ? 700 : 500 }}>{data.label}</span>
          {isSelected && <span style={{ marginLeft: 'auto', color: found?.color, fontSize: 20 }}>&#10003;</span>}
        </div>
      </components.Option>
    );
  };
  const ContactSingleValue = (props: any) => {
    const { data } = props;
    const found = contactOptions.find(opt => opt.value === data.value);
    return (
      <components.SingleValue {...props}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <span style={{ color: found?.color, fontWeight: 700 }}>{data.label}</span>
        </div>
      </components.SingleValue>
    );
  };



  columnsWithDeleteRef.current = columnsWithDelete;

  return { columnsWithDelete, retailersColumns, getSortedRows, getSortIcon, handleSortClick, getCellPosition };
}
