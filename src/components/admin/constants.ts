import React from 'react';

export const defaultColumnKeys = ['name', 'retail_price', 'buyer', 'store_count', 'hq_location', 'cmg'];

// ─── Product Status ───────────────────────────────────────────────────────────

export interface StatusOption {
  value: string;
  label: string;
  bg: string;
  color: string;
}

export const productStatusOptions: StatusOption[] = [
  { value: 'Authorized',       label: 'Authorized',       bg: '#e6f4ea', color: '#14532d' },
  { value: 'In Process',       label: 'In Process',       bg: '#e0e7ff', color: '#1e3a8a' },
  { value: 'In/Out',           label: 'In/Out',           bg: '#fef9c3', color: '#92400e' },
  { value: 'Buyer Passed',     label: 'Buyer Passed',     bg: '#fee2e2', color: '#991b1b' },
  { value: 'Presented',        label: 'Presented',        bg: '#ede9fe', color: '#6d28d9' },
  { value: 'Discontinued',     label: 'Discontinued',     bg: '#f3f4f6', color: '#374151' },
  { value: 'Meeting Secured',  label: 'Meeting Secured',  bg: '#fff7ed', color: '#b45309' },
  { value: 'On Hold',          label: 'On Hold',          bg: '#fdf2f8', color: '#be185d' },
  { value: 'Category Review',  label: 'Category Review',  bg: '#f0fdfa', color: '#0f766e' },
  { value: 'Open Review',      label: 'Open Review',      bg: '#e0f2fe', color: '#0369a1' },
];

export const statusIcons: Record<string, React.ReactNode> = {
  'Authorized':      React.createElement('span', { style: { fontWeight: 700 } }, '\u2713'),
  'In Process':      React.createElement('span', { style: { fontWeight: 700 } }, '\u23F3'),
  'In/Out':          React.createElement('span', { style: { fontWeight: 700 } }, '\u2194'),
  'Buyer Passed':    React.createElement('span', { style: { fontWeight: 700 } }, '\u274C'),
  'Presented':       React.createElement('span', { style: { fontWeight: 700 } }, '\uD83D\uDCC4'),
  'Discontinued':    React.createElement('span', { style: { fontWeight: 700 } }, '\u26D4'),
  'Meeting Secured': React.createElement('span', { style: { fontWeight: 700 } }, '\uD83D\uDCC5'),
  'On Hold':         React.createElement('span', { style: { fontWeight: 700, color: '#2563eb' } }, '\u23F8'),
  'Category Review': React.createElement('span', { style: { fontWeight: 700 } }, '\uD83D\uDCC4'),
  'Open Review':     React.createElement('span', { style: { fontWeight: 700 } }, '\uD83D\uDC41'),
};

// ─── Priority ─────────────────────────────────────────────────────────────────

export interface PriorityOption {
  value: string;
  label: string;
  bg: string;
  color: string;
}

export const priorityOptions: PriorityOption[] = [
  { value: 'High',   label: 'High',   bg: '#fee2e2', color: '#b91c1c' },
  { value: 'Medium', label: 'Medium', bg: '#fef9c3', color: '#b45309' },
  { value: 'Low',    label: 'Low',    bg: '#e0f2fe', color: '#0369a1' },
];

// ─── 3B Contact ───────────────────────────────────────────────────────────────

export interface ContactOption {
  value: string;
  label: string;
  bg: string;
  color: string;
}

export const contactOptions: ContactOption[] = [
  { value: 'Volkan', label: 'Volkan', bg: '#e0f2fe', color: '#0369a1' },
  { value: 'Troy',   label: 'Troy',   bg: '#fef9c3', color: '#b45309' },
];
