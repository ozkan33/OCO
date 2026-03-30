'use client';
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import DatePickerOrig from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format, isToday } from 'date-fns';
import type { CellPosition } from './types';

// react-datepicker doesn't ship full TS overloads; cast once at the top
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
        padding: 8,
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
    </div>,
    document.body
  );
}
