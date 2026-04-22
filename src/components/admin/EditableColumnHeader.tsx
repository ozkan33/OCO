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

const PencilIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
  </svg>
);

const TrashIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
  </svg>
);

const CheckIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

const XIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
  </svg>
);

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
            className="rounded-md border border-slate-300 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 px-2 py-1 text-sm transition-all outline-none"
            style={{ width: Math.max(80, inputValue.length * 10) }}
            onBlur={() => commitChange(true)}
            maxLength={32}
            tabIndex={0}
            autoFocus
          />
          <button
            onClick={e => commitChange(false, e)}
            className="ml-1 p-1 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
            title="Save"
            tabIndex={-1}
          >
            <CheckIcon />
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setInputValue(col.name as string);
              inputRef.current?.blur();
            }}
            className="ml-0.5 p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Cancel"
            tabIndex={-1}
          >
            <XIcon />
          </button>
        </>
      ) : (
        <>
          <span className="truncate text-sm font-medium" style={{ maxWidth: 100 }}>{col.name}</span>
          <button
            className="ml-1 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all text-slate-400 hover:text-blue-600 hover:bg-blue-50"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            title="Rename column"
            tabIndex={-1}
            onClick={e => { e.stopPropagation(); setEditing(true); }}
          >
            <PencilIcon />
          </button>
          {isUserAdded && onDeleteColumn && (
            <button
              className="ml-0.5 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all text-slate-400 hover:text-red-600 hover:bg-red-50"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              title="Delete column"
              tabIndex={-1}
              onClick={e => { e.stopPropagation(); onDeleteColumn(col.key as string); }}
            >
              <TrashIcon />
            </button>
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
