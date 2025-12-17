import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number; // Height of each item in pixels
  containerHeight: number; // Height of the scrollable container
  overscan?: number; // Number of items to render above/below visible area
  renderItem: (item: T, index: number, style: React.CSSProperties) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  className?: string;
  onEndReached?: () => void;
  endReachedThreshold?: number; // Pixels from end to trigger onEndReached
  emptyComponent?: React.ReactNode;
  loadingComponent?: React.ReactNode;
  isLoading?: boolean;
}

/**
 * Virtual scrolling list component for efficiently rendering large lists
 * Only renders items that are visible in the viewport plus a small overscan buffer
 */
function VirtualListInner<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 5,
  renderItem,
  keyExtractor,
  className = '',
  onEndReached,
  endReachedThreshold = 200,
  emptyComponent,
  loadingComponent,
  isLoading
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const endReachedCalledRef = useRef(false);

  // Calculate visible range
  const { startIndex, visibleItems, offsetY, totalHeight } = useMemo(() => {
    const totalHeight = items.length * itemHeight;
    
    // Calculate visible range with overscan
    const visibleStart = Math.floor(scrollTop / itemHeight);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    
    const startIndex = Math.max(0, visibleStart - overscan);
    const endIndex = Math.min(items.length - 1, visibleStart + visibleCount + overscan);
    
    // Get visible items
    const visibleItems = items.slice(startIndex, endIndex + 1);
    
    // Calculate offset for positioning
    const offsetY = startIndex * itemHeight;

    return { startIndex, visibleItems, offsetY, totalHeight };
  }, [items, itemHeight, containerHeight, scrollTop, overscan]);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);

    // Check if end reached
    if (onEndReached && !endReachedCalledRef.current) {
      const distanceFromEnd = target.scrollHeight - target.scrollTop - target.clientHeight;
      if (distanceFromEnd < endReachedThreshold) {
        endReachedCalledRef.current = true;
        onEndReached();
      }
    }
  }, [onEndReached, endReachedThreshold]);

  // Reset end reached flag when items change
  useEffect(() => {
    endReachedCalledRef.current = false;
  }, [items.length]);

  // Empty state
  if (items.length === 0 && !isLoading) {
    return emptyComponent ? (
      <div className={className}>{emptyComponent}</div>
    ) : null;
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      {/* Total height spacer */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Visible items container */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${offsetY}px)`
          }}
        >
          {visibleItems.map((item, idx) => {
            const actualIndex = startIndex + idx;
            const style: React.CSSProperties = {
              height: itemHeight,
              boxSizing: 'border-box'
            };
            return (
              <div key={keyExtractor(item, actualIndex)}>
                {renderItem(item, actualIndex, style)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Loading indicator */}
      {isLoading && loadingComponent && (
        <div className="flex justify-center py-4">
          {loadingComponent}
        </div>
      )}
    </div>
  );
}

// Memoized version
export const VirtualList = memo(VirtualListInner) as typeof VirtualListInner;

/**
 * Hook for virtual scrolling with dynamic item heights
 */
export function useVirtualList<T>(
  items: T[],
  estimatedItemHeight: number,
  containerRef: React.RefObject<HTMLDivElement>
) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const itemHeightsRef = useRef<Map<number, number>>(new Map());

  // Update container height on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      setContainerHeight(container.clientHeight);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [containerRef]);

  // Calculate visible range with variable heights
  const { startIndex, endIndex, offsetY, totalHeight } = useMemo(() => {
    let totalHeight = 0;
    let startIndex = 0;
    let endIndex = items.length - 1;
    let offsetY = 0;
    let currentOffset = 0;
    let foundStart = false;

    for (let i = 0; i < items.length; i++) {
      const height = itemHeightsRef.current.get(i) || estimatedItemHeight;
      
      if (!foundStart && currentOffset + height > scrollTop) {
        startIndex = Math.max(0, i - 2); // Small overscan
        offsetY = currentOffset - (i > 0 ? (itemHeightsRef.current.get(startIndex) || estimatedItemHeight) * (i - startIndex) : 0);
        foundStart = true;
      }

      if (foundStart && currentOffset > scrollTop + containerHeight) {
        endIndex = Math.min(items.length - 1, i + 2); // Small overscan
        break;
      }

      currentOffset += height;
      totalHeight += height;
    }

    return { startIndex, endIndex, offsetY, totalHeight };
  }, [items, scrollTop, containerHeight, estimatedItemHeight]);

  // Measure item heights
  const measureItem = useCallback((index: number, element: HTMLElement | null) => {
    if (element) {
      itemHeightsRef.current.set(index, element.offsetHeight);
    }
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return {
    startIndex,
    endIndex,
    offsetY,
    totalHeight,
    containerHeight,
    measureItem,
    handleScroll
  };
}

export default VirtualList;
