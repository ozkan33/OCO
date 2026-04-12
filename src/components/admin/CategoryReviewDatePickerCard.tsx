'use client';
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import DatePickerOrig from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format, isToday } from 'date-fns';
import type { CellPosition } from './types';

const DatePicker = DatePickerOrig as unknown as React.FC<any>;

function parseDate(val: string): Date | null {
  if (!val) return null;
  if (/\d{2}\/\d{2}\/\d{4}/.test(val)) {
    const [month, day, year] = val.split('/').map(Number);
    return new Date(year, month - 1, day);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

interface CategoryReviewDatePickerCardProps {
  position: CellPosition;
  value: string;
  columnKey: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}

export default function CategoryReviewDatePickerCard({
  position,
  value,
  onSelect,
  onClose,
}: CategoryReviewDatePickerCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(value ? parseDate(value) : null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const positionStyle: React.CSSProperties = position.openUpward
    ? { position: 'fixed', bottom: window.innerHeight - position.top, left: position.left }
    : { position: 'fixed', top: position.top, left: position.left };

  return ReactDOM.createPortal(
    <div
      ref={cardRef}
      className="category-review-datepicker"
      style={{
        ...positionStyle,
        minWidth: position.width,
        background: '#fff',
        zIndex: 99999,
        boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
        border: 'none',
        borderRadius: 10,
        padding: 6,
        marginTop: 2,
        maxHeight: position.maxHeight,
        overflowY: 'auto',
      }}
      tabIndex={-1}
    >
      <DatePicker
        selected={selectedDate}
        onChange={(date: Date | null) => {
          setSelectedDate(date);
          if (date) onSelect(format(date, 'MM/dd/yyyy'));
        }}
        dateFormat="MM/dd/yyyy"
        inline
        todayButton="Today"
        dayClassName={(date: Date) => (isToday(date) ? 'react-datepicker__day--today' : '')}
      />
      {selectedDate && (
        <button
          onClick={() => { onSelect(''); onClose(); }}
          className="w-full text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 py-1.5 rounded-md transition-colors mt-1 font-medium"
        >
          Clear date
        </button>
      )}
    </div>,
    document.body
  );
}
