import { useEffect, useMemo, useState } from 'react';
import styles from '../../../styles/InitiativeComments.module.css';
import { InitiativeCommentThread } from '../../../shared/types/initiative';

interface CommentHighlightsProps {
  containerRef: React.RefObject<HTMLElement>;
  threads: InitiativeCommentThread[];
  isVisible: boolean;
  activeThreadId?: string | null;
  onSelect?: (threadId: string) => void;
}

interface HighlightBox {
  id: string;
  index: number;
  top: number;
  left: number;
  width: number;
  height: number;
}

export const CommentHighlights = ({
  containerRef,
  threads,
  isVisible,
  activeThreadId,
  onSelect
}: CommentHighlightsProps) => {
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
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
    if (!size.width || !size.height) {
      return [] as HighlightBox[];
    }
    return threads
      .map((thread, index) => {
        if (!thread.selection) {
          return null;
        }
        const baseWidth = thread.selection.pageWidth || size.width;
        const baseHeight = thread.selection.pageHeight || size.height;
        const scaleX = size.width / baseWidth;
        const scaleY = size.height / baseHeight;
        return {
          id: thread.id,
          index: index + 1,
          top: thread.selection.top * scaleY,
          left: thread.selection.left * scaleX,
          width: Math.max(thread.selection.width * scaleX, 24),
          height: Math.max(thread.selection.height * scaleY, 24)
        };
      })
      .filter((entry): entry is HighlightBox => Boolean(entry));
  }, [threads, size.height, size.width]);

  if (!isVisible || !boxes.length) {
    return null;
  }

  return (
    <div className={styles.highlightLayer}>
      {boxes.map((box) => (
        <button
          key={box.id}
          type="button"
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
