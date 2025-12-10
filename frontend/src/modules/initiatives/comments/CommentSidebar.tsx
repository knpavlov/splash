import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon } from '../../../components/icons/CheckIcon';
import { CloseIcon } from '../../../components/icons/CloseIcon';
import { SendIcon } from '../../../components/icons/SendIcon';
import { TrashIcon } from '../../../components/icons/TrashIcon';
import styles from '../../../styles/InitiativeComments.module.css';
import { InitiativeCommentThread } from '../../../shared/types/initiative';
import { CommentSelectionDraft } from './types';

interface CommentSidebarProps {
  threads: InitiativeCommentThread[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  pendingSelection: CommentSelectionDraft | null;
  onCancelPending: () => void;
  onReply: (threadId: string, body: string) => Promise<void>;
  onClose: () => void;
  onSelectThread?: (threadId: string | null) => void;
  activeThreadId?: string | null;
  onToggleResolved: (threadId: string, nextState: boolean) => Promise<void>;
  onDeleteComment?: (threadId: string, messageId: string | null) => Promise<void>;
  currentActorId?: string | null;
  anchorMap: Map<string, { topRatio: number }>;
  onScrollToElement?: (threadId: string) => void;
}

const formatDate = (value: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));

const defaultCardHeight = 180;

export const CommentSidebar = forwardRef<HTMLDivElement, CommentSidebarProps>(
  (
    {
      threads,
      isLoading,
      isSaving,
      error,
      pendingSelection,
      onCancelPending,
      onReply,
      onClose,
      onSelectThread,
      activeThreadId,
      onToggleResolved,
      onDeleteComment,
      currentActorId,
      anchorMap,
      onScrollToElement
    },
    ref
  ) => {
    const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
    const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
    const listRef = useRef<HTMLDivElement>(null);
    const [listHeight, setListHeight] = useState(0);

    useEffect(() => {
      const node = listRef.current;
      if (!node) {
        return;
      }
      const updateHeight = () => setListHeight(node.clientHeight || node.getBoundingClientRect().height);
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
            <p>Select text or drag an area to start a new comment.</p>
          </div>
        );
      }
      return (
        <div className={styles.pendingCard}>
          <div className={styles.pendingHeader}>
            <p className={styles.pendingLabel}>New comment</p>
            <button
              className={styles.iconButton}
              type="button"
              aria-label="Cancel draft"
              title="Cancel draft"
              onClick={() => {
                onCancelPending();
              }}
            >
              <CloseIcon width={16} height={16} />
            </button>
          </div>
          <p className={styles.pendingHint}>Type in the popover near your selection.</p>
        </div>
      );
    };

    const layoutEntries = useMemo(() => {
      const height = Math.max(listHeight, 1);
      const gap = 14;
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
        <div className={styles.sidebarInner}>
          <header className={styles.sidebarHeader}>
            <div>
              <p className={styles.sidebarTitle}>Comments</p>
              <p className={styles.sidebarSubtitle}>{orderedThreads.length} thread{orderedThreads.length !== 1 ? 's' : ''}</p>
            </div>
            <button
              className={styles.iconButton}
              type="button"
              aria-label="Close comments"
              title="Close comments"
              onClick={onClose}
            >
              <CloseIcon width={16} height={16} />
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
            const canDeleteThread = currentActorId && thread.createdByAccountId === currentActorId;
            const threadClass = `${styles.threadCard} ${thread.id === activeThreadId ? styles.threadActive : ''} ${
              isResolved ? styles.threadResolved : ''
            }`;
            return (
              <section
                key={thread.id}
                className={threadClass}
                style={{ marginTop }}
                ref={registerCardRef(thread.id)}
                onMouseEnter={() => onSelectThread?.(thread.id)}
                onMouseLeave={() => onSelectThread?.(null)}
                onFocus={() => onSelectThread?.(thread.id)}
                onBlur={() => onSelectThread?.(null)}
              >
                <div className={styles.threadHeader}>
                  <button
                    type="button"
                    className={styles.threadBadgeButton}
                    onClick={() => onScrollToElement?.(thread.id)}
                    title="Scroll to element"
                  >
                    {index}
                  </button>
                  <div className={styles.threadHeaderInfo}>
                    <p className={styles.threadMeta}>
                      {thread.createdByName ?? 'Unknown user'} • {formatDate(thread.createdAt)}
                    </p>
                  </div>
                  <span className={isResolved ? styles.statusResolved : styles.statusOpen}>
                    {isResolved ? 'Resolved' : 'Open'}
                  </span>
                </div>
                <div className={styles.messageList}>
                  {thread.comments.map((message, msgIndex) => {
                    const canDeleteMessage = currentActorId && message.authorAccountId === currentActorId;
                    const isFirstMessage = msgIndex === 0;
                    return (
                      <article key={message.id} className={styles.message}>
                        <div className={styles.messageHeader}>
                          {!isResolved && (
                            <p className={styles.messageMeta}>
                              {message.authorName ?? 'Unnamed'} • {formatDate(message.createdAt)}
                            </p>
                          )}
                          {canDeleteMessage && onDeleteComment && (
                            <button
                              type="button"
                              className={styles.deleteButton}
                              onClick={() => onDeleteComment(thread.id, isFirstMessage ? null : message.id)}
                              disabled={isSaving}
                              title={isFirstMessage ? 'Delete thread' : 'Delete message'}
                              aria-label={isFirstMessage ? 'Delete thread' : 'Delete message'}
                            >
                              <TrashIcon width={14} height={14} />
                            </button>
                          )}
                        </div>
                        <p className={styles.messageBody}>{message.body}</p>
                      </article>
                    );
                  })}
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
                      disabled={!(replyDrafts[thread.id] ?? '').trim() || isSaving}
                      onClick={() => handleReply(thread.id)}
                      aria-label="Send reply"
                      title="Send reply"
                    >
                      <SendIcon width={16} height={16} />
                    </button>
                    <button
                      className={styles.iconButton}
                      type="button"
                      disabled={isSaving}
                      onClick={() => onToggleResolved(thread.id, !isResolved)}
                      aria-label={isResolved ? 'Mark as open' : 'Mark as addressed'}
                      title={isResolved ? 'Mark as open' : 'Mark as addressed'}
                    >
                      <CheckIcon width={16} height={16} />
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
          </div>
        </div>
      </aside>
    );
  }
);

CommentSidebar.displayName = 'CommentSidebar';
