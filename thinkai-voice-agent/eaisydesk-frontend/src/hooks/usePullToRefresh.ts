/**
 * usePullToRefresh – touch-based pull-to-refresh for mobile lists.
 * Returns a ref to attach to the scrollable container and a React element
 * to render as the pull indicator above the list.
 */
import { useRef, useState, useCallback, useEffect } from 'react';

interface PullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number; // px to pull before triggering (default: 60)
  enabled?: boolean;
}

export function usePullToRefresh({ onRefresh, threshold = 60, enabled = true }: PullToRefreshOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || isRefreshing) return;
    const container = containerRef.current;
    if (!container) return;
    // Only start pull if at the very top
    if (container.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, [enabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling.current || !enabled || isRefreshing) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) {
      // Dampen the pull (rubber band effect)
      const dampened = Math.min(dy * 0.4, threshold * 1.5);
      setPullDistance(dampened);
      // Prevent default scroll when pulling
      if (dy > 10) e.preventDefault();
    } else {
      setPullDistance(0);
      isPulling.current = false;
    }
  }, [enabled, isRefreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current || !enabled) return;
    isPulling.current = false;

    if (pullDistance >= threshold * 0.6) {
      setIsRefreshing(true);
      setPullDistance(threshold * 0.5); // Hold at indicator position
      try {
        await onRefresh();
      } catch {
        // Ignore
      }
      setIsRefreshing(false);
    }
    setPullDistance(0);
  }, [enabled, pullDistance, threshold, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, enabled]);

  return {
    containerRef,
    pullDistance,
    isRefreshing,
  };
}
