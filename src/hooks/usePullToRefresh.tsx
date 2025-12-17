import React, { useState, useEffect, useCallback, useRef } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number; // Pull distance to trigger refresh (default: 80px)
  resistance?: number; // Resistance factor (default: 2.5)
  maxPull?: number; // Maximum pull distance (default: 150px)
  disabled?: boolean;
}

interface UsePullToRefreshReturn {
  pullDistance: number;
  isRefreshing: boolean;
  isPulling: boolean;
  pullProgress: number; // 0-1 progress to threshold
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Custom hook for pull-to-refresh functionality on mobile devices
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  resistance = 2.5,
  maxPull = 150,
  disabled = false
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    // Only trigger if at top of scroll
    if (container.scrollTop > 0) return;
    
    startYRef.current = e.touches[0].clientY;
    currentYRef.current = e.touches[0].clientY;
  }, [disabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing || startYRef.current === 0) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    // Only trigger if at top of scroll
    if (container.scrollTop > 0) {
      startYRef.current = 0;
      setPullDistance(0);
      setIsPulling(false);
      return;
    }
    
    currentYRef.current = e.touches[0].clientY;
    const deltaY = currentYRef.current - startYRef.current;
    
    if (deltaY > 0) {
      // Prevent default scrolling when pulling
      e.preventDefault();
      
      // Apply resistance
      const distance = Math.min(deltaY / resistance, maxPull);
      setPullDistance(distance);
      setIsPulling(true);
    } else {
      setPullDistance(0);
      setIsPulling(false);
    }
  }, [disabled, isRefreshing, resistance, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (disabled || isRefreshing) return;
    
    startYRef.current = 0;
    
    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      setPullDistance(threshold); // Hold at threshold during refresh
      
      try {
        await onRefresh();
      } catch (error) {
        console.error('[PullToRefresh] Refresh failed:', error);
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
    
    setIsPulling(false);
  }, [disabled, isRefreshing, pullDistance, threshold, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Add touch event listeners
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const pullProgress = Math.min(pullDistance / threshold, 1);

  return {
    pullDistance,
    isRefreshing,
    isPulling,
    pullProgress,
    containerRef
  };
}

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  pullProgress: number;
  threshold?: number;
}

/**
 * Visual indicator component for pull-to-refresh
 */
export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  pullProgress
}: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) {
    return null;
  }

  return (
    <div
      className="absolute left-0 right-0 top-0 flex items-center justify-center overflow-hidden pointer-events-none z-10"
      style={{
        height: pullDistance,
        transition: isRefreshing ? 'none' : 'height 0.2s ease-out'
      }}
    >
      <div 
        className={`
          w-10 h-10 rounded-full bg-white dark:bg-gray-700 shadow-lg
          flex items-center justify-center
          transition-transform duration-200
          ${pullProgress >= 1 || isRefreshing ? 'scale-100' : ''}
        `}
        style={{
          transform: `scale(${Math.max(0.5, pullProgress)})`,
          opacity: pullProgress
        }}
      >
        {isRefreshing ? (
          <svg
            className="w-5 h-5 text-blue-500 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <svg
            className={`w-5 h-5 text-gray-600 dark:text-gray-300 transition-transform duration-200 ${
              pullProgress >= 1 ? 'rotate-180' : ''
            }`}
            style={{
              transform: `rotate(${pullProgress * 180}deg)`
            }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        )}
      </div>
      
      {/* Progress text */}
      {!isRefreshing && pullProgress > 0.3 && (
        <span className="absolute bottom-2 text-xs text-gray-500 dark:text-gray-400">
          {pullProgress >= 1 ? 'Release to refresh' : 'Pull to refresh'}
        </span>
      )}
    </div>
  );
}

export default usePullToRefresh;
