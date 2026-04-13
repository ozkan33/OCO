import { useState } from 'react';
import { toast } from 'sonner';

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
}

export function useSubGridHandlers({
  subGrids, setSubGrids, expandedRowId, setExpandedRowId,
  editingScoreCard, getCurrentData, updateCurrentData,
  selectedCategory, isScorecard,
}: UseSubGridHandlersParams) {

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
    const updatedRows = currentData.rows.map((row: any) =>
      row.id === parentId ? { ...row, subgrid: { columns: subgrid.columns, rows: subgrid.rows } } : row
    );
    updateCurrentData({ rows: updatedRows });
  }

  function ensureSubGrid(parentId: string | number | undefined) {
    if (parentId === undefined) return;
    if (!subGrids[parentId]) {
      setSubGrids((prev: any) => ({
        ...prev,
        [parentId]: { columns: [{ key: 'task', name: 'Task', editable: true, sortable: true }], rows: [] }
      }));
    }
  }

  function handleToggleSubGrid(parentId: string | number | undefined) {
    if (parentId === undefined) return;
    setExpandedRowId(expandedRowId === parentId ? null : parentId);
    ensureSubGrid(parentId);
  }

  function handleDeleteSubGrid(parentId: string | number | undefined) {
    if (parentId === undefined) return;
    // Remove subgrid from parent row so auto-save persists the deletion
    if (selectedCategory && isScorecard(selectedCategory)) {
      const currentData = getCurrentData();
      if (currentData) {
        const updatedRows = currentData.rows.map((row: any) => {
          if (row.id === parentId) {
            const { subgrid, ...rest } = row;
            return rest;
          }
          return row;
        });
        updateCurrentData({ rows: updatedRows });
      }
    }
    setSubGrids((prev: any) => { const n = { ...prev }; delete n[parentId]; return n; });
  }

  function handleAddSubGrid(parentId: string | number) {
    setSubGrids((prev: any) => {
      const updated = {
        ...prev,
        [parentId]: { columns: [{ key: 'note', name: 'Note', editable: true, sortable: true }], rows: [] }
      };
      updateParentRowSubgrid(parentId, updated[parentId]);
      return updated;
    });
    setExpandedRowId(parentId);
  }

  function handleSubGridAddColumn(parentId: string | number | undefined) {
    if (parentId === undefined) return;
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
    setSubGrids((prev: any) => {
      const updated = { ...prev, [parentId]: { ...prev[parentId], rows: newRows.filter((r: any) => !r.isAddRow) } };
      updateParentRowSubgrid(parentId, updated[parentId]);
      return updated;
    });
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
  };
}
