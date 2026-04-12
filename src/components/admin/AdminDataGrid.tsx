import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DataGrid, type Column, type SortColumn, type RenderEditCellProps } from 'react-data-grid';
import { FaSort, FaSortUp, FaSortDown, FaRegCommentDots } from 'react-icons/fa';
import 'react-data-grid/lib/styles.css';

import { useRouter } from 'next/navigation';
import Select, { components } from 'react-select';
import DatePickerOrig from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format, isToday } from 'date-fns';
import { Toaster, toast } from 'sonner';
import { useScoreCardAutoSave } from '../../hooks/useAutoSave';
import MasterScorecard from './MasterScorecard';

// ─── Extracted components ────────────────────────────────────────────────────
import StatusPickerCard from './StatusPickerCard';
import PriorityPickerCard from './PriorityPickerCard';
import ContactPickerCard from './ContactPickerCard';
import CategoryReviewDatePickerCard from './CategoryReviewDatePickerCard';
import EditableColumnHeader from './EditableColumnHeader';
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
  ImportPreviewModal,
  SubgridTemplateModal,
} from './GridModals';
import ScorecardSidebar from './ScorecardSidebar';
import GridToolbar from './GridToolbar';
import { SimpleCommentDrawer, RetailerDrawer } from './CommentDrawer';
import SubGridRenderer from './SubGridRenderer';
import { AdminGridProvider, type AdminGridContextValue } from './AdminDataGridContext';
import { useCommentHandlers } from './useCommentHandlers';
import { useSubGridHandlers } from './useSubGridHandlers';
import { productStatusOptions, statusIcons, priorityOptions, contactOptions } from './constants';
import { useScrollPrevention } from './useScrollPrevention';
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

export interface NavigateToPayload {
  scorecardId: string;
  rowId?: string;
}

interface AdminDataGridProps {
  userRole: string;
  navigateToRef?: React.MutableRefObject<((payload: NavigateToPayload) => void) | null>;
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

export default function AdminDataGrid({ userRole, navigateToRef }: AdminDataGridProps) {
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

  // ScoreCard state
  const [scorecards, setScorecards] = useState<ScoreCard[]>(() => loadScoreCardsFromStorage());
  const [showCreateScoreCardModal, setShowCreateScoreCardModal] = useState(false);
  const [newScoreCardName, setNewScoreCardName] = useState('');
  const [editingScoreCard, setEditingScoreCard] = useState<ScoreCard | null>(null);
  const [showEditScoreCardModal, setShowEditScoreCardModal] = useState(false);
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

  // Scroll prevention is handled by useScrollPrevention hook (see below)



  // Add this to the main component state
  const [contactModalData, setContactModalData] = useState<{ name: string; telephone: string; address: string; notes: string }>({ name: '', telephone: '', address: '', notes: '' });

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

  // 3. Add state for CategoryReviewDatePicker
  const [categoryReviewDatePicker, setCategoryReviewDatePicker] = React.useState<PickerState | null>(null);

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

  const {
    loadScorecardComments, updateComment, deleteComment,
    handleOpenCommentModal, handleCloseCommentModal, handleAddComment,
  } = useCommentHandlers({
    comments, setComments, commentInput, setCommentInput,
    openCommentRowId, setOpenCommentRowId,
    selectedCategory, user, editingScoreCard, isScorecard,
    setScorecards, setEditingScoreCard, setSelectedCategory,
  });

  const {
    ensureSubGrid, handleToggleSubGrid, handleDeleteSubGrid, handleAddSubGrid,
    handleSubGridAddColumn, handleSubGridAddRow, handleSubGridRowsChange,
    handleSubGridColumnNameChange, handleSubGridDeleteRow, handleSubGridDeleteColumn,
    updateParentRowSubgrid,
    handleImportSubgridExcel, handleExportSubgridExcel,
    handleSaveSubgridTemplate, handleImportSubgridTemplate,
    saveSubgridTemplates,
    subgridTemplateModal, setSubgridTemplateModal,
    subgridTemplateName, setSubgridTemplateName,
    subgridIncludeRows, setSubgridIncludeRows,
    subgridSelectedTemplate, setSubgridSelectedTemplate,
    subgridImportWithRows, setSubgridImportWithRows,
    subgridTemplateError, setSubgridTemplateError,
    subgridTemplates, setSubgridTemplates,
  } = useSubGridHandlers({
    subGrids, setSubGrids, expandedRowId, setExpandedRowId,
    editingScoreCard, getCurrentData, updateCurrentData,
    selectedCategory, isScorecard,
  });

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

  // Scroll prevention — all logic consolidated in useScrollPrevention hook
  const isDropdownOpen = !!(contactPicker || statusPicker || priorityPicker || categoryReviewDatePicker);
  useScrollPrevention(gridContainerRef, scrollPositionRef, preventScrollRef, dropdownOpenRef, isDropdownOpen, currentScoreCardData);

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
      const res = await fetch('/api/templates', { credentials: 'include' });
      if (!res.ok) {
        console.error('❌ Failed to fetch templates:', res.status, res.statusText);
        throw new Error('Failed to load templates');
      }
      const data = await res.json();
      setTemplates(data);
    } catch (e) {
      console.error('❌ Error fetching templates:', e);
      setTemplates([]);
    }
  }
  useEffect(() => { fetchTemplates(); }, []);

  // Save template to API
  async function saveTemplateToAPI(template: { name: string; columns: any; rows?: any }) {
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
    // Refetch templates to ensure consistency
    await fetchTemplates();
    return data;
  }

  // Delete template from API
  async function deleteTemplateFromAPI(id: string) {
    const res = await fetch(`/api/templates/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      console.error('❌ Failed to delete template:', res.status, res.statusText);
      throw new Error('Failed to delete template');
    }
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
          setScorecards(prev => [...prev, formatted].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
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
      return { columns: scorecard.columns, rows: scorecard.rows };
    }

    // If not a scorecard, check regular categories
    if (selectedCategory in categoryData) {
      return categoryData[selectedCategory];
    }

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
  }, [categoryData, selectedCategory, scorecards]);

  useEffect(() => {
    const currentData = getCurrentData();
    if (!currentData) return;

    const updatedColumns = currentData.columns.map(col => {
      const editable = userRole === 'ADMIN' && col.key !== 'id' && col.key !== 'delete';
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
      return;
    }

    // Check if it's a scorecard (either local or database)
    const scorecard = scorecards.find(sc => sc.id === category);
    if (scorecard) {
      setEditingScoreCard(scorecard);
      setLastSelectedScorecardId(scorecard.id);
      // Load comments for this scorecard
      loadScorecardComments(scorecard.id);
    } else {
      setEditingScoreCard(null);
    }

  }

  // Expose navigation function for notification clicks
  useEffect(() => {
    if (navigateToRef) {
      navigateToRef.current = (payload: NavigateToPayload) => {
        const { scorecardId, rowId } = payload;
        // Switch to the scorecard
        handleCategoryChange(scorecardId);
        // Open comment drawer for the row after a short delay to let the scorecard load
        if (rowId) {
          setTimeout(() => {
            const numericRowId = Number(rowId);
            if (!isNaN(numericRowId)) {
              setOpenCommentRowId(numericRowId);
            }
          }, 300);
        }
      };
    }
    return () => {
      if (navigateToRef) navigateToRef.current = null;
    };
  }, [navigateToRef, scorecards]);

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

  // Contact card modal
  let contactCardModal: React.ReactNode = null;
  if (openContactModal) {
    const currentData = getCurrentData();
    const rowIdx = currentData?.rows.findIndex(r => r.id === openContactModal.rowId);
    const key = openContactModal.key;
    contactCardModal = (
      <ContactCardModal
        contactData={contactModalData}
        onContactDataChange={(field, value) => setContactModalData(c => ({ ...c, [field]: value }))}
        onSave={() => {
          if (!currentData || rowIdx === undefined || rowIdx === -1) return;
          const updatedRows = currentData.rows.map((r, i) => i === rowIdx ? { ...r, [key]: { ...contactModalData } } : r);
          updateCurrentData({ rows: updatedRows });
          setOpenContactModal(null);
        }}
        onCancel={() => setOpenContactModal(null)}
      />
    );
  }

  // Remove subrow objects from getRowsWithSubRows, just return the main rows plus add-row
  function getRowsWithSubRows() {
    const rows = getSortedRows();
    return [...rows, { isAddRow: true, id: 'add-row' }];
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


  // Normalize function
  function normalizeColName(name: string) {
    return (name || '').toLowerCase().replace(/\s+/g, '').replace(/_/g, '').trim();
  }



  // Subgrid template state and helpers (per subgrid)

  // Add state for comment delete confirmation
  const [confirmDeleteComment, setConfirmDeleteComment] = useState<{ rowId: number, commentIdx: number } | null>(null);


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
          const sorted = formattedScorecards.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
          setScorecards(sorted);
          if (sorted.length > 0) {
            setEditingScoreCard(sorted[0]);
            setSelectedCategory(sorted[0].id);
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
          const sortedLocal = filteredLocalScorecards.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
          setScorecards(sortedLocal);
          if (sortedLocal.length > 0) {
            setEditingScoreCard(sortedLocal[0]);
            setSelectedCategory(sortedLocal[0].id);
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

  // Add state for exclude subgrid data in export modal
  const [excludeSubgridExport, setExcludeSubgridExport] = useState(false);

  // ─── Context value for extracted child components ─────────────────────────
  const gridContextValue: AdminGridContextValue = {
    selectedCategory, userRole, user, editingScoreCard, scorecards,
    comments, commentInput, editCommentIdx, editCommentText,
    openCommentRowId, openRetailerDrawer,
    setCommentInput, setEditCommentIdx, setEditCommentText,
    setOpenCommentRowId, setOpenRetailerDrawer, setComments,
    setConfirmDeleteComment, handleAddComment, handleCloseCommentModal,
    updateComment, deleteComment,
    setScorecards, setEditingScoreCard, setSelectedCategory,
    getCurrentData, updateCurrentData, isScorecard,
    subGrids, expandedRowId, setExpandedRowId,
    subgridTemplates, setSubgridTemplates,
    subgridTemplateName, setSubgridTemplateName,
    subgridIncludeRows, setSubgridIncludeRows,
    subgridTemplateError, setSubgridTemplateError,
    subgridSelectedTemplate, setSubgridSelectedTemplate,
    subgridImportWithRows, setSubgridImportWithRows,
    setSubgridTemplateModal, setConfirmDelete, saveSubgridTemplates,
    handleSubGridAddColumn, handleSubGridAddRow, handleSubGridRowsChange,
    handleSubGridColumnNameChange, handleSubGridDeleteRow,
    handleSubGridDeleteColumn, handleDeleteSubGrid,
    handleImportSubgridExcel, handleExportSubgridExcel,
    handleSaveSubgridTemplate, handleImportSubgridTemplate,
  };

  return (
    <AdminGridProvider value={gridContextValue}>
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
        <ScorecardSidebar
          scorecards={scorecards}
          selectedCategory={selectedCategory}
          sidebarCollapsed={sidebarCollapsed}
          userRole={userRole}
          saveStatus={saveStatus}
          lastSaved={lastSaved}
          saveError={saveError}
          hasUnsavedChanges={hasUnsavedChanges}
          isOnline={isOnline}
          editingScoreCardId={editingScoreCard?.id || null}
          dataCategories={dataCategories}
          onCategoryChange={handleCategoryChange}
          onCreateScoreCard={() => setShowCreateScoreCardModal(true)}
          onEditScoreCard={(sc) => { setEditingScoreCard(sc); setShowEditScoreCardModal(true); }}
          onDeleteScoreCard={(id) => setConfirmDelete({ type: 'scorecard', id })}
          onCollapse={() => setSidebarCollapsed(true)}
          onExpand={() => setSidebarCollapsed(false)}
        />

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

          {/* Toolbar */}
          {selectedCategory && isScorecard(selectedCategory) && (
            <GridToolbar
              userRole={userRole}
              editingScoreCard={editingScoreCard}
              saveStatus={saveStatus}
              lastSaved={lastSaved}
              saveError={saveError}
              hasUnsavedChanges={hasUnsavedChanges}
              isOnline={isOnline}
              templates={templates}
              onAddColumn={openAddColModal}
              onImportExcel={handleImportExcel}
              onExportClick={() => setShowExportModal(true)}
              onSaveTemplate={() => setShowSaveTemplateModal(true)}
              onImportTemplateClick={() => setShowImportTemplateModal(true)}
              onForceSave={forceSave}
              onFetchTemplates={fetchTemplates}
            />
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
            <AddColumnModal
              newColName={newColName}
              colError={colError}
              onNameChange={setNewColName}
              onConfirm={handleAddColumnConfirm}
              onCancel={() => { setShowAddColModal(false); setColError(''); setNewColName(''); }}
            />
          )}

          {/* Create ScoreCard Modal */}
          {showCreateScoreCardModal && (
            <CreateScoreCardModal
              name={newScoreCardName}
              onNameChange={setNewScoreCardName}
              onCreate={createScoreCard}
              onCancel={() => setShowCreateScoreCardModal(false)}
            />
          )}

          {/* Edit ScoreCard Modal */}
          {showEditScoreCardModal && editingScoreCard && (
            <EditScoreCardModal
              scorecard={editingScoreCard}
              onNameChange={(v) => setEditingScoreCard(prev => prev ? { ...prev, name: v } : null)}
              onSave={() => {
                if (editingScoreCard) {
                  const normalizedEditName = editingScoreCard.name.trim().toLowerCase();
                  if (scorecards.some(sc => sc.id !== editingScoreCard.id && sc.name.trim().toLowerCase() === normalizedEditName)) {
                    toast.error('A ScoreCard with this name already exists. Please choose a different name.');
                    return;
                  }
                  updateScoreCard(editingScoreCard.id, { name: editingScoreCard.name });
                  setShowEditScoreCardModal(false);
                }
              }}
              onCancel={() => setShowEditScoreCardModal(false)}
            />
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

          {/* Comment & Retailer Drawers — extracted to CommentDrawer.tsx */}
          {openCommentRowId !== null && isScorecard(selectedCategory) && <SimpleCommentDrawer />}
          {openRetailerDrawer !== null && selectedCategory && isScorecard(selectedCategory) && <RetailerDrawer />}


          {/* Contact Card Modal */}
          {contactCardModal}

          {/* Delete Confirmation Modal */}
          {confirmDelete && confirmDelete.type !== 'template' && confirmDelete.type !== 'subgrid-template' && (
            <DeleteConfirmModal
              type={confirmDelete.type}
              name={confirmDelete.name}
              onConfirm={() => {
                if (confirmDelete.type === 'row') handleDeleteRow(confirmDelete.id as number);
                else if (confirmDelete.type === 'column') handleDeleteColumn(confirmDelete.id as string);
                else if (confirmDelete.type === 'scorecard') deleteScoreCard(confirmDelete.id as string);
                setConfirmDelete(null);
              }}
              onCancel={() => setConfirmDelete(null)}
            />
          )}

          {/* Save Template Modal */}
          {showSaveTemplateModal && (
            <SaveTemplateModal
              templateName={templateName}
              includeRows={includeRowsInTemplate}
              templateError={templateError}
              onNameChange={setTemplateName}
              onIncludeRowsChange={setIncludeRowsInTemplate}
              onSave={handleSaveTemplate}
              onCancel={() => { setShowSaveTemplateModal(false); setTemplateError(''); setTemplateName(''); setIncludeRowsInTemplate(true); }}
            />
          )}

          {/* Import Template Modal */}
          {showImportTemplateModal && (
            <ImportTemplateModal
              templates={templates}
              selectedTemplateName={selectedTemplateName}
              importWithRows={importWithRows}
              templateError={templateError}
              onTemplateChange={(name) => {
                setSelectedTemplateName(name);
                const t = templates.find(t => t.name === name);
                setImportWithRows(!!(t && t.rows));
              }}
              onImportWithRowsChange={setImportWithRows}
              onImport={() => {
                if (templates.length === 0) { toast.info('No templates available. Please save a template first.'); return; }
                handleImportTemplate();
              }}
              onCancel={() => { setShowImportTemplateModal(false); setTemplateError(''); setSelectedTemplateName(''); setImportWithRows(true); }}
              onDeleteTemplate={(name) => {
                const template = templates.find(t => t.name === name);
                if (template) setConfirmDelete({ type: 'template', id: template.id, name: template.name });
              }}
            />
          )}

          {/* Subgrid Template Modal */}
          {subgridTemplateModal && (
            <SubgridTemplateModal
              mode={subgridTemplateModal.mode}
              templateName={subgridTemplateName}
              includeRows={subgridIncludeRows}
              templateError={subgridTemplateError}
              templates={subgridTemplates}
              selectedTemplate={subgridSelectedTemplate}
              importWithRows={subgridImportWithRows}
              onNameChange={setSubgridTemplateName}
              onIncludeRowsChange={setSubgridIncludeRows}
              onSave={() => handleSaveSubgridTemplate(subgridTemplateModal.parentId)}
              onTemplateChange={(v) => {
                setSubgridSelectedTemplate(v);
                const t = subgridTemplates.find(t => t.name === v);
                setSubgridImportWithRows(!!(t && t.rows));
              }}
              onImportWithRowsChange={setSubgridImportWithRows}
              onImport={() => handleImportSubgridTemplate(subgridTemplateModal.parentId)}
              onDeleteTemplate={(name) => {
                const t = subgridTemplates.find(t => t.name === name);
                if (!t) return;
                if (window.confirm(`Delete template '${t.name}'? This cannot be undone.`)) {
                  const newTemplates = subgridTemplates.filter(st => st.name !== t.name);
                  setSubgridTemplates(newTemplates);
                  saveSubgridTemplates(newTemplates);
                  setSubgridSelectedTemplate('');
                  setSubgridImportWithRows(true);
                }
              }}
              onCancel={() => { setSubgridTemplateModal(null); setSubgridTemplateError(''); setSubgridTemplateName(''); setSubgridIncludeRows(true); }}
            />
          )}

          {/* Comment Delete Confirmation */}
          {confirmDeleteComment && (
            <DeleteCommentModal
              onConfirm={async () => {
                if (confirmDeleteComment) {
                  const { rowId, commentIdx } = confirmDeleteComment;
                  try {
                    const comment = comments[selectedCategory][rowId][commentIdx];
                    await deleteComment(comment.id, rowId);
                    setConfirmDeleteComment(null);
                  } catch (error) { /* handled in deleteComment */ }
                }
              }}
              onCancel={() => setConfirmDeleteComment(null)}
            />
          )}

          {/* Template Delete Confirmation */}
          {confirmDelete && confirmDelete.type === 'template' && (
            <DeleteConfirmModal
              type="template"
              name={confirmDelete.name}
              onConfirm={() => handleDeleteTemplate(confirmDelete.id as string)}
              onCancel={() => setConfirmDelete(null)}
            />
          )}

          {/* Export Modal */}
          {showExportModal && (
            <ExportExcelModal
              excludeSubgrid={excludeSubgridExport}
              onExcludeSubgridChange={setExcludeSubgridExport}
              onExport={() => { handleExportExcel(excludeSubgridExport); setShowExportModal(false); }}
              onCancel={() => setShowExportModal(false)}
            />
          )}

          {/* Import Preview */}
          {importPreview && (
            <ImportPreviewModal
              importPreview={importPreview}
              onCancel={() => setImportPreview(null)}
              onApply={applyImport}
            />
          )}

          {/* Subgrid Template Delete */}
          {confirmDelete && confirmDelete.type === 'subgrid-template' && (
            <DeleteConfirmModal
              type="subgrid-template"
              name={confirmDelete.name}
              onConfirm={() => {
                const newTemplates = subgridTemplates.filter(st => st.name !== confirmDelete.id);
                setSubgridTemplates(newTemplates);
                saveSubgridTemplates(newTemplates);
                setSubgridSelectedTemplate('');
                setSubgridImportWithRows(true);
                setConfirmDelete(null);
              }}
              onCancel={() => setConfirmDelete(null)}
            />
          )}
        </main>
      </div>
    </AdminGridProvider>
  );
}