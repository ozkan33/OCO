'use client';

import { useEffect, useRef, useState } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
}

/**
 * Accessible, styled confirmation dialog for the brand portal.
 * Replaces native `confirm()` usage with a slate-palette modal that matches
 * the portal's visual register (rounded-2xl card, subtle shadow, red CTA).
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const titleId = 'confirm-dialog-title';
  const descId = 'confirm-dialog-desc';

  // Tracks the in-flight promise returned by onConfirm so the confirm button
  // disables itself for the full request, blocking duplicate writes from
  // double-taps.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Reset busy state whenever the dialog reopens.
  useEffect(() => {
    if (!open) {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [open]);

  // Autofocus the confirm button + handle Escape to cancel
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => confirmBtnRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submittingRef.current) {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    // Prevent background scroll while the dialog is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onCancel]);

  if (!open) return null;

  const confirmClasses = destructive
    ? 'bg-red-600 [@media(hover:hover)]:hover:bg-red-700 active:bg-red-700 focus-visible:ring-red-500'
    : 'bg-blue-600 [@media(hover:hover)]:hover:bg-blue-700 active:bg-blue-700 focus-visible:ring-blue-500';

  const iconWrapClasses = destructive
    ? 'bg-red-50 text-red-600'
    : 'bg-blue-50 text-blue-600';

  const handleConfirmClick = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await Promise.resolve(onConfirm());
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm modal-backdrop sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm border-t sm:border border-slate-200 sheet-slide-up sm:modal-content overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <span className="block w-10 h-1 rounded-full bg-slate-300" aria-hidden="true" />
        </div>
        <div className="px-5 sm:px-6 pt-4 sm:pt-6 pb-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconWrapClasses}`}
              aria-hidden="true"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-base font-semibold text-slate-900">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-sm text-slate-600 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col-reverse sm:flex-row justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="min-h-[44px] sm:min-h-0 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg [@media(hover:hover)]:hover:bg-slate-100 active:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={handleConfirmClick}
            disabled={submitting}
            aria-busy={submitting}
            className={`min-h-[44px] sm:min-h-0 px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:opacity-70 disabled:cursor-not-allowed ${confirmClasses}`}
          >
            {submitting ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
