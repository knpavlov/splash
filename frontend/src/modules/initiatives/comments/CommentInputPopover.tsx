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
    const hostRect = containerRef.current.getBoundingClientRect();
    const width = 320;
    const margin = 10;
    const x = anchorPoint?.x ?? hostRect.width / 2;
    const y = anchorPoint?.y ?? hostRect.height / 2;
    const top = Math.min(Math.max(y + margin, margin), Math.max(hostRect.height - 20, margin));
    const left = Math.min(Math.max(x - width / 2, margin), Math.max(hostRect.width - width - margin, margin));
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
    inputRef.current?.focus();
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
        <div>
          <p className={styles.popoverTitle}>New comment</p>
          <p className={styles.popoverTarget}>{draft.targetLabel ?? draft.targetPath}</p>
        </div>
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
