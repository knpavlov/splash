import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CloseIcon } from '../../../components/icons/CloseIcon';
import { SendIcon } from '../../../components/icons/SendIcon';
import styles from '../../../styles/InitiativeComments.module.css';
import { CommentSelectionDraft } from './types';

interface CommentInputPopoverProps {
  containerRef: React.RefObject<HTMLElement>;
  draft: CommentSelectionDraft | null;
  isSaving: boolean;
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
}

export const CommentInputPopover = ({
  containerRef,
  draft,
  isSaving,
  onSubmit,
  onCancel
}: CommentInputPopoverProps) => {
  const [value, setValue] = useState('');
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const anchorPoint = useMemo(() => {
    if (!draft) {
      return null;
    }
    const { selection, cursor } = draft;
    return {
      x: cursor?.x ?? selection.left + selection.width / 2,
      y: cursor?.y ?? selection.top + selection.height
    };
  }, [draft]);

  const updatePosition = useCallback(() => {
    if (!draft || !containerRef.current) {
      return;
    }
    const container = containerRef.current;
    const hostRect = container.getBoundingClientRect();
    const popoverWidth = 320;
    const popoverHeight = 180;
    const margin = 10;
    const scrollTop = container.scrollTop;
    const scrollLeft = container.scrollLeft;

    // Calculate anchor position relative to container
    const anchorX = anchorPoint?.x ?? draft.selection.left + draft.selection.width / 2;
    const anchorY = anchorPoint?.y ?? draft.selection.top + draft.selection.height;

    // Calculate position that keeps popover in viewport
    const viewportTop = scrollTop;
    const viewportBottom = scrollTop + hostRect.height;
    const viewportLeft = scrollLeft;
    const viewportRight = scrollLeft + hostRect.width;

    // Try to position below the selection first
    let top = anchorY + margin;
    // If it would go below viewport, position above
    if (top + popoverHeight > viewportBottom - margin) {
      top = Math.max(anchorY - popoverHeight - margin, viewportTop + margin);
    }

    // Center horizontally on anchor, but keep within bounds
    let left = anchorX - popoverWidth / 2;
    left = Math.max(viewportLeft + margin, Math.min(left, viewportRight - popoverWidth - margin));

    setPosition({ top, left });
  }, [anchorPoint, containerRef, draft]);

  const handleSubmit = useCallback(async () => {
    if (!value.trim() || !draft) {
      return;
    }
    await onSubmit(value.trim());
    setValue('');
  }, [draft, onSubmit, value]);

  useEffect(() => {
    if (!draft) {
      setValue('');
      return;
    }
    updatePosition();
    // Use preventScroll to avoid unwanted page scrolling when focusing
    inputRef.current?.focus({ preventScroll: true });
  }, [draft, updatePosition]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) {
      return;
    }
    const handleScroll = () => updatePosition();
    const handleResize = () => updatePosition();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updatePosition()) : null;
    if (observer) {
      observer.observe(host);
    } else {
      window.addEventListener('resize', handleResize);
    }
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [containerRef, updatePosition]);

  if (!draft) {
    return null;
  }

  return (
    <div
      className={styles.inputPopover}
      style={{ top: position.top, left: position.left }}
      data-comment-popover
    >
      <header className={styles.popoverHeader}>
        <p className={styles.popoverTitle}>New comment</p>
        <button
          className={styles.iconButton}
          type="button"
          aria-label="Cancel comment"
          title="Cancel comment"
          onClick={onCancel}
        >
          <CloseIcon width={16} height={16} />
        </button>
      </header>
      <textarea
        ref={inputRef}
        className={styles.inputField}
        rows={3}
        placeholder="Leave a quick note..."
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void handleSubmit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <div className={styles.popoverActions}>
        <button
          className={styles.iconButton}
          type="button"
          aria-label="Cancel comment"
          title="Cancel comment"
          onClick={onCancel}
        >
          <CloseIcon width={16} height={16} />
        </button>
        <button
          className={styles.iconButtonPrimary}
          type="button"
          aria-label="Save comment"
          title="Save comment"
          disabled={!value.trim() || isSaving}
          onClick={() => void handleSubmit()}
        >
          <SendIcon width={16} height={16} />
        </button>
      </div>
      {isSaving && <p className={styles.popoverHint}>Saving...</p>}
      {!isSaving && <p className={styles.popoverHint}>Press Ctrl/Cmd + Enter to post</p>}
    </div>
  );
};
