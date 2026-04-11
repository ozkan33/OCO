'use client';
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { priorityOptions } from './constants';
import type { CellPosition } from './types';

interface PriorityPickerCardProps {
  position: CellPosition;
  value: string;
  columnKey: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}

export default function PriorityPickerCard({ position, value, onSelect, onClose }: PriorityPickerCardProps) {
  const [focusedIdx, setFocusedIdx] = useState(() =>
    priorityOptions.findIndex(opt => opt.value === value)
  );
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!cardRef.current) return;
      if (e.key === 'ArrowDown') {
        setFocusedIdx(idx => (idx + 1) % priorityOptions.length);
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        setFocusedIdx(idx => (idx - 1 + priorityOptions.length) % priorityOptions.length);
        e.preventDefault();
      } else if (e.key === 'Enter') {
        onSelect(priorityOptions[focusedIdx].value);
      } else if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedIdx, onSelect, onClose]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      ref={cardRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        minWidth: Math.max(position.width, 140),
        background: '#fff',
        zIndex: 99999,
        boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
        border: 'none',
        borderRadius: 8,
        padding: 4,
        marginTop: 2,
        maxHeight: position.maxHeight,
        overflowY: 'auto',
      }}
      tabIndex={-1}
    >
      {priorityOptions.map((opt, idx) => {
        const isSelected = value === opt.value;
        const isFocused = idx === focusedIdx;
        return (
          <div
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            onMouseEnter={() => setFocusedIdx(idx)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              background: isSelected ? opt.bg : isFocused ? '#f8fafc' : 'transparent',
              fontWeight: isSelected ? 600 : 400,
              color: opt.color,
              fontSize: 13,
              marginBottom: 1,
              transition: 'background 0.1s ease',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: opt.color, opacity: 0.8, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{opt.label}</span>
            {isSelected && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={opt.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        );
      })}
    </div>,
    document.body
  );
}
