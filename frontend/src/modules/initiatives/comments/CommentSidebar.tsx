import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import styles from '../../../styles/InitiativeComments.module.css';
import { InitiativeCommentThread } from '../../../shared/types/initiative';
import { CommentSelectionDraft } from './types';

interface CommentSidebarProps {
  threads: InitiativeCommentThread[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  pendingSelection: CommentSelectionDraft | null;
  onSubmitPending: (body: string) => Promise<void>;
  onCancelPending: () => void;
  onReply: (threadId: string, body: string) => Promise<void>;
  onClose: () => void;
  onSelectThread?: (threadId: string | null) => void;
  activeThreadId?: string | null;
  onToggleResolved: (threadId: string, nextState: boolean) => Promise<void>;
  anchorMap: Map<string, { topRatio: number }>;
}

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

const defaultCardHeight = 220;

export const CommentSidebar = forwardRef<HTMLDivElement, CommentSidebarProps>(
  (
    {
      threads,
      isLoading,
      isSaving,
      error,
      pendingSelection,
      onSubmitPending,
      onCancelPending,
      onReply,
      onClose,
      onSelectThread,
      activeThreadId,
      onToggleResolved,
      anchorMap
    },
    ref
  ) => {
    const [draft, setDraft] = useState('');
    const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
    const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
    const listRef = useRef<HTMLDivElement>(null);
    const [listHeight, setListHeight] = useState(0);

    useEffect(() => {
      const node = listRef.current;
      if (!node) {
        return;
      }
      const updateHeight = () => setListHeight(node.clientHeight);
      updateHeight();
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(updateHeight);
        observer.observe(node);
        return () => observer.disconnect();
      }
      window.addEventListener('resize', updateHeight);
      return () => window.removeEventListener('resize', updateHeight);
    }, []);

    const registerCardRef = (threadId: string) => (node: HTMLDivElement | null) => {
      if (!node) {
        return;
      }
      const height = node.getBoundingClientRect().height;
      setCardHeights((prev) => {
        if (prev[threadId] === height) {
          return prev;
        }
        return { ...prev, [threadId]: height };
      });
    };

    const orderedThreads = useMemo(() => threads.map((thread, index) => ({ thread, index: index + 1 })), [threads]);

    const handleSubmitPending = async () => {
      if (!pendingSelection || !draft.trim()) {
        return;
      }
      const text = draft.trim();
      await onSubmitPending(text);
      setDraft('');
    };

    const handleReply = async (threadId: string) => {
      const body = (replyDrafts[threadId] ?? '').trim();
      if (!body) {
        return;
      }
      await onReply(threadId, body);
      setReplyDrafts((prev) => ({ ...prev, [threadId]: '' }));
    };

    const renderPendingBlock = () => {
      if (!pendingSelection) {
        return (
          <div className={styles.pendingEmpty}>
            <p>Click any interface element to start a new comment.</p>
          </div>
        );
      }
      return (
        <div className={styles.pendingCard}>
          <div className={styles.pendingHeader}>
            <div>
              <p className={styles.pendingLabel}>New comment</p>
              <p className={styles.pendingTarget}>{pendingSelection.targetLabel ?? pendingSelection.targetPath}</p>
            </div>
            <button
              className={styles.pendingCancel}
              type="button"
              onClick={() => {
                setDraft('');
                onCancelPending();
              }}
            >
              Cancel
            </button>
          </div>
          <textarea
            className={styles.textarea}
            rows={3}
            placeholder="Describe your feedback..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            className={styles.primaryButton}
            type="button"
            disabled={!draft.trim() || isSaving}
            onClick={handleSubmitPending}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      );
    };

    const layoutEntries = useMemo(() => {
      const height = Math.max(listHeight, 1);
      const gap = 18;
      let cursor = 0;
      return orderedThreads.map(({ thread, index }) => {
        const anchor = anchorMap.get(thread.id);
        const ratio = anchor?.topRatio ?? index / Math.max(1, orderedThreads.length);
        const cardHeight = cardHeights[thread.id] ?? defaultCardHeight;
        const maxStart = Math.max(0, height - cardHeight);
        const preferredTop = Math.min(maxStart, Math.max(0, ratio * height));
        const top = Math.max(cursor, preferredTop);
        const marginTop = Math.max(0, top - cursor);
        cursor = top + cardHeight + gap;
        return { thread, index, marginTop };
      });
    }, [anchorMap, orderedThreads, cardHeights, listHeight]);

    return (
      <aside className={styles.sidebar} ref={ref} data-comment-panel>
        <header className={styles.sidebarHeader}>
          <div>
            <p className={styles.sidebarTitle}>Comments</p>
            <p className={styles.sidebarSubtitle}>Annotation mode is enabled</p>
          </div>
          <button className={styles.sidebarClose} type="button" onClick={onClose}>
            Close
          </button>
        </header>

        {error && <p className={styles.errorMessage}>{error}</p>}

        {renderPendingBlock()}

        <div className={styles.threadList} ref={listRef}>
          {isLoading && <p className={styles.helperText}>Loading comments…</p>}
          {!isLoading && orderedThreads.length === 0 && (
            <div className={styles.emptyState}>
              <p>No comments yet.</p>
              <p>Add the first annotation to guide the initiative owner.</p>
            </div>
          )}
          {layoutEntries.map(({ thread, index, marginTop }) => {
            const isResolved = Boolean(thread.resolvedAt);
            return (
              <section
                key={thread.id}
                className={`${styles.threadCard} ${thread.id === activeThreadId ? styles.threadActive : ''}`}
                style={{ marginTop }}
                ref={registerCardRef(thread.id)}
                onMouseEnter={() => onSelectThread?.(thread.id)}
                onMouseLeave={() => onSelectThread?.(null)}
                onFocus={() => onSelectThread?.(thread.id)}
                onBlur={() => onSelectThread?.(null)}
              >
                <div className={styles.threadHeader}>
                  <span className={styles.threadBadge}>{index}</span>
                  <div>
                    <p className={styles.threadTarget}>{thread.targetLabel ?? thread.targetPath ?? 'UI element'}</p>
                    <p className={styles.threadMeta}>
                      {thread.createdByName ?? 'Unknown user'} · {formatDateTime(thread.createdAt)}
                    </p>
                  </div>
                  <span className={isResolved ? styles.statusResolved : styles.statusOpen}>
                    {isResolved ? 'Addressed' : 'Open'}
                  </span>
                </div>
                <div className={styles.messageList}>
                  {thread.comments.map((message) => (
                    <article key={message.id} className={styles.message}>
                      <p className={styles.messageMeta}>
                        {message.authorName ?? 'Unnamed'} · {formatDateTime(message.createdAt)}
                      </p>
                      <p className={styles.messageBody}>{message.body}</p>
                    </article>
                  ))}
                </div>
                <div className={styles.replyBox}>
                  <textarea
                    className={styles.textarea}
                    rows={2}
                    placeholder="Reply..."
                    value={replyDrafts[thread.id] ?? ''}
                    onChange={(event) => setReplyDrafts((prev) => ({ ...prev, [thread.id]: event.target.value }))}
                  />
                  <div className={styles.replyActions}>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={!(replyDrafts[thread.id] ?? '').trim() || isSaving}
                      onClick={() => handleReply(thread.id)}
                    >
                      {isSaving ? 'Sending…' : 'Reply'}
                    </button>
                    <button
                      className={styles.tertiaryButton}
                      type="button"
                      disabled={isSaving}
                      onClick={() => onToggleResolved(thread.id, !isResolved)}
                    >
                      {isResolved ? 'Mark as open' : 'Mark as addressed'}
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </aside>
    );
  }
);

CommentSidebar.displayName = 'CommentSidebar';
