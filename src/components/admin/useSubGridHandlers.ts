import { useState } from 'react';
import { toast } from 'sonner';

interface DeltaTracker {
  recordCellDelta: (delta: { rowId?: number | string; columnKey: string; value: any; parentRowId?: number | string; subRowId?: number | string }) => void;
  markStructuralChange: () => void;
}

interface UseSubGridHandlersParams {
  subGrids: any;
  setSubGrids: any;
  expandedRowId: string | number | null;
  setExpandedRowId: (v: string | number | null) => void;
  editingScoreCard: any;
  getCurrentData: () => { columns: any[]; rows: any[] } | null;
  updateCurrentData: (updates: Partial<{ columns: any[]; rows: any[] }>) => void;
  selectedCategory: string;
  isScorecard: (id: string) => boolean;
  deltaTracker?: DeltaTracker;
  reloadComments?: (scorecardId: string) => Promise<void> | void;
}

// Default column keys that are NOT product columns
const DEFAULT_COLUMN_KEYS = new Set([
  'name', 'priority', 'retail_price', 'category_review_date',
  'buyer', 'store_count', 'hq_location', 'cmg', 'route_to_market',
  'comments', 'delete', 'store_contact',
]);

// The fixed store-info columns for subgrids (comments handled by icon column in SubGridRenderer)
const STORE_INFO_COLUMNS = [
  { key: 'store_name', name: 'Store Name', editable: false, sortable: true },
  { key: 'address', name: 'Address', editable: false, sortable: true },
  { key: 'city', name: 'City', editable: false, sortable: true },
  { key: 'state', name: 'State', editable: false, sortable: true },
  { key: 'zipcode', name: 'Zipcode', editable: false, sortable: true },
];

// Authorization options for product columns in subgrid
export const AUTHORIZATION_OPTIONS = ['Authorized', 'Discontinued', 'Not Authorized'];

export function useSubGridHandlers({
  subGrids, setSubGrids, expandedRowId, setExpandedRowId,
  editingScoreCard, getCurrentData, updateCurrentData,
  selectedCategory, isScorecard, deltaTracker, reloadComments,
}: UseSubGridHandlersParams) {

  // Back-fills subgrid/parent comments from market_visits that predate the
  // scorecard rows, then reloads comments so the UI picks them up. Idempotent
  // server-side, so safe to call opportunistically whenever subgrid stores
  // change — and also on scorecard selection, so a cleanup DELETE of
  // mis-attributed rows gets repaired the next time the user opens that
  // scorecard.
  //
  // Exported so AdminDataGrid can re-run it on every category switch.
  async function backfillMarketVisitComments(scorecardId: string | null | undefined) {
    if (!scorecardId || typeof scorecardId !== 'string' || scorecardId.startsWith('scorecard_')) return;
    try {
      const res = await fetch('/api/market-visits/backfill-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scorecard_id: scorecardId }),
      });
      if (!res.ok) return;
      const json = await res.json().catch(() => ({ created: 0 }));
      if (json?.created > 0 && reloadComments) await reloadComments(scorecardId);
    } catch (err) {
      console.warn('Failed to backfill market visit comments:', err);
    }
  }

  // Subgrid template state
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
    } catch { return []; }
  }

  function saveSubgridTemplates(templates: any[]) {
    try { localStorage.setItem('subgridTemplates', JSON.stringify(templates)); } catch { /* silent */ }
  }

  const [subgridTemplates, setSubgridTemplates] = useState<any[]>(() => loadSubgridTemplates());

  function updateParentRowSubgrid(parentId: string | number, subgrid: { columns: any[]; rows: any[] }) {
    if (!selectedCategory || !isScorecard(selectedCategory)) return;
    const currentData = getCurrentData();
    if (!currentData) return;
    const storeCount = subgrid.rows.length;
    const updatedRows = currentData.rows.map((row: any) =>
      row.id === parentId ? { ...row, store_count: storeCount, subgrid: { columns: subgrid.columns, rows: subgrid.rows } } : row
    );
    updateCurrentData({ rows: updatedRows });
  }

  // Sync all existing subgrids when a new product column is added to the scorecard
  function syncSubgridsWithColumns() {
    const newColumns = buildSubgridColumns();
    setSubGrids((prev: any) => {
      const updated = { ...prev };
      let changed = false;
      for (const parentId of Object.keys(updated)) {
        const grid = updated[parentId];
        if (!grid) continue;
        // Check if any new product columns are missing from this subgrid
        const existingKeys = new Set(grid.columns.map((c: any) => c.key));
        const missingCols = newColumns.filter((c: any) => !existingKeys.has(c.key));
        if (missingCols.length === 0) continue;
        changed = true;
        const updatedGrid = {
          columns: [...grid.columns, ...missingCols],
          rows: grid.rows.map((row: any) => {
            const newRow = { ...row };
            missingCols.forEach((col: any) => { if (!(col.key in newRow)) newRow[col.key] = ''; });
            return newRow;
          }),
        };
        updated[parentId] = updatedGrid;
        updateParentRowSubgrid(Number(parentId) || parentId, updatedGrid);
      }
      return changed ? updated : prev;
    });
  }

  // Extract product column keys from the current scorecard (columns between name and priority that are user-added)
  function getProductColumns(): { key: string; name: string }[] {
    const currentData = getCurrentData();
    if (!currentData) return [];
    return currentData.columns
      .filter((col: any) => !DEFAULT_COLUMN_KEYS.has(col.key) && col.key !== 'name')
      .map((col: any) => ({ key: `product_${col.key}`, name: col.name || col.key }));
  }

  // Build the full subgrid column set: store info + product columns
  function buildSubgridColumns(): any[] {
    const productCols = getProductColumns();
    const productColDefs = productCols.map(pc => ({
      key: pc.key,
      name: pc.name,
      editable: true,
      sortable: true,
      isProductAuth: true, // flag for dropdown rendering
    }));
    return [...STORE_INFO_COLUMNS, ...productColDefs];
  }

  // Fetch stores from API by chain name and populate subgrid
  // Shared logic for fetching and building store rows
  async function fetchStoreRows(chainName: string) {
    const res = await fetch(`/api/stores?chain=${encodeURIComponent(chainName)}`, { credentials: 'include' });
    if (!res.ok) return null;
    const stores: any[] = await res.json();
    if (!stores || stores.length === 0) return null;

    const columns = buildSubgridColumns();
    const rows = stores.map((store: any, idx: number) => {
      const row: any = {
        id: idx + 1,
        store_name: store.store_name || '',
        address: store.address || '',
        city: store.city || '',
        state: store.state || '',
        zipcode: store.zipcode || '',
      };
      columns.forEach((col: any) => {
        if (col.isProductAuth && !(col.key in row)) row[col.key] = '';
      });
      return row;
    });
    return { columns, rows };
  }

  async function fetchAndPopulateStores(parentId: string | number, chainName: string) {
    try {
      const result = await fetchStoreRows(chainName);
      if (!result) return;

      let didPopulate = false;
      setSubGrids((prev: any) => {
        const existing = prev[parentId];
        // Only auto-populate if subgrid has no rows yet (don't overwrite user data)
        if (existing && existing.rows && existing.rows.length > 0) return prev;

        didPopulate = true;
        const updated = { ...prev, [parentId]: result };
        updateParentRowSubgrid(parentId, updated[parentId]);
        return updated;
      });

      if (didPopulate) void backfillMarketVisitComments(editingScoreCard?.id);
    } catch (err) {
      console.warn('Failed to fetch chain stores:', err);
    }
  }

  // Force-refresh: re-fetches stores from DB, preserving product column values where store names match
  async function refreshStoresForSubgrid(parentId: string | number) {
    const currentData = getCurrentData();
    const parentRow = currentData?.rows?.find((r: any) => r.id === parentId);
    if (!parentRow?.name) return;

    try {
      const result = await fetchStoreRows(parentRow.name);
      if (!result) return; // No stores in DB for this chain — keep existing subgrid data as-is

      setSubGrids((prev: any) => {
        const existing = prev[parentId];
        // Preserve product column values from old rows where store_name matches
        const oldRowsByStore: Record<string, any> = {};
        if (existing?.rows) {
          for (const row of existing.rows) {
            if (row.store_name) oldRowsByStore[row.store_name] = row;
          }
        }

        const mergedRows = result.rows.map((newRow: any) => {
          const oldRow = oldRowsByStore[newRow.store_name];
          if (!oldRow) return newRow;
          // Copy over product column values from old row
          const merged = { ...newRow };
          for (const col of result.columns) {
            if ((col as any).isProductAuth && oldRow[col.key]) {
              merged[col.key] = oldRow[col.key];
            }
          }
          return merged;
        });

        const updated = { ...prev, [parentId]: { columns: result.columns, rows: mergedRows } };
        updateParentRowSubgrid(parentId, updated[parentId]);
        return updated;
      });

      void backfillMarketVisitComments(editingScoreCard?.id);
    } catch (err) {
      console.warn('Failed to refresh stores:', err);
    }
  }

  function ensureSubGrid(parentId: string | number | undefined) {
    if (parentId === undefined) return;
    if (!subGrids[parentId]) {
      const columns = buildSubgridColumns();
      setSubGrids((prev: any) => ({
        ...prev,
        [parentId]: { columns, rows: [] }
      }));
    }
  }

  function handleToggleSubGrid(parentId: string | number | undefined) {
    if (parentId === undefined) return;

    if (expandedRowId === parentId) {
      setExpandedRowId(null);
      return;
    }

    setExpandedRowId(parentId);
    ensureSubGrid(parentId);

    // Always refresh stores from DB (preserves existing product auth values)
    refreshStoresForSubgrid(parentId);
  }

  function handleDeleteSubGrid(parentId: string | number | undefined) {
    if (parentId === undefined) return;
    deltaTracker?.markStructuralChange();
    // Remove subgrid from parent row so auto-save persists the deletion
    if (selectedCategory && isScorecard(selectedCategory)) {
      const currentData = getCurrentData();
      if (currentData) {
        const updatedRows = currentData.rows.map((row: any) => {
          if (row.id === parentId) {
            const { subgrid, ...rest } = row;
            return { ...rest, store_count: 0 };
          }
          return row;
        });
        updateCurrentData({ rows: updatedRows });
      }
    }
    setSubGrids((prev: any) => { const n = { ...prev }; delete n[parentId]; return n; });
  }

  function handleAddSubGrid(parentId: string | number) {
    const columns = buildSubgridColumns();
    setSubGrids((prev: any) => {
      const updated = {
        ...prev,
        [parentId]: { columns, rows: [] }
      };
      updateParentRowSubgrid(parentId, updated[parentId]);
      return updated;
    });
    setExpandedRowId(parentId);

    // Auto-fetch stores
    const currentData = getCurrentData();
    const parentRow = currentData?.rows?.find((r: any) => r.id === parentId);
    if (parentRow?.name) {
      fetchAndPopulateStores(parentId, parentRow.name);
    }
  }

  function handleSubGridAddColumn(parentId: string | number | undefined) {
    if (parentId === undefined) return;
    deltaTracker?.markStructuralChange();
    const colKey = `col_${Date.now()}`;
    setSubGrids((prev: any) => {
      const grid = prev[parentId] || { columns: [], rows: [] };
      const existingCount = grid.columns.length;
      const colName = `Column ${existingCount + 1}`;
      const updated = {
        ...prev,
        [parentId]: {
          ...grid,
          columns: [...grid.columns, { key: colKey, name: colName, editable: true, sortable: true }],
          rows: grid.rows.map((row: any) => ({ ...row, [colKey]: '' }))
        }
      };
      updateParentRowSubgrid(parentId, updated[parentId]);
      return updated;
    });
  }

  function handleSubGridAddRow(parentId: string | number | undefined) {
    if (parentId === undefined) return;
    deltaTracker?.markStructuralChange();
    setSubGrids((prev: any) => {
      const grid = prev[parentId] || { columns: [], rows: [] };
      const newId = grid.rows.length > 0 ? Math.max(...grid.rows.map((r: any) => typeof r.id === 'number' ? r.id : 0)) + 1 : 1;
      const newRow: any = { id: newId };
      grid.columns.forEach((col: any) => { newRow[col.key] = ''; });
      const updated = { ...prev, [parentId]: { ...grid, rows: [...grid.rows, newRow] } };
      updateParentRowSubgrid(parentId, updated[parentId]);
      return updated;
    });
  }

  function handleSubGridRowsChange(parentId: string | number | undefined, newRows: any[]) {
    if (parentId === undefined) return;
    // Diff subgrid rows to record cell-level deltas
    let storeNameChanged = false;
    const oldRows = subGrids[parentId]?.rows || [];
    for (const newRow of newRows) {
      if (newRow.isAddRow) continue;
      const oldRow = oldRows.find((r: any) => r.id === newRow.id);
      if (!oldRow) continue;
      for (const key of Object.keys(newRow)) {
        if (key === 'id' || key === 'isAddRow') continue;
        if (newRow[key] !== oldRow[key]) {
          deltaTracker?.recordCellDelta({ parentRowId: parentId, subRowId: newRow.id, columnKey: key, value: newRow[key] });
          if (key === 'store_name' && typeof newRow[key] === 'string' && newRow[key].trim()) {
            storeNameChanged = true;
          }
        }
      }
    }
    setSubGrids((prev: any) => {
      const updated = { ...prev, [parentId]: { ...prev[parentId], rows: newRows.filter((r: any) => !r.isAddRow) } };
      updateParentRowSubgrid(parentId, updated[parentId]);
      return updated;
    });

    if (storeNameChanged) void backfillMarketVisitComments(editingScoreCard?.id);
  }

  function handleSubGridColumnNameChange(parentId: string | number | undefined, idx: number, newName: string) {
    if (parentId === undefined) return;
    setSubGrids((prev: any) => {
      const grid = prev[parentId];
      if (!grid) return prev;
      const updatedColumns = grid.columns.map((col: any, i: number) => i === idx ? { ...col, name: newName } : col);
      const updated = { ...prev, [parentId]: { ...grid, columns: updatedColumns } };
      updateParentRowSubgrid(parentId, updated[parentId]);
      return updated;
    });
  }

  function handleSubGridDeleteRow(parentId: string | number | undefined, rowId: number | string | undefined) {
    if (parentId === undefined || rowId === undefined) return;
    deltaTracker?.markStructuralChange();
    setSubGrids((prev: any) => {
      const grid = prev[parentId];
      if (!grid) return prev;
      const updated = { ...prev, [parentId]: { ...grid, rows: grid.rows.filter((row: any) => row.id !== rowId) } };
      updateParentRowSubgrid(parentId, updated[parentId]);
      return updated;
    });
  }

  function handleSubGridDeleteColumn(parentId: string | number | undefined, colKey: string) {
    if (parentId === undefined) return;
    deltaTracker?.markStructuralChange();
    setSubGrids((prev: any) => {
      const grid = prev[parentId];
      if (!grid) return prev;
      const updated = {
        ...prev,
        [parentId]: {
          ...grid,
          columns: grid.columns.filter((col: any) => col.key !== colKey),
          rows: grid.rows.map((row: any) => { const n = { ...row }; delete n[colKey]; return n; })
        }
      };
      updateParentRowSubgrid(parentId, updated[parentId]);
      return updated;
    });
  }

  function handleSaveSubgridTemplate(parentId: string | number) {
    if (!subgridTemplateName.trim()) { setSubgridTemplateError('Template name is required.'); return; }
    if (subgridTemplates.some(t => t.name.trim().toLowerCase() === subgridTemplateName.trim().toLowerCase())) {
      setSubgridTemplateError('A template with this name already exists.'); return;
    }
    const grid = subGrids[parentId];
    if (!grid) { setSubgridTemplateError('No subgrid found.'); return; }
    const newTemplate = { name: subgridTemplateName.trim(), columns: grid.columns, rows: subgridIncludeRows ? grid.rows : undefined };
    const newTemplates = [...subgridTemplates, newTemplate];
    setSubgridTemplates(newTemplates);
    saveSubgridTemplates(newTemplates);
    setSubgridTemplateModal(null); setSubgridTemplateName(''); setSubgridIncludeRows(true); setSubgridTemplateError('');
    toast.success('Subgrid template saved!');
  }

  function handleImportSubgridTemplate(parentId: string | number) {
    const template = subgridTemplates.find(t => t.name === subgridSelectedTemplate);
    if (!template) { setSubgridTemplateError('Please select a template.'); return; }
    setSubGrids((prev: any) => {
      const updated = {
        ...prev,
        [parentId]: { columns: template.columns, rows: subgridImportWithRows && template.rows ? template.rows : prev[parentId]?.rows || [] }
      };
      updateParentRowSubgrid(parentId, updated[parentId]);
      return updated;
    });
    setSubgridTemplateModal(null); setSubgridSelectedTemplate(''); setSubgridImportWithRows(true); setSubgridTemplateError('');
    toast.success('Subgrid template imported!');
  }

  // Build unique header names for export/import — disambiguates duplicate column names
  function getUniqueHeaders(columns: any[]) {
    const nameCounts: Record<string, number> = {};
    return columns
      .filter((col: any) => col.key !== 'delete')
      .map((col: any) => {
        const baseName = String(col.name || col.key);
        nameCounts[baseName] = (nameCounts[baseName] || 0) + 1;
        const header = nameCounts[baseName] > 1 ? `${baseName} (${nameCounts[baseName]})` : baseName;
        return { key: col.key, header };
      });
  }

  async function handleExportSubgridExcel(parentId: string | number) {
    const XLSX = await import('xlsx');
    const grid = subGrids[parentId];
    if (!grid) { toast.error('No subgrid data to export'); return; }
    const colHeaders = getUniqueHeaders(grid.columns);
    const exportRows = grid.rows.map((row: any) => {
      const obj: any = {};
      colHeaders.forEach(({ key, header }) => { obj[header] = row[key] ?? ''; });
      return obj;
    });
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    const scorecardName = (editingScoreCard?.name || 'scorecard').replace(/[^a-zA-Z0-9_-]/g, '_');
    const parentRow = getCurrentData()?.rows.find((r: any) => r.id === parentId);
    const parentName = (parentRow?.name || 'subgrid').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.utils.book_append_sheet(workbook, worksheet, `${scorecardName}_${parentName}`.slice(0, 31));
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `${scorecardName}_${parentName}_subgrid_${timestamp}.xlsx`;
    XLSX.writeFile(workbook, filename);
    toast.success(`Exported subgrid as ${filename}`);
  }

  function handleImportSubgridExcel(event: React.ChangeEvent<HTMLInputElement>, parentId: string | number) {
    const file = event.target.files?.[0];
    if (!file) return;
    const grid = subGrids[parentId];
    if (!grid) { toast.error('No subgrid found for import'); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const XLSX = await import('xlsx');
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows2D: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (rows2D.length === 0) return;
      const headers = rows2D[0];
      if (!headers || headers.length === 0) { toast.error('No headers found in Excel/CSV file!'); return; }

      // Match columns by position — this handles duplicate column names correctly
      // The Excel was exported with columns in the same order as the grid
      const gridCols = grid.columns.filter((col: any) => col.key !== 'delete');

      if (headers.length !== gridCols.length) {
        toast.error(`Column count mismatch: Excel has ${headers.length} columns, grid has ${gridCols.length}. Please ensure the file matches the current subgrid structure.`);
        return;
      }

      // Map each grid column to its Excel column index by position
      const colKeyToIdx: Record<string, number> = {};
      gridCols.forEach((col: any, idx: number) => { colKeyToIdx[col.key] = idx; });

      const dataRows = rows2D.slice(1).filter((row: any[]) => row.some(cell => cell && String(cell).trim() !== ''));
      const formattedRows = dataRows.map((rowArr: any[], idx: number) => {
        const obj: any = {};
        Object.entries(colKeyToIdx).forEach(([colKey, excelIdx]) => { obj[colKey] = rowArr[excelIdx] ?? ''; });
        obj.id = idx + 1;
        return obj;
      });

      setSubGrids((prev: any) => ({ ...prev, [parentId]: { ...prev[parentId], rows: formattedRows } }));
      toast.success('Subgrid import successful!');
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  }

  return {
    ensureSubGrid, handleToggleSubGrid, handleDeleteSubGrid, handleAddSubGrid,
    handleSubGridAddColumn, handleSubGridAddRow, handleSubGridRowsChange,
    handleSubGridColumnNameChange, handleSubGridDeleteRow, handleSubGridDeleteColumn,
    updateParentRowSubgrid,
    handleImportSubgridExcel, handleExportSubgridExcel,
    handleSaveSubgridTemplate, handleImportSubgridTemplate,
    loadSubgridTemplates, saveSubgridTemplates,
    subgridTemplateModal, setSubgridTemplateModal,
    subgridTemplateName, setSubgridTemplateName,
    subgridIncludeRows, setSubgridIncludeRows,
    subgridSelectedTemplate, setSubgridSelectedTemplate,
    subgridImportWithRows, setSubgridImportWithRows,
    subgridTemplateError, setSubgridTemplateError,
    subgridTemplates, setSubgridTemplates,
    fetchAndPopulateStores, refreshStoresForSubgrid, buildSubgridColumns, getProductColumns, syncSubgridsWithColumns,
    backfillMarketVisitComments,
  };
}
