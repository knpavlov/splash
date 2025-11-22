import { useEffect, useMemo, useState } from 'react';
import styles from '../../../styles/InitiativeComments.module.css';
import { InitiativeCommentThread } from '../../../shared/types/initiative';

interface CommentHighlightsProps {
  containerRef: React.RefObject<HTMLElement>;
  threads: InitiativeCommentThread[];
  isVisible: boolean;
  activeThreadId?: string | null;
  onSelect?: (threadId: string) => void;
  anchors: Map<string, { top: number; left: number; width: number; height: number }>;
}

export const CommentHighlights = ({
  containerRef,
  threads,
  isVisible,
  activeThreadId,
  onSelect,
  anchors
}: CommentHighlightsProps) => {
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: element.scrollHeight || rect.height });
    };
    updateSize();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateSize);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [containerRef]);

  const boxes = useMemo(() => {
    const fallbackWidth = containerSize.width || 1;
    const fallbackHeight = containerSize.height || 1;
    return threads
      .map((thread, index) => {
        const anchor = anchors.get(thread.id);
        if (anchor) {
          return { id: thread.id, index: index + 1, ...anchor };
        }
        if (!thread.selection) {
          return null;
        }
        const baseWidth = thread.selection.pageWidth || fallbackWidth;
        const baseHeight = thread.selection.pageHeight || fallbackHeight;
        const scaleX = fallbackWidth / baseWidth;
        const scaleY = fallbackHeight / baseHeight;
        return {
          id: thread.id,
          index: index + 1,
          top: thread.selection.top * scaleY,
          left: thread.selection.left * scaleX,
          width: Math.max(thread.selection.width * scaleX, 24),
          height: Math.max(thread.selection.height * scaleY, 24)
        };
      })
      .filter((entry): entry is { id: string; index: number; top: number; left: number; width: number; height: number } =>
        Boolean(entry)
      );
  }, [anchors, containerSize.height, containerSize.width, threads]);

  if (!isVisible || !boxes.length) {
    return null;
  }

  return (
    <div className={styles.highlightLayer}>
      {boxes.map((box) => (
        <button
          key={box.id}
          type="button"
          data-comment-highlight
          className={`${styles.highlight} ${box.id === activeThreadId ? styles.highlightActive : ''}`}
          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
          onClick={(event) => {
            event.stopPropagation();
            onSelect?.(box.id);
          }}
        >
          <span>{box.index}</span>
        </button>
      ))}
    </div>
  );
};
