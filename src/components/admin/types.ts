import type { Column } from 'react-data-grid';

export interface Row {
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

export type MyColumn = Column<Row> & { locked?: boolean; isDefault?: boolean };

export interface ScoreCard {
  id: string;
  name: string;
  columns: MyColumn[];
  rows: Row[];
  createdAt: Date;
  lastModified?: Date;
}

export interface AdminDataGridProps {
  userRole: string;
}

/** Pre-computed dropdown/picker position from getCellPosition() */
export interface CellPosition {
  top: number;
  left: number;
  width: number;
  openUpward: boolean;
  maxHeight: number;
}

export interface PickerState extends CellPosition {
  rowIdx: number;
  colIdx: number;
  value: string;
  columnKey: string;
}
