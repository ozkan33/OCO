import React from 'react';
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

export const SaveStatus: React.FC<SaveStatusProps> = React.memo(({
  status,
  lastSaved,
  error,
  hasUnsavedChanges,
  isOnline,
  onRetry,
  className = '',
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'saved':
        return {
          icon: '✅',
          text: 'All changes saved',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
        };
      case 'saving':
        return {
          icon: '🔄',
          text: 'Saving...',
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          animate: true,
        };
      case 'unsaved':
        return {
          icon: '●',
          text: 'Unsaved changes',
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
        };
      case 'error':
        return {
          icon: '⚠️',
          text: 'Save failed',
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
        };
      case 'offline':
        return {
          icon: '📴',
          text: 'Offline - changes saved locally',
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
        };
      default:
        return {
          icon: '●',
          text: 'Unknown status',
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
        };
    }
  };

  const config = getStatusConfig();
  
  const formatLastSaved = (date: Date | null) => {
    if (!date) return null;
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    if (minutes === 0) {
      return seconds <= 5 ? 'just now' : `${seconds}s ago`;
    } else if (minutes < 60) {
      return `${minutes}m ago`;
    } else {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Main status indicator */}
      <div className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium
        ${config.color} ${config.bgColor} ${config.borderColor}
        ${config.animate ? 'animate-pulse' : ''}
      `}>
        <span className={config.animate ? 'animate-spin' : ''}>
          {config.icon}
        </span>
        <span>{config.text}</span>
      </div>

      {/* Last saved timestamp */}
      {lastSaved && status === 'saved' && (
        <span className="text-xs text-gray-500">
          {formatLastSaved(lastSaved)}
        </span>
      )}

      {/* Error message and retry button */}
      {status === 'error' && error && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-600 max-w-xs truncate" title={error}>
            {error}
          </span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs text-red-600 hover:text-red-800 underline"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Offline indicator */}
      {!isOnline && (
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span>🔌</span>
          <span>Offline</span>
        </div>
      )}

      {/* Unsaved changes warning */}
      {hasUnsavedChanges && status !== 'saving' && (
        <div className="flex items-center gap-1 text-xs text-yellow-600">
          <span>⚡</span>
          <span>Changes pending</span>
        </div>
      )}
    </div>
  );
});

// Compact version for minimal UI
export const SaveStatusCompact: React.FC<SaveStatusProps> = React.memo(({
  status,
  lastSaved,
  error,
  hasUnsavedChanges,
  isOnline,
  onRetry,
  className = '',
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'saved':
        return { icon: '✅', color: 'text-green-600' };
      case 'saving':
        return { icon: '🔄', color: 'text-blue-600', animate: true };
      case 'unsaved':
        return { icon: '●', color: 'text-yellow-600' };
      case 'error':
        return { icon: '⚠️', color: 'text-red-600' };
      case 'offline':
        return { icon: '📴', color: 'text-gray-600' };
      default:
        return { icon: '●', color: 'text-gray-600' };
    }
  };

  const config = getStatusConfig();
  
  const getTooltip = () => {
    switch (status) {
      case 'saved':
        return lastSaved ? `Saved ${formatLastSaved(lastSaved)}` : 'All changes saved';
      case 'saving':
        return 'Saving changes...';
      case 'unsaved':
        return 'You have unsaved changes';
      case 'error':
        return error || 'Save failed';
      case 'offline':
        return 'Offline - changes saved locally';
      default:
        return 'Unknown status';
    }
  };

  const formatLastSaved = (date: Date | null) => {
    if (!date) return null;
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    if (minutes === 0) {
      return seconds <= 5 ? 'just now' : `${seconds}s ago`;
    } else if (minutes < 60) {
      return `${minutes}m ago`;
    } else {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span
        className={`
          text-lg cursor-help
          ${config.color}
          ${config.animate ? 'animate-spin' : ''}
        `}
        title={getTooltip()}
      >
        {config.icon}
      </span>
      
      {!isOnline && (
        <span className="text-xs text-gray-500" title="Offline">
          🔌
        </span>
      )}
      
      {status === 'error' && onRetry && (
        <button
          onClick={onRetry}
          className="text-xs text-red-600 hover:text-red-800 underline ml-1"
          title="Retry save"
        >
          Retry
        </button>
      )}
    </div>
  );
});

// Hook for before unload warning
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