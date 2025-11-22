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
  anchorMap: Map<string, { topRatio: number; top: number }>;
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
      // We want to position cards at their anchor's top position.
      // If multiple cards are close, we stack them to prevent overlap.
      const gap = 12;
      let cursor = 0;

      return orderedThreads.map(({ thread, index }) => {
        const anchor = anchorMap.get(thread.id);
        const cardHeight = cardHeights[thread.id] ?? defaultCardHeight;

        // Preferred top is the anchor's top position (relative to container)
        // If no anchor, we might want to put it at the top or bottom, or just after previous
        // For now, if no anchor, use cursor.
        const preferredTop = anchor ? anchor.top : cursor;

        // Ensure we don't overlap with previous card
        const top = Math.max(cursor, preferredTop);

        cursor = top + cardHeight + gap;

        return { thread, index, top };
      });
    }, [anchorMap, orderedThreads, cardHeights]);

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
          {layoutEntries.map(({ thread, index, top }) => {
            const isResolved = Boolean(thread.resolvedAt);
            return (
              <section
                key={thread.id}
                className={`${styles.threadCard} ${thread.id === activeThreadId ? styles.threadActive : ''}`}
                style={{ position: 'absolute', top, left: 0, right: 0 }}
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
                      className={styles.iconButton}
                      type="button"
                      title="Reply"
                      disabled={!(replyDrafts[thread.id] ?? '').trim() || isSaving}
                      onClick={() => handleReply(thread.id)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                      </svg>
                    </button>
                    <button
                      className={styles.iconButton}
                      type="button"
                      title={isResolved ? 'Mark as open' : 'Mark as addressed'}
                      disabled={isSaving}
                      onClick={() => onToggleResolved(thread.id, !isResolved)}
                    >
                      {isResolved ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="15" y1="9" x2="9" y2="15"></line>
                          <line x1="9" y1="9" x2="15" y2="15"></line>
                        </svg>
                      )}
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
