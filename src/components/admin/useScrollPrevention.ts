import { useEffect } from 'react';

/**
 * Prevents grid scroll jumps when dropdown pickers are open.
 * Uses two simple strategies:
 * 1. Save scroll position continuously when idle
 * 2. Lock scroll via pointer-events + restore on dropdown close
 */
export function useScrollPrevention(
  gridContainerRef: React.RefObject<HTMLDivElement | null>,
  scrollPositionRef: React.MutableRefObject<{ left: number; top: number } | null>,
  preventScrollRef: React.MutableRefObject<boolean>,
  dropdownOpenRef: React.MutableRefObject<boolean>,
  isDropdownOpen: boolean,
  _dataKey?: unknown,
) {
  // Save scroll position continuously when no dropdown is open
  useEffect(() => {
    const gridElement = gridContainerRef.current;
    if (!gridElement) return;

    const saveScrollPosition = () => {
      if (!dropdownOpenRef.current) {
        scrollPositionRef.current = {
          left: gridElement.scrollLeft,
          top: gridElement.scrollTop,
        };
      }
    };

    gridElement.addEventListener('scroll', saveScrollPosition, { passive: true });
    return () => gridElement.removeEventListener('scroll', saveScrollPosition);
  }, [gridContainerRef, scrollPositionRef, dropdownOpenRef]);

  // Lock/unlock grid when dropdown opens/closes
  useEffect(() => {
    dropdownOpenRef.current = isDropdownOpen;
    preventScrollRef.current = isDropdownOpen;

    const gridElement = gridContainerRef.current;
    if (!gridElement) return;

    if (isDropdownOpen) {
      // Save current position and freeze grid
      scrollPositionRef.current = {
        left: gridElement.scrollLeft,
        top: gridElement.scrollTop,
      };
      gridElement.style.overflow = 'hidden';
    } else {
      // Unfreeze and restore scroll position
      gridElement.style.overflow = '';
      if (scrollPositionRef.current) {
        requestAnimationFrame(() => {
          if (gridElement && scrollPositionRef.current) {
            gridElement.scrollLeft = scrollPositionRef.current.left;
            gridElement.scrollTop = scrollPositionRef.current.top;
          }
        });
      }
    }
  }, [isDropdownOpen, gridContainerRef, scrollPositionRef, dropdownOpenRef, preventScrollRef]);
}
