'use client';
import React from 'react';
import type { MyColumn } from './types';

interface EditableColumnHeaderProps {
  col: MyColumn;
  idx: number;
  isUserAdded: boolean;
  onNameChange: (newName: string) => void;
  sortIcon?: React.ReactNode;
  onSort?: () => void;
  onDeleteColumn?: (key: string) => void;
}

export default function EditableColumnHeader({
  col,
  isUserAdded,
  onNameChange,
  sortIcon,
  onSort,
  onDeleteColumn,
}: EditableColumnHeaderProps) {
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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        commitChange(true);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editing, inputValue]);

  function commitChange(fromBlur = false, e?: React.SyntheticEvent) {
    if (e) e.stopPropagation();
    setEditing(false);
    if (inputValue.trim() && inputValue !== col.name) {
      onNameChange(inputValue.trim());
    } else {
      setInputValue(col.name as string);
    }
    if (inputRef.current) inputRef.current.blur();
  }

  return (
    <div
      ref={containerRef}
      className="group flex items-center w-full h-full px-2"
      style={{ userSelect: 'none' }}
    >
      {editing ? (
        <>
          <input
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitChange(false, e);
              if (e.key === 'Escape') {
                setEditing(false);
                setInputValue(col.name as string);
                inputRef.current?.blur();
              }
            }}
            className="rounded-lg border border-gray-300 px-2 py-1 text-sm transition-all outline-none focus:outline-none"
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
            onClick={() => {
              setEditing(false);
              setInputValue(col.name as string);
              inputRef.current?.blur();
            }}
            className="ml-1 text-gray-400 hover:text-red-600"
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
          >✏️</button>
          {isUserAdded && onDeleteColumn && (
            <button
              className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600"
              style={{ fontSize: 16, background: 'none', border: 'none', cursor: 'pointer' }}
              title="Delete column"
              tabIndex={-1}
              onClick={e => { e.stopPropagation(); onDeleteColumn(col.key as string); }}
            >🗑️</button>
          )}
          {sortIcon && (
            <span
              className="ml-1 cursor-pointer"
              onClick={e => { e.stopPropagation(); onSort?.(); }}
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
