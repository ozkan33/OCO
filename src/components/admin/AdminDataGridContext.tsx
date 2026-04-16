'use client';
import React, { createContext, useContext } from 'react';

// Shared context for AdminDataGrid child components.
// State is owned by AdminDataGrid — this just exposes it to deeply nested children
// so they don't need 15+ props drilled through.

export interface AdminGridContextValue {
  // Core state
  selectedCategory: string;
  userRole: string;
  user: any;
  editingScoreCard: any;
  scorecards: any[];

  // Comment state
  comments: Record<string, Record<string, any[]>>;
  commentInput: string;
  editCommentIdx: number | null;
  editCommentText: string;
  openCommentRowId: number | null;
  openRetailerDrawer: number | string | null;

  // Comment actions
  setCommentInput: (v: string) => void;
  setEditCommentIdx: (v: number | null) => void;
  setEditCommentText: (v: string) => void;
  setOpenCommentRowId: (v: number | null) => void;
  setOpenRetailerDrawer: (v: number | string | null) => void;
  setComments: React.Dispatch<React.SetStateAction<Record<string, Record<string, any[]>>>>;
  setConfirmDeleteComment: (v: { rowId: number | string; commentIdx: number } | null) => void;
  handleAddComment: () => void;
  handleCloseCommentModal: () => void;
  updateComment: (commentId: string, newText: string) => Promise<void>;
  deleteComment: (commentId: string, rowId: number | string) => Promise<void>;

  // Scorecard mutations (needed by retailer drawer migration logic)
  setScorecards: React.Dispatch<React.SetStateAction<any[]>>;
  setEditingScoreCard: React.Dispatch<React.SetStateAction<any>>;
  setSelectedCategory: (v: string) => void;

  // Data access
  getCurrentData: () => { columns: any[]; rows: any[] } | null;
  updateCurrentData: (updates: Partial<{ columns: any[]; rows: any[] }>) => void;
  isScorecard: (categoryId: string) => boolean;

  // Subgrid comment state
  openSubgridCommentKey: string | null; // "sub:{parentRowId}:{storeName}"
  setOpenSubgridCommentKey: (v: string | null) => void;
  subgridCommentInput: string;
  setSubgridCommentInput: (v: string) => void;
  handleAddSubgridComment: () => void;

  // Subgrid state
  subGrids: Record<string, { columns: any[]; rows: any[] }>;
  expandedRowId: string | number | null;
  setExpandedRowId: (v: string | number | null) => void;
  setConfirmDelete: (v: any) => void;

  // Subgrid expansion
  subgridExpanded: boolean;
  setSubgridExpanded: (v: boolean) => void;

  // Subgrid actions
  refreshStoresForSubgrid: (parentId: string | number) => void;
  handleSubGridAddColumn: (parentId: string | number | undefined) => void;
  handleSubGridAddRow: (parentId: string | number | undefined) => void;
  handleSubGridRowsChange: (parentId: string | number | undefined, newRows: any[]) => void;
  handleSubGridColumnNameChange: (parentId: string | number | undefined, idx: number, newName: string) => void;
  handleSubGridDeleteRow: (parentId: string | number | undefined, rowId: number | string | undefined) => void;
  handleSubGridDeleteColumn: (parentId: string | number | undefined, colKey: string) => void;
  handleDeleteSubGrid: (parentId: string | number | undefined) => void;
  handleImportSubgridExcel: (event: React.ChangeEvent<HTMLInputElement>, parentId: string | number) => void;
  handleExportSubgridExcel: (parentId: string | number) => void;
}

const AdminGridContext = createContext<AdminGridContextValue | null>(null);

export function AdminGridProvider({ value, children }: { value: AdminGridContextValue; children: React.ReactNode }) {
  return <AdminGridContext.Provider value={value}>{children}</AdminGridContext.Provider>;
}

export function useAdminGrid(): AdminGridContextValue {
  const ctx = useContext(AdminGridContext);
  if (!ctx) throw new Error('useAdminGrid must be used within AdminGridProvider');
  return ctx;
}
