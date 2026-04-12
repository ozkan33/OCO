import { useEffect, useRef } from 'react';

/**
 * Custom hook that prevents the grid from scrolling when a dropdown picker is open.
 * Consolidates multiple scroll prevention strategies:
 * - Event listener prevention (scroll, focus, wheel, keydown)
 * - MutationObserver to revert scroll changes
 * - scrollIntoView monkey-patch
 * - requestAnimationFrame scroll lock loop
 * - Scroll position save/restore on data changes
 */
export function useScrollPrevention(
  gridContainerRef: React.RefObject<HTMLDivElement | null>,
  scrollPositionRef: React.MutableRefObject<{ left: number; top: number } | null>,
  preventScrollRef: React.MutableRefObject<boolean>,
  dropdownOpenRef: React.MutableRefObject<boolean>,
  isDropdownOpen: boolean,
  dataKey?: unknown, // triggers scroll restore on data changes (e.g. currentScoreCardData)
) {
  // Comprehensive scroll prevention: event listeners on grid
  useEffect(() => {
    const gridElement = gridContainerRef.current;
    if (!gridElement) return;

    const handleScroll = (e: Event) => {
      if (preventScrollRef.current && scrollPositionRef.current) {
        e.preventDefault();
        e.stopPropagation();
        gridElement.scrollLeft = scrollPositionRef.current.left;
        gridElement.scrollTop = scrollPositionRef.current.top;
        return false;
      }
    };

    const handleFocus = (e: Event) => {
      if (preventScrollRef.current) {
        e.preventDefault();
        e.stopPropagation();
        const active = document.activeElement as HTMLElement;
        if (active?.blur) active.blur();
        return false;
      }
    };

    const handleWheel = (e: Event) => {
      if (preventScrollRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (preventScrollRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    gridElement.addEventListener('scroll', handleScroll, { passive: false });
    gridElement.addEventListener('focusin', handleFocus, { passive: false });
    gridElement.addEventListener('focusout', handleFocus, { passive: false });
    gridElement.addEventListener('wheel', handleWheel, { passive: false });
    gridElement.addEventListener('keydown', handleKeydown, { passive: false });

    const observer = new MutationObserver(() => {
      if (preventScrollRef.current && scrollPositionRef.current) {
        if (gridElement.scrollLeft !== scrollPositionRef.current.left ||
          gridElement.scrollTop !== scrollPositionRef.current.top) {
          gridElement.scrollLeft = scrollPositionRef.current.left;
          gridElement.scrollTop = scrollPositionRef.current.top;
        }
      }
    });

    observer.observe(gridElement, {
      attributes: true,
      attributeFilter: ['style'],
      subtree: true,
    });

    return () => {
      gridElement.removeEventListener('scroll', handleScroll);
      gridElement.removeEventListener('focusin', handleFocus);
      gridElement.removeEventListener('focusout', handleFocus);
      gridElement.removeEventListener('wheel', handleWheel);
      gridElement.removeEventListener('keydown', handleKeydown);
      observer.disconnect();
    };
  }, []);

  // Track dropdown state: disable grid interaction + set preventScroll flag
  useEffect(() => {
    dropdownOpenRef.current = isDropdownOpen;
    preventScrollRef.current = isDropdownOpen;

    const gridElement = gridContainerRef.current;
    if (!gridElement) return;

    if (isDropdownOpen) {
      gridElement.style.pointerEvents = 'none';
      gridElement.style.userSelect = 'none';
    } else {
      gridElement.style.pointerEvents = 'auto';
      gridElement.style.userSelect = 'auto';
      // Restore scroll position when dropdown closes
      if (scrollPositionRef.current) {
        setTimeout(() => {
          gridElement.scrollLeft = scrollPositionRef.current!.left;
          gridElement.scrollTop = scrollPositionRef.current!.top;
        }, 0);
      }
    }
  }, [isDropdownOpen]);

  // When dropdown opens: store scroll position, blur focused elements
  useEffect(() => {
    if (!isDropdownOpen) return;

    const gridElement = gridContainerRef.current;
    if (gridElement) {
      scrollPositionRef.current = {
        left: gridElement.scrollLeft,
        top: gridElement.scrollTop,
      };
    }

    // Blur active element to prevent focus-triggered scroll
    setTimeout(() => {
      const active = document.activeElement as HTMLElement;
      if (active?.blur) active.blur();
    }, 0);
  }, [isDropdownOpen]);

  // Monkey-patch scrollIntoView when dropdown is open
  useEffect(() => {
    if (!isDropdownOpen) return;

    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function () { return; };

    return () => {
      HTMLElement.prototype.scrollIntoView = original;
    };
  }, [isDropdownOpen]);

  // rAF loop: continuously lock scroll while dropdown is open
  useEffect(() => {
    let raf: number;

    function keepScroll() {
      if (dropdownOpenRef.current && gridContainerRef.current && scrollPositionRef.current) {
        gridContainerRef.current.scrollTop = scrollPositionRef.current.top;
        gridContainerRef.current.scrollLeft = scrollPositionRef.current.left;
        raf = requestAnimationFrame(keepScroll);
      }
    }

    if (isDropdownOpen) keepScroll();

    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [isDropdownOpen]);

  // Restore scroll after dropdown opens (next frame)
  useEffect(() => {
    if (isDropdownOpen && gridContainerRef.current && scrollPositionRef.current) {
      requestAnimationFrame(() => {
        const grid = gridContainerRef.current;
        if (grid && scrollPositionRef.current) {
          grid.scrollLeft = scrollPositionRef.current.left;
          grid.scrollTop = scrollPositionRef.current.top;
        }
      });
    }
  }, [isDropdownOpen]);

  // MutationObserver + scroll listener when dropdown is open
  useEffect(() => {
    if (!isDropdownOpen || !gridContainerRef.current || !scrollPositionRef.current) return;

    const gridElement = gridContainerRef.current;
    const origTop = scrollPositionRef.current.top;
    const origLeft = scrollPositionRef.current.left;

    const revert = () => {
      if (gridElement.scrollTop !== origTop || gridElement.scrollLeft !== origLeft) {
        gridElement.scrollTop = origTop;
        gridElement.scrollLeft = origLeft;
      }
    };

    const observer = new MutationObserver(revert);
    observer.observe(gridElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
      subtree: true,
      childList: true,
    });

    gridElement.addEventListener('scroll', revert, { passive: false });
    window.addEventListener('scroll', revert, { passive: false });
    document.addEventListener('scroll', revert, { passive: false });

    return () => {
      observer.disconnect();
      gridElement.removeEventListener('scroll', revert);
      window.removeEventListener('scroll', revert);
      document.removeEventListener('scroll', revert);
    };
  }, [isDropdownOpen]);

  // Save scroll position on scroll (when no dropdown open)
  useEffect(() => {
    const gridElement = gridContainerRef.current;
    if (!gridElement) return;

    const saveScrollPosition = () => {
      if (gridElement && !dropdownOpenRef.current) {
        scrollPositionRef.current = {
          left: gridElement.scrollLeft,
          top: gridElement.scrollTop,
        };
      }
    };

    gridElement.addEventListener('scroll', saveScrollPosition);
    return () => gridElement.removeEventListener('scroll', saveScrollPosition);
  }, [dataKey]);

  // Restore scroll after data changes (when no dropdown open)
  useEffect(() => {
    if (!dropdownOpenRef.current && gridContainerRef.current && scrollPositionRef.current) {
      requestAnimationFrame(() => {
        const grid = gridContainerRef.current;
        if (grid && scrollPositionRef.current) {
          grid.scrollLeft = scrollPositionRef.current.left;
          grid.scrollTop = scrollPositionRef.current.top;
        }
      });
    }
  }, [dataKey]);
}
