import React, { useEffect, useState } from 'react';
import { SaveStatus as SaveStatusType } from '../../hooks/useAutoSave';

interface SaveStatusProps {
  status: SaveStatusType;
  lastSaved: Date | null;
  error: string | null;
  hasUnsavedChanges: boolean;
  isOnline: boolean;
  onRetry?: () => void;
  className?: string;
}

// ─── SVG Icon Components ────────────────────────────────────────────────────

const CheckCircleIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const SpinnerIcon = ({ className = '' }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} width="14" height="14" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const AlertCircleIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const CloudOffIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 2l20 20" />
    <path d="M17.5 21H9a7 7 0 0 1-1.1-13.9" />
    <path d="M20.7 17.7A4.5 4.5 0 0 0 18 9h-1.3a7 7 0 0 0-4.2-5" />
  </svg>
);

const DotIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
    <circle cx="4" cy="4" r="4" />
  </svg>
);

// ─── Time formatting utility ────────────────────────────────────────────────

function formatLastSaved(date: Date | null): string | null {
  if (!date) return null;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(diff / 60000);

  if (seconds <= 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Full SaveStatus (toolbar/header placement) ─────────────────────────────

export const SaveStatus: React.FC<SaveStatusProps> = React.memo(({
  status,
  lastSaved,
  error,
  hasUnsavedChanges,
  isOnline,
  onRetry,
  className = '',
}) => {
  // Auto-refresh the "saved X ago" text
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status === 'saved' && lastSaved) {
      const interval = setInterval(() => setTick(t => t + 1), 10000);
      return () => clearInterval(interval);
    }
  }, [status, lastSaved]);

  const renderContent = () => {
    switch (status) {
      case 'saving':
        return (
          <div className="save-status-indicator save-status-saving">
            <SpinnerIcon className="text-blue-500" />
            <span className="text-slate-500 text-xs font-medium">Saving...</span>
          </div>
        );
      case 'saved':
        return (
          <div className="save-status-indicator save-status-saved">
            <CheckCircleIcon className="text-emerald-500 save-status-check" />
            <span className="text-slate-400 text-xs">
              {lastSaved ? `Saved ${formatLastSaved(lastSaved)}` : 'All changes saved'}
            </span>
          </div>
        );
      case 'unsaved':
        return (
          <div className="save-status-indicator save-status-unsaved">
            <DotIcon className="text-amber-400 save-status-pulse" />
            <span className="text-slate-400 text-xs">Editing...</span>
          </div>
        );
      case 'error':
        return (
          <div className="save-status-indicator save-status-error">
            <AlertCircleIcon className="text-red-500" />
            <span className="text-red-600 text-xs font-medium">
              Save failed
            </span>
            {onRetry && (
              <button
                onClick={onRetry}
                className="text-xs text-red-600 hover:text-red-800 font-medium underline underline-offset-2 ml-1 transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        );
      case 'offline':
        return (
          <div className="save-status-indicator save-status-offline">
            <CloudOffIcon className="text-slate-400" />
            <span className="text-slate-400 text-xs">Offline</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`flex items-center ${className}`} role="status" aria-live="polite" aria-atomic="true">
      {renderContent()}
    </div>
  );
});

// ─── Compact SaveStatus (sidebar inline) ────────────────────────────────────

export const SaveStatusCompact: React.FC<SaveStatusProps> = React.memo(({
  status,
  lastSaved,
  error,
  hasUnsavedChanges,
  isOnline,
  onRetry,
  className = '',
}) => {
  const getTooltip = () => {
    switch (status) {
      case 'saved':
        return lastSaved ? `Saved ${formatLastSaved(lastSaved)}` : 'All changes saved';
      case 'saving':
        return 'Saving changes...';
      case 'unsaved':
        return 'Unsaved changes';
      case 'error':
        return error || 'Save failed';
      case 'offline':
        return 'Offline - changes saved locally';
      default:
        return '';
    }
  };

  const renderIcon = () => {
    switch (status) {
      case 'saving':
        return <SpinnerIcon className="text-blue-500" />;
      case 'saved':
        return <CheckCircleIcon className="text-emerald-500 save-status-check" />;
      case 'unsaved':
        return <DotIcon className="text-amber-400 save-status-pulse" />;
      case 'error':
        return <AlertCircleIcon className="text-red-500" />;
      case 'offline':
        return <CloudOffIcon className="text-slate-400" />;
      default:
        return null;
    }
  };

  return (
    <div
      className={`inline-flex items-center gap-1 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={getTooltip()}
      title={getTooltip()}
    >
      {renderIcon()}
      {status === 'error' && onRetry && (
        <button
          onClick={(e) => { e.stopPropagation(); onRetry(); }}
          className="text-[10px] text-red-600 hover:text-red-800 underline underline-offset-2 transition-colors"
          title="Retry save"
        >
          Retry
        </button>
      )}
    </div>
  );
});

// ─── Hook for before unload warning ─────────────────────────────────────────

export const useBeforeUnloadWarning = (hasUnsavedChanges: boolean) => {
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);
};
