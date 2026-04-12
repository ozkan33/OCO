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
    setSubGrids((prev: any) => { const n = { ...prev }; delete n[parentId]; return n; });
  }

  function handleAddSubGrid(parentId: string | number) {
    setSubGrids((prev: any) => ({
      ...prev,
      [parentId]: { columns: [{ key: 'note', name: 'Note', editable: true, sortable: true }], rows: [] }
    }));
    setExpandedRowId(parentId);
  }

  function handleSubGridAddColumn(parentId: string | number | undefined) {
    if (parentId === undefined) return;
    const colKey = `col_${Date.now()}`;
    setSubGrids((prev: any) => {
      const grid = prev[parentId] || { columns: [], rows: [] };
      const updated = {
        ...prev,
        [parentId]: {
          ...grid,
          columns: [...grid.columns, { key: colKey, name: 'New Column', editable: true, sortable: true }],
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
      return { ...prev, [parentId]: { ...grid, rows: [...grid.rows, newRow] } };
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
    setSubGrids((prev: any) => ({
      ...prev,
      [parentId]: { columns: template.columns, rows: subgridImportWithRows && template.rows ? template.rows : prev[parentId]?.rows || [] }
    }));
    setSubgridTemplateModal(null); setSubgridSelectedTemplate(''); setSubgridImportWithRows(true); setSubgridTemplateError('');
    toast.success('Subgrid template imported!');
  }

  async function handleExportSubgridExcel(parentId: string | number) {
    const XLSX = await import('xlsx');
    const grid = subGrids[parentId];
    if (!grid) { toast.error('No subgrid data to export'); return; }
    const exportRows = grid.rows.map((row: any) => {
      const obj: any = {};
      grid.columns.forEach((col: any) => { if (col.key !== 'delete') obj[String(col.name || col.key)] = row[col.key] ?? ''; });
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

      function normalizeColName(name: string) { return (name || '').toLowerCase().replace(/\s+/g, '').replace(/_/g, '').trim(); }
      const gridColNames = grid.columns.filter((col: any) => col.key !== 'delete').map((col: any) => normalizeColName(String(col.name)));
      const excelColNames = headers.map((h: any) => normalizeColName(String(h)));

      const counts: Record<string, number> = {};
      excelColNames.forEach((n: string) => { counts[n] = (counts[n] || 0) + 1; });
      const dupes = Object.entries(counts).filter(([_, c]) => c > 1).map(([n]) => n);
      if (dupes.length > 0) { toast.error(`Duplicate columns: ${dupes.join(', ')}`); return; }

      const missing = gridColNames.filter((n: string) => !excelColNames.includes(n));
      const extra = excelColNames.filter((n: string) => !gridColNames.includes(n));
      if (gridColNames.length !== excelColNames.length || missing.length > 0 || extra.length > 0) {
        let msg = 'Column names do not match.';
        if (missing.length) msg += `\nMissing: ${missing.join(', ')}`;
        if (extra.length) msg += `\nExtra: ${extra.join(', ')}`;
        toast.error(msg); return;
      }

      const colKeyToIdx: Record<string, number> = {};
      grid.columns.forEach((col: any) => {
        if (col.key === 'delete') return;
        const idx = excelColNames.indexOf(normalizeColName(String(col.name)));
        if (idx !== -1) colKeyToIdx[col.key] = idx;
      });

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
