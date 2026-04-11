import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DataGrid, type Column, type RowsChangeData, type SortColumn, type RenderEditCellProps } from 'react-data-grid';
import { FaSort, FaSortUp, FaSortDown, FaRegCommentDots, FaInfoCircle, FaPlus, FaEdit, FaTrash } from 'react-icons/fa';
import ReactDOM from 'react-dom';
import 'react-data-grid/lib/styles.css';

import { useRouter } from 'next/navigation';
import Select, { components } from 'react-select';
import DatePickerOrig from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format, isToday } from 'date-fns';
import { Toaster, toast } from 'sonner';
import { useScoreCardAutoSave } from '../../hooks/useAutoSave';
import { SaveStatus, SaveStatusCompact } from '../ui/SaveStatus';
import MasterScorecard from './MasterScorecard';

// ─── Extracted components ────────────────────────────────────────────────────
import StatusPickerCard from './StatusPickerCard';
import PriorityPickerCard from './PriorityPickerCard';
import ContactPickerCard from './ContactPickerCard';
import CategoryReviewDatePickerCard from './CategoryReviewDatePickerCard';
import EditableColumnHeader from './EditableColumnHeader';
import CommentDrawer from './CommentDrawer';
import ScorecardSidebar from './ScorecardSidebar';
import GridToolbar from './GridToolbar';
import {
  AddColumnModal,
  CreateScoreCardModal,
  EditScoreCardModal,
  DeleteConfirmModal,
  DeleteCommentModal,
  SaveTemplateModal,
  ImportTemplateModal,
  ExportExcelModal,
  ContactCardModal,
} from './GridModals';
import { productStatusOptions, statusIcons, priorityOptions, contactOptions } from './constants';
import type { PickerState } from './types';

interface Row {
  id: number | string;
  name?: string;
  email?: string;
  role?: string;
  storeName?: string;
  notes?: string;
  address?: string;
  isAddRow?: boolean;
  isSubRow?: boolean;
  parentId?: number | string;
  [key: string]: any;
}

type MyColumn = Column<Row> & { locked?: boolean, isDefault?: boolean };

interface ScoreCard {
  id: string;
  name: string;
  columns: MyColumn[];
  rows: Row[];
  createdAt: Date;
  lastModified?: Date;
}

interface AdminDataGridProps {
  userRole: string;
}

const DatePicker = DatePickerOrig as unknown as React.FC<any>;

// --- Robust prevention of save on scorecard switch ---
// Move auto-save logic into a wrapper component keyed by editingScoreCard?.id
function ScorecardAutoSaveWrapper({ scorecard, onSaveSuccess, onSaveError }: { scorecard: any, onSaveSuccess: any, onSaveError: (error: any) => void }) {
  const currentScoreCardData = React.useMemo(() => {
    if (!scorecard) return null;
    return {
      id: scorecard.id,
      name: scorecard.name,
      columns: scorecard.columns,
      rows: scorecard.rows,
      data: scorecard,
    };
  }, [scorecard?.id, scorecard?.name, scorecard?.columns, scorecard?.rows]);

  const {
    status,
    lastSaved,
    error,
    forceSave,
    isOnline,
    hasUnsavedChanges,
  } = useScoreCardAutoSave(
    scorecard?.id || null,
    currentScoreCardData,
    {
      debounceMs: 3000,
      enableOfflineBackup: true,
      onSaveSuccess,
      onSaveError,
    }
  );
  // Expose these to parent via a ref or context if needed
  return null;
}

export default function AdminDataGrid({ userRole }: AdminDataGridProps) {
  const router = useRouter();

  // Remove/hide Retailers from dataCategories
  const dataCategories: string[] = [];

  // Remove/hide Retailers from dataSets
  const dataSets: Record<string, { section: string; columns: MyColumn[]; rows: Row[] }> = {};

  // All logic for columns, rows, advanced commenting, and drawer should now be used only for ScoreCards
  // When creating a new ScoreCard, use the previous retailersColumns as the template for columns
  // All grid, row/column management, and advanced commenting drawer logic should be available only for ScoreCards

  // ContactCardModalButton and handleContactCardSave will be defined after all state and helpers

  // Now define the Retailers columns so the above are in scope
  const defaultColumnKeys = ['name', 'retail_price', 'buyer', 'store_count', 'hq_location', 'cmg'];
  const retailersColumns: MyColumn[] = [
    {
      key: 'name', name: 'Retailer Name', editable: true, sortable: true, isDefault: true, frozen: true, width: 220,
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
        // Debug logging
        console.log('Retail price value:', value, 'type:', typeof value);

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
        return value ? format(new Date(value), 'MM/dd/yyyy') : '';
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
      key: 'store_count', name: 'Store Count', editable: true, sortable: true, isDefault: true, renderEditCell: ({ row, column, onRowChange }: RenderEditCellProps<Row>) => (
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
      )
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

  // Log the react-data-grid version for debugging
  // @ts-ignore
  // console.log('react-data-grid version:', DataGrid.version);

  // ScoreCard state
  const [scorecards, setScorecards] = useState<ScoreCard[]>(() => loadScoreCardsFromStorage());
  const [showCreateScoreCardModal, setShowCreateScoreCardModal] = useState(false);
  const [newScoreCardName, setNewScoreCardName] = useState('');
  const [editingScoreCard, setEditingScoreCard] = useState<ScoreCard | null>(null);
  const [showEditScoreCardModal, setShowEditScoreCardModal] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);



  // Store both columns and rows per category
  const [categoryData, setCategoryData] = useState(() => {
    const initial: Record<string, { columns: MyColumn[]; rows: Row[] }> = {};
    for (const cat of dataCategories) {
      let rows = [...dataSets[cat].rows];
      if (cat === 'Retailers') {
        const stored = loadRetailersFromStorage();
        if (stored) rows = stored;
      }
      initial[cat] = {
        columns: dataSets[cat].columns.map(col => ({
          ...col,
          renderEditCell: col.renderEditCell || (col.editable ? ({ row, column, onRowChange }: RenderEditCellProps<Row>) => (
            <input
              defaultValue={row[column.key] !== undefined ? String(row[column.key]) : ''}
              onChange={e => onRowChange({ ...row, [column.key]: e.target.value })}
              className="w-full h-full px-2 py-1"
              autoFocus
            />
          ) : undefined)
        })),
        rows
      };
    }
    // console.log('Initial categoryData:', initial);
    return initial;
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('master-scorecard');
  const [lastSelectedScorecardId, setLastSelectedScorecardId] = useState<string | null>(null);
  const [editColumns, setEditColumns] = useState(false);
  const [rowEditEnabled, setRowEditEnabled] = useState(true);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>([]);
  const [showAddColModal, setShowAddColModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [colError, setColError] = useState('');

  // Comment modal state (now for ScoreCards only)
  const [openCommentRowId, setOpenCommentRowId] = useState<number | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [user, setUser] = useState<any>(null);
  // Comments are now stored in database - structure: { scorecardId: { rowId: Comment[] } }
  const [comments, setComments] = useState<Record<string, Record<number, any[]>>>({});

  // Add state and modal for the advanced retailer drawer if not present
  const [openRetailerDrawer, setOpenRetailerDrawer] = useState<number | null>(null);

  // Added for comment editing
  const [editCommentIdx, setEditCommentIdx] = useState<number | null>(null);
  const [editCommentText, setEditCommentText] = useState('');

  // Add state for contact card modal
  const [openContactModal, setOpenContactModal] = useState<{ rowId: number; key: string; value: string } | null>(null);

  // Add a ref for DataGrid
  const gridRef = useRef<any>(null);
  // Ref to hold current rendered columns so auto-focus effect can read them
  const columnsWithDeleteRef = useRef<MyColumn[]>([]);
  // Track new row id to auto-focus its name cell after creation
  const [pendingFocusRowId, setPendingFocusRowId] = useState<number | null>(null);

  // Add state for the open status picker
  const [statusPicker, setStatusPicker] = useState<PickerState | null>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Add a ref to track scroll position
  const scrollPositionRef = useRef<{ left: number; top: number } | null>(null);

  // Add a ref to track if we should prevent scroll
  const preventScrollRef = useRef(false);

  // Add a ref to track if dropdown is open
  const dropdownOpenRef = useRef(false);

  // Add comprehensive scroll prevention effect
  React.useEffect(() => {
    const gridElement = gridContainerRef.current;
    if (!gridElement) return;

    const handleScroll = (e: Event) => {
      if (preventScrollRef.current && scrollPositionRef.current) {
        e.preventDefault();
        e.stopPropagation();
        // Immediately restore scroll position
        gridElement.scrollLeft = scrollPositionRef.current.left;
        gridElement.scrollTop = scrollPositionRef.current.top;
        return false;
      }
    };

    // Add scroll event listener
    gridElement.addEventListener('scroll', handleScroll, { passive: false });

    // Add MutationObserver to watch for scroll changes
    const observer = new MutationObserver(() => {
      if (preventScrollRef.current && scrollPositionRef.current) {
        // If scroll position changed, restore it
        if (gridElement.scrollLeft !== scrollPositionRef.current.left ||
          gridElement.scrollTop !== scrollPositionRef.current.top) {
          gridElement.scrollLeft = scrollPositionRef.current.left;
          gridElement.scrollTop = scrollPositionRef.current.top;
        }
      }
    });

    observer.observe(gridElement, {
      attributes: true,
      attributeFilter: ['style'],
      subtree: true
    });

    // Add focus prevention
    const handleFocus = (e: Event) => {
      if (preventScrollRef.current) {
        e.preventDefault();
        e.stopPropagation();
        // Blur any focused elements
        const activeElement = document.activeElement as HTMLElement;
        if (activeElement && activeElement.blur) {
          activeElement.blur();
        }
        return false;
      }
    };

    // Add focus event listeners to prevent focus-triggered scroll
    gridElement.addEventListener('focusin', handleFocus, { passive: false });
    gridElement.addEventListener('focusout', handleFocus, { passive: false });

    // Add wheel event prevention
    const handleWheel = (e: Event) => {
      if (preventScrollRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    gridElement.addEventListener('wheel', handleWheel, { passive: false });

    // Add keydown prevention for arrow keys and other navigation
    const handleKeydown = (e: KeyboardEvent) => {
      if (preventScrollRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    gridElement.addEventListener('keydown', handleKeydown, { passive: false });

    return () => {
      gridElement.removeEventListener('scroll', handleScroll);
      gridElement.removeEventListener('focusin', handleFocus);
      gridElement.removeEventListener('focusout', handleFocus);
      gridElement.removeEventListener('wheel', handleWheel);
      gridElement.removeEventListener('keydown', handleKeydown);
      observer.disconnect();
    };
  }, []);



  // Add this to the main component state
  const [contactModalData, setContactModalData] = useState<{ name: string; telephone: string; address: string; notes: string }>({ name: '', telephone: '', address: '', notes: '' });

  // Add state to track expanded rows
  const [expandedRows, setExpandedRows] = useState<Record<number | string, boolean>>({});

  // Subgrid state: per parent row, store columns and rows only
  const [subGrids, setSubGrids] = useState<{ [parentId: string]: { columns: MyColumn[]; rows: Row[] } }>(() => {
    // Lazy initialization to prevent heavy operations on mount
    try {
      const scorecards = JSON.parse(localStorage.getItem('scorecards') || '[]');
      const initial: { [parentId: string]: { columns: MyColumn[]; rows: Row[] } } = {};

      // Only process if scorecards is an array and not too large
      if (Array.isArray(scorecards) && scorecards.length < 100) {
        for (const sc of scorecards) {
          if (sc.rows && Array.isArray(sc.rows)) {
            for (const row of sc.rows) {
              if (row.subgrid && row.subgrid.columns && row.subgrid.rows) {
                initial[row.id] = { columns: row.subgrid.columns, rows: row.subgrid.rows };
              }
            }
          }
        }
      }
      return initial;
    } catch (error) {
      console.warn('Failed to initialize subgrids from localStorage:', error);
      return {};
    }
  });
  // Only one expanded row at a time
  const [expandedRowId, setExpandedRowId] = useState<string | number | null>(null);
  // Reset expandedRowId when switching scorecards
  useEffect(() => {
    setExpandedRowId(null);
  }, [selectedCategory]);

  // Add state for custom delete confirmation modal
  const [confirmDelete, setConfirmDelete] = useState<null | { type: 'row' | 'column' | 'scorecard' | 'template' | 'subgrid-template', id: string | number, name?: string }>(null);

  // 1. Add state for Priority picker
  const [priorityPicker, setPriorityPicker] = React.useState<PickerState | null>(null);

  // 2. Add state for Contact picker
  const [contactPicker, setContactPicker] = React.useState<PickerState | null>(null);

  // Debug: Track contactPicker state changes
  React.useEffect(() => {
    // console.log('🎯 DEBUG: contactPicker state changed to:', contactPicker);
  }, [contactPicker]);

  // 3. Add state for CategoryReviewDatePicker
  const [categoryReviewDatePicker, setCategoryReviewDatePicker] = React.useState<PickerState | null>(null);

  // Track dropdown state changes for auto-save prevention
  React.useEffect(() => {
    const hasDropdownOpen = contactPicker || statusPicker || priorityPicker || categoryReviewDatePicker;
    dropdownOpenRef.current = !!hasDropdownOpen;

    if (hasDropdownOpen) {
      // console.log('🎯 DEBUG: Dropdown opened, preventing auto-save');

      // Disable grid interaction when dropdown is open
      const gridElement = gridContainerRef.current;
      if (gridElement) {
        gridElement.style.pointerEvents = 'none';
        gridElement.style.userSelect = 'none';
      }
    } else {
      // console.log('🎯 DEBUG: Dropdown closed, allowing auto-save');

      // Re-enable grid interaction when dropdown is closed
      const gridElement = gridContainerRef.current;
      if (gridElement) {
        gridElement.style.pointerEvents = 'auto';
        gridElement.style.userSelect = 'auto';
      }
    }
  }, [contactPicker, statusPicker, priorityPicker, categoryReviewDatePicker]);

  // Debug: Track dropdown states and prevent scroll
  React.useEffect(() => {
    // Set prevent scroll flag when any dropdown is open
    const hasOpenDropdown = !!statusPicker || !!priorityPicker || !!contactPicker || !!categoryReviewDatePicker;
    preventScrollRef.current = hasOpenDropdown;

    // If dropdown is closing, restore scroll position
    if (!hasOpenDropdown && scrollPositionRef.current && gridContainerRef.current) {
      const gridElement = gridContainerRef.current;
      gridElement.scrollLeft = scrollPositionRef.current.left;
      gridElement.scrollTop = scrollPositionRef.current.top;
    }
  }, [statusPicker, priorityPicker, contactPicker, categoryReviewDatePicker]);

  // Template state and helpers
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showImportTemplateModal, setShowImportTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [includeRowsInTemplate, setIncludeRowsInTemplate] = useState(true);
  const [selectedTemplateName, setSelectedTemplateName] = useState('');
  const [importWithRows, setImportWithRows] = useState(true);
  const [templateError, setTemplateError] = useState('');

  // Helper function to check if a category is a scorecard
  const isScorecard = (categoryId: string) => {
    return scorecards.some(sc => sc.id === categoryId);
  };

  // --- Robust prevention of save on scorecard switch ---
  // Track last saved serialized data for each scorecard
  const lastSavedDataByIdRef = React.useRef<{ [id: string]: string }>({});

  // --- Robust auto-save logic in main component ---
  const lastScorecardIdRef = React.useRef<string | null>(null);
  const skipNextSaveRef = React.useRef(false);
  React.useEffect(() => {
    if (editingScoreCard?.id !== lastScorecardIdRef.current) {
      skipNextSaveRef.current = true;
      lastScorecardIdRef.current = editingScoreCard?.id || null;
    }
  }, [editingScoreCard?.id]);

  const currentScoreCardData = React.useMemo(() => {
    if (!editingScoreCard) return null;

    // If dropdown is open, return null to prevent auto-save
    if (dropdownOpenRef.current) {
      // console.log('🎯 DEBUG: Preventing auto-save due to open dropdown');
      return null;
    }

    return {
      id: editingScoreCard.id,
      name: editingScoreCard.name,
      columns: editingScoreCard.columns,
      rows: editingScoreCard.rows,
      data: editingScoreCard,
    };
  }, [editingScoreCard?.id, editingScoreCard?.name, editingScoreCard?.columns, editingScoreCard?.rows]);

  const {
    status: saveStatus,
    lastSaved,
    error: saveError,
    forceSave,
    isOnline,
    hasUnsavedChanges,
  } = useScoreCardAutoSave(
    editingScoreCard?.id || null,
    currentScoreCardData,
    {
      debounceMs: 3000,
      enableOfflineBackup: true,
      onSaveSuccess: (savedData?: any) => {
        if (savedData && savedData.id && editingScoreCard && editingScoreCard.id !== savedData.id) {
          const oldId = editingScoreCard.id;
          const newId = savedData.id;
          setScorecards(prev => prev.map(sc =>
            sc.id === oldId ? { ...sc, id: newId, ...savedData } : sc
          ));
          if (selectedCategory === oldId) {
            setSelectedCategory(newId);
          }
          setEditingScoreCard(prev => prev ? { ...prev, id: newId } : null);
        }
        // No toast needed
      },
      onSaveError: (error) => {
        // No toast needed
      },
    },
    editingScoreCard?.id, // resetKey
    editingScoreCard // resetValue
  );

  // Warn user if they try to close tab/navigate away with unsaved changes
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Add scroll position preservation effect (ChatGPT's solution)
  React.useEffect(() => {
    const gridElement = gridContainerRef.current;
    if (!gridElement) return;

    // Save scroll position before any data changes
    const saveScrollPosition = () => {
      if (gridElement && !dropdownOpenRef.current) {
        scrollPositionRef.current = {
          left: gridElement.scrollLeft,
          top: gridElement.scrollTop
        };
      }
    };

    // Restore scroll position after data changes
    const restoreScrollPosition = () => {
      if (gridElement && scrollPositionRef.current && !dropdownOpenRef.current) {
        // Use requestAnimationFrame to ensure DOM is updated
        requestAnimationFrame(() => {
          gridElement.scrollLeft = scrollPositionRef.current!.left;
          gridElement.scrollTop = scrollPositionRef.current!.top;
        });
      }
    };

    // Add scroll event listener to save position
    gridElement.addEventListener('scroll', saveScrollPosition);

    // Restore scroll position after data changes
    restoreScrollPosition();

    return () => {
      gridElement.removeEventListener('scroll', saveScrollPosition);
    };
  }, [currentScoreCardData]); // Trigger when data changes

  // Add comprehensive scroll prevention when dropdown is open
  useEffect(() => {
    const gridElement = gridContainerRef.current;
    if (!gridElement) return;

    const isDropdownOpen = contactPicker || statusPicker || priorityPicker || categoryReviewDatePicker;

    if (isDropdownOpen) {
      // Store current scroll position
      scrollPositionRef.current = {
        left: gridElement.scrollLeft,
        top: gridElement.scrollTop
      };

      // Prevent any scroll events
      const preventScroll = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      };

      // Prevent focus-triggered scroll
      const preventFocus = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      };

      // Add event listeners to prevent scroll
      gridElement.addEventListener('scroll', preventScroll, { passive: false });
      gridElement.addEventListener('focus', preventFocus, { passive: false });
      gridElement.addEventListener('focusin', preventFocus, { passive: false });

      // Also prevent scroll on the window/document
      window.addEventListener('scroll', preventScroll, { passive: false });
      document.addEventListener('scroll', preventScroll, { passive: false });

      return () => {
        gridElement.removeEventListener('scroll', preventScroll);
        gridElement.removeEventListener('focus', preventFocus);
        gridElement.removeEventListener('focusin', preventFocus);
        window.removeEventListener('scroll', preventScroll);
        document.removeEventListener('scroll', preventScroll);
      };
    } else {
      // Restore scroll position when dropdown closes
      if (scrollPositionRef.current) {
        setTimeout(() => {
          gridElement.scrollLeft = scrollPositionRef.current!.left;
          gridElement.scrollTop = scrollPositionRef.current!.top;
        }, 0);
      }
    }
  }, [contactPicker, statusPicker, priorityPicker, categoryReviewDatePicker]);

  // ROCK SOLID SOLUTION: Monkey patch scrollIntoView when dropdown is open
  useEffect(() => {
    const isDropdownOpen = contactPicker || statusPicker || priorityPicker || categoryReviewDatePicker;

    if (isDropdownOpen) {
      // Store original scrollIntoView
      const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

      // Override scrollIntoView to do nothing
      HTMLElement.prototype.scrollIntoView = function () {
        // Do nothing - prevent any scrollIntoView calls
        return;
      };

      return () => {
        // Restore original scrollIntoView when dropdown closes
        HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      };
    }
  }, [contactPicker, statusPicker, priorityPicker, categoryReviewDatePicker]);

  // ROCK SOLID SOLUTION: Restore scroll on next animation frame after dropdown opens
  useEffect(() => {
    const isDropdownOpen = contactPicker || statusPicker || priorityPicker || categoryReviewDatePicker;

    if (isDropdownOpen && gridContainerRef.current && scrollPositionRef.current) {
      // After dropdown opens, forcibly restore scroll on next animation frame
      requestAnimationFrame(() => {
        const grid = gridContainerRef.current;
        if (grid && scrollPositionRef.current) {
          grid.scrollLeft = scrollPositionRef.current.left;
          grid.scrollTop = scrollPositionRef.current.top;
        }
      });
    }
  }, [contactPicker, statusPicker, priorityPicker, categoryReviewDatePicker]);

  // ROCK SOLID SOLUTION: Restore scroll after any data changes
  useEffect(() => {
    if (!dropdownOpenRef.current && gridContainerRef.current && scrollPositionRef.current) {
      requestAnimationFrame(() => {
        const grid = gridContainerRef.current;
        if (grid && scrollPositionRef.current) {
          grid.scrollLeft = scrollPositionRef.current.left;
          grid.scrollTop = scrollPositionRef.current.top;
        }
      });
    }
  }, [currentScoreCardData]);

  // ROCK SOLID SOLUTION: Immediately blur any focused elements when dropdown opens
  useEffect(() => {
    const isDropdownOpen = contactPicker || statusPicker || priorityPicker || categoryReviewDatePicker;

    if (isDropdownOpen) {
      // Immediately blur any focused elements to prevent focus-triggered scroll
      setTimeout(() => {
        const activeElement = document.activeElement as HTMLElement;
        if (activeElement && activeElement.blur) {
          activeElement.blur();
        }
      }, 0);
    }
  }, [contactPicker, statusPicker, priorityPicker, categoryReviewDatePicker]);

  // ROCK SOLID SOLUTION: Lock the Grid's Internal Scroll Position Constantly While Dropdown is Open
  useEffect(() => {
    let raf: number;

    function keepScroll() {
      if (dropdownOpenRef.current && gridContainerRef.current && scrollPositionRef.current) {
        gridContainerRef.current.scrollTop = scrollPositionRef.current.top;
        gridContainerRef.current.scrollLeft = scrollPositionRef.current.left;
        raf = requestAnimationFrame(keepScroll);
      }
    }

    if (dropdownOpenRef.current) {
      keepScroll();
    }

    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
  }, [contactPicker, statusPicker, priorityPicker, categoryReviewDatePicker]);

  // NUCLEAR OPTION: MutationObserver to detect and revert any scroll changes
  useEffect(() => {
    const isDropdownOpen = contactPicker || statusPicker || priorityPicker || categoryReviewDatePicker;

    if (isDropdownOpen && gridContainerRef.current && scrollPositionRef.current) {
      const gridElement = gridContainerRef.current;
      const originalScrollTop = scrollPositionRef.current.top;
      const originalScrollLeft = scrollPositionRef.current.left;

      // Create a MutationObserver to watch for any scroll changes
      const observer = new MutationObserver((mutations) => {
        if (gridElement && scrollPositionRef.current) {
          // If scroll position changed, immediately restore it
          if (gridElement.scrollTop !== originalScrollTop || gridElement.scrollLeft !== originalScrollLeft) {
            gridElement.scrollTop = originalScrollTop;
            gridElement.scrollLeft = originalScrollLeft;
          }
        }
      });

      // Observe the grid element for any attribute changes
      observer.observe(gridElement, {
        attributes: true,
        attributeFilter: ['style', 'class'],
        subtree: true,
        childList: true
      });

      return () => {
        observer.disconnect();
      };
    }
  }, [contactPicker, statusPicker, priorityPicker, categoryReviewDatePicker]);

  // NUCLEAR OPTION: Scroll event listener to immediately revert any scroll changes
  useEffect(() => {
    const isDropdownOpen = contactPicker || statusPicker || priorityPicker || categoryReviewDatePicker;

    if (isDropdownOpen && gridContainerRef.current && scrollPositionRef.current) {
      const gridElement = gridContainerRef.current;
      const originalScrollTop = scrollPositionRef.current.top;
      const originalScrollLeft = scrollPositionRef.current.left;

      const handleScroll = () => {
        if (gridElement && scrollPositionRef.current) {
          // If scroll position changed, immediately restore it
          if (gridElement.scrollTop !== originalScrollTop || gridElement.scrollLeft !== originalScrollLeft) {
            gridElement.scrollTop = originalScrollTop;
            gridElement.scrollLeft = originalScrollLeft;
          }
        }
      };

      // Add scroll event listener
      gridElement.addEventListener('scroll', handleScroll, { passive: false });

      return () => {
        gridElement.removeEventListener('scroll', handleScroll);
      };
    }
  }, [contactPicker, statusPicker, priorityPicker, categoryReviewDatePicker]);

  // Patch: skip first save after scorecard switch
  React.useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    // No-op: the useScoreCardAutoSave hook already handles debounced save on data change
  }, [currentScoreCardData]);

  // Auto-focus the name cell after a new row is added
  useEffect(() => {
    if (!pendingFocusRowId || !editingScoreCard) return;
    const rowIdx = editingScoreCard.rows.findIndex(r => r.id === pendingFocusRowId);
    if (rowIdx === -1) return;
    const nameColIdx = columnsWithDeleteRef.current.findIndex(col => col.key === 'name');
    if (nameColIdx === -1) return;
    setPendingFocusRowId(null);
    requestAnimationFrame(() => {
      gridRef.current?.selectCell({ rowIdx, idx: nameColIdx });
    });
  }, [pendingFocusRowId, editingScoreCard?.rows]);

  // Replace localStorage template logic with API calls
  // Templates state
  const [templates, setTemplates] = useState<any[]>([]);

  // Load templates from API
  async function fetchTemplates() {
    try {
      // console.log('🔍 Fetching templates from API...');
      const res = await fetch('/api/templates', { credentials: 'include' });
      if (!res.ok) {
        console.error('❌ Failed to fetch templates:', res.status, res.statusText);
        throw new Error('Failed to load templates');
      }
      const data = await res.json();
      // console.log('✅ Templates loaded:', data.length, 'templates found');
      setTemplates(data);
    } catch (e) {
      console.error('❌ Error fetching templates:', e);
      setTemplates([]);
    }
  }
  useEffect(() => { fetchTemplates(); }, []);

  // Save template to API
  async function saveTemplateToAPI(template: { name: string; columns: any; rows?: any }) {
    // console.log('💾 Saving template to API:', template.name);
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(template),
    });
    if (!res.ok) {
      console.error('❌ Failed to save template:', res.status, res.statusText);
      throw new Error('Failed to save template');
    }
    const data = await res.json();
    // console.log('✅ Template saved successfully:', data);
    // Refetch templates to ensure consistency
    await fetchTemplates();
    return data;
  }

  // Delete template from API
  async function deleteTemplateFromAPI(id: string) {
    // console.log('🗑️ Deleting template with ID:', id);
    const res = await fetch(`/api/templates/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    // console.log('Delete response status:', res.status);
    if (!res.ok) {
      console.error('❌ Failed to delete template:', res.status, res.statusText);
      throw new Error('Failed to delete template');
    }
    // console.log('✅ Template deleted successfully');
    // Refetch templates to ensure consistency
    await fetchTemplates();
  }

  // Save Template logic
  async function handleSaveTemplate() {
    if (!templateName.trim()) {
      setTemplateError('Template name is required.');
      return;
    }
    // Prevent duplicate template names
    if (templates.some(t => t.name.trim().toLowerCase() === templateName.trim().toLowerCase())) {
      setTemplateError('A template with this name already exists.');
      return;
    }
    const currentData = getCurrentData();
    if (!currentData) {
      setTemplateError('No scorecard selected.');
      return;
    }
    const newTemplate = {
      name: templateName.trim(),
      columns: currentData.columns,
      rows: includeRowsInTemplate ? currentData.rows : undefined
    };

    try {
      await saveTemplateToAPI(newTemplate);
      setShowSaveTemplateModal(false);
      setTemplateName('');
      setIncludeRowsInTemplate(true);
      setTemplateError('');
      toast.success('Template saved successfully!');
    } catch (error) {
      setTemplateError('Failed to save template.');
      console.error('Save template error:', error);
    }
  }

  // Import Template logic
  function handleImportTemplate() {
    const template = templates.find(t => t.name === selectedTemplateName);
    if (!template) {
      setTemplateError('Please select a template.');
      return;
    }
    // Replace columns and optionally rows
    updateCurrentData({
      columns: template.columns,
      rows: importWithRows && template.rows ? template.rows : getCurrentData()?.rows
    });
    setShowImportTemplateModal(false);
    setSelectedTemplateName('');
    setImportWithRows(true);
    setTemplateError('');
    toast.success('Template imported!');
  }

  // Remove template delete from localStorage, add API delete
  async function handleDeleteTemplate(id: string) {
    try {
      await deleteTemplateFromAPI(id);
      toast.success('Template deleted successfully!');
      setSelectedTemplateName('');
      setImportWithRows(true);
      setConfirmDelete(null);
      // Check if no templates remain after deletion
      if (templates.length <= 1) {
        setShowImportTemplateModal(false);
        toast.info('No templates remaining. Please save a template first.');
      }
    } catch (error) {
      toast.error('Failed to delete template.');
      console.error('Delete template error:', error);
    }
  }

  // Helper to initialize a subgrid if it doesn't exist
  function ensureSubGrid(parentId: string | number | undefined) {
    if (parentId === undefined) return;
    if (!subGrids[parentId]) {
      setSubGrids(prev => ({
        ...prev,
        [parentId]: {
          columns: [
            { key: 'task', name: 'Task', editable: true, sortable: true }
          ],
          rows: []
        }
      }));
    }
  }

  function handleToggleSubGrid(parentId: string | number | undefined) {
    if (parentId === undefined) return;
    setExpandedRowId(prev => (prev === parentId ? null : parentId));
    ensureSubGrid(parentId);
  }

  function handleDeleteSubGrid(parentId: string | number | undefined) {
    if (parentId === undefined) return;
    setSubGrids(prev => {
      const newGrids = { ...prev };
      delete newGrids[parentId];
      return newGrids;
    });
  }

  function handleAddSubGrid(parentId: string | number) {
    setSubGrids(prev => ({
      ...prev,
      [parentId]: {
        columns: [{ key: 'note', name: 'Note', editable: true, sortable: true }],
        rows: []
      }
    }));
    setExpandedRowId(parentId);
  }

  // Subgrid column/row handlers (same as before, but now recursive)
  function handleSubGridAddColumn(parentId: string | number | undefined) {
    if (parentId === undefined) return;
    const colKey = `col_${Date.now()}`;
    setSubGrids(prev => {
      const grid = prev[parentId] || { columns: [], rows: [], expanded: true };
      const updated = {
        ...prev,
        [parentId]: {
          ...grid,
          columns: [
            ...grid.columns,
            { key: colKey, name: 'New Column', editable: true, sortable: true }
          ],
          rows: grid.rows.map((row: Row) => ({ ...row, [colKey]: '' }))
        }
      };
      updateParentRowSubgrid(parentId, updated[parentId]);
      return updated;
    });
  }
  function handleSubGridAddRow(parentId: string | number | undefined) {
    if (parentId === undefined) return;
    setSubGrids(prev => {
      const grid = prev[parentId] || { columns: [], rows: [], expanded: true };
      const newId = grid.rows.length > 0 ? Math.max(...grid.rows.map((r: Row) => typeof r.id === 'number' ? r.id : 0)) + 1 : 1;
      const newRow: Row = { id: newId };
      grid.columns.forEach((col: MyColumn) => { newRow[col.key] = ''; });
      return {
        ...prev,
        [parentId]: {
          ...grid,
          rows: [...grid.rows, newRow]
        }
      };
    });
  }
  function handleSubGridRowsChange(parentId: string | number | undefined, newRows: Row[]) {
    if (parentId === undefined) return;
    setSubGrids(prev => {
      const updated = {
        ...prev,
        [parentId]: {
          ...prev[parentId],
          rows: newRows.filter((r: Row) => !r.isAddRow)
        }
      };
      // Also update the parent row in the main grid
      updateParentRowSubgrid(parentId, updated[parentId]);
      return updated;
    });
  }
  function handleSubGridColumnNameChange(parentId: string | number | undefined, idx: number, newName: string) {
    if (parentId === undefined) return;
    setSubGrids(prev => {
      const grid = prev[parentId];
      if (!grid) return prev;
      const updatedColumns = grid.columns.map((col: MyColumn, i: number) => i === idx ? { ...col, name: newName } : col);
      const updated = {
        ...prev,
        [parentId]: {
          ...grid,
          columns: updatedColumns
        }
      };
      updateParentRowSubgrid(parentId, updated[parentId]);
      return updated;
    });
  }
  function handleSubGridDeleteRow(parentId: string | number | undefined, rowId: number | string | undefined) {
    if (parentId === undefined || rowId === undefined) return;
    setSubGrids(prev => {
      const grid = prev[parentId];
      if (!grid) return prev;
      const updated = {
        ...prev,
        [parentId]: {
          ...grid,
          rows: grid.rows.filter((row: Row) => row.id !== rowId)
        }
      };
      updateParentRowSubgrid(parentId, updated[parentId]);
      return updated;
    });
  }
  function handleSubGridDeleteColumn(parentId: string | number | undefined, colKey: string) {
    if (parentId === undefined) return;
    setSubGrids(prev => {
      const grid = prev[parentId];
      if (!grid) return prev;
      const updated = {
        ...prev,
        [parentId]: {
          ...grid,
          columns: grid.columns.filter((col: MyColumn) => col.key !== colKey),
          rows: grid.rows.map((row: Row) => {
            const newRow = { ...row };
            delete newRow[colKey];
            return newRow;
          })
        }
      };
      updateParentRowSubgrid(parentId, updated[parentId]);
      return updated;
    });
  }
  // Helper to update the parent row's subgrid property and trigger save
  function updateParentRowSubgrid(parentId: string | number, subgrid: { columns: MyColumn[]; rows: Row[] }) {
    // Only for scorecards
    if (!selectedCategory || !isScorecard(selectedCategory)) return;
    const currentData = getCurrentData();
    if (!currentData) return;
    const updatedRows = currentData.rows.map(row =>
      row.id === parentId ? { ...row, subgrid: { columns: subgrid.columns, rows: subgrid.rows } } : row
    );
    updateCurrentData({ rows: updatedRows });
  }
  // On scorecard load, initialize subGrids from any subgrid data in rows
  useEffect(() => {
    if (!selectedCategory || !isScorecard(selectedCategory)) return;
    const currentData = getCurrentData();
    if (!currentData) return;
    const newSubGrids: { [parentId: string]: { columns: MyColumn[]; rows: Row[] } } = {};
    for (const row of currentData.rows) {
      if (row.subgrid && row.subgrid.columns && row.subgrid.rows) {
        newSubGrids[row.id] = { columns: row.subgrid.columns, rows: row.subgrid.rows };
      }
    }
    setSubGrids(newSubGrids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  // Load comments from database for a specific scorecard
  async function loadScorecardComments(scorecardId: string) {
    try {
      // console.log('📥 Loading comments for scorecard:', scorecardId);

      // Skip loading for local scorecards (they don't have database comments)
      if (scorecardId.startsWith('scorecard_')) {
        // console.log('📝 Skipping comment load for local scorecard');
        setComments(prev => ({
          ...prev,
          [scorecardId]: {}
        }));
        return;
      }

      const response = await fetch(`/api/comments?scorecard_id=${scorecardId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        console.error('❌ Failed to load comments:', response.status);
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Error details:', errorData);
        return;
      }

      const commentsData = await response.json();
      // console.log('✅ Comments loaded:', commentsData.length, 'comments');

      // Group comments by row_id
      const groupedComments: Record<number, any[]> = {};
      commentsData.forEach((comment: any) => {
        const rowId = parseInt(comment.row_id);
        if (!groupedComments[rowId]) {
          groupedComments[rowId] = [];
        }
        groupedComments[rowId].push(comment);
      });

      setComments(prev => ({
        ...prev,
        [scorecardId]: groupedComments
      }));
    } catch (error) {
      console.error('❌ Error loading comments:', error);
    }
  }

  // Update a comment in the database
  async function updateComment(commentId: string, newText: string) {
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ text: newText }),
      });

      if (!response.ok) {
        throw new Error('Failed to update comment');
      }

      const updatedComment = await response.json();

      // Update local state
      setComments(prev => {
        const updated = { ...prev };
        const scorecardComments = updated[selectedCategory] || {};

        // Find and update the comment
        Object.keys(scorecardComments).forEach(rowId => {
          const rowIdNum = parseInt(rowId);
          const commentIndex = scorecardComments[rowIdNum]?.findIndex(c => c.id === commentId);
          if (commentIndex !== -1) {
            scorecardComments[rowIdNum][commentIndex] = updatedComment;
          }
        });

        return updated;
      });

      return updatedComment;
    } catch (error) {
      console.error('Error updating comment:', error);
      throw error;
    }
  }

  // Delete a comment from the database
  async function deleteComment(commentId: string, rowId: number) {
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete comment');
      }

      // Update local state
      setComments(prev => {
        const updated = { ...prev };
        const scorecardComments = updated[selectedCategory] || {};

        if (scorecardComments[rowId]) {
          scorecardComments[rowId] = scorecardComments[rowId].filter(c => c.id !== commentId);
        }

        return updated;
      });

      toast.success('Comment deleted successfully!');
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Failed to delete comment');
      throw error;
    }
  }

  function handleOpenCommentModal(rowId: number) {
    setOpenCommentRowId(rowId);
    setCommentInput('');
  }
  function handleCloseCommentModal() {
    setOpenCommentRowId(null);
    setCommentInput('');
  }
  async function handleAddComment() {
    if (!commentInput.trim() || openCommentRowId == null || !isScorecard(selectedCategory) || !user) return;

    try {
      // console.log('💬 Adding comment to scorecard:', selectedCategory);

      // Get current scorecard data for potential migration
      const currentScorecard = editingScoreCard;
      const requestBody = {
        scorecard_id: selectedCategory,
        user_id: openCommentRowId, // This is actually the row_id (API will rename it)
        text: commentInput.trim(),
        // Include scorecard data for auto-migration if it's a local scorecard
        scorecard_data: selectedCategory.startsWith('scorecard_') ? {
          name: currentScorecard?.name || 'Untitled Scorecard',
          columns: currentScorecard?.columns || [],
          rows: currentScorecard?.rows || []
        } : undefined
      };

      // console.log('📤 Sending comment request:', requestBody);

      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Comment creation failed:', errorData);
        throw new Error(errorData.error || 'Failed to add comment');
      }

      const newComment = await response.json();
      // console.log('✅ Comment created successfully:', newComment);

      // Handle scorecard migration if it occurred
      if (newComment.migrated_scorecard) {
        // console.log('🔄 Scorecard was migrated:', newComment.migrated_scorecard);

        const { old_id, new_id, title } = newComment.migrated_scorecard;

        // Update the scorecard in our state
        const migratedScorecard: ScoreCard = {
          ...currentScorecard!,
          id: new_id,
          name: title,
          columns: currentScorecard?.columns || [],
          rows: currentScorecard?.rows || [],
          createdAt: currentScorecard?.createdAt || new Date(),
          lastModified: new Date()
        };

        // Update scorecards list
        setScorecards(prev => prev.map(sc =>
          sc.id === old_id ? migratedScorecard : sc
        ));

        // Update current editing scorecard
        setEditingScoreCard(migratedScorecard);

        // Update selected category
        setSelectedCategory(new_id);

        // Update localStorage
        const allScorecards = JSON.parse(localStorage.getItem('scorecards') || '[]');
        const updatedLocalScorecards = allScorecards.map((sc: any) =>
          sc.id === old_id ? migratedScorecard : sc
        );
        localStorage.setItem('scorecards', JSON.stringify(updatedLocalScorecards));

        toast.success('Scorecard migrated to database and comment added!');

        // Use the new scorecard ID for comment grouping
        const actualScorecardId = new_id;

        // Update local comment state
        setComments(prev => {
          const updated = {
            ...prev,
            [actualScorecardId]: {
              ...(prev[actualScorecardId] || {}),
              [openCommentRowId]: [...((prev[actualScorecardId] || {})[openCommentRowId] || []), newComment],
            }
          };
          return updated;
        });
      } else {
        // Normal comment addition (no migration)
        setComments(prev => {
          const updated = {
            ...prev,
            [selectedCategory]: {
              ...(prev[selectedCategory] || {}),
              [openCommentRowId]: [...((prev[selectedCategory] || {})[openCommentRowId] || []), newComment],
            }
          };
          return updated;
        });

        toast.success('Comment added successfully!');
      }

      setCommentInput('');
    } catch (error) {
      console.error('❌ Error adding comment:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add comment');
    }
  }

  // Save scorecards to localStorage whenever they change
  useEffect(() => {
    saveScoreCardsToStorage(scorecards);
  }, [scorecards]);

  // ScoreCard functions
  function createScoreCard() {
    if (!newScoreCardName.trim()) return;
    // Prevent duplicate scorecard names (case-insensitive, trimmed)
    const normalizedNewName = newScoreCardName.trim().toLowerCase();
    if (scorecards.some(sc => sc.name.trim().toLowerCase() === normalizedNewName)) {
      toast.error('A ScoreCard with this name already exists. Please choose a different name.');
      return;
    }
    const retailersCols = categoryData['Retailers']?.columns || retailersColumns;
    const newScoreCard = {
      title: newScoreCardName.trim(),
      data: {
        columns: retailersCols.map(col => ({ ...col })),
        rows: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ],
      },
    };
    fetch('/api/scorecards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(newScoreCard),
    })
      .then(async (response) => {
        if (response.ok) {
          const created = await response.json();
          const formatted = {
            id: created.id,
            name: created.title,
            columns: created.data.columns,
            rows: created.data.rows,
            createdAt: new Date(created.created_at),
            lastModified: new Date(created.last_modified),
            data: created.data,
          };
          setScorecards(prev => [...prev, formatted]);
          setEditingScoreCard(formatted);
          setSelectedCategory(formatted.id);
          setNewScoreCardName('');
          setShowCreateScoreCardModal(false);
          toast.success('ScoreCard created successfully');
        } else {
          toast.error('Failed to create ScoreCard');
        }
      })
      .catch(() => toast.error('Failed to create ScoreCard'));
  }

  function deleteScoreCard(scorecardId: string) {
    fetch(`/api/scorecards/${scorecardId}`, {
      method: 'DELETE',
      credentials: 'include',
    })
      .then((response) => {
        if (response.ok) {
          setScorecards(prev => prev.filter(sc => sc.id !== scorecardId));
          if (selectedCategory === scorecardId) {
            setSelectedCategory(dataCategories[0]);
          }
          toast.success('ScoreCard deleted successfully');
        } else {
          toast.error('Failed to delete ScoreCard');
        }
      })
      .catch(() => toast.error('Failed to delete ScoreCard'));
  }

  function updateScoreCard(scorecardId: string, updates: Partial<ScoreCard>) {
    setScorecards(prev => prev.map(sc =>
      sc.id === scorecardId
        ? { ...sc, ...updates, rows: updates.rows ? [...updates.rows] : sc.rows, lastModified: new Date() }
        : sc
    ));
  }

  // Get current data based on selected category
  function getCurrentData() {
    if (!selectedCategory) return null;

    // Check if it's a scorecard (either local with 'scorecard_' prefix or database with numeric ID)
    const scorecard = scorecards.find(sc => sc.id === selectedCategory);
    if (scorecard) {
      // console.log('📊 Found scorecard data:', scorecard.name, 'with', scorecard.rows.length, 'rows');
      return { columns: scorecard.columns, rows: scorecard.rows };
    }

    // If not a scorecard, check regular categories
    if (selectedCategory in categoryData) {
      return categoryData[selectedCategory];
    }

    // console.log('❌ No data found for category:', selectedCategory);
    return null;
  }

  // Update current data
  function updateCurrentData(updates: { columns?: MyColumn[]; rows?: Row[] }) {
    if (updates.columns) {
      updates.columns = updates.columns.map(col =>
        col.key === 'comments' ? { ...col, name: '', renderHeaderCell: () => null } : col
      );
    }

    // Check if it's a scorecard (either local or database)
    const scorecard = scorecards.find(sc => sc.id === selectedCategory);
    if (scorecard) {
      updateScoreCard(selectedCategory, updates);

      // CRITICAL: Update editingScoreCard state for auto-save
      if (editingScoreCard) {
        const updatedScorecard = {
          ...editingScoreCard,
          ...updates,
          lastModified: new Date(),
        };
        setEditingScoreCard(updatedScorecard);
      }
    } else {
      // Handle regular categories
      setCategoryData(prev => ({
        ...prev,
        [selectedCategory]: {
          ...prev[selectedCategory],
          ...updates
        }
      }));
    }
  }

  // Get all available categories including scorecards
  function getAllCategories() {
    const scorecardCategories = scorecards.map(sc => ({
      id: sc.id,
      name: sc.name,
      type: 'scorecard' as const
    }));

    const regularCategories = dataCategories.map(cat => ({
      id: cat,
      name: cat,
      type: 'regular' as const
    }));

    return [...regularCategories, ...scorecardCategories];
  }

  useEffect(() => {
    // console.log('categoryData:', categoryData);
    // console.log('selectedCategory:', selectedCategory);
    // console.log('columns:', getCurrentData()?.columns);
    // console.log('rows:', getCurrentData()?.rows);
    // console.log('First row:', getCurrentData()?.rows?.[0]);
    // console.log('Column keys:', getCurrentData()?.columns?.map(col => col.key));
  }, [categoryData, selectedCategory, scorecards]);

  useEffect(() => {
    const currentData = getCurrentData();
    if (!currentData) return;

    const updatedColumns = currentData.columns.map(col => {
      const editable = userRole === 'ADMIN' && col.key !== 'id' && col.key !== 'delete';
      // console.log(`Column ${col.key} editable state:`, {
      //   userRole,
      //   isId: col.key === 'id',
      //   isDelete: col.key === 'delete',
      //   finalEditable: editable
      // });
      return {
        ...col,
        editable,
        renderEditCell: col.renderEditCell || (editable ? ({ row, column, onRowChange }: RenderEditCellProps<Row>) => {
          return (
            <input
              defaultValue={row[column.key] !== undefined ? String(row[column.key]) : ''}
              onChange={e => {
                onRowChange({ ...row, [column.key]: e.target.value });
              }}
              className="w-full h-full px-2 py-1"
              autoFocus
            />
          );
        } : undefined)
      };
    });
    // console.log('Updated columns after useEffect:', updatedColumns);
    updateCurrentData({ columns: updatedColumns });
  }, [userRole, selectedCategory]);

  // Handle category switch — flush pending save before switching
  async function handleCategoryChange(category: string) {
    // Save current scorecard before switching
    if (hasUnsavedChanges && editingScoreCard) {
      try { await forceSave(); } catch { /* best effort */ }
    }
    setSelectedCategory(category);
    setSortColumns([]);

    // Check if it's the master scorecard
    if (category === 'master-scorecard') {
      setEditingScoreCard(null);
      // console.log('🎯 Auto-save DISABLED for master scorecard');
      return;
    }

    // Check if it's a scorecard (either local or database)
    const scorecard = scorecards.find(sc => sc.id === category);
    if (scorecard) {
      setEditingScoreCard(scorecard);
      setLastSelectedScorecardId(scorecard.id);
      // console.log('🎯 Auto-save ENABLED for scorecard:', scorecard.name, 'ID:', scorecard.id);
      // Load comments for this scorecard
      loadScorecardComments(scorecard.id);
    } else {
      setEditingScoreCard(null);
      // console.log('🎯 Auto-save DISABLED for regular category:', category);
    }

    // console.log('Switching to', category, 'found scorecard:', !!scorecard);
  }

  // Update current scorecard
  const updateCurrentScorecard = useCallback((updates: Partial<ScoreCard>) => {
    if (!editingScoreCard) return;
    const updatedScorecard = {
      ...editingScoreCard,
      ...updates,
      lastModified: new Date(),
    };
    setEditingScoreCard(updatedScorecard);
    setScorecards(prev => prev.map(sc =>
      sc.id === editingScoreCard.id ? updatedScorecard : sc
    ));
  }, [editingScoreCard]);

  // Handle rows change
  const onRowsChange = useCallback((newRows: Row[]) => {
    updateCurrentScorecard({ rows: [...newRows] });
  }, [updateCurrentScorecard]);

  // Handle column name change
  const handleColumnNameChange = useCallback((idx: number, newName: string) => {
    if (!editingScoreCard) return;
    const newColumns = [...editingScoreCard.columns];
    newColumns[idx] = { ...newColumns[idx], name: newName };
    updateCurrentScorecard({ columns: newColumns });
  }, [editingScoreCard, updateCurrentScorecard]);

  // Add new row
  const handleAddRow = useCallback(() => {
    if (!editingScoreCard) return;
    const newRow: Row = {
      id: Date.now(),
      name: '',
      priority: 'Medium',
      retail_price: 0,
      buyer: '',
      store_count: 0,
      hq_location: '',
      notes: '',
    };
    updateCurrentScorecard({ rows: [...editingScoreCard.rows, newRow] });
  }, [editingScoreCard, updateCurrentScorecard]);

  // Delete row
  const handleDeleteRow = useCallback((rowId: number | string) => {
    if (!editingScoreCard) return;
    const newRows = editingScoreCard.rows.filter(row => row.id !== rowId);
    updateCurrentScorecard({ rows: newRows });
  }, [editingScoreCard, updateCurrentScorecard]);

  // Add new column
  const handleAddColumn = useCallback(() => {
    if (!newColName.trim()) {
      setColError('Column name cannot be empty');
      return;
    }
    if (!editingScoreCard) return;
    const newColumn: MyColumn = {
      key: newColName.toLowerCase().replace(/\s+/g, '_'),
      name: newColName,
      editable: true,
      sortable: true,
    };
    updateCurrentScorecard({ columns: [...editingScoreCard.columns, newColumn] });
    setNewColName('');
    setShowAddColModal(false);
    setColError('');
  }, [newColName, editingScoreCard, updateCurrentScorecard]);

  function openAddColModal() {
    setNewColName('');
    setShowAddColModal(true);
  }

  function handleAddColumnConfirm() {
    if (!newColName.trim()) {
      setColError('Column name is required.');
      return;
    }
    // Auto-generate key from name
    const key = newColName.trim().toLowerCase().replace(/\s+/g, '_');
    const currentData = getCurrentData();
    if (!currentData) return;
    if (currentData.columns.some(col => col.key === key)) {
      setColError('Column name must be unique.');
      return;
    }
    const newColumn = {
      key,
      name: newColName, // Ensure name is always set
      editable: userRole === 'ADMIN',
      sortable: true,
      isDefault: false, // Mark as user-added
      renderHeaderCell: undefined // Let columnsWithDelete logic handle header rendering
    };
    // Find the index of "Retail Price" column to insert before it
    const retailPriceIndex = currentData.columns.findIndex(col => col.key === 'retail_price');
    const insertIndex = retailPriceIndex !== -1 ? retailPriceIndex : currentData.columns.length;
    // Insert the new column at the specified position
    let updatedColumns = [
      ...currentData.columns.slice(0, insertIndex),
      newColumn,
      ...currentData.columns.slice(insertIndex)
    ];
    // Ensure comments column always has blank name and header
    updatedColumns = updatedColumns.map(col =>
      col.key === 'comments' ? { ...col, name: '', renderHeaderCell: () => null } : col
    );
    const updatedRows = currentData.rows.map(row => ({ ...row, [key]: '' }));
    updateCurrentData({ columns: updatedColumns, rows: updatedRows });
    setShowAddColModal(false);
    setNewColName('');
    setColError('');
  }

  // Sorting icon logic
  function getSortIcon(columnKey: string) {
    const sort = sortColumns.find(sc => sc.columnKey === columnKey);
    if (!sort) return <FaSort style={{ marginLeft: 4, color: '#888' }} />;
    if (sort.direction === 'ASC') return <FaSortUp style={{ marginLeft: 4, color: '#2563eb' }} />;
    if (sort.direction === 'DESC') return <FaSortDown style={{ marginLeft: 4, color: '#2563eb' }} />;
    return <FaSort style={{ marginLeft: 4, color: '#888' }} />;
  }

  function handleSortClick(columnKey: string) {
    setSortColumns(prev => {
      const existing = prev.find(sc => sc.columnKey === columnKey);
      if (!existing) return [{ columnKey, direction: 'ASC' }];
      if (existing.direction === 'ASC') return [{ columnKey, direction: 'DESC' }];
      return [];
    });
  }

  // --- Product Status Dropdown: always clickable, accessible, improved colors ---
  const productStatusOptions = [
    { value: 'Authorized', label: 'Authorized', bg: '#e6f4ea', color: '#14532d' }, // soft green
    { value: 'In Process', label: 'In Process', bg: '#e0e7ff', color: '#1e3a8a' }, // soft blue
    { value: 'In/Out', label: 'In/Out', bg: '#fef9c3', color: '#92400e' }, // soft yellow
    { value: 'Buyer Passed', label: 'Buyer Passed', bg: '#fee2e2', color: '#991b1b' }, // soft red
    { value: 'Presented', label: 'Presented', bg: '#ede9fe', color: '#6d28d9' }, // soft purple
    { value: 'Discontinued', label: 'Discontinued', bg: '#f3f4f6', color: '#374151' }, // soft gray
    { value: 'Meeting Secured', label: 'Meeting Secured', bg: '#fff7ed', color: '#b45309' }, // soft orange
    { value: 'On Hold', label: 'On Hold', bg: '#fdf2f8', color: '#be185d' }, // soft pink
    { value: 'Category Review', label: 'Category Review', bg: '#f0fdfa', color: '#0f766e' }, // soft teal
    { value: 'Open Review', label: 'Open Review', bg: '#e0f2fe', color: '#0369a1' }, // soft sky
  ];

  // Add icon mapping for statuses
  const statusIcons: Record<string, React.ReactNode> = {
    'Authorized': <span style={{ fontWeight: 700 }}>&#10003;</span>, // checkmark
    'In Process': <span style={{ fontWeight: 700 }}>&#9203;</span>, // clock
    'In/Out': <span style={{ fontWeight: 700 }}>&#8596;</span>, // arrows
    'Buyer Passed': <span style={{ fontWeight: 700 }}>&#10060;</span>, // cross
    'Presented': <span style={{ fontWeight: 700 }}>&#128196;</span>, // document
    'Discontinued': <span style={{ fontWeight: 700 }}>&#9940;</span>, // stop
    'Meeting Secured': <span style={{ fontWeight: 700 }}>&#128197;</span>, // calendar
    'On Hold': <span style={{ fontWeight: 700, color: '#2563eb' }}>&#9208;</span>, // blue pause
    'Category Review': <span style={{ fontWeight: 700 }}>&#128196;</span>, // document
    'Open Review': <span style={{ fontWeight: 700 }}>&#128065;</span>, // eye
  };

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
  // For ScoreCards, insert comment column and user-added columns after Retailer Name
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
  // console.log('Final columnsWithDelete:', columnsWithDelete.map(col => ({
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

  function handleImportExcel(event: React.ChangeEvent<HTMLInputElement>) {
    // console.log('handleImportExcel called');
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const XLSX = await import('xlsx');
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows2D: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (rows2D.length === 0) return;

      // Find the header row
      const headerRowIndex = 0; // or your logic to find the header row
      const headers = rows2D[headerRowIndex];
      // console.log('Excel headers:', headers);
      if (!headers || headers.length === 0) {
        toast.error('No headers found in Excel/CSV file!');
        return;
      }

      // Normalize and compare
      function normalizeColName(name: string) {
        return (name || '').toLowerCase().replace(/\s+/g, '').replace(/_/g, '').trim();
      }
      const visibleGridCols = (getCurrentData()?.columns || []).filter(
        col => !col.key.startsWith('_') && col.key !== 'delete' && col.key !== 'comments'
      );
      const gridColNames = visibleGridCols.map(col => normalizeColName(String(col.name)));
      const excelColNames = headers.map(h => normalizeColName(String(h)));
      // console.log('Grid columns:', gridColNames);
      // console.log('Excel columns:', excelColNames);

      // Detect duplicates in Excel columns
      const excelColNameCounts: Record<string, number> = {};
      excelColNames.forEach(name => {
        excelColNameCounts[name] = (excelColNameCounts[name] || 0) + 1;
      });
      const duplicateExcelCols = Object.entries(excelColNameCounts).filter(([_, count]) => count > 1).map(([name]) => name);
      if (duplicateExcelCols.length > 0) {
        toast.error(
          `Duplicate columns detected in Excel/CSV file after normalization: ${duplicateExcelCols.join(', ')}. Please remove or rename duplicates.`
        );
        return;
      }

      // Find missing and extra columns
      const missingCols = gridColNames.filter(name => !excelColNames.includes(name));
      const extraCols = excelColNames.filter(name => !gridColNames.includes(name));
      if (
        gridColNames.length !== excelColNames.length ||
        missingCols.length > 0 ||
        extraCols.length > 0
      ) {
        let msg = 'Column names in the Excel/CSV file do not match the current grid columns.';
        if (missingCols.length > 0) {
          msg += `\nMissing columns: ${missingCols.join(', ')}`;
        }
        if (extraCols.length > 0) {
          msg += `\nExtra columns: ${extraCols.join(', ')}`;
        }
        toast.error(msg);
        return;
      }

      // Build a mapping from grid column key to Excel column index
      const colKeyToExcelIdx: Record<string, number> = {};
      visibleGridCols.forEach((col) => {
        const normName = normalizeColName(String(col.name));
        const excelIdx = excelColNames.findIndex(name => name === normName);
        if (excelIdx !== -1) {
          colKeyToExcelIdx[col.key] = excelIdx;
        }
      });

      // For each data row, map values by column name
      const dataRows = rows2D.slice(headerRowIndex + 1).filter(row => row.some(cell => cell && String(cell).trim() !== ''));
      const formattedRows = dataRows.map((rowArr: any[], idx: number) => {
        const obj: any = {};
        Object.entries(colKeyToExcelIdx).forEach(([colKey, excelIdx]) => {
          obj[colKey] = rowArr[excelIdx] ?? '';
        });
        obj.id = idx + 1;
        return obj;
      });

      // Compute diff: match by normalized retailer name
      const existingRows = getCurrentData()?.rows || [];
      const normalizeRowName = (n: any) => String(n || '').toLowerCase().trim();
      const existingNames = new Set(existingRows.map(r => normalizeRowName(r.name)));
      const incomingNames = new Set(formattedRows.map((r: any) => normalizeRowName(r.name)));
      const toUpdate = formattedRows.filter((r: any) => existingNames.has(normalizeRowName(r.name))).length;
      const toAdd = formattedRows.filter((r: any) => !existingNames.has(normalizeRowName(r.name))).length;
      const toSkip = existingRows.filter(r => !incomingNames.has(normalizeRowName(r.name))).length;

      // Show diff preview instead of immediately applying
      setImportPreview({ filename: file.name, formattedRows, toUpdate, toAdd, toSkip });
    };
    reader.readAsArrayBuffer(file);
    // Reset the input so selecting the same file again triggers onChange
    event.target.value = '';
  }

  async function applyImport() {
    if (!importPreview) return;

    // Save a backup of current data before overwriting
    const scorecardName = (editingScoreCard?.name || 'scorecard').replace(/[^a-zA-Z0-9_-]/g, '_');
    const currentData = getCurrentData();
    if (currentData && currentData.rows.length > 0) {
      try {
        const XLSX = await import('xlsx');
        const backupRows = currentData.rows.map(row => {
          const obj: any = {};
          currentData.columns.forEach(col => {
            if (col.key !== 'comments' && col.key !== '_delete_row') {
              obj[String(col.name || col.key)] = row[col.key] || '';
            }
          });
          return obj;
        });
        const ws = XLSX.utils.json_to_sheet(backupRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, scorecardName.slice(0, 31));
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        XLSX.writeFile(wb, `${scorecardName}_backup_before_import_${timestamp}.xlsx`);
      } catch {
        // Backup export failed — continue with import anyway
      }
    }

    updateCurrentData({ rows: importPreview.formattedRows });
    const importSource = importPreview.filename;
    setImportPreview(null);
    setTimeout(async () => {
      try {
        await forceSave();
      } catch {
        toast.error('Failed to save imported data to backend.');
      }
    }, 0);
    toast.success(`Imported "${importSource}" into "${editingScoreCard?.name}" — ${importPreview.toUpdate} updated, ${importPreview.toAdd} added.`);
  }

  // Sync editAddress/editNotes with retailer when modal opens or retailer changes
  useEffect(() => {
    if (openCommentRowId !== null) {
      const retailer = getCurrentData()?.rows.find(r => r.id === openCommentRowId);
      setCommentInput('');
    }
  }, [openCommentRowId]);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) {
          setUser(null);
          return;
        }
        const data = await res.json();
        setUser(data.user);
      } catch {
        setUser(null);
      }
    };
    fetchUser();
  }, []);

  // ScoreCard management functions
  function loadScoreCardsFromStorage(): ScoreCard[] {
    try {
      const stored = localStorage.getItem('scorecards');
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Failed to load scorecards from localStorage:', error);
      return [];
    }
  }
  function saveScoreCardsToStorage(scorecards: ScoreCard[]) {
    try {
      localStorage.setItem('scorecards', JSON.stringify(scorecards));
    } catch (error) {
      console.warn('Failed to save scorecards to localStorage:', error);
    }
  }
  // Utility for loading/saving retailers
  function loadRetailersFromStorage() {
    try {
      const stored = localStorage.getItem('retailers');
      if (!stored) return null;
      return JSON.parse(stored);
    } catch (error) {
      console.warn('Failed to load retailers from localStorage:', error);
      return null;
    }
  }
  function saveRetailersToStorage(rows: any[]) {
    try {
      localStorage.setItem('retailers', JSON.stringify(rows));
    } catch (error) {
      console.warn('Failed to save retailers to localStorage:', error);
    }
  }

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

    // console.log('🎯 DEBUG: Final dropdown position:', finalPosition);

    return finalPosition;
  }

  // StatusPickerCard is now in StatusPickerCard.tsx — this stub keeps old call-sites compiling
  // while the return statement is migrated. Remove once JSX is updated.
  function _StatusPickerCard_REMOVED({
    rowIdx, colIdx, value, onSelect, onClose, columnKey
  }: { rowIdx: number; colIdx: number; value: string; onSelect: (v: string) => void; onClose: () => void; columnKey: string }) {
    const [focusedIdx, setFocusedIdx] = useState(() => productStatusOptions.findIndex(opt => opt.value === value));
    const cardRef = useRef<HTMLDivElement>(null);
    const pos = getCellPosition(rowIdx, colIdx);;

    useEffect(() => {
      function handleKeyDown(e: KeyboardEvent) {
        if (!cardRef.current) return;
        if (e.key === 'ArrowDown') {
          setFocusedIdx(idx => (idx + 1) % productStatusOptions.length);
          e.preventDefault();
        } else if (e.key === 'ArrowUp') {
          setFocusedIdx(idx => (idx - 1 + productStatusOptions.length) % productStatusOptions.length);
          e.preventDefault();
        } else if (e.key === 'Enter') {
          onSelect(productStatusOptions[focusedIdx].value);
        } else if (e.key === 'Escape') {
          onClose();
        }
      }
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusedIdx, onSelect, onClose]);

    useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
          onClose();
        }
      }
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return ReactDOM.createPortal(
      <div
        ref={cardRef}
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          minWidth: pos.width,
          background: '#fff',
          zIndex: 99999,
          boxShadow: pos.openUpward ? '0 -4px 24px #0002' : '0 4px 24px #0002',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          padding: 4,
          marginTop: 2,
          maxHeight: pos.maxHeight,
          overflowY: 'auto',
        }}
        tabIndex={-1}
      >
        {productStatusOptions.map((opt, idx) => {
          const isSelected = value === opt.value;
          const isFocused = idx === focusedIdx;
          return (
            <div
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              onMouseEnter={() => setFocusedIdx(idx)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px',
                borderRadius: 8,
                cursor: 'pointer',
                background: isSelected ? (opt.bg || '#f3f4f6') : isFocused ? '#f3f4f6' : 'transparent',
                fontWeight: isSelected ? 700 : 400,
                color: opt.color,
                boxShadow: isSelected ? '0 2px 8px #0001' : undefined,
                marginBottom: 2,
                transition: 'background 0.15s',
              }}
            >
              {/* Status icon */}
              <span style={{ fontSize: 18, width: 22, display: 'flex', justifyContent: 'center' }}>{statusIcons[opt.value] || ''}</span>
              {/* Colored dot */}
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: opt.bg, border: `2px solid ${opt.color}`, display: 'inline-block' }}></span>
              {/* Label */}
              <span style={{ color: opt.color, fontWeight: isSelected ? 700 : 500 }}>{opt.label}</span>
              {/* Checkmark if selected */}
              {isSelected && <span style={{ marginLeft: 'auto', color: opt.color, fontSize: 20 }}>&#10003;</span>}
            </div>
          );
        })}
      </div>,
      document.body
    );
  }

  // Update the openContactModal logic to initialize contactModalData
  function handleOpenContactModal(rowId: number, key: string, value: any) {
    let contact = { name: '', telephone: '', address: '', notes: '' };

    if (value && typeof value === 'object') {
      // If it's already an object with contact details
      contact = value;
    } else if (value && typeof value === 'string') {
      // If it's a string (like "Jamie Chen"), use it as the name
      contact = { name: value, telephone: '', address: '', notes: '' };
    }

    setContactModalData(contact);
    setOpenContactModal({ rowId, key, value });
  }

  // Place this before the return statement in the component
  let contactCardModal: React.ReactNode = null;
  if (openContactModal) {
    const currentData = getCurrentData();
    const rowIdx = currentData?.rows.findIndex(r => r.id === openContactModal.rowId);
    const key = openContactModal.key;
    contactCardModal = (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg shadow-xl w-96">
          <h3 className="text-lg font-bold mb-4">Edit 3B Contact</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Name</label>
              <input type="text" value={contactModalData.name} onChange={e => setContactModalData(c => ({ ...c, name: e.target.value }))} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" placeholder="Name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Telephone</label>
              <input type="tel" value={contactModalData.telephone} onChange={e => setContactModalData(c => ({ ...c, telephone: e.target.value }))} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" placeholder="Telephone" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Address</label>
              <input type="text" value={contactModalData.address} onChange={e => setContactModalData(c => ({ ...c, address: e.target.value }))} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" placeholder="Address" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Notes</label>
              <textarea value={contactModalData.notes} onChange={e => setContactModalData(c => ({ ...c, notes: e.target.value }))} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" placeholder="Notes" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpenContactModal(null)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200">Cancel</button>
              <button onClick={() => {
                if (!currentData || rowIdx === undefined || rowIdx === -1) return;
                const updatedRows = currentData.rows.map((r, i) => i === rowIdx ? { ...r, [key]: { ...contactModalData } } : r);
                updateCurrentData({ rows: updatedRows });
                setOpenContactModal(null);
              }} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Save</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Remove subrow objects from getRowsWithSubRows, just return the main rows plus add-row
  function getRowsWithSubRows() {
    const rows = getSortedRows();
    return [...rows, { isAddRow: true, id: 'add-row' }];
  }

  // Subgrid renderer: shows Add Column, Add Row, and allows delete
  function SubGridRenderer({ parentId }: { parentId: string | number | undefined }) {
    if (parentId === undefined) return null;
    const grid = subGrids[parentId];
    if (!grid || expandedRowId !== parentId) return null;

    // Subgrid sorting state
    const [subgridSortColumns, setSubgridSortColumns] = React.useState<SortColumn[]>([]);

    // Sort subgrid rows
    const sortedSubgridRows = React.useMemo(() => {
      if (subgridSortColumns.length === 0) return grid.rows;

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
    }, [grid.rows, subgridSortColumns]);

    // Only render real rows and the add-row
    let subgridRows = [
      ...sortedSubgridRows,
      { isAddRow: true, id: 'add-row' }
    ];

    // Calculate column widths based on content with dynamic algorithm
    const calculateColumnWidth = (col: MyColumn) => {
      const colNameLength = typeof col.name === 'string' ? col.name.length : 0;
      const contentLengths = grid.rows.map(row => String(row[col.key] || '').length);
      const maxContentLength = Math.max(colNameLength, ...contentLengths);

      // Dynamic width calculation based on content
      const charWidth = 10; // Reduced from 14px to 10px per character
      const padding = 20; // Reduced padding
      const iconSpace = 60; // Space for icons (edit, delete, sort)

      const calculatedWidth = Math.max(maxContentLength * charWidth + padding + iconSpace, 100);
      return Math.min(calculatedWidth, 300); // Reduced max width for better distribution
    };

    const subEditableColumns = grid.columns.map((col: MyColumn, idx: number) => ({
      ...col,
      width: calculateColumnWidth(col),
      renderHeaderCell: () => {
        const [isEditing, setIsEditing] = React.useState(false);
        const [inputValue, setInputValue] = React.useState(col.name as string);
        const inputRef = React.useRef<HTMLInputElement>(null);

        // Update local state on prop change
        React.useEffect(() => {
          setInputValue(typeof col.name === 'string' ? col.name : '');
        }, [col.name]);

        const startEditing = () => {
          setIsEditing(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        };

        const commitChange = () => {
          setIsEditing(false);
          if (inputValue !== col.name && inputValue.trim()) {
            handleSubGridColumnNameChange(parentId, idx, inputValue.trim());
          } else {
            setInputValue(typeof col.name === 'string' ? col.name : '');
          }
        };

        const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            commitChange();
          } else if (e.key === 'Escape') {
            setIsEditing(false);
            setInputValue(typeof col.name === 'string' ? col.name : '');
          }
        };

        // Get sort icon for this column
        const sortColumn = subgridSortColumns.find(sc => sc.columnKey === col.key);
        const sortIcon = sortColumn ? (sortColumn.direction === 'ASC' ? '↑' : '↓') : null;

        return (
          <div className="flex items-center justify-between w-full">
            {isEditing ? (
              <input
                ref={inputRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onBlur={commitChange}
                onKeyDown={handleKeyDown}
                className="border border-blue-300 px-2 py-1 rounded text-xs bg-white"
                style={{
                  fontSize: '12px',
                  height: 24,
                  width: '100%',
                  minWidth: '80px'
                }}
                maxLength={20}
              />
            ) : (
              <>
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-[11px] font-medium text-slate-600 truncate">
                    {typeof col.name === 'string' ? col.name : ''}
                  </span>
                  <button
                    onClick={startEditing}
                    className="text-slate-300 hover:text-blue-500 transition-colors p-0.5"
                    title="Edit Column Name"
                    style={{ fontSize: 10 }}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" /></svg>
                  </button>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  {!col.isDefault &&
                    col.key !== 'name' &&
                    col.key !== 'priority' &&
                    col.key !== 'retailPrice' &&
                    col.key !== 'categoryReviewDate' &&
                    col.key !== 'buyer' &&
                    col.key !== 'storeContact' &&
                    col.key !== 'delete' &&
                    col.key !== 'retailerName' &&
                    typeof col.name === 'string' &&
                    !col.name.toLowerCase().includes('retailer') &&
                    !col.name.toLowerCase().includes('priority') &&
                    !col.name.toLowerCase().includes('price') &&
                    !col.name.toLowerCase().includes('category') &&
                    !col.name.toLowerCase().includes('buyer') &&
                    !col.name.toLowerCase().includes('contact') && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleSubGridDeleteColumn(parentId, col.key);
                        }}
                        className="text-slate-300 hover:text-red-500 transition-colors p-0.5"
                        title="Delete Column"
                        style={{ fontSize: 10 }}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                      </button>
                    )}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      const currentSort = subgridSortColumns.find(sc => sc.columnKey === col.key);
                      const newDirection = currentSort?.direction === 'ASC' ? 'DESC' : 'ASC';
                      setSubgridSortColumns(prev => {
                        const filtered = prev.filter(sc => sc.columnKey !== col.key);
                        return [...filtered, { columnKey: col.key, direction: newDirection }];
                      });
                    }}
                    className="text-slate-300 hover:text-blue-500 transition-colors p-0.5"
                    title="Sort Column"
                    style={{ fontSize: 10 }}
                  >
                    {sortIcon || <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-3L16.5 18m0 0L12 13.5m4.5 4.5V4.5" /></svg>}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      },
      renderCell: (props: { row: Row }) => {
        if (props.row.isDummy) {
          return null;
        }
        if (props.row.isAddRow) {
          if (idx === 0) {
            return (
              <button
                onClick={() => handleSubGridAddRow(parentId)}
                className="w-full h-full flex items-center justify-start text-slate-400 hover:text-blue-600 transition-colors font-medium pl-2"
                style={{ minHeight: 24, fontSize: '13px', padding: 0 }}
              >
                + Add Row
              </button>
            );
          } else {
            return null;
          }
        }

        const cellValue = props.row[col.key];
        const displayValue = cellValue ? String(cellValue).substring(0, 20) : '';
        const isTruncated = cellValue && String(cellValue).length > 20;

        return (
          <div
            className="flex items-center px-2 py-1"
            style={{
              fontSize: '13px',
              minHeight: '24px',
              backgroundColor: 'transparent'
            }}
            title={isTruncated ? String(cellValue) : undefined}
          >
            <span className="text-slate-800">{displayValue}</span>
            {isTruncated && <span className="text-slate-400 ml-1">...</span>}
          </div>
        );
      },
      renderEditCell: ({ row, column, onRowChange }: RenderEditCellProps<Row>) => (
        <input
          defaultValue={row[column.key] !== undefined ? String(row[column.key]) : ''}
          onChange={e => {
            const value = e.target.value;
            // Limit to 20 characters
            if (value.length <= 20) {
              onRowChange({ ...row, [column.key]: value });
            }
          }}
          className="w-full h-full px-2 py-1 border border-blue-300 rounded bg-white"
          autoFocus
          style={{
            fontSize: '13px',
            height: '24px',
            minHeight: '24px'
          }}
          maxLength={20}
        />
      )
    }));

    // Add delete column button
    subEditableColumns.push({
      key: 'delete',
      name: '',
      width: 36,
      frozen: false,
      renderHeaderCell: () => <></>,
      renderCell: ({ row }: { row: Row }) => {
        // Don't show delete button for add-row
        if (row.isAddRow) {
          return null;
        }
        return (
          <button
            onClick={() => handleSubGridDeleteRow(parentId, row.id)}
            className="text-slate-300 hover:text-red-500 transition-colors text-base"
            style={{ fontSize: 14, padding: 0 }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
          </button>
        );
      },
      renderEditCell: () => <></>,
    });

    const parentRow = getCurrentData()?.rows.find(r => r.id === parentId);
    const parentName = parentRow?.name || 'Item';

    return (
      <div className="flex flex-col h-full">
        {/* Drawer header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-1 h-5 bg-blue-500 rounded-full shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-800 truncate">{parentName}</h3>
              <p className="text-[11px] text-slate-400">{grid.rows.length} row{grid.rows.length !== 1 ? 's' : ''} · {grid.columns.length} column{grid.columns.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={() => setExpandedRowId(null)}
            className="text-slate-400 hover:text-slate-600 text-xl font-bold shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-100 shrink-0 flex-wrap">
          <button onClick={() => handleSubGridAddColumn(parentId)} className="grid-toolbar-btn sm primary">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Column
          </button>
          <button onClick={() => handleSubGridAddRow(parentId)} className="grid-toolbar-btn sm">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Row
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

        {/* Grid content */}
        <div className="flex-1 overflow-auto p-4">
          <DataGrid
            key={parentId + '-' + grid.rows.length + '-' + grid.columns.length}
            columns={subEditableColumns}
            rows={subgridRows}
            onRowsChange={newRows => handleSubGridRowsChange(parentId, newRows)}
            sortColumns={subgridSortColumns}
            onSortColumnsChange={setSubgridSortColumns}
            className="fill-grid subgrid-with-separators"
            enableVirtualization={false}
            style={{
              fontSize: '12px',
              height: '100%',
              width: '100%',
            }}
          />
        </div>
      </div>
    );
  }

  // Add handleDeleteColumn for main grid
  function handleDeleteColumn(colKey: string) {
    const currentData = getCurrentData();
    if (!currentData) return;
    const updatedColumns = currentData.columns.filter(col => col.key !== colKey);
    const updatedRows = currentData.rows.map(row => {
      const newRow = { ...row };
      delete newRow[colKey];
      return newRow;
    });
    updateCurrentData({ columns: updatedColumns, rows: updatedRows });
  }

  // In main grid columnsWithDelete, add delete button for product columns only (between Retailer Name and Retail Price)
  columnsWithDelete = columnsWithDelete.map((col, idx) => {
    // Always use special logic for 'Retailer Name' column
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
            onNameChange={newName => handleColumnNameChange(idx, newName)}
            sortIcon={getSortIcon ? getSortIcon(col.key) : null}
            onSort={() => handleSortClick(col.key)}
          />
        )
      };
    }
    return col;
  });

  // 1. Add priorityOptions
  const priorityOptions = [
    { value: 'High', label: 'High', bg: '#fee2e2', color: '#b91c1c' },
    { value: 'Medium', label: 'Medium', bg: '#fef9c3', color: '#b45309' },
    { value: 'Low', label: 'Low', bg: '#e0f2fe', color: '#0369a1' },
  ];

  // 2. Add contactOptions for 3B Contact dropdown
  const contactOptions = [
    { value: 'Volkan', label: 'Volkan', bg: '#e0f2fe', color: '#0369a1' },
    { value: 'Troy', label: 'Troy', bg: '#fef9c3', color: '#b45309' },
  ];

  // 2. Add PriorityLabel and PriorityDropdownEditCell
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

  // PriorityPickerCard is now in PriorityPickerCard.tsx — stub removed
  function _PriorityPickerCard_REMOVED({ rowIdx, colIdx, value, onSelect, onClose, columnKey }: { rowIdx: number; colIdx: number; value: string; onSelect: (v: string) => void; onClose: () => void; columnKey: string }) {
    const [focusedIdx, setFocusedIdx] = React.useState(() => priorityOptions.findIndex(opt => opt.value === value));
    const cardRef = React.useRef<HTMLDivElement>(null);
    const pos = getCellPosition(rowIdx, colIdx);

    // console.log('🎯 DEBUG: PriorityPickerCard opened');

    React.useEffect(() => {
      function handleKeyDown(e: KeyboardEvent) {
        if (!cardRef.current) return;
        if (e.key === 'ArrowDown') {
          setFocusedIdx(idx => (idx + 1) % priorityOptions.length);
          e.preventDefault();
        } else if (e.key === 'ArrowUp') {
          setFocusedIdx(idx => (idx - 1 + priorityOptions.length) % priorityOptions.length);
          e.preventDefault();
        } else if (e.key === 'Enter') {
          onSelect(priorityOptions[focusedIdx].value);
        } else if (e.key === 'Escape') {
          onClose();
        }
      }
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusedIdx, onSelect, onClose]);

    React.useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
          onClose();
        }
      }
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return ReactDOM.createPortal(
      <div
        ref={cardRef}
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          minWidth: pos.width,
          background: '#fff',
          zIndex: 99999,
          boxShadow: pos.openUpward ? '0 -4px 24px #0002' : '0 4px 24px #0002',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          padding: 4,
          marginTop: 2,
          maxHeight: pos.maxHeight,
          overflowY: 'auto',
        }}
        tabIndex={-1}
      >
        {priorityOptions.map((opt, idx) => {
          const isSelected = value === opt.value;
          const isFocused = idx === focusedIdx;
          return (
            <div
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              onMouseEnter={() => setFocusedIdx(idx)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px',
                borderRadius: 8,
                cursor: 'pointer',
                background: isSelected ? (opt.bg || '#f3f4f6') : isFocused ? '#f3f4f6' : 'transparent',
                fontWeight: isSelected ? 700 : 400,
                color: opt.color,
                boxShadow: isSelected ? '0 2px 8px #0001' : undefined,
                marginBottom: 2,
                transition: 'background 0.15s',
              }}
            >
              <span style={{ color: opt.color, fontWeight: isSelected ? 700 : 500 }}>{opt.label}</span>
              {isSelected && <span style={{ marginLeft: 'auto', color: opt.color, fontSize: 20 }}>&#10003;</span>}
            </div>
          );
        })}
      </div>,
      document.body
    );
  }

  // ContactPickerCard is now in ContactPickerCard.tsx — stub removed
  function _ContactPickerCard_REMOVED({ rowIdx, colIdx, value, onSelect, onClose, columnKey }: { rowIdx: number; colIdx: number; value: string; onSelect: (v: string) => void; onClose: () => void; columnKey: string }) {
    const [focusedIdx, setFocusedIdx] = React.useState(() => contactOptions.findIndex(opt => opt.value === value));
    const cardRef = React.useRef<HTMLDivElement>(null);
    const pos = getCellPosition(rowIdx, colIdx);

    // Debug: Log dropdown opening
    // console.log('🎯 DEBUG: ContactPickerCard opened');

    React.useEffect(() => {
      function handleKeyDown(e: KeyboardEvent) {
        if (!cardRef.current) return;
        if (e.key === 'ArrowDown') {
          setFocusedIdx(idx => (idx + 1) % contactOptions.length);
          e.preventDefault();
        } else if (e.key === 'ArrowUp') {
          setFocusedIdx(idx => (idx - 1 + contactOptions.length) % contactOptions.length);
          e.preventDefault();
        } else if (e.key === 'Enter') {
          onSelect(contactOptions[focusedIdx].value);
        } else if (e.key === 'Escape') {
          onClose();
        }
      }
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusedIdx, onSelect, onClose]);

    React.useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
          onClose();
        }
      }
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return ReactDOM.createPortal(
      <div
        ref={cardRef}
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          minWidth: pos.width,
          background: '#fff',
          zIndex: 99999,
          boxShadow: pos.openUpward ? '0 -4px 24px #0002' : '0 4px 24px #0002',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          padding: 4,
          marginTop: 2,
          maxHeight: pos.maxHeight,
          overflowY: 'auto',
        }}
        tabIndex={-1}
      >
        {contactOptions.map((opt, idx) => {
          const isSelected = value === opt.value;
          const isFocused = idx === focusedIdx;
          return (
            <div
              key={opt.value}
              onClick={() => {
                // Prevent focus from returning to the grid cell after selection
                setTimeout(() => {
                  const activeElement = document.activeElement as HTMLElement;
                  if (activeElement && activeElement.blur) {
                    activeElement.blur();
                  }
                }, 0);

                // Store current scroll position before selection
                const gridElement = gridContainerRef.current;
                if (gridElement) {
                  scrollPositionRef.current = {
                    left: gridElement.scrollLeft,
                    top: gridElement.scrollTop
                  };
                }

                // Prevent any scroll during selection
                preventScrollRef.current = true;

                onSelect(opt.value);
              }}
              onMouseEnter={() => setFocusedIdx(idx)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px',
                borderRadius: 8,
                cursor: 'pointer',
                background: isSelected ? (opt.bg || '#f3f4f6') : isFocused ? '#f3f4f6' : 'transparent',
                fontWeight: isSelected ? 700 : 400,
                color: opt.color,
                boxShadow: isSelected ? '0 2px 8px #0001' : undefined,
                marginBottom: 2,
                transition: 'background 0.15s',
              }}
            >
              <span style={{ color: opt.color, fontWeight: isSelected ? 700 : 500 }}>{opt.label}</span>
              {isSelected && <span style={{ marginLeft: 'auto', color: opt.color, fontSize: 20 }}>&#10003;</span>}
            </div>
          );
        })}
      </div>,
      document.body
    );
  }

  function CategoryReviewDateEditCell({ row, column, onRowChange }: RenderEditCellProps<Row>) {
    const [open, setOpen] = React.useState(true);
    // Parse value as MM/dd/yyyy
    const value = row[column.key] ? parseDate(row[column.key]) : null;
    return (
      <DatePicker
        selected={value}
        onChange={(date: Date | null) => {
          onRowChange({ ...row, [column.key]: date ? format(date, 'MM/dd/yyyy') : '' });
          setOpen(false);
        }}
        dateFormat="MM/dd/yyyy"
        placeholderText="Select date"
        className="w-full h-full px-2 py-1"
        todayButton="Today"
        dayClassName={(date: Date) => isToday(date) ? 'react-datepicker__day--today' : ''}
        popperPlacement="bottom"
        popperClassName="react-datepicker-popper"
        autoFocus
        open={open}
        onClickOutside={() => setOpen(false)}
        onFocus={() => setOpen(true)}
      />
    );
  }

  // Helper to parse MM/dd/yyyy or ISO
  function parseDate(val: string): Date | null {
    if (!val) return null;
    if (/\d{2}\/\d{2}\/\d{4}/.test(val)) {
      // MM/dd/yyyy
      const [month, day, year] = val.split('/').map(Number);
      return new Date(year, month - 1, day);
    }
    // Try ISO
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  // CategoryReviewDatePickerCard is now in CategoryReviewDatePickerCard.tsx — stub removed
  function _CategoryReviewDatePickerCard_REMOVED({ rowIdx, colIdx, value, onSelect, onClose, columnKey }: { rowIdx: number; colIdx: number; value: string; onSelect: (v: string) => void; onClose: () => void; columnKey: string }) {
    const cardRef = React.useRef<HTMLDivElement>(null);
    // Parse value as MM/dd/yyyy
    const [selectedDate, setSelectedDate] = React.useState(value ? parseDate(value) : null);
    const pos = getCellPosition(rowIdx, colIdx);

    // console.log('🎯 DEBUG: CategoryReviewDatePickerCard opened');

    React.useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
          onClose();
        }
      }
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return ReactDOM.createPortal(
      <div
        ref={cardRef}
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          minWidth: pos.width,
          background: '#fff',
          zIndex: 99999,
          boxShadow: pos.openUpward ? '0 -4px 24px #0002' : '0 4px 24px #0002',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          padding: 8,
          marginTop: 2,
          maxHeight: pos.maxHeight,
          overflowY: 'auto',
        }}
        tabIndex={-1}
      >
        <DatePicker
          selected={selectedDate}
          onChange={(date: Date | null) => {
            setSelectedDate(date);
            if (date) {
              onSelect(format(date, 'MM/dd/yyyy'));
            }
          }}
          dateFormat="MM/dd/yyyy"
          inline
          todayButton="Today"
          dayClassName={(date: Date) => isToday(date) ? 'react-datepicker__day--today' : ''}
        />
      </div>,
      document.body
    );
  }

  // Normalize function
  function normalizeColName(name: string) {
    return (name || '').toLowerCase().replace(/\s+/g, '').replace(/_/g, '').trim();
  }



  // Subgrid template state and helpers (per subgrid)
  const [subgridTemplateModal, setSubgridTemplateModal] = useState<null | { parentId: string | number; mode: 'save' | 'import' }>(null);
  const [subgridTemplateName, setSubgridTemplateName] = useState('');
  const [subgridIncludeRows, setSubgridIncludeRows] = useState(true);
  const [subgridSelectedTemplate, setSubgridSelectedTemplate] = useState('');
  const [subgridImportWithRows, setSubgridImportWithRows] = useState(true);
  const [subgridTemplateError, setSubgridTemplateError] = useState('');

  function loadSubgridTemplates() {
    try {
      const stored = localStorage.getItem('subgridTemplates');
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Failed to load subgrid templates from localStorage:', error);
      return [];
    }
  }
  function saveSubgridTemplates(templates: any[]) {
    try {
      localStorage.setItem('subgridTemplates', JSON.stringify(templates));
    } catch (error) {
      console.warn('Failed to save subgrid templates to localStorage:', error);
    }
  }
  const [subgridTemplates, setSubgridTemplates] = useState<any[]>(() => loadSubgridTemplates());

  function handleSaveSubgridTemplate(parentId: string | number) {
    if (!subgridTemplateName.trim()) {
      setSubgridTemplateError('Template name is required.');
      return;
    }
    if (subgridTemplates.some(t => t.name.trim().toLowerCase() === subgridTemplateName.trim().toLowerCase())) {
      setSubgridTemplateError('A template with this name already exists.');
      return;
    }
    const grid = subGrids[parentId];
    if (!grid) {
      setSubgridTemplateError('No subgrid found.');
      return;
    }
    const newTemplate = {
      name: subgridTemplateName.trim(),
      columns: grid.columns,
      rows: subgridIncludeRows ? grid.rows : undefined
    };
    const newTemplates = [...subgridTemplates, newTemplate];
    setSubgridTemplates(newTemplates);
    saveSubgridTemplates(newTemplates);
    setSubgridTemplateModal(null);
    setSubgridTemplateName('');
    setSubgridIncludeRows(true);
    setSubgridTemplateError('');
    toast.success('Subgrid template saved!');
  }

  function handleImportSubgridTemplate(parentId: string | number) {
    const template = subgridTemplates.find(t => t.name === subgridSelectedTemplate);
    if (!template) {
      setSubgridTemplateError('Please select a template.');
      return;
    }
    setSubGrids(prev => ({
      ...prev,
      [parentId]: {
        columns: template.columns,
        rows: subgridImportWithRows && template.rows ? template.rows : prev[parentId]?.rows || []
      }
    }));
    setSubgridTemplateModal(null);
    setSubgridSelectedTemplate('');
    setSubgridImportWithRows(true);
    setSubgridTemplateError('');
    toast.success('Subgrid template imported!');
  }

  // Add state for comment delete confirmation
  const [confirmDeleteComment, setConfirmDeleteComment] = useState<{ rowId: number, commentIdx: number } | null>(null);

  // Modern editable column header for user-added columns
  function EditableColumnHeader({ col, idx, onNameChange, sortIcon, onSort }: { col: MyColumn, idx: number, onNameChange: (newName: string) => void, sortIcon?: React.ReactNode, onSort?: () => void }) {
    const [editing, setEditing] = React.useState(false);
    const [inputValue, setInputValue] = React.useState(col.name as string);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      setInputValue(col.name as string);
    }, [col.name]);

    React.useEffect(() => {
      if (editing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [editing]);

    // Click outside to exit edit mode
    React.useEffect(() => {
      if (!editing) return;
      function handleClickOutside(e: MouseEvent) {
        if (
          containerRef.current &&
          !containerRef.current.contains(e.target as Node)
        ) {
          setEditing(false);
          setInputValue(col.name as string);
          if (inputRef.current) inputRef.current.blur();
          // Remove focus from grid header cell
          if (document.activeElement && (document.activeElement as HTMLElement).classList.contains('rdg-header-cell')) {
            (document.activeElement as HTMLElement).blur();
          }
        }
      }
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [editing, col.name]);

    const commitChange = (fromBlur = false, event?: React.SyntheticEvent) => {
      if (event) event.stopPropagation();
      if (inputValue.trim() && inputValue !== col.name) {
        onNameChange(inputValue.trim());
        setEditing(false);
        if (inputRef.current) inputRef.current.blur();
        if (document.activeElement && (document.activeElement as HTMLElement).classList.contains('rdg-header-cell')) {
          (document.activeElement as HTMLElement).blur();
        }
      } else if (fromBlur) {
        setEditing(false);
        setInputValue(col.name as string);
        if (inputRef.current) inputRef.current.blur();
        if (document.activeElement && (document.activeElement as HTMLElement).classList.contains('rdg-header-cell')) {
          (document.activeElement as HTMLElement).blur();
        }
      }
    };

    // Determine if this is a user-added column (not default/system, not special columns)
    const isUserAdded = col.isDefault !== true && col.key !== 'priority' && col.key !== '_delete_row' && col.key !== 'comments' && col.key !== 'name';

    return (
      <div
        ref={containerRef}
        className={`flex items-center gap-1 group relative px-1 py-0.5 rounded transition-all ${editing ? 'custom-col-editing' : ''}`}
        style={{ minWidth: 80, maxWidth: 180 }}
      >
        {editing ? (
          <>
            <input
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitChange(false, e);
                if (e.key === 'Escape') { setEditing(false); setInputValue(col.name as string); if (inputRef.current) inputRef.current.blur(); if (document.activeElement && (document.activeElement as HTMLElement).classList.contains('rdg-header-cell')) { (document.activeElement as HTMLElement).blur(); } }
              }}
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm transition-all outline-none focus:outline-none"
              style={{ width: Math.max(80, inputValue.length * 10) }}
              onBlur={() => commitChange(true)}
              maxLength={32}
              tabIndex={0}
              autoFocus
            />
            <button
              onClick={e => commitChange(false, e)}
              className="ml-1 text-green-600 hover:text-green-800"
              title="Save"
              tabIndex={-1}
              style={{ fontSize: 18 }}
            >✓</button>
            <button
              onClick={() => { setEditing(false); setInputValue(col.name as string); if (inputRef.current) inputRef.current.blur(); if (document.activeElement && (document.activeElement as HTMLElement).classList.contains('rdg-header-cell')) { (document.activeElement as HTMLElement).blur(); } }}
              className="ml-1 text-slate-400 hover:text-red-600"
              title="Cancel"
              tabIndex={-1}
              style={{ fontSize: 18 }}
            >×</button>
          </>
        ) : (
          <>
            <span className="truncate text-sm font-medium" style={{ maxWidth: 100 }}>{col.name}</span>
            <button
              className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-600"
              style={{ fontSize: 16, background: 'none', border: 'none', cursor: 'pointer' }}
              title="Edit column name"
              tabIndex={-1}
              onClick={e => { e.stopPropagation(); setEditing(true); }}
            ><svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" /></svg></button>
            {isUserAdded && (
              <button
                className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600"
                style={{ fontSize: 16, background: 'none', border: 'none', cursor: 'pointer' }}
                title="Delete column"
                tabIndex={-1}
                onClick={e => { e.stopPropagation(); setConfirmDelete({ type: 'column', id: col.key }); }}
              ><svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg></button>
            )}
            {sortIcon && (
              <span
                className="ml-1 cursor-pointer"
                onClick={e => { e.stopPropagation(); onSort && onSort(); }}
                title="Sort column"
                style={{ display: 'flex', alignItems: 'center' }}
              >
                {sortIcon}
              </span>
            )}
          </>
        )}
      </div>
    );
  }

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/api/scorecards', {
          credentials: 'include',
        });
        if (response.ok) {
          const scorecardsData = await response.json();
          const formattedScorecards = scorecardsData.map((sc: any) => ({
            id: sc.id,
            name: sc.title,
            columns: (sc.data.columns || retailersColumns)
              .filter((col: any) => col.key !== 'brand_lead')
              .map((col: any) => {
                // Update any old "Category Manager" column names to "3B Contact"
                if (col.key === 'cmg' && col.name === 'Category Manager') {
                  return { ...col, name: '3B Contact' };
                }
                return col;
              }),
            rows: sc.data.rows || [],
            createdAt: new Date(sc.created_at),
            lastModified: new Date(sc.last_modified),
            data: sc.data,
          }));
          setScorecards(formattedScorecards);
          if (formattedScorecards.length > 0) {
            setEditingScoreCard(formattedScorecards[0]);
            setSelectedCategory(formattedScorecards[0].id);
          }
        } else {
          // Fall back to localStorage if API fails
          const localScorecards = loadScoreCardsFromStorage();
          const filteredLocalScorecards = localScorecards.map(sc => ({
            ...sc,
            columns: sc.columns
              .filter((col: any) => col.key !== 'brand_lead')
              .map((col: any) => {
                // Update any old "Category Manager" column names to "3B Contact"
                if (col.key === 'cmg' && col.name === 'Category Manager') {
                  return { ...col, name: '3B Contact' };
                }
                return col;
              })
          }));
          setScorecards(filteredLocalScorecards);
          if (filteredLocalScorecards.length > 0) {
            setEditingScoreCard(filteredLocalScorecards[0]);
            setSelectedCategory(filteredLocalScorecards[0].id);
          }
        }
      } catch (error) {
        // Fall back to localStorage on error
        const localScorecards = loadScoreCardsFromStorage();
        const filteredLocalScorecards = localScorecards.map(sc => ({
          ...sc,
          columns: sc.columns
            .filter((col: any) => col.key !== 'brand_lead')
            .map((col: any) => {
              // Update any old "Category Manager" column names to "3B Contact"
              if (col.key === 'cmg' && col.name === 'Category Manager') {
                return { ...col, name: '3B Contact' };
              }
              return col;
            })
        }));
        setScorecards(filteredLocalScorecards);
        if (filteredLocalScorecards.length > 0) {
          setEditingScoreCard(filteredLocalScorecards[0]);
          setSelectedCategory(filteredLocalScorecards[0].id);
        }
      }
    };
    loadData();
  }, []);

  // --- Save before logout ---
  async function handleLogout() {
    if (hasUnsavedChanges) {
      try {
        await forceSave();
      } catch (e) {
        // Ignore save error, proceed with logout
      }
    }
    // Proceed with logout with better mobile handling
    try {
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/logout';
      }
    } catch (redirectError) {
      console.error('Redirect error:', redirectError);
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/logout';
      }
    }
  }

  // Export Excel function with modern hierarchical table design
  async function handleExportExcel(excludeSubgrid = false) {
    const XLSX = await import('xlsx');
    const currentData = getCurrentData();
    if (!currentData) {
      toast.error('No data to export');
      return;
    }
    const workbook = XLSX.utils.book_new();
    const modernRows: any[] = [];
    currentData.rows.forEach(parentRow => {
      const subgrid = subGrids[parentRow.id];
      const hasChildren = subgrid && subgrid.rows.length > 0;
      // Add parent row
      const parentRowData: any = {
        'Parent Indicator': hasChildren ? '🔵 PARENT' : '🟣 PARENT (No Children)',
        'Type': 'Parent',
        'Has Children': hasChildren ? 'Yes' : 'No',
        'Children Count': hasChildren ? subgrid.rows.length : 0
      };
      currentData.columns.forEach(col => {
        if (col.key !== 'comments' && col.key !== '_delete_row') {
          const colName = String(col.name || col.key);
          parentRowData[colName] = parentRow[col.key] || '';
        }
      });
      modernRows.push(parentRowData);
      if (!excludeSubgrid && hasChildren) {
        subgrid.rows.forEach((subRow, index) => {
          const isLastChild = index === subgrid.rows.length - 1;
          const childRowData: any = {
            'Parent Indicator': isLastChild ? '└─ CHILD' : '├─ CHILD',
            'Type': 'Child',
            'Child Number': index + 1,
            'Parent Name': parentRow.name || ''
          };
          subgrid.columns.forEach(col => {
            if (col.key !== 'delete') {
              const colName = String(col.name || col.key);
              childRowData[colName] = subRow[col.key] || '';
            }
          });
          modernRows.push(childRowData);
        });
      }
    });
    const worksheet = XLSX.utils.json_to_sheet(modernRows);
    const scorecardName = (editingScoreCard?.name || 'scorecard').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.utils.book_append_sheet(workbook, worksheet, scorecardName.slice(0, 31));
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `${scorecardName}_${timestamp}.xlsx`;
    XLSX.writeFile(workbook, filename);
    toast.success(`Exported as ${filename}`);
  }

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    filename: string;
    formattedRows: Row[];
    toUpdate: number;
    toAdd: number;
    toSkip: number;
  } | null>(null);

  // Subgrid Export Excel
  async function handleExportSubgridExcel(parentId: string | number) {
    const XLSX = await import('xlsx');
    const grid = subGrids[parentId];
    if (!grid) {
      toast.error('No subgrid data to export');
      return;
    }
    const exportRows = grid.rows.map((row, idx) => {
      const obj: any = {};
      grid.columns.forEach(col => {
        if (col.key !== 'delete') {
          obj[String(col.name || col.key)] = row[col.key] ?? '';
        }
      });
      return obj;
    });
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    const scorecardName = (editingScoreCard?.name || 'scorecard').replace(/[^a-zA-Z0-9_-]/g, '_');
    const parentRow = getCurrentData()?.rows.find(r => r.id === parentId);
    const parentName = (parentRow?.name || 'subgrid').replace(/[^a-zA-Z0-9_-]/g, '_');
    const sheetName = `${scorecardName}_${parentName}`.slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `${scorecardName}_${parentName}_subgrid_${timestamp}.xlsx`;
    XLSX.writeFile(workbook, filename);
    toast.success(`Exported subgrid as ${filename}`);
  }

  // Subgrid Import Excel
  function handleImportSubgridExcel(event: React.ChangeEvent<HTMLInputElement>, parentId: string | number) {
    const file = event.target.files?.[0];
    if (!file) return;
    const grid = subGrids[parentId];
    if (!grid) {
      toast.error('No subgrid found for import');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const XLSX = await import('xlsx');
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows2D: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (rows2D.length === 0) return;
      const headerRowIndex = 0;
      const headers = rows2D[headerRowIndex];
      if (!headers || headers.length === 0) {
        toast.error('No headers found in Excel/CSV file!');
        return;
      }
      function normalizeColName(name: string) {
        return (name || '').toLowerCase().replace(/\s+/g, '').replace(/_/g, '').trim();
      }
      const gridColNames = grid.columns.filter(col => col.key !== 'delete').map(col => normalizeColName(String(col.name)));
      const excelColNames = headers.map(h => normalizeColName(String(h)));
      // Detect duplicates in Excel columns
      const excelColNameCounts: Record<string, number> = {};
      excelColNames.forEach(name => {
        excelColNameCounts[name] = (excelColNameCounts[name] || 0) + 1;
      });
      const duplicateExcelCols = Object.entries(excelColNameCounts).filter(([_, count]) => count > 1).map(([name]) => name);
      if (duplicateExcelCols.length > 0) {
        toast.error(`Duplicate columns detected in Excel/CSV file after normalization: ${duplicateExcelCols.join(', ')}. Please remove or rename duplicates.`);
        return;
      }
      const missingCols = gridColNames.filter(name => !excelColNames.includes(name));
      const extraCols = excelColNames.filter(name => !gridColNames.includes(name));
      if (
        gridColNames.length !== excelColNames.length ||
        missingCols.length > 0 ||
        extraCols.length > 0
      ) {
        let msg = 'Column names in the Excel/CSV file do not match the current subgrid columns.';
        if (missingCols.length > 0) {
          msg += `\nMissing columns: ${missingCols.join(', ')}`;
        }
        if (extraCols.length > 0) {
          msg += `\nExtra columns: ${extraCols.join(', ')}`;
        }
        toast.error(msg);
        return;
      }
      // Build a mapping from grid column key to Excel column index
      const colKeyToExcelIdx: Record<string, number> = {};
      grid.columns.forEach((col) => {
        if (col.key === 'delete') return;
        const normName = normalizeColName(String(col.name));
        const excelIdx = excelColNames.findIndex(name => name === normName);
        if (excelIdx !== -1) {
          colKeyToExcelIdx[col.key] = excelIdx;
        }
      });
      const dataRows = rows2D.slice(headerRowIndex + 1).filter(row => row.some(cell => cell && String(cell).trim() !== ''));
      const formattedRows = dataRows.map((rowArr: any[], idx: number) => {
        const obj: any = {};
        Object.entries(colKeyToExcelIdx).forEach(([colKey, excelIdx]) => {
          obj[colKey] = rowArr[excelIdx] ?? '';
        });
        obj.id = idx + 1;
        return obj;
      });
      setSubGrids(prev => ({
        ...prev,
        [parentId]: {
          ...prev[parentId],
          rows: formattedRows
        }
      }));
      toast.success('Subgrid import successful!');
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  }

  // Add state for exclude subgrid data in export modal
  const [excludeSubgridExport, setExcludeSubgridExport] = useState(false);

  return (
    <>
      <Toaster position="top-right" richColors />
      <style jsx global>{`
        .rdg-cell:focus, .rdg-cell.rdg-cell-selected {
          outline: none !important;
          box-shadow: none !important;
          border: none !important;
        }
        .dropdown-menu {
          pointer-events: auto !important;
        }
        .rdg, .rdg * {
          pointer-events: auto !important;
        }
        /* Force React Select dropdown menu to be visible and on top */
        .Select__menu, .react-select__menu, .Select-menu, .Select-menu-outer {
          z-index: 99999 !important;
          display: block !important;
          opacity: 1 !important;
          pointer-events: auto !important;
        }
        /* Ensure react-datepicker calendar popup is above everything */
        .react-datepicker-popper {
          z-index: 99999 !important;
        }
        /* Add this to your global CSS (e.g., in globals.css or a style tag): */
        /* .custom-col-editing { background: #fff; box-shadow: 0 0 0 2px #2563eb; border-radius: 6px; } */
      `}</style>
      <div className="flex h-screen w-full">
        {/* Sidebar */}
        <aside
          className="h-full bg-white border-r border-slate-200 shadow-sm flex flex-col shrink-0 transition-all duration-200 ease-in-out overflow-hidden"
          style={{ width: sidebarCollapsed ? 0 : 240, opacity: sidebarCollapsed ? 0 : 1 }}
        >
          <div className="px-4 pt-5 pb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Workspaces</h3>
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="p-1 text-slate-300 hover:text-slate-500 hover:bg-slate-100 rounded transition-colors"
              title="Collapse sidebar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" /></svg>
            </button>
          </div>

          <div className="px-3 mb-2">
            <button
              onClick={() => handleCategoryChange('master-scorecard')}
              className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-all flex items-center gap-2 text-sm ${selectedCategory === 'master-scorecard' ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-600'}`}
              style={{ borderLeft: selectedCategory === 'master-scorecard' ? '3px solid #3b82f6' : '3px solid transparent' }}
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
              <span>Master Scorecard</span>
              <span className="ml-auto text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-semibold">
                Dashboard
              </span>
            </button>
          </div>

          <div className="px-3">
            {dataCategories.map(cat => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
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
              {userRole === 'ADMIN' && (
                <button
                  onClick={() => setShowCreateScoreCardModal(true)}
                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="Create New ScoreCard"
                >
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
              .filter(sc => !sidebarSearch || sc.name.toLowerCase().includes(sidebarSearch.toLowerCase()))
              .map(scorecard => (
              <div key={scorecard.id} className="mb-0.5">
                <div className="flex items-center justify-between group">
                  <button
                    onClick={() => handleCategoryChange(scorecard.id)}
                    className={`flex-1 text-left px-3 py-2 rounded-lg font-medium transition-all text-sm truncate ${selectedCategory === scorecard.id ? 'bg-slate-100 text-slate-900' : 'hover:bg-slate-50 text-slate-600'}`}
                    style={{ borderLeft: selectedCategory === scorecard.id ? '3px solid #3b82f6' : '3px solid transparent' }}
                    title={scorecard.name}
                  >
                    <div className="flex items-center">
                      <span className="truncate">{scorecard.name}</span>
                      {selectedCategory === scorecard.id && editingScoreCard?.id === scorecard.id && (
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
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => {
                          setEditingScoreCard(scorecard);
                          setShowEditScoreCardModal(true);
                        }}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"
                        title="Edit ScoreCard"
                      >
                        <FaEdit size={11} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete({ type: 'scorecard', id: scorecard.id })}
                        className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                        title="Delete ScoreCard"
                      >
                        <FaTrash size={11} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {scorecards.length === 0 && (
              <p className="text-xs text-slate-400 italic px-3 py-3">
                No scorecards yet.{userRole === 'ADMIN' && ' Click + to create one.'}
              </p>
            )}

            {sidebarSearch && scorecards.filter(sc => sc.name.toLowerCase().includes(sidebarSearch.toLowerCase())).length === 0 && scorecards.length > 0 && (
              <p className="text-xs text-slate-400 italic px-3 py-3">
                No match for &ldquo;{sidebarSearch}&rdquo;
              </p>
            )}
          </div>
        </aside>

        {/* Sidebar expand button (shown when collapsed) */}
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="h-full w-10 shrink-0 bg-white border-r border-slate-200 flex flex-col items-center pt-4 hover:bg-slate-50 transition-colors group"
            title="Expand sidebar"
          >
            <svg className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" /></svg>
          </button>
        )}

        {/* Main Content */}
        <main className="flex-1 h-full flex flex-col p-6 overflow-auto bg-slate-50">
          {/* Auto-save wrapper (no toast on routine save — uses inline indicator instead) */}
          {editingScoreCard && (
            <ScorecardAutoSaveWrapper
              key={editingScoreCard.id}
              scorecard={editingScoreCard}
              onSaveSuccess={(savedData?: any) => {
                if (savedData && savedData.id && editingScoreCard && editingScoreCard.id !== savedData.id) {
                  const oldId = editingScoreCard.id;
                  const newId = savedData.id;
                  setScorecards(prev => prev.map(sc =>
                    sc.id === oldId ? { ...sc, id: newId, ...savedData } : sc
                  ));
                  if (selectedCategory === oldId) {
                    setSelectedCategory(newId);
                  }
                  setEditingScoreCard(prev => prev ? { ...prev, id: newId } : null);
                }
                // No toast — inline SaveStatus indicator shows feedback
              }}
              onSaveError={(error) => {
                toast.error(`Save failed: ${error.message}`);
              }}
            />
          )}

          {/* Row Edit Toggle Button and Import */}
          {selectedCategory && isScorecard(selectedCategory) && (
            <div className="flex items-center justify-between gap-2 pb-3 flex-wrap sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 -mx-6 px-6 pt-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <button onClick={openAddColModal} className="grid-toolbar-btn primary" disabled={userRole !== 'ADMIN'}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Add Column
                </button>
                <span className="relative flex items-center group">
                  <FaInfoCircle className="text-slate-400 group-hover:text-blue-500 cursor-pointer" size={14} />
                  <div className="absolute left-1/2 top-full mt-2 ml-2 w-64 bg-slate-800 text-white text-xs rounded-lg p-2.5 shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity duration-150" style={{ whiteSpace: 'normal' }}>
                    To import data, columns and data types must match exactly.
                  </div>
                </span>
                <label htmlFor="main-import-excel" className="grid-toolbar-btn cursor-pointer" onClick={() => toast.warning('Importing an Excel file will overwrite all existing data in this scorecard.')}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                  Import
                </label>
                <input id="main-import-excel" type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportExcel} />
                <button onClick={() => setShowExportModal(true)} className="grid-toolbar-btn">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12M12 16.5V3" /></svg>
                  Export
                </button>
              </div>
              <div className="flex items-center gap-3">
                {/* Inline save status indicator — like Google Docs "All changes saved" */}
                {editingScoreCard && (
                  <SaveStatus
                    status={saveStatus}
                    lastSaved={lastSaved}
                    error={saveError}
                    hasUnsavedChanges={hasUnsavedChanges}
                    isOnline={isOnline}
                    onRetry={forceSave}
                  />
                )}
                <div className="w-px h-5 bg-slate-200" />
                <button onClick={() => setShowSaveTemplateModal(true)} className="grid-toolbar-btn" disabled={userRole !== 'ADMIN'}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
                  Save Template
                </button>
                <button
                  onClick={async () => {
                    await fetchTemplates();
                    if (templates.length === 0) {
                      toast.error('No templates available. Please save a template first.');
                      return;
                    }
                    setShowImportTemplateModal(true);
                  }}
                  className="grid-toolbar-btn"
                  disabled={userRole !== 'ADMIN'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                  Load Template
                </button>
              </div>
            </div>
          )}

          {/* Master Scorecard */}
          {selectedCategory === 'master-scorecard' && (
            <MasterScorecard
              key={`master-${scorecards.length}-${scorecards.map(sc => sc.lastModified).join('-')}`} // Force refresh when scorecards change
              selectedScorecardId={lastSelectedScorecardId || (scorecards.length > 0 ? scorecards[0].id : undefined)}
              availableScorecards={scorecards
                .filter(sc => {
                  // Check if scorecard has product columns (user-added columns)
                  const columns = sc.columns || [];
                  const retailerCol = columns.find(col => col.name === 'Retailer Name' || col.key === 'name');
                  if (!retailerCol) return false;

                  const productCols = columns.filter(col =>
                    col.key !== retailerCol.key &&
                    !col.isDefault &&
                    col.key !== 'comments' &&
                    col.key !== '_delete_row'
                  );
                  return productCols.length > 0;
                })
                .map(sc => ({ id: sc.id, title: sc.name }))
              }
              onCustomerClick={(customerId) => {
                // Switch to the customer's scorecard
                handleCategoryChange(customerId);
              }}
            />
          )}

          {/* DataGrid */}
          {selectedCategory !== 'master-scorecard' && getCurrentData() && getCurrentData()?.columns && getCurrentData()?.rows ? (
            <div ref={gridContainerRef} className="flex-1 w-full flex flex-col" style={{ position: 'relative', minHeight: 'calc(100vh - 120px)' }}>
              <DataGrid
                ref={gridRef}
                key={JSON.stringify(getCurrentData())}
                style={{
                  height: '100%',
                  width: '100%',
                  // Disable scroll when dropdown is open
                  overflow: (contactPicker || priorityPicker || statusPicker || categoryReviewDatePicker) ? 'hidden' : 'auto'
                }}
                // Prevent auto-scroll behavior (ChatGPT's solution)
                enableVirtualization={false}
                onSelectedRowsChange={() => { }} // No-op handler to prevent selection
                onSelectedCellChange={() => { }} // No-op handler to prevent cell selection
                columns={columnsWithDelete.map((col, colIdx) => {
                  if (colIdx === 0) {
                    return {
                      ...col,
                      renderCell: (props: any) => {
                        if (props.row && props.row.isAddRow) {
                          return (
                            <button
                              onClick={handleAddRow}
                              className="w-full h-full flex items-center justify-center text-slate-400 hover:text-blue-600 text-sm font-medium transition-colors"
                            >
                              + Add Row
                            </button>
                          );
                        }
                        // Only show expand/collapse chevrons for main grid rows, not subgrid rows
                        if (props.row && !props.row.isSubRow && subGrids[props.row.id]) {
                          // ...existing chevron logic...
                        }
                        return col.renderCell ? col.renderCell(props) : props.row[col.key];
                      },
                      editable: (row: Row) => !(row && row.isAddRow),
                      renderEditCell: (props: any) => (props.row && props.row.isAddRow ? null : col.renderEditCell ? col.renderEditCell(props) : null)
                    };
                  }
                  return {
                    ...col,
                    renderCell: (props: any) => {
                      if (props.row && props.row.isAddRow) return null;
                      return col.renderCell ? col.renderCell(props) : props.row[col.key];
                    },
                    editable: (row: Row) => !(row && row.isAddRow),
                    renderEditCell: (props: any) => (props.row && props.row.isAddRow ? null : col.renderEditCell ? col.renderEditCell(props) : null)
                  };
                })}
                rows={getRowsWithSubRows()}
                onRowsChange={newRows => {
                  // Prevent grid updates when dropdown is open
                  if (contactPicker || priorityPicker || statusPicker || categoryReviewDatePicker) {
                    return;
                  }
                  // Filter out the add row before updating state
                  const filteredRows = newRows.filter(r => !(r as any).isAddRow);
                  onRowsChange(filteredRows as Row[]);
                }}
                onScroll={e => {
                  // Prevent scroll when dropdown is open
                  if (contactPicker || priorityPicker || statusPicker || categoryReviewDatePicker) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                  }
                }}
                sortColumns={sortColumns}
                onSortColumnsChange={setSortColumns}
                className="fill-grid main-grid-with-separators"
                onCellClick={(args) => {
                  const { rowIdx, column, row } = args;
                  // console.log('🎯 DEBUG: Cell clicked:', { column: column.key, rowIdx, isAddRow: row.isAddRow });
                  // Only for user-added product status columns, not Priority or Add Row
                  const isProductColumn = (() => {
                    const retailerNameIdx = columnsWithDelete.findIndex(col => col.key === 'name');
                    const retailPriceIdx = columnsWithDelete.findIndex(col => col.key === 'retail_price');
                    const colIdx = columnsWithDelete.findIndex(c => c.key === column.key);
                    // Only user-added columns (not isDefault, not priority)
                    const colObj = columnsWithDelete[colIdx];
                    return (
                      typeof retailerNameIdx === 'number' && typeof retailPriceIdx === 'number' &&
                      colIdx > retailerNameIdx && colIdx < retailPriceIdx &&
                      colObj && colObj.isDefault !== true && colObj.key !== 'priority'
                    );
                  })();
                  if (row.isAddRow) return;
                  if (isProductColumn) {
                    // console.log('🎯 DEBUG: Opening StatusPicker for product column:', column.key);
                    const colIdx = columnsWithDelete.findIndex(c => c.key === column.key);
                    setStatusPicker({
                      rowIdx,
                      colIdx,
                      ...getCellPosition(rowIdx, colIdx),
                      value: row[column.key],
                      columnKey: column.key
                    });
                    return;
                  }
                  // For Priority column, open PriorityPickerCard on single click
                  if (column.key === 'priority') {
                    // console.log('🎯 DEBUG: Opening PriorityPicker for priority column');
                    const colIdx = columnsWithDelete.findIndex(c => c.key === 'priority');
                    setPriorityPicker({
                      rowIdx,
                      colIdx,
                      ...getCellPosition(rowIdx, colIdx),
                      value: row[column.key],
                      columnKey: column.key
                    });
                    return;
                  }
                  // For Contact column, open ContactPickerCard on single click
                  if (column.key === 'cmg') {
                    // console.log('🎯 DEBUG: Opening ContactPicker for contact column');

                    const colIdx = columnsWithDelete.findIndex(c => c.key === 'cmg');
                    const contactPickerData = {
                      rowIdx,
                      colIdx,
                      ...getCellPosition(rowIdx, colIdx),
                      value: row[column.key],
                      columnKey: column.key
                    };

                    // Store current scroll position BEFORE opening dropdown
                    const gridElement = gridContainerRef.current;
                    if (gridElement) {
                      scrollPositionRef.current = {
                        left: gridElement.scrollLeft,
                        top: gridElement.scrollTop
                      };
                    }

                    // Prevent the grid from focusing the cell by blurring any focused elements
                    const activeElement = document.activeElement as HTMLElement;
                    if (activeElement && activeElement.blur) {
                      activeElement.blur();
                    }

                    // Also blur any grid cells that might have focus
                    const gridCells = document.querySelectorAll('.rdg-cell');
                    gridCells.forEach(cell => {
                      if (cell instanceof HTMLElement) {
                        cell.blur();
                      }
                    });

                    // Temporarily disable grid pointer events to prevent focus
                    if (gridElement) {
                      gridElement.style.pointerEvents = 'none';
                    }

                    setContactPicker(contactPickerData);

                    // ROCK SOLID: Immediately blur any focused elements to prevent focus-triggered scroll
                    setTimeout(() => {
                      const activeElement = document.activeElement as HTMLElement;
                      if (activeElement && activeElement.blur) {
                        activeElement.blur();
                      }
                    }, 0);

                    // Re-enable grid interaction after a short delay
                    setTimeout(() => {
                      if (gridElement) {
                        gridElement.style.pointerEvents = 'auto';
                      }
                    }, 100);

                    return;
                  }
                  // For CategoryReviewDate column, enter edit mode on single click
                  if (column.key === 'category_review_date') {
                    // console.log('🎯 DEBUG: Opening CategoryReviewDatePicker for date column');
                    const colIdx = columnsWithDelete.findIndex(c => c.key === 'category_review_date');
                    setCategoryReviewDatePicker({
                      rowIdx,
                      colIdx,
                      ...getCellPosition(rowIdx, colIdx),
                      value: row[column.key],
                      columnKey: column.key
                    });
                    return;
                  }
                }}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-lg" style={{ minHeight: '60vh' }}>
              {selectedCategory === 'master-scorecard' ? 'Loading Master Scorecard...' : scorecards.length === 0 ? 'No ScoreCards yet. Please create one.' : 'Please select a ScoreCard.'}
            </div>
          )}
          {statusPicker && (
            <StatusPickerCard
              position={statusPicker}
              value={statusPicker.value}
              columnKey={statusPicker.columnKey}
              onSelect={v => {
                // Store current scroll position BEFORE updating the grid
                const gridElement = gridContainerRef.current;
                let currentScrollLeft = 0;
                let currentScrollTop = 0;

                if (gridElement) {
                  currentScrollLeft = gridElement.scrollLeft;
                  currentScrollTop = gridElement.scrollTop;
                  // Store in ref for later use
                  scrollPositionRef.current = { left: currentScrollLeft, top: currentScrollTop };

                  // Enable scroll prevention
                  preventScrollRef.current = true;

                  // Temporarily disable grid focus behavior
                  gridElement.style.pointerEvents = 'none';
                }

                // Close dropdown FIRST to prevent any interference
                setStatusPicker(null);

                // Use a completely different approach - prevent React-Data-Grid from updating and causing scroll
                setTimeout(() => {
                  // Get the current data and update it directly
                  const currentData = getCurrentData();
                  if (currentData) {
                    // Create a new data object with the updated row
                    const updatedRows = [...currentData.rows];
                    updatedRows[statusPicker.rowIdx] = {
                      ...updatedRows[statusPicker.rowIdx],
                      [statusPicker.columnKey]: v
                    };

                    // Update the data directly without going through onRowsChange
                    updateCurrentData({ rows: updatedRows });

                    // Force restore scroll position after a short delay
                    setTimeout(() => {
                      if (scrollPositionRef.current && gridElement) {
                        gridElement.scrollLeft = scrollPositionRef.current.left;
                        gridElement.scrollTop = scrollPositionRef.current.top;

                        // Also blur any focused elements to prevent focus-triggered scroll
                        const activeElement = document.activeElement as HTMLElement;
                        if (activeElement && activeElement.blur) {
                          activeElement.blur();
                        }

                        // Re-enable grid interaction
                        gridElement.style.pointerEvents = 'auto';

                        // Disable scroll prevention after a delay
                        setTimeout(() => {
                          preventScrollRef.current = false;
                        }, 100);
                      }
                    }, 10);
                  }
                }, 0);
              }}
              onClose={() => setStatusPicker(null)}
            />
          )}

          {priorityPicker && (
            <PriorityPickerCard
              position={priorityPicker}
              value={priorityPicker.value}
              columnKey={priorityPicker.columnKey}
              onSelect={v => {
                // Store current scroll position BEFORE updating the grid
                const gridElement = gridContainerRef.current;
                let currentScrollLeft = 0;
                let currentScrollTop = 0;

                if (gridElement) {
                  currentScrollLeft = gridElement.scrollLeft;
                  currentScrollTop = gridElement.scrollTop;
                  // Store in ref for later use
                  scrollPositionRef.current = { left: currentScrollLeft, top: currentScrollTop };

                  // Enable scroll prevention
                  preventScrollRef.current = true;

                  // Temporarily disable grid focus behavior
                  gridElement.style.pointerEvents = 'none';
                }

                // Close dropdown FIRST to prevent any interference
                setPriorityPicker(null);

                // Use a completely different approach - prevent React-Data-Grid from updating and causing scroll
                setTimeout(() => {
                  // Get the current data and update it directly
                  const currentData = getCurrentData();
                  if (currentData) {
                    // Create a new data object with the updated row
                    const updatedRows = [...currentData.rows];
                    updatedRows[priorityPicker.rowIdx] = {
                      ...updatedRows[priorityPicker.rowIdx],
                      [priorityPicker.columnKey]: v
                    };

                    // Update the data directly without going through onRowsChange
                    updateCurrentData({ rows: updatedRows });

                    // Force restore scroll position after a short delay
                    setTimeout(() => {
                      if (scrollPositionRef.current && gridElement) {
                        gridElement.scrollLeft = scrollPositionRef.current.left;
                        gridElement.scrollTop = scrollPositionRef.current.top;

                        // Also blur any focused elements to prevent focus-triggered scroll
                        const activeElement = document.activeElement as HTMLElement;
                        if (activeElement && activeElement.blur) {
                          activeElement.blur();
                        }

                        // Re-enable grid interaction
                        gridElement.style.pointerEvents = 'auto';

                        // Disable scroll prevention after a delay
                        setTimeout(() => {
                          preventScrollRef.current = false;
                        }, 100);
                      }
                    }, 10);
                  }
                }, 0);
              }}
              onClose={() => setPriorityPicker(null)}
            />
          )}

          {contactPicker && (
            <ContactPickerCard
              position={contactPicker}
              value={contactPicker.value}
              columnKey={contactPicker.columnKey}
              onSelect={v => {
                // Store current scroll position BEFORE updating the grid
                const gridElement = gridContainerRef.current;
                let currentScrollLeft = 0;
                let currentScrollTop = 0;

                if (gridElement) {
                  currentScrollLeft = gridElement.scrollLeft;
                  currentScrollTop = gridElement.scrollTop;
                  // Store in ref for later use
                  scrollPositionRef.current = { left: currentScrollLeft, top: currentScrollTop };

                  // Enable scroll prevention
                  preventScrollRef.current = true;

                  // Temporarily disable grid focus behavior
                  gridElement.style.pointerEvents = 'none';
                }

                // Close dropdown FIRST to prevent any interference
                setContactPicker(null);

                // Use a completely different approach - prevent React-Data-Grid from updating and causing scroll
                setTimeout(() => {
                  // Get the current data and update it directly
                  const currentData = getCurrentData();
                  if (currentData) {
                    // Create a new data object with the updated row
                    const updatedRows = [...currentData.rows];
                    updatedRows[contactPicker.rowIdx] = {
                      ...updatedRows[contactPicker.rowIdx],
                      [contactPicker.columnKey]: v
                    };

                    // Update the data directly without going through onRowsChange
                    updateCurrentData({ rows: updatedRows });

                    // Force restore scroll position after a short delay
                    setTimeout(() => {
                      if (scrollPositionRef.current && gridElement) {
                        gridElement.scrollLeft = scrollPositionRef.current.left;
                        gridElement.scrollTop = scrollPositionRef.current.top;

                        // Also blur any focused elements to prevent focus-triggered scroll
                        const activeElement = document.activeElement as HTMLElement;
                        if (activeElement && activeElement.blur) {
                          activeElement.blur();
                        }

                        // Re-enable grid interaction
                        gridElement.style.pointerEvents = 'auto';

                        // Disable scroll prevention after a delay
                        setTimeout(() => {
                          preventScrollRef.current = false;
                        }, 100);
                      }
                    }, 10);
                  }
                }, 0);
              }}
              onClose={() => setContactPicker(null)}
            />
          )}

          {categoryReviewDatePicker && (
            <CategoryReviewDatePickerCard
              position={categoryReviewDatePicker}
              value={categoryReviewDatePicker.value}
              columnKey={categoryReviewDatePicker.columnKey}
              onSelect={v => {
                // Store current scroll position BEFORE updating the grid
                const gridElement = gridContainerRef.current;
                let currentScrollLeft = 0;
                let currentScrollTop = 0;

                if (gridElement) {
                  currentScrollLeft = gridElement.scrollLeft;
                  currentScrollTop = gridElement.scrollTop;
                  // Store in ref for later use
                  scrollPositionRef.current = { left: currentScrollLeft, top: currentScrollTop };

                  // Enable scroll prevention
                  preventScrollRef.current = true;

                  // Temporarily disable grid focus behavior
                  gridElement.style.pointerEvents = 'none';
                }

                // Close dropdown FIRST to prevent any interference
                setCategoryReviewDatePicker(null);

                // Use a completely different approach - prevent React-Data-Grid from updating and causing scroll
                setTimeout(() => {
                  // Get the current data and update it directly
                  const currentData = getCurrentData();
                  if (currentData) {
                    // Create a new data object with the updated row
                    const updatedRows = [...currentData.rows];
                    updatedRows[categoryReviewDatePicker.rowIdx] = {
                      ...updatedRows[categoryReviewDatePicker.rowIdx],
                      [categoryReviewDatePicker.columnKey]: v
                    };

                    // Update the data directly without going through onRowsChange
                    updateCurrentData({ rows: updatedRows });

                    // Force restore scroll position after a short delay
                    setTimeout(() => {
                      if (scrollPositionRef.current && gridElement) {
                        gridElement.scrollLeft = scrollPositionRef.current.left;
                        gridElement.scrollTop = scrollPositionRef.current.top;

                        // Also blur any focused elements to prevent focus-triggered scroll
                        const activeElement = document.activeElement as HTMLElement;
                        if (activeElement && activeElement.blur) {
                          activeElement.blur();
                        }

                        // Re-enable grid interaction
                        gridElement.style.pointerEvents = 'auto';

                        // Disable scroll prevention after a delay
                        setTimeout(() => {
                          preventScrollRef.current = false;
                        }, 100);
                      }
                    }, 10);
                  }
                }, 0);
              }}
              onClose={() => setCategoryReviewDatePicker(null)}
            />
          )}

          {/* Add Column Modal */}
          {showAddColModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <div className="bg-white p-6 rounded-lg shadow-xl w-96">
                <h3 className="text-lg font-bold mb-4">Add New Column</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Column Name</label>
                    {/* Hidden password field to prevent browser autofill */}
                    <input type="password" style={{ display: 'none' }} autoComplete="new-password" />
                    <input
                      type="text"
                      value={newColName}
                      onChange={e => setNewColName(e.target.value)}
                      className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 pr-8"
                      placeholder="e.g., Phone Number"
                      autoComplete="new-password"
                    />
                  </div>
                  {colError && (
                    <p className="text-red-500 text-sm">{colError}</p>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setShowAddColModal(false); setColError(''); setNewColName(''); }}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddColumnConfirm}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                      Add Column
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Create ScoreCard Modal */}
          {showCreateScoreCardModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <div className="bg-white p-6 rounded-lg shadow-xl w-96">
                <h3 className="text-lg font-bold mb-4">Create New ScoreCard</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">ScoreCard Name</label>
                    <input
                      type="text"
                      value={newScoreCardName}
                      onChange={e => setNewScoreCardName(e.target.value)}
                      className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="e.g., Sales Performance"
                      onKeyPress={e => e.key === 'Enter' && createScoreCard()}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowCreateScoreCardModal(false)}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={createScoreCard}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                      Create ScoreCard
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Edit ScoreCard Modal */}
          {showEditScoreCardModal && editingScoreCard && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <div className="bg-white p-6 rounded-lg shadow-xl w-96">
                <h3 className="text-lg font-bold mb-4">Edit ScoreCard</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">ScoreCard Name</label>
                    <input
                      type="text"
                      value={editingScoreCard.name}
                      onChange={e => setEditingScoreCard(prev => prev ? { ...prev, name: e.target.value } : null)}
                      className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="e.g., Sales Performance"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowEditScoreCardModal(false)}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (editingScoreCard) {
                          const normalizedEditName = editingScoreCard.name.trim().toLowerCase();
                          // Prevent duplicate name except for the current scorecard
                          if (scorecards.some(sc => sc.id !== editingScoreCard.id && sc.name.trim().toLowerCase() === normalizedEditName)) {
                            toast.error('A ScoreCard with this name already exists. Please choose a different name.');
                            return;
                          }
                          updateScoreCard(editingScoreCard.id, { name: editingScoreCard.name });
                          setShowEditScoreCardModal(false);
                        }
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Subgrid Drawer */}
          {expandedRowId !== null && subGrids[expandedRowId] && selectedCategory && isScorecard(selectedCategory) && (
            <div className="fixed inset-0 z-40 flex">
              <div
                className="fixed inset-0 bg-black/20 transition-opacity"
                onClick={() => setExpandedRowId(null)}
              />
              <div className="relative ml-auto w-full max-w-xl h-full bg-white shadow-2xl flex flex-col border-l border-slate-200 overflow-hidden" style={{ animation: 'slideInRight 0.2s ease-out' }}>
                <SubGridRenderer parentId={expandedRowId} />
              </div>
            </div>
          )}

          {/* Comment Modal */}
          {openCommentRowId !== null && isScorecard(selectedCategory) && (() => {
            const row: Partial<Row> = getCurrentData()?.rows.find(r => r.id === openCommentRowId) || {};
            return (
              <div className="fixed inset-0 z-50 flex">
                <div className="fixed inset-0 bg-black bg-opacity-40 transition-opacity" onClick={handleCloseCommentModal}></div>
                <div className="relative ml-auto w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-slideInRight rounded-l-2xl border-l border-slate-200">
                  <div className="flex items-center justify-between border-b px-8 py-6 bg-slate-50 rounded-t-2xl">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">{row.name || 'Row'}</h2>
                    </div>
                    <button onClick={handleCloseCommentModal} className="text-slate-400 hover:text-slate-700 text-3xl font-bold">×</button>
                  </div>
                  <div className="flex-1 flex flex-col px-8 py-6 overflow-y-auto bg-slate-50">
                    <h3 className="text-base font-semibold text-slate-700 mb-4">Comments</h3>
                    <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-1" style={{ maxHeight: '40vh' }}>
                      {typeof row.id === 'number' && comments[selectedCategory]?.[row.id] && comments[selectedCategory][row.id].length > 0 ? (
                        comments[selectedCategory][row.id].map((c, i) => {
                          const isAuthor = user?.id === c.user_id;
                          const displayName = user?.name || user?.email || 'Anonymous';
                          const createdAt = new Date(c.created_at).toLocaleString();
                          return (
                            <li key={c.id || i} className="flex items-start gap-4 bg-white rounded-2xl shadow border border-slate-200 p-4">
                              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                                {displayName[0]?.toUpperCase() || 'A'}
                              </div>
                              <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-semibold text-slate-800">{displayName}</span>
                                  <span className="text-xs text-slate-400 ml-2 whitespace-nowrap">{createdAt}</span>
                                </div>
                                {editCommentIdx === i ? (
                                  <div className="flex flex-col gap-2 mt-1">
                                    <textarea
                                      value={editCommentText}
                                      onChange={e => setEditCommentText(e.target.value)}
                                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base"
                                      rows={2}
                                      autoFocus
                                    />
                                    <div className="flex gap-2 mt-1">
                                      <button
                                        onClick={async () => {
                                          // Save edited comment
                                          if (typeof row.id === 'number') {
                                            try {
                                              const comment = comments[selectedCategory][row.id][i];
                                              await updateComment(comment.id, editCommentText);
                                              setEditCommentIdx(null);
                                              setEditCommentText('');
                                              toast.success('Comment updated!');
                                            } catch (error) {
                                              toast.error('Failed to update comment');
                                            }
                                          }
                                        }}
                                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-semibold"
                                      >Save</button>
                                      <button
                                        onClick={() => { setEditCommentIdx(null); setEditCommentText(''); }}
                                        className="px-3 py-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 text-xs font-semibold"
                                      >Cancel</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-slate-700 text-base whitespace-pre-line mt-1">{c.text}</div>
                                )}
                                {/* Show Edit/Delete if author */}
                                {isAuthor && editCommentIdx !== i && (
                                  <div className="flex gap-2 mt-2">
                                    <button
                                      onClick={() => { setEditCommentIdx(i); setEditCommentText(c.text); }}
                                      className="text-xs text-blue-600 hover:underline px-2 py-1 rounded"
                                    >Edit</button>
                                    <button
                                      onClick={() => setConfirmDeleteComment({ rowId: row.id as number, commentIdx: i })}
                                      className="text-xs text-red-500 hover:underline px-2 py-1 rounded"
                                    >Delete</button>
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })
                      ) : (
                        <div className="text-slate-400 text-center py-8">No comments yet. Be the first to comment!</div>
                      )}
                    </div>
                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        handleAddComment();
                      }}
                      className="pt-4 border-t bg-white rounded-b-2xl flex gap-3 items-start mt-2"
                      style={{ borderTop: '1px solid #e5e7eb' }}
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg mt-1">
                        {(user?.name || user?.username || 'A')[0].toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <textarea
                          value={commentInput}
                          onChange={e => setCommentInput(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-blue-500 px-4 py-3 text-base bg-white shadow-sm resize-none min-h-[44px] transition-all"
                          placeholder="Add a comment..."
                          rows={commentInput.length > 60 ? 4 : 2}
                          style={{ minHeight: 44, maxHeight: 120, marginBottom: 8 }}
                          onFocus={e => e.currentTarget.rows = 4}
                          // Removed onBlur to prevent focus loss/resizing issues
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                        />
                        <button
                          id="add-comment-btn"
                          type="submit"
                          className="mt-2 px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-base font-semibold shadow transition-all float-right"
                          style={{ minWidth: 120 }}
                        >
                          Add
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Render the advanced drawer for ScoreCard rows */}
          {openRetailerDrawer !== null && selectedCategory && isScorecard(selectedCategory) && (() => {
            const currentData = getCurrentData();
            const row: Partial<Row> = currentData?.rows.find(r => r.id === openRetailerDrawer) || {};
            return (
              <div className="fixed inset-0 z-50 flex">
                <div className="fixed inset-0 bg-black bg-opacity-40 transition-opacity" onClick={() => setOpenRetailerDrawer(null)}></div>
                <div className="relative ml-auto w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-slideInRight rounded-l-2xl border-l border-slate-200">
                  <div className="flex items-center justify-between border-b px-6 py-4 bg-slate-50 rounded-t-2xl">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{row.name || 'Row'}</h2>
                    </div>
                    <button onClick={() => setOpenRetailerDrawer(null)} className="text-slate-400 hover:text-slate-700 text-2xl font-bold">×</button>
                  </div>
                  <div className="flex-1 flex flex-col px-6 py-4 overflow-y-auto">
                    {/* Address editing */}
                    <div className="mb-4">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Address</label>
                      <input
                        type="text"
                        value={row.address || ''}
                        onChange={e => {
                          if (!currentData || row.id === undefined) return;
                          // Update the address for this row in the scorecard
                          const updatedRows = currentData.rows.map(r => r.id === row.id ? { ...r, address: e.target.value } : r);
                          updateCurrentData({ rows: updatedRows });
                        }}
                        className="w-full border rounded px-3 py-2 text-sm"
                        placeholder="Enter address..."
                      />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">Comments</h3>
                    <div className="flex-1 overflow-y-auto mb-2 space-y-4 pr-1" style={{ maxHeight: '40vh' }}>
                      {typeof row.id === 'number' && comments[selectedCategory]?.[row.id]
                        ? comments[selectedCategory][row.id].map((c, i) => {
                          const isAuthor = user?.id === c.user_id;
                          const displayName = user?.name || user?.email || 'Anonymous';
                          const createdAt = new Date(c.created_at).toLocaleString();
                          return (
                            <li key={c.id || i} className="flex items-start gap-3 bg-white rounded-xl shadow border border-slate-200 p-4">
                              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                                {displayName[0]?.toUpperCase() || 'A'}
                              </div>
                              <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-semibold text-slate-800">{displayName}</span>
                                  <span className="text-xs text-slate-400 ml-2 whitespace-nowrap">{createdAt}</span>
                                </div>
                                {/* Edit mode for comment */}
                                {editCommentIdx === i ? (
                                  <div className="flex gap-2 items-center mt-1">
                                    <textarea
                                      value={editCommentText}
                                      onChange={e => setEditCommentText(e.target.value)}
                                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                      rows={2}
                                      autoFocus
                                    />
                                    <button
                                      onClick={async () => {
                                        // Save edited comment
                                        if (typeof row.id === 'number') {
                                          try {
                                            const comment = comments[selectedCategory][row.id][i];
                                            await updateComment(comment.id, editCommentText);
                                            setEditCommentIdx(null);
                                            setEditCommentText('');
                                            toast.success('Comment updated!');
                                          } catch (error) {
                                            toast.error('Failed to update comment');
                                          }
                                        }
                                      }}
                                      className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-semibold"
                                    >Save</button>
                                    <button
                                      onClick={() => { setEditCommentIdx(null); setEditCommentText(''); }}
                                      className="px-2 py-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 text-xs font-semibold"
                                    >Cancel</button>
                                  </div>
                                ) : (
                                  <div className="text-slate-700 text-sm whitespace-pre-line mt-1">{c.text}</div>
                                )}
                                {/* Show Edit/Delete if author */}
                                {isAuthor && editCommentIdx !== i && (
                                  <div className="flex gap-2 mt-2">
                                    <button
                                      onClick={() => { setEditCommentIdx(i); setEditCommentText(c.text); }}
                                      className="text-xs text-blue-600 hover:underline px-1 py-0.5 rounded"
                                    >Edit</button>
                                    <button
                                      onClick={async () => {
                                        // Delete comment
                                        if (typeof row.id === 'number') {
                                          try {
                                            const comment = comments[selectedCategory][row.id][i];
                                            await deleteComment(comment.id, row.id);
                                            setEditCommentIdx(null);
                                            setEditCommentText('');
                                          } catch (error) {
                                            // Error already handled in deleteComment function
                                          }
                                        }
                                      }}
                                      className="text-xs text-red-500 hover:underline px-1 py-0.5 rounded"
                                    >Delete</button>
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })
                        : null}
                    </div>
                    {/* Modern comment input */}
                    <div className="pt-4 border-t bg-slate-50 rounded-b-2xl flex gap-3 items-start mt-2" style={{ borderTop: '1px solid #e5e7eb' }}>
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg mt-1">
                        {(user?.name || user?.username || 'A')[0].toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <textarea
                          value={commentInput}
                          onChange={e => setCommentInput(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-blue-500 px-4 py-2 text-sm bg-white shadow-sm resize-none min-h-[44px] transition-all"
                          placeholder="Add a comment..."
                          rows={commentInput.length > 60 ? 4 : 2}
                          style={{ minHeight: 44, maxHeight: 120, marginBottom: 8 }}
                          onFocus={e => e.currentTarget.rows = 4}
                          onBlur={e => e.currentTarget.rows = commentInput.length > 60 ? 4 : 2}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); /* Only add if not shift+enter */ document.getElementById('add-comment-btn')?.click(); } }}
                        />
                        <button
                          id="add-comment-btn"
                          onClick={async () => {
                            if (!commentInput.trim() || openRetailerDrawer == null || !selectedCategory || !user) return;

                            try {
                              console.log('💬 Adding comment to scorecard from drawer:', selectedCategory);

                              // Get current scorecard data for potential migration
                              const currentScorecard = editingScoreCard;
                              const requestBody = {
                                scorecard_id: selectedCategory,
                                user_id: openRetailerDrawer, // This is actually the row_id (API will rename it)
                                text: commentInput.trim(),
                                // Include scorecard data for auto-migration if it's a local scorecard
                                scorecard_data: selectedCategory.startsWith('scorecard_') ? {
                                  name: currentScorecard?.name || 'Untitled Scorecard',
                                  columns: currentScorecard?.columns || [],
                                  rows: currentScorecard?.rows || []
                                } : undefined
                              };

                              const response = await fetch('/api/comments', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                credentials: 'include',
                                body: JSON.stringify(requestBody),
                              });

                              if (!response.ok) {
                                const errorData = await response.json().catch(() => ({}));
                                console.error('❌ Comment creation failed:', errorData);
                                throw new Error(errorData.error || 'Failed to add comment');
                              }

                              const newComment = await response.json();
                              console.log('✅ Comment created successfully:', newComment);

                              // Handle scorecard migration if it occurred
                              if (newComment.migrated_scorecard) {
                                console.log('🔄 Scorecard was migrated:', newComment.migrated_scorecard);

                                const { old_id, new_id, title } = newComment.migrated_scorecard;

                                // Update the scorecard in our state
                                const migratedScorecard: ScoreCard = {
                                  ...currentScorecard!,
                                  id: new_id,
                                  name: title,
                                  columns: currentScorecard?.columns || [],
                                  rows: currentScorecard?.rows || [],
                                  createdAt: currentScorecard?.createdAt || new Date(),
                                  lastModified: new Date()
                                };

                                // Update scorecards list
                                setScorecards(prev => prev.map(sc =>
                                  sc.id === old_id ? migratedScorecard : sc
                                ));

                                // Update current editing scorecard
                                setEditingScoreCard(migratedScorecard);

                                // Update selected category
                                setSelectedCategory(new_id);

                                // Update localStorage
                                const allScorecards = JSON.parse(localStorage.getItem('scorecards') || '[]');
                                const updatedLocalScorecards = allScorecards.map((sc: any) =>
                                  sc.id === old_id ? migratedScorecard : sc
                                );
                                localStorage.setItem('scorecards', JSON.stringify(updatedLocalScorecards));

                                // Close the drawer since the row ID might have changed
                                setOpenRetailerDrawer(null);

                                toast.success('Scorecard migrated to database and comment added!');

                                // Use the new scorecard ID for comment grouping
                                const actualScorecardId = new_id;

                                // Update local comment state
                                setComments(prev => {
                                  const updated = {
                                    ...prev,
                                    [actualScorecardId]: {
                                      ...(prev[actualScorecardId] || {}),
                                      [openRetailerDrawer]: [...((prev[actualScorecardId] || {})[openRetailerDrawer] || []), newComment],
                                    }
                                  };
                                  return updated;
                                });
                              } else {
                                // Normal comment addition (no migration)
                                setComments(prev => {
                                  const updated = {
                                    ...prev,
                                    [selectedCategory]: {
                                      ...(prev[selectedCategory] || {}),
                                      [openRetailerDrawer]: [...((prev[selectedCategory] || {})[openRetailerDrawer] || []), newComment],
                                    }
                                  };
                                  return updated;
                                });

                                toast.success('Comment added successfully!');
                              }

                              setCommentInput('');
                            } catch (error) {
                              console.error('❌ Error adding comment:', error);
                              toast.error(error instanceof Error ? error.message : 'Failed to add comment');
                            }
                          }}
                          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold shadow transition-all float-right"
                          style={{ minWidth: 120 }}
                        >
                          Add Comment
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Contact Card Modal */}
          {contactCardModal}

          {/* Delete Confirmation Modal */}
          {confirmDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
              <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-xs flex flex-col items-center">
                <h2 className="text-lg font-bold mb-2">Confirm Deletion</h2>
                <p className="mb-4 text-center text-slate-700">
                  Are you sure you want to delete this {confirmDelete.type === 'row' ? 'row' : confirmDelete.type === 'column' ? 'column' : 'scorecard'}?
                </p>
                <div className="flex gap-4 w-full justify-center">
                  <button
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
                    onClick={() => setConfirmDelete(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                    onClick={() => {
                      if (confirmDelete.type === 'row') {
                        handleDeleteRow(confirmDelete.id as number);
                      } else if (confirmDelete.type === 'column') {
                        handleDeleteColumn(confirmDelete.id as string);
                      } else if (confirmDelete.type === 'scorecard') {
                        deleteScoreCard(confirmDelete.id as string);
                      }
                      setConfirmDelete(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Save Template Modal */}
          {showSaveTemplateModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg shadow-xl w-96">
                <h3 className="text-lg font-bold mb-4">Save ScoreCard as Template</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Template Name</label>
                    <input
                      type="text"
                      value={templateName}
                      onChange={e => setTemplateName(e.target.value)}
                      className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="e.g., Product Columns"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeRowsInTemplate}
                      onChange={e => setIncludeRowsInTemplate(e.target.checked)}
                      id="includeRowsInTemplate"
                    />
                    <label htmlFor="includeRowsInTemplate" className="text-sm">Include row data</label>
                  </div>
                  {templateError && <p className="text-red-500 text-sm">{templateError}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setShowSaveTemplateModal(false); setTemplateError(''); setTemplateName(''); setIncludeRowsInTemplate(true); }}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveTemplate}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                      Save Template
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Import Template Modal */}
          {showImportTemplateModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg shadow-xl w-96">
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
                              setSelectedTemplateName(e.target.value);
                              const t = templates.find(t => t.name === e.target.value);
                              setImportWithRows(!!(t && t.rows));
                            }}
                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          >
                            <option value="">-- Select --</option>
                            {templates.map(t => (
                              <option key={t.id || t.name} value={t.name}>{t.name}</option>
                            ))}
                          </select>
                          {/* Delete button for selected template */}
                          {selectedTemplateName && (
                            <button
                              type="button"
                              className="ml-2 px-2 py-1 bg-red-500 text-white rounded hover:bg-red-700 text-xs"
                              onClick={() => {
                                const template = templates.find(t => t.name === selectedTemplateName);
                                if (!template) return;
                                setConfirmDelete({ type: 'template', id: template.id, name: template.name });
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                      {selectedTemplateName && templates.find(t => t.name === selectedTemplateName)?.rows && (
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={importWithRows}
                            onChange={e => setImportWithRows(e.target.checked)}
                            id="importWithRows"
                          />
                          <label htmlFor="importWithRows" className="text-sm">Import with row data</label>
                        </div>
                      )}
                    </>
                  )}
                  {templateError && <p className="text-red-500 text-sm">{templateError}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setShowImportTemplateModal(false); setTemplateError(''); setSelectedTemplateName(''); setImportWithRows(true); }}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (templates.length === 0) {
                          toast.info('No templates available. Please save a template first.');
                          return;
                        }
                        handleImportTemplate();
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-md hover:bg-cyan-700"
                      disabled={!selectedTemplateName || templates.length === 0}
                    >
                      Import Template
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {subgridTemplateModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg shadow-xl w-96">
                {subgridTemplateModal.mode === 'save' ? (
                  <>
                    <h3 className="text-lg font-bold mb-4">Save Subgrid as Template</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700">Template Name</label>
                        <input
                          type="text"
                          value={subgridTemplateName}
                          onChange={e => setSubgridTemplateName(e.target.value)}
                          className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          placeholder="e.g., Subgrid Columns"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={subgridIncludeRows}
                          onChange={e => setSubgridIncludeRows(e.target.checked)}
                          id="subgridIncludeRows"
                        />
                        <label htmlFor="subgridIncludeRows" className="text-sm">Include row data</label>
                      </div>
                      {subgridTemplateError && <p className="text-red-500 text-sm">{subgridTemplateError}</p>}
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => { setSubgridTemplateModal(null); setSubgridTemplateError(''); setSubgridTemplateName(''); setSubgridIncludeRows(true); }}
                          className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveSubgridTemplate(subgridTemplateModal.parentId)}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                        >
                          Save Template
                        </button>
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
                          <select
                            value={subgridSelectedTemplate}
                            onChange={e => {
                              setSubgridSelectedTemplate(e.target.value);
                              const t = subgridTemplates.find(t => t.name === e.target.value);
                              setSubgridImportWithRows(!!(t && t.rows));
                            }}
                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          >
                            <option value="">-- Select --</option>
                            {subgridTemplates.map(t => (
                              <option key={t.name} value={t.name}>{t.name}</option>
                            ))}
                          </select>
                          {/* Delete button for selected template */}
                          {subgridSelectedTemplate && (
                            <button
                              type="button"
                              className="ml-2 px-2 py-1 bg-red-500 text-white rounded hover:bg-red-700 text-xs"
                              onClick={() => {
                                const t = subgridTemplates.find(t => t.name === subgridSelectedTemplate);
                                if (!t) return;
                                if (window.confirm(`Delete template '${t.name}'? This cannot be undone.`)) {
                                  const newTemplates = subgridTemplates.filter(st => st.name !== t.name);
                                  setSubgridTemplates(newTemplates);
                                  saveSubgridTemplates(newTemplates);
                                  setSubgridSelectedTemplate('');
                                  setSubgridImportWithRows(true);
                                }
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                      {subgridSelectedTemplate && subgridTemplates.find(t => t.name === subgridSelectedTemplate)?.rows && (
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={subgridImportWithRows}
                            onChange={e => setSubgridImportWithRows(e.target.checked)}
                            id="subgridImportWithRows"
                          />
                          <label htmlFor="subgridImportWithRows" className="text-sm">Import with row data</label>
                        </div>
                      )}
                      {subgridTemplateError && <p className="text-red-500 text-sm">{subgridTemplateError}</p>}
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => { setSubgridTemplateModal(null); setSubgridTemplateError(''); setSubgridSelectedTemplate(''); setSubgridImportWithRows(true); }}
                          className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleImportSubgridTemplate(subgridTemplateModal.parentId)}
                          className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-md hover:bg-cyan-700"
                          disabled={!subgridSelectedTemplate}
                        >
                          Import Template
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Comment Delete Confirmation Dialog */}
          {confirmDeleteComment && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
              <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-xs flex flex-col items-center">
                <h2 className="text-lg font-bold mb-2">Delete Comment</h2>
                <p className="mb-4 text-center text-slate-700">Are you sure you want to delete this comment?</p>
                <div className="flex gap-4 w-full justify-center">
                  <button
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
                    onClick={() => setConfirmDeleteComment(null)}
                  >Cancel</button>
                  <button
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                    onClick={async () => {
                      if (confirmDeleteComment) {
                        const { rowId, commentIdx } = confirmDeleteComment;
                        try {
                          const comment = comments[selectedCategory][rowId][commentIdx];
                          await deleteComment(comment.id, rowId);
                          setConfirmDeleteComment(null);
                        } catch (error) {
                          // Error already handled in deleteComment function
                        }
                      }
                    }}
                  >Delete</button>
                </div>
              </div>
            </div>
          )}
          {confirmDelete && confirmDelete.type === 'template' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
              <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-xs flex flex-col items-center">
                <h2 className="text-lg font-bold mb-2">Confirm Deletion</h2>
                <p className="mb-4 text-center text-slate-700">
                  Are you sure you want to delete the template '{confirmDelete.name}'?
                </p>
                <div className="flex gap-4 w-full justify-center">
                  <button
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
                    onClick={() => setConfirmDelete(null)}
                  >Cancel</button>
                  <button
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                    onClick={() => {
                      handleDeleteTemplate(confirmDelete.id as string);
                      // Do not update UI here; let handleDeleteTemplate do it on success
                    }}
                  >Delete</button>
                </div>
              </div>
            </div>
          )}

          {/* Export Modal */}
          {showExportModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg shadow-xl w-96">
                <h3 className="text-lg font-bold mb-4">Export to Excel</h3>
                <div className="space-y-4">
                  <div className="bg-blue-50 p-3 rounded text-sm text-blue-700">
                    <strong>Modern Hierarchical Export</strong><br />
                    This export will include all main grid data and any subgrid data that exists, with clear parent-child relationships using visual indicators.
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
                      checked={excludeSubgridExport}
                      onChange={e => setExcludeSubgridExport(e.target.checked)}
                    />
                    <label htmlFor="excludeSubgridExport" className="text-sm">Exclude subgrid data (export only main grid)</label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowExportModal(false)}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        handleExportExcel(excludeSubgridExport);
                        setShowExportModal(false);
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                    >
                      Export
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {importPreview && (
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
                  <button
                    onClick={() => setImportPreview(null)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={applyImport}
                    className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700"
                  >
                    Apply Import
                  </button>
                </div>
              </div>
            </div>
          )}
          {confirmDelete && confirmDelete.type === 'subgrid-template' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
              <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-xs flex flex-col items-center">
                <h2 className="text-lg font-bold mb-2">Confirm Deletion</h2>
                <p className="mb-4 text-center text-slate-700">
                  Are you sure you want to delete the subgrid template '{confirmDelete.name}'?
                </p>
                <div className="flex gap-4 w-full justify-center">
                  <button
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
                    onClick={() => setConfirmDelete(null)}
                  >Cancel</button>
                  <button
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                    onClick={() => {
                      const newTemplates = subgridTemplates.filter(st => st.name !== confirmDelete.id);
                      setSubgridTemplates(newTemplates);
                      saveSubgridTemplates(newTemplates);
                      setSubgridSelectedTemplate('');
                      setSubgridImportWithRows(true);
                      setConfirmDelete(null);
                    }}
                  >Delete</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}