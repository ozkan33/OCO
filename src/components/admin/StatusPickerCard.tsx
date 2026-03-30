'use client';
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { productStatusOptions, statusIcons } from './constants';
import type { CellPosition } from './types';

interface StatusPickerCardProps {
  position: CellPosition;
  value: string;
  columnKey: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}

export default function StatusPickerCard({ position, value, onSelect, onClose }: StatusPickerCardProps) {
  const [focusedIdx, setFocusedIdx] = useState(() =>
    productStatusOptions.findIndex(opt => opt.value === value)
  );
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!cardRef.current) return;
      if (e.key === 'ArrowDown') {
        setFocusedIdx(idx => (idx + 1) % productStatusOptions.length);
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        setFocusedIdx(idx => (idx - 1 + productStatusOptions.length) % productStatusOptions.length);
        e.preventDefault();
      } else if (e.key === 'Enter') {
        onSelect(productStatusOptions[focusedIdx].value);
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
        minWidth: position.width,
        background: '#fff',
        zIndex: 99999,
        boxShadow: position.openUpward ? '0 -4px 24px #0002' : '0 4px 24px #0002',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: 4,
        marginTop: 2,
        maxHeight: position.maxHeight,
        overflowY: 'auto',
      }}
      tabIndex={-1}
    >
      {productStatusOptions.map((opt, idx) => {
        const isSelected = value === opt.value;
        const isFocused = idx === focusedIdx;
        return (
          <div
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            onMouseEnter={() => setFocusedIdx(idx)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 16px',
              borderRadius: 8,
              cursor: 'pointer',
              background: isSelected ? opt.bg : isFocused ? '#f3f4f6' : 'transparent',
              fontWeight: isSelected ? 700 : 400,
              color: opt.color,
              boxShadow: isSelected ? '0 2px 8px #0001' : undefined,
              marginBottom: 2,
              transition: 'background 0.15s',
            }}
          >
            <span style={{ fontSize: 18, width: 22, display: 'flex', justifyContent: 'center' }}>
              {statusIcons[opt.value] || ''}
            </span>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: opt.bg, border: `2px solid ${opt.color}`, display: 'inline-block' }} />
            <span style={{ color: opt.color, fontWeight: isSelected ? 700 : 500 }}>{opt.label}</span>
            {isSelected && <span style={{ marginLeft: 'auto', color: opt.color, fontSize: 20 }}>&#10003;</span>}
          </div>
        );
      })}
    </div>,
    document.body
  );
}
