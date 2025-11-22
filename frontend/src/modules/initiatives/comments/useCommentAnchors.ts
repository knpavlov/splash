import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { InitiativeCommentThread } from '../../../shared/types/initiative';

const cssEscape = (value: string) => {
  if (typeof CSS !== 'undefined' && CSS.escape) {
    return CSS.escape(value);
  }
  return value.replace(/([.*+?^${}()|[\]\\])/g, '\\$1');
};

export interface CommentAnchorBox {
  top: number;
  left: number;
  width: number;
  height: number;
  topRatio: number;
}

export const useCommentAnchors = (
  threads: InitiativeCommentThread[],
  containerRef: React.RefObject<HTMLElement>
) => {
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const updateSize = useCallback(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    setContainerSize({ width: rect.width, height: rect.height });
  }, [containerRef]);

  useLayoutEffect(() => {
    updateSize();
  }, [updateSize, threads]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateSize);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [containerRef, updateSize]);

  const anchors = useMemo(() => {
    const container = containerRef.current;
    if (!container || !containerSize.width || !containerSize.height) {
      return new Map<string, CommentAnchorBox>();
    }
    const containerRect = container.getBoundingClientRect();
    const map = new Map<string, CommentAnchorBox>();
    for (const thread of threads) {
      let rect: DOMRect | null = null;
      let anchorRect: DOMRect | null = null;

      if (thread.targetId) {
        const anchor = container.querySelector<HTMLElement>(`[data-comment-anchor="${cssEscape(thread.targetId)}"]`);
        if (anchor) {
          anchorRect = anchor.getBoundingClientRect();
        } else {
          try {
            const fallback = container.querySelector<HTMLElement>(thread.targetId);
            if (fallback) {
              anchorRect = fallback.getBoundingClientRect();
            }
          } catch {
            // targetId is not a valid selector, ignore
          }
        }
      }

      if (anchorRect) {
        if (thread.selection) {
          const baseWidth = thread.selection.pageWidth || anchorRect.width;
          const baseHeight = thread.selection.pageHeight || anchorRect.height;
          // Avoid division by zero
          const scaleX = baseWidth ? anchorRect.width / baseWidth : 1;
          const scaleY = baseHeight ? anchorRect.height / baseHeight : 1;

          const width = Math.max(thread.selection.width * scaleX, 24);
          const height = Math.max(thread.selection.height * scaleY, 24);

          rect = new DOMRect(
            anchorRect.left + thread.selection.left * scaleX,
            anchorRect.top + thread.selection.top * scaleY,
            width,
            height
          );
        } else {
          rect = anchorRect;
        }
      } else if (thread.selection) {
        const baseWidth = thread.selection.pageWidth || containerSize.width;
        const baseHeight = thread.selection.pageHeight || containerSize.height;
        const scaleX = containerSize.width / baseWidth;
        const scaleY = containerSize.height / baseHeight;
        const width = Math.max(thread.selection.width * scaleX, 24);
        const height = Math.max(thread.selection.height * scaleY, 24);
        rect = new DOMRect(
          containerRect.left + thread.selection.left * scaleX,
          containerRect.top + thread.selection.top * scaleY,
          width,
          height
        );
      }

      if (!rect) {
        continue;
      }
      const top = rect.top - containerRect.top;
      const left = rect.left - containerRect.left;
      map.set(thread.id, {
        top,
        left,
        width: rect.width,
        height: rect.height,
        topRatio: containerSize.height ? Math.min(1, Math.max(0, top / containerSize.height)) : 0
      });
    }
    return map;
  }, [containerRef, containerSize.height, containerSize.width, threads]);

  return anchors;
};
