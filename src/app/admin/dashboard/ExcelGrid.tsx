'use client';
import * as React from 'react';
import { DataGrid } from 'react-data-grid';

const columns = [
  { key: 'id', name: 'ID' },
  { key: 'title', name: 'Title' }
];

const rows = [
  { id: 0, title: 'Example' },
  { id: 1, title: 'Test' }
];

export default function ExcelGrid() {
  return (
    <div style={{ height: 300 }}>
      <DataGrid columns={columns} rows={rows} />
    </div>
  );
} 