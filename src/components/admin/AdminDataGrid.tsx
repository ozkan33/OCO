import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DataGrid, type Column, type SortColumn, type RenderEditCellProps } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';

import { useRouter } from 'next/navigation';
import { Toaster, toast } from 'sonner';
import { useScoreCardAutoSave } from '../../hooks/useAutoSave';
import { useDeltaTracker } from '../../hooks/useDeltaTracker';
import { useRealtimeScorecard } from '../../hooks/useRealtimeScorecard';
import MasterScorecard from './MasterScorecard';

// ─── Extracted components ────────────────────────────────────────────────────
import StatusPickerCard from './StatusPickerCard';
import PriorityPickerCard from './PriorityPickerCard';
import ContactPickerCard from './ContactPickerCard';
import CategoryReviewDatePickerCard from './CategoryReviewDatePickerCard';
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
} from './GridModals';
import ScorecardSidebar from './ScorecardSidebar';
import GridToolbar from './GridToolbar';
import { SimpleCommentDrawer, RetailerDrawer } from './CommentDrawer';
import SubGridRenderer from './SubGridRenderer';
import { AdminGridProvider, type AdminGridContextValue } from './AdminDataGridContext';
import { useCommentHandlers } from './useCommentHandlers';
import { useSubGridHandlers } from './useSubGridHandlers';
import { useColumnDefinitions } from './useColumnDefinitions';
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
  storeName?: string | null;
}

interface AdminDataGridProps {
  userRole: string;
  navigateToRef?: React.MutableRefObject<((payload: NavigateToPayload) => void) | null>;
  refreshCommentsRef?: React.MutableRefObject<((scorecardId: string) => void) | null>;
}



export default function AdminDataGrid({ userRole, navigateToRef, refreshCommentsRef }: AdminDataGridProps) {
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

  // Log the react-data-grid version for debugging
  // @ts-ignore

  // Deduplicate scorecards by id (keeps last occurrence)
  const dedup = (arr: ScoreCard[]) => {
    const seen = new Map<string, ScoreCard>();
    arr.forEach(sc => seen.set(sc.id, sc));
    return Array.from(seen.values());
  };

  // ScoreCard state
  const [scorecards, setScorecardsRaw] = useState<ScoreCard[]>(() => loadScoreCardsFromStorage());
  const setScorecards: typeof setScorecardsRaw = (action) => {
    setScorecardsRaw(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      return dedup(next);
    });
  };
  const scorecardsRef = useRef<ScoreCard[]>(scorecards);
  scorecardsRef.current = scorecards;
  const [showCreateScoreCardModal, setShowCreateScoreCardModal] = useState(false);
  const [newScoreCardName, setNewScoreCardName] = useState('');
  const [editingScoreCard, setEditingScoreCard] = useState<ScoreCard | null>(null);
  const [showEditScoreCardModal, setShowEditScoreCardModal] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);



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
  const [comments, setComments] = useState<Record<string, Record<string, any[]>>>({});

  // Add state and modal for the advanced retailer drawer if not present
  const [openRetailerDrawer, setOpenRetailerDrawer] = useState<number | string | null>(null);

  // Added for comment editing
  const [editCommentIdx, setEditCommentIdx] = useState<number | null>(null);
  const [editCommentText, setEditCommentText] = useState('');

  // Subgrid comment state
  const [openSubgridCommentKey, setOpenSubgridCommentKey] = useState<string | null>(null);
  const [subgridCommentInput, setSubgridCommentInput] = useState('');
  const [isAddingSubgridComment, setIsAddingSubgridComment] = useState(false);
  const addingSubgridCommentRef = useRef(false);

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
  const [subgridExpanded, setSubgridExpanded] = useState(false);

  // ─── Auto-expand subgrid when a comment drawer opens on top of it ─────────
  // UX: at the default 36rem width a comment drawer visually covers the subgrid.
  // When the user opens a comment while viewing a subgrid, widen the subgrid so
  // both can coexist, and restore the previous width when the comment closes.
  // Manual chevron toggles during the overlay take precedence (no fighting).
  const prevSubgridExpandedRef = useRef<boolean | null>(null);
  const userOverrodeSubgridWidthRef = useRef<boolean>(false);
  useEffect(() => {
    const commentOpen = openSubgridCommentKey !== null || openRetailerDrawer !== null;
    const subgridVisible = expandedRowId !== null;
    // Only manage width when the subgrid is actually on screen.
    if (!subgridVisible) {
      prevSubgridExpandedRef.current = null;
      userOverrodeSubgridWidthRef.current = false;
      return;
    }
    if (commentOpen && prevSubgridExpandedRef.current === null) {
      // Comment just opened — remember current width and auto-widen.
      prevSubgridExpandedRef.current = subgridExpanded;
      userOverrodeSubgridWidthRef.current = false;
      if (!subgridExpanded) setSubgridExpanded(true);
    } else if (!commentOpen && prevSubgridExpandedRef.current !== null) {
      // Comment just closed — restore prior width unless the user took over.
      if (!userOverrodeSubgridWidthRef.current) {
        setSubgridExpanded(prevSubgridExpandedRef.current);
      }
      prevSubgridExpandedRef.current = null;
      userOverrodeSubgridWidthRef.current = false;
    }
  }, [openSubgridCommentKey, openRetailerDrawer, expandedRowId, subgridExpanded]);

  // Add state for custom delete confirmation modal
  const [confirmDelete, setConfirmDelete] = useState<null | { type: 'row' | 'column' | 'scorecard' | 'template', id: string | number, name?: string }>(null);

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
    isAddingComment,
  } = useCommentHandlers({
    comments, setComments, commentInput, setCommentInput,
    openCommentRowId, setOpenCommentRowId,
    selectedCategory, user, editingScoreCard, isScorecard,
    setScorecards, setEditingScoreCard, setSelectedCategory,
    scorecardsRef,
  });

  // Delta tracker for granular cell-level saves
  const deltaTracker = useDeltaTracker();

  const {
    ensureSubGrid, handleToggleSubGrid, handleDeleteSubGrid, handleAddSubGrid,
    handleSubGridAddColumn, handleSubGridAddRow, handleSubGridRowsChange,
    handleSubGridColumnNameChange, handleSubGridDeleteRow, handleSubGridDeleteColumn,
    updateParentRowSubgrid,
    handleImportSubgridExcel, handleExportSubgridExcel,
    syncSubgridsWithColumns,
    refreshStoresForSubgrid,
    backfillMarketVisitComments,
  } = useSubGridHandlers({
    subGrids, setSubGrids, expandedRowId, setExpandedRowId,
    editingScoreCard, getCurrentData, updateCurrentData,
    selectedCategory, isScorecard, deltaTracker,
    reloadComments: loadScorecardComments,
  });

  // Auto-save uses resetKey (editingScoreCard?.id) to cleanly reset on switch

  const currentScoreCardData = React.useMemo(() => {
    if (!editingScoreCard) return null;

    // Only include serialization-stable fields — exclude Date objects and metadata
    // that change on every access to prevent false "unsaved" detection on scorecard switch
    return {
      id: editingScoreCard.id,
      name: editingScoreCard.name,
      columns: editingScoreCard.columns,
      rows: editingScoreCard.rows,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally using granular deps to avoid re-memo on every editingScoreCard reference change
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
      debounceMs: 1500,
      enableOfflineBackup: true,
      onSaveSuccess: (savedData?: any) => {
        if (savedData && savedData.id && editingScoreCard && editingScoreCard.id !== savedData.id) {
          // Only migrate if we're still on the same scorecard (prevent stale closure corruption)
          if (selectedCategory !== editingScoreCard.id) return;
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
      },
      onSaveError: () => {},
    },
    editingScoreCard?.id, // resetKey
    editingScoreCard, // resetValue
    deltaTracker
  );

  // Realtime multi-tab sync — receive remote updates from other tabs/sessions
  const { suppressEcho } = useRealtimeScorecard({
    scorecardId: editingScoreCard?.id || null,
    isSaving: saveStatus === 'saving',
    onRemoteUpdate: React.useCallback((data: { columns: any[]; rows: any[] }, lastModified: string) => {
      if (!editingScoreCard) return;
      // Only apply if we don't have unsaved changes (avoid overwriting local edits)
      if (hasUnsavedChanges) return;
      const updatedScorecard = {
        ...editingScoreCard,
        columns: data.columns || editingScoreCard.columns,
        rows: data.rows || editingScoreCard.rows,
        lastModified: new Date(lastModified),
      };
      setEditingScoreCard(updatedScorecard);
      setScorecards(prev => prev.map(sc =>
        sc.id === editingScoreCard.id ? updatedScorecard : sc
      ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingScoreCard?.id, hasUnsavedChanges]),
  });

  // Suppress realtime echo after our own saves
  React.useEffect(() => {
    if (saveStatus === 'saved') suppressEcho();
  }, [saveStatus, suppressEcho]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only trigger on pendingFocusRowId and rows change
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

  // On scorecard load, initialize subGrids from any subgrid data in rows and sync store_count
  useEffect(() => {
    if (!selectedCategory || !isScorecard(selectedCategory)) return;
    const currentData = getCurrentData();
    if (!currentData) return;
    const newSubGrids: { [parentId: string]: { columns: MyColumn[]; rows: Row[] } } = {};
    let needsStoreCountSync = false;
    const updatedRows = currentData.rows.map((row: any) => {
      if (row.subgrid && row.subgrid.columns && row.subgrid.rows) {
        newSubGrids[row.id] = { columns: row.subgrid.columns, rows: row.subgrid.rows };
        const correctCount = row.subgrid.rows.length;
        if (row.store_count !== correctCount) {
          needsStoreCountSync = true;
          return { ...row, store_count: correctCount };
        }
      }
      return row;
    });
    setSubGrids(newSubGrids);
    if (needsStoreCountSync) {
      updateCurrentData({ rows: updatedRows });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);


  // Save scorecards to localStorage (debounced to avoid blocking main thread on every keystroke)
  const localStorageTimerRef = React.useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (localStorageTimerRef.current) clearTimeout(localStorageTimerRef.current);
    localStorageTimerRef.current = setTimeout(() => saveScoreCardsToStorage(scorecards), 2000);
    return () => { if (localStorageTimerRef.current) clearTimeout(localStorageTimerRef.current); };
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

  // Memoized current data for the render path (avoids triple-calling getCurrentData)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- getCurrentData is stable, deps track the data it reads
  const currentData = React.useMemo(() => getCurrentData(), [selectedCategory, scorecards, categoryData]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on role/category change only; getCurrentData/updateCurrentData are stable
  }, [userRole, selectedCategory]);

  // Handle category switch — flush pending save before switching
  const switchingRef = useRef(false);

  async function handleCategoryChange(category: string) {
    // Only reset the subgrid when we're actually switching to a different
    // scorecard. Callers that need to pre-set expanded state (e.g. notification
    // navigation) rely on this not clobbering their writes when the category
    // stays the same.
    if (category !== selectedCategory) {
      setExpandedRowId(null);
      setSubgridExpanded(false);
    }
    // Prevent overlapping switches — if we're already mid-switch, just update the target
    if (switchingRef.current) {
      setSelectedCategory(category);
      const sc = scorecards.find(s => s.id === category);
      setEditingScoreCard(sc || null);
      if (sc) setLastSelectedScorecardId(sc.id);
      return;
    }

    switchingRef.current = true;
    try {
      // Save current scorecard before switching (best effort, don't block)
      if (hasUnsavedChanges && editingScoreCard) {
        try { await forceSave(); } catch { /* best effort */ }
      }
    } finally {
      switchingRef.current = false;
    }

    setSelectedCategory(category);
    setSortColumns([]);
    // Auto-collapse sidebar on mobile after selection
    if (window.innerWidth < 768) setSidebarCollapsed(true);

    if (category === 'master-scorecard') {
      setEditingScoreCard(null);
      return;
    }

    const scorecard = scorecards.find(sc => sc.id === category);
    if (scorecard) {
      setEditingScoreCard(scorecard);
      setLastSelectedScorecardId(scorecard.id);
      loadScorecardComments(scorecard.id);
    } else {
      setEditingScoreCard(null);
    }
  }

  // Rebuild market-visit auto-comments whenever the selected scorecard
  // changes, including the initial mount (which sets selectedCategory directly
  // without going through handleCategoryChange). Idempotent server-side, and
  // reloads comments only when rows were actually created.
  useEffect(() => {
    if (!selectedCategory || !isScorecard(selectedCategory)) return;
    void backfillMarketVisitComments(selectedCategory);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- backfill is stable; isScorecard depends on scorecards array which changes on every save
  }, [selectedCategory]);

  // Expose a hook for external polls (e.g., NotificationBell) to refresh
  // comments for a given scorecard — used so the subgrid badge count updates
  // shortly after a brand user posts a comment.
  useEffect(() => {
    if (!refreshCommentsRef) return;
    refreshCommentsRef.current = (scorecardId: string) => {
      if (!scorecardId) return;
      if (scorecardId === selectedCategory) {
        loadScorecardComments(scorecardId);
      }
    };
    return () => {
      if (refreshCommentsRef) refreshCommentsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadScorecardComments is stable
  }, [refreshCommentsRef, selectedCategory]);

  // Expose navigation function for notification clicks.
  // Two cases to support:
  //   1. Chain-level (retailer) note → open the retailer drawer with its comments.
  //   2. Store-level (subgrid) note → expand the parent retailer's subgrid and open
  //      the store's comment drawer.
  // The handler re-resolves the row_id against the freshly loaded scorecard so
  // that a stringly-typed notification row_id still matches a numeric row.id,
  // and falls back to store-name matching when the stored row_id can't be
  // located (e.g. portal couldn't resolve a parent when the note was created).
  useEffect(() => {
    if (!navigateToRef) return;
    navigateToRef.current = async (payload: NavigateToPayload) => {
      const { scorecardId, rowId, storeName } = payload;
      await handleCategoryChange(scorecardId);
      if (!rowId) return;

      // Wait for the scorecard's rows to be available in state. The handler may
      // fire before /api/scorecards has resolved on a fresh page load.
      const waitForRows = async (maxMs = 3000): Promise<any[]> => {
        const start = Date.now();
        while (Date.now() - start < maxMs) {
          const sc = scorecardsRef.current.find((s: ScoreCard) => s.id === scorecardId);
          if (sc && Array.isArray(sc.rows) && sc.rows.length > 0) return sc.rows;
          await new Promise(r => setTimeout(r, 100));
        }
        return scorecardsRef.current.find((s: ScoreCard) => s.id === scorecardId)?.rows || [];
      };
      const rows = await waitForRows();

      // Resolve the notification's row_id to a real row.id in the scorecard.
      // For store-level notifications we *prefer* the retailer whose subgrid
      // actually contains the referenced store — the stored row_id may point at
      // the wrong chain when the notification was created before parent
      // resolution understood subgrids (e.g. "L&B CHANHASSEN" was mis-attached
      // to the "L&B" retailer instead of its real parent "Lunds&Byerlys").
      const normalize = (s: string) =>
        s.trim().toLowerCase().replace(/\s*&\s*/g, '&').replace(/\s+/g, ' ');
      let resolvedRowId: string | number = rowId;

      if (storeName) {
        const nStore = normalize(storeName);
        let subgridParent: any = null;
        for (const r of rows as any[]) {
          const subRows = r?.subgrid?.rows;
          if (!Array.isArray(subRows)) continue;
          const sub = subRows.find((sr: any) => {
            const sn = normalize(String(sr.store_name || ''));
            return sn && (sn === nStore || sn.includes(nStore) || nStore.includes(sn));
          });
          if (sub) { subgridParent = r; break; }
        }
        if (subgridParent) {
          resolvedRowId = subgridParent.id;
        } else {
          const direct = rows.find((r: any) => String(r.id) === String(rowId));
          if (direct) {
            resolvedRowId = direct.id;
          } else {
            const byName = rows.find((r: any) => {
              const n = normalize(String(r.name || ''));
              return n && (nStore === n || nStore.includes(n) || n.includes(nStore));
            });
            if (byName) resolvedRowId = byName.id;
          }
        }
      } else {
        const direct = rows.find((r: any) => String(r.id) === String(rowId));
        if (direct) {
          resolvedRowId = direct.id;
        } else {
          const num = Number(rowId);
          if (!Number.isNaN(num) && String(num) === String(rowId)) resolvedRowId = num;
        }
      }

      loadScorecardComments(scorecardId);

      // Reset any drawer state left over from a prior notification click so the
      // new target is the only thing on screen (retailer drawers and subgrid
      // comment drawers are tracked independently and otherwise stack).
      if (storeName) {
        setOpenRetailerDrawer(null);
        setExpandedRowId(resolvedRowId);
        setSubgridExpanded(true);
        setOpenSubgridCommentKey(`sub:${resolvedRowId}:${storeName}`);
      } else {
        setOpenSubgridCommentKey(null);
        setExpandedRowId(null);
        setSubgridExpanded(false);
        setOpenRetailerDrawer(resolvedRowId);
      }
    };
    return () => {
      if (navigateToRef) navigateToRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- scorecardsRef gives fresh reads; handler only needs re-registering when nav target changes
  }, [navigateToRef]);

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

  // Handle rows change — diff to record cell-level deltas
  const onRowsChange = useCallback((newRows: Row[]) => {
    if (editingScoreCard) {
      const oldRows = editingScoreCard.rows;
      for (const newRow of newRows) {
        if (newRow.isAddRow) continue;
        const oldRow = oldRows.find((r: any) => r.id === newRow.id);
        if (!oldRow) continue;
        for (const key of Object.keys(newRow)) {
          if (key === 'id' || key === 'isAddRow' || key === 'subgrid') continue;
          if (newRow[key] !== oldRow[key]) {
            deltaTracker.recordCellDelta({ rowId: newRow.id, columnKey: key, value: newRow[key] });
          }
        }
      }
    }
    updateCurrentScorecard({ rows: [...newRows] });
  }, [editingScoreCard, updateCurrentScorecard, deltaTracker]);

  // Handle column name change (structural — changes column shape)
  const handleColumnNameChange = useCallback((idx: number, newName: string) => {
    if (!editingScoreCard) return;
    const newColumns = [...editingScoreCard.columns];
    newColumns[idx] = { ...newColumns[idx], name: newName };
    deltaTracker.markStructuralChange();
    updateCurrentScorecard({ columns: newColumns });
  }, [editingScoreCard, updateCurrentScorecard, deltaTracker]);

  // Add new row (structural)
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
    deltaTracker.markStructuralChange();
    updateCurrentScorecard({ rows: [...editingScoreCard.rows, newRow] });
  }, [editingScoreCard, updateCurrentScorecard, deltaTracker]);

  // Delete row (structural)
  const handleDeleteRow = useCallback((rowId: number | string) => {
    if (!editingScoreCard) return;
    const newRows = editingScoreCard.rows.filter(row => row.id !== rowId);
    deltaTracker.markStructuralChange();
    updateCurrentScorecard({ rows: newRows });
  }, [editingScoreCard, updateCurrentScorecard, deltaTracker]);

  const {
    columnsWithDelete, retailersColumns, getSortedRows, getCellPosition,
  } = useColumnDefinitions({
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
  });

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
    deltaTracker.markStructuralChange();
    updateCurrentData({ columns: updatedColumns, rows: updatedRows });
    // Sync all existing subgrids with the new product column
    setTimeout(() => syncSubgridsWithColumns(), 0);
    setShowAddColModal(false);
    setNewColName('');
    setColError('');
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset input when comment modal opens/closes
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
  // Normalize function
  function normalizeColName(name: string) {
    return (name || '').toLowerCase().replace(/\s+/g, '').replace(/_/g, '').trim();
  }



  // Subgrid template state and helpers (per subgrid)

  // Add state for comment delete confirmation
  const [confirmDeleteComment, setConfirmDeleteComment] = useState<{ rowId: number | string, commentIdx: number } | null>(null);


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
                // Update any old "Retailer Name" to "Customer"
                if (col.key === 'name' && col.name !== 'Customer') {
                  return { ...col, name: 'Customer' };
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- initial data load on mount only
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
  async function handleExportExcel(excludeSubgrid = false, includeNotes = false) {
    const ExcelJS = await import('exceljs');
    const currentData = getCurrentData();
    if (!currentData) {
      toast.error('No data to export');
      return;
    }

    const scorecardComments = includeNotes && selectedCategory
      ? (comments[selectedCategory] || {})
      : {};

    const workbook = new ExcelJS.Workbook();
    workbook.creator = '3Brothers Marketing';
    workbook.created = new Date();

    const headerFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A5F' } };
    const headerFont: any = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
    const headerBorder: any = {
      bottom: { style: 'thin', color: { argb: 'CCCCCC' } },
    };

    function styleHeaderRow(sheet: any) {
      const row = sheet.getRow(1);
      row.eachCell((cell: any) => {
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.border = headerBorder;
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      });
      row.height = 28;
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    function autoWidth(sheet: any) {
      sheet.columns.forEach((col: any) => {
        let max = (col.header || '').length;
        col.eachCell?.({ includeEmpty: false }, (cell: any) => {
          const len = cell.value ? String(cell.value).length : 0;
          if (len > max) max = len;
        });
        col.width = Math.min(Math.max(max + 3, 10), 50);
      });
    }

    // Priority fill colors
    const priorityFills: Record<string, any> = {
      High: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } },
      Medium: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } },
      Low: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DCFCE7' } },
    };

    // ── Sheet 1: Retailers ──────────────────────────────────────────────────
    const scorecardName = editingScoreCard?.name || 'Scorecard';
    const mainSheet = workbook.addWorksheet('Retailers');
    const mainCols = currentData.columns
      .filter((c: any) => c.key !== 'comments' && c.key !== '_delete_row')
      .map((c: any) => String(c.name || c.key));
    mainSheet.columns = mainCols.map(name => ({ header: name, key: name }));

    currentData.rows.forEach((row: any) => {
      const rowData: Record<string, any> = {};
      currentData.columns.forEach((col: any) => {
        if (col.key !== 'comments' && col.key !== '_delete_row') {
          rowData[String(col.name || col.key)] = row[col.key] ?? '';
        }
      });
      const excelRow = mainSheet.addRow(rowData);

      // Color-code priority
      const priorityColIdx = mainCols.indexOf('Priority');
      if (priorityColIdx >= 0) {
        const cell = excelRow.getCell(priorityColIdx + 1);
        const fill = priorityFills[String(cell.value)];
        if (fill) cell.fill = fill;
      }
    });

    styleHeaderRow(mainSheet);
    mainSheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + mainCols.length)}1` };
    autoWidth(mainSheet);

    // ── Sheet 2: Details (subgrids) ────────────────────────────────────────
    if (!excludeSubgrid) {
      let hasAnySubgrid = false;
      const detailSheet = workbook.addWorksheet('Details');
      let detailHeaderSet = false;

      currentData.rows.forEach((parentRow: any) => {
        const subgrid = subGrids[parentRow.id];
        if (!subgrid || subgrid.rows.length === 0) return;
        hasAnySubgrid = true;

        const subColNames = subgrid.columns
          .filter((c: any) => c.key !== 'delete')
          .map((c: any) => String(c.name || c.key));

        if (!detailHeaderSet) {
          detailSheet.columns = [
            { header: 'Customer', key: 'Retailer' },
            ...subColNames.map((name: string) => ({ header: name, key: name })),
          ];
          styleHeaderRow(detailSheet);
          detailHeaderSet = true;
        }

        subgrid.rows.forEach((subRow: any) => {
          const rowData: Record<string, any> = { Retailer: parentRow.name || '' };
          subgrid.columns.forEach((col: any) => {
            if (col.key !== 'delete') {
              rowData[String(col.name || col.key)] = subRow[col.key] ?? '';
            }
          });
          detailSheet.addRow(rowData);
        });
      });

      if (hasAnySubgrid) {
        autoWidth(detailSheet);
      } else {
        workbook.removeWorksheet(detailSheet.id);
      }
    }

    // ── Sheet 3: Notes ──────────────────────────────────────────────────────
    if (includeNotes) {
      const notesSheet = workbook.addWorksheet('Notes');
      notesSheet.columns = [
        { header: 'Customer', key: 'Retailer' },
        { header: 'Date', key: 'Date' },
        { header: 'Author', key: 'Author' },
        { header: 'Note', key: 'Note' },
      ];

      let hasAnyNotes = false;
      currentData.rows.forEach((row: any) => {
        const rowComments = scorecardComments[row.id as number] || [];
        rowComments.forEach((c: any) => {
          hasAnyNotes = true;
          notesSheet.addRow({
            Retailer: row.name || '',
            Date: c.created_at ? new Date(c.created_at).toLocaleDateString() : '',
            Author: c.user_email || 'Unknown',
            Note: c.text || '',
          });
        });
      });

      if (hasAnyNotes) {
        styleHeaderRow(notesSheet);
        autoWidth(notesSheet);
        // Make the Note column wider
        const noteCol = notesSheet.getColumn('Note');
        if (noteCol) noteCol.width = 60;
      } else {
        workbook.removeWorksheet(notesSheet.id);
      }
    }

    // ── Write file ──────────────────────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = scorecardName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    a.href = url;
    a.download = `${safeName}_${timestamp}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${safeName}`);
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
  const [includeNotesExport, setIncludeNotesExport] = useState(false);

  // ─── Subgrid comment handler ───────────────────────────────────────────────
  const handleAddSubgridComment = useCallback(async () => {
    if (addingSubgridCommentRef.current) return;
    if (!subgridCommentInput.trim() || !openSubgridCommentKey || !isScorecard(selectedCategory) || !user) return;

    // Parse composite key: "sub:{parentRowId}:{storeName}"
    const parts = openSubgridCommentKey.match(/^sub:(.+?):(.+)$/);
    if (!parts) return;
    const [, parentRowId, storeName] = parts;

    addingSubgridCommentRef.current = true;
    setIsAddingSubgridComment(true);
    try {
      const requestBody: any = {
        scorecard_id: selectedCategory,
        user_id: storeName, // row_id = store name for subgrid comments
        text: subgridCommentInput.trim(),
        parent_row_id: parentRowId,
      };

      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to add comment');
      }

      const newComment = await response.json();

      setComments(prev => ({
        ...prev,
        [selectedCategory]: {
          ...(prev[selectedCategory] || {}),
          [openSubgridCommentKey]: [...((prev[selectedCategory] || {})[openSubgridCommentKey] || []), newComment],
        }
      }));

      setSubgridCommentInput('');
    } catch (error) {
      console.error('Error adding subgrid comment:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add comment');
    } finally {
      addingSubgridCommentRef.current = false;
      setIsAddingSubgridComment(false);
    }
  }, [subgridCommentInput, openSubgridCommentKey, selectedCategory, user, isScorecard, setComments]);

  // ─── Context value for extracted child components ─────────────────────────
  const gridContextValue: AdminGridContextValue = React.useMemo(() => ({
    selectedCategory, userRole, user, editingScoreCard, scorecards,
    comments, commentInput, editCommentIdx, editCommentText,
    openCommentRowId, openRetailerDrawer,
    setCommentInput, setEditCommentIdx, setEditCommentText,
    setOpenCommentRowId, setOpenRetailerDrawer, setComments,
    setConfirmDeleteComment, handleAddComment, handleCloseCommentModal,
    updateComment, deleteComment,
    isAddingComment,
    setScorecards, setEditingScoreCard, setSelectedCategory,
    getCurrentData, updateCurrentData, isScorecard,
    openSubgridCommentKey, setOpenSubgridCommentKey,
    subgridCommentInput, setSubgridCommentInput,
    handleAddSubgridComment, isAddingSubgridComment,
    subGrids, expandedRowId, setExpandedRowId,
    subgridExpanded, setSubgridExpanded,
    setConfirmDelete,
    refreshStoresForSubgrid,
    handleSubGridAddColumn, handleSubGridAddRow, handleSubGridRowsChange,
    handleSubGridColumnNameChange, handleSubGridDeleteRow,
    handleSubGridDeleteColumn, handleDeleteSubGrid,
    handleImportSubgridExcel, handleExportSubgridExcel,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    selectedCategory, editingScoreCard, scorecards, comments, commentInput,
    editCommentIdx, editCommentText, openCommentRowId, openRetailerDrawer,
    openSubgridCommentKey, subgridCommentInput, handleAddSubgridComment,
    subGrids, expandedRowId, subgridExpanded,
    isAddingComment, isAddingSubgridComment,
  ]);

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
      <div className="flex h-dvh w-full">
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
        <main className="flex-1 h-full flex flex-col p-3 sm:p-6 overflow-auto bg-slate-50">
          {/* Auto-save handled by useScoreCardAutoSave hook directly */}

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
                  const retailerCol = columns.find(col => col.name === 'Customer' || col.key === 'name');
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
          {selectedCategory !== 'master-scorecard' && currentData && currentData.columns && currentData.rows ? (
            <div ref={gridContainerRef} className="flex-1 w-full flex flex-col" style={{ position: 'relative', minHeight: 'calc(100dvh - 120px)' }}>
              <DataGrid
                ref={gridRef}
                key={selectedCategory}
                style={{
                  height: '100%',
                  width: '100%',
                  // Disable scroll when dropdown is open
                  overflow: (contactPicker || priorityPicker || statusPicker || categoryReviewDatePicker) ? 'hidden' : 'auto'
                }}
                enableVirtualization={true}
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
                    const updatedRows = [...currentData.rows];
                    updatedRows[statusPicker.rowIdx] = {
                      ...updatedRows[statusPicker.rowIdx],
                      [statusPicker.columnKey]: v
                    };
                    deltaTracker.recordCellDelta({ rowId: updatedRows[statusPicker.rowIdx].id, columnKey: statusPicker.columnKey, value: v });
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
                    const updatedRows = [...currentData.rows];
                    updatedRows[priorityPicker.rowIdx] = {
                      ...updatedRows[priorityPicker.rowIdx],
                      [priorityPicker.columnKey]: v
                    };
                    deltaTracker.recordCellDelta({ rowId: updatedRows[priorityPicker.rowIdx].id, columnKey: priorityPicker.columnKey, value: v });
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
                    const updatedRows = [...currentData.rows];
                    updatedRows[contactPicker.rowIdx] = {
                      ...updatedRows[contactPicker.rowIdx],
                      [contactPicker.columnKey]: v
                    };
                    deltaTracker.recordCellDelta({ rowId: updatedRows[contactPicker.rowIdx].id, columnKey: contactPicker.columnKey, value: v });
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
                    const updatedRows = [...currentData.rows];
                    updatedRows[categoryReviewDatePicker.rowIdx] = {
                      ...updatedRows[categoryReviewDatePicker.rowIdx],
                      [categoryReviewDatePicker.columnKey]: v
                    };
                    deltaTracker.recordCellDelta({ rowId: updatedRows[categoryReviewDatePicker.rowIdx].id, columnKey: categoryReviewDatePicker.columnKey, value: v });
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
                onClick={() => { setSubgridExpanded(false); setExpandedRowId(null); }}
              />
              <div
                className="relative ml-auto h-full flex"
                style={{
                  width: subgridExpanded ? '50vw' : '36rem',
                  transition: 'width 0.25s ease-in-out',
                  animation: 'slideInRight 0.2s ease-out',
                }}
              >
                {/* Expand/Collapse tab on left edge */}
                <button
                  onClick={() => {
                    // If a comment drawer is currently driving the width, flag
                    // that the user has taken manual control so we don't snap
                    // back when it closes.
                    if (prevSubgridExpandedRef.current !== null) {
                      userOverrodeSubgridWidthRef.current = true;
                    }
                    setSubgridExpanded(!subgridExpanded);
                  }}
                  className="absolute -left-7 top-1/2 -translate-y-1/2 z-10 w-7 h-14 bg-white border border-r-0 border-slate-200 rounded-l-lg shadow-md flex items-center justify-center hover:bg-slate-50 transition-colors group"
                  title={subgridExpanded ? 'Collapse panel' : 'Expand panel'}
                >
                  <svg className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    {subgridExpanded ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                    )}
                  </svg>
                </button>
                <div className="flex-1 h-full bg-white shadow-2xl flex flex-col border-l border-slate-200 overflow-hidden">
                  <SubGridRenderer parentId={expandedRowId} />
                </div>
              </div>
            </div>
          )}

          {/* Comment & Retailer Drawers — extracted to CommentDrawer.tsx */}
          {openCommentRowId !== null && isScorecard(selectedCategory) && <SimpleCommentDrawer />}
          {openRetailerDrawer !== null && selectedCategory && isScorecard(selectedCategory) && <RetailerDrawer />}


          {/* Contact Card Modal */}
          {contactCardModal}

          {/* Delete Confirmation Modal */}
          {confirmDelete && confirmDelete.type !== 'template' && (
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
              includeNotes={includeNotesExport}
              onIncludeNotesChange={setIncludeNotesExport}
              onExport={() => { handleExportExcel(excludeSubgridExport, includeNotesExport); setShowExportModal(false); }}
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

        </main>
      </div>
    </AdminGridProvider>
  );
}