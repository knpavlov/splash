import { forwardRef, useMemo, useState } from 'react';
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
}

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

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
      activeThreadId
    },
    ref
  ) => {
    const [draft, setDraft] = useState('');
    const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

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
            <p>Нажмите на любой элемент справа, чтобы оставить комментарий.</p>
          </div>
        );
      }
      return (
        <div className={styles.pendingCard}>
          <div className={styles.pendingHeader}>
            <div>
              <p className={styles.pendingLabel}>Новый комментарий</p>
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
              Отменить
            </button>
          </div>
          <textarea
            className={styles.textarea}
            rows={3}
            placeholder="Добавьте комментарий..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            className={styles.primaryButton}
            type="button"
            disabled={!draft.trim() || isSaving}
            onClick={handleSubmitPending}
          >
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      );
    };

    return (
      <aside className={styles.sidebar} ref={ref} data-comment-panel>
        <header className={styles.sidebarHeader}>
          <div>
            <p className={styles.sidebarTitle}>Комментарии</p>
            <p className={styles.sidebarSubtitle}>Режим аннотаций включен</p>
          </div>
          <button className={styles.sidebarClose} type="button" onClick={onClose}>
            Закрыть
          </button>
        </header>

        {error && <p className={styles.errorMessage}>{error}</p>}

        {renderPendingBlock()}

        <div className={styles.threadList}>
          {isLoading && <p className={styles.helperText}>Загрузка комментариев...</p>}
          {!isLoading && orderedThreads.length === 0 && (
            <div className={styles.emptyState}>
              <p>Здесь пока нет комментариев.</p>
              <p>Добавьте первый, чтобы оставить отметку для автора инициативы.</p>
            </div>
          )}
          {orderedThreads.map(({ thread, index }) => (
            <section
              key={thread.id}
              className={`${styles.threadCard} ${thread.id === activeThreadId ? styles.threadActive : ''}`}
              onMouseEnter={() => onSelectThread?.(thread.id)}
              onMouseLeave={() => onSelectThread?.(null)}
              onFocus={() => onSelectThread?.(thread.id)}
              onBlur={() => onSelectThread?.(null)}
            >
              <div className={styles.threadHeader}>
                <span className={styles.threadBadge}>{index}</span>
                <div>
                  <p className={styles.threadTarget}>{thread.targetLabel ?? thread.targetPath ?? 'Фрагмент интерфейса'}</p>
                  <p className={styles.threadMeta}>
                    {thread.createdByName ?? 'Неизвестный пользователь'} · {formatDateTime(thread.createdAt)}
                  </p>
                </div>
              </div>
              <div className={styles.messageList}>
                {thread.comments.map((message) => (
                  <article key={message.id} className={styles.message}>
                    <p className={styles.messageMeta}>
                      {message.authorName ?? 'Без имени'} · {formatDateTime(message.createdAt)}
                    </p>
                    <p className={styles.messageBody}>{message.body}</p>
                  </article>
                ))}
              </div>
              <div className={styles.replyBox}>
                <textarea
                  className={styles.textarea}
                  rows={2}
                  placeholder="Ответить..."
                  value={replyDrafts[thread.id] ?? ''}
                  onChange={(event) => setReplyDrafts((prev) => ({ ...prev, [thread.id]: event.target.value }))}
                />
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={!(replyDrafts[thread.id] ?? '').trim() || isSaving}
                  onClick={() => handleReply(thread.id)}
                >
                  {isSaving ? 'Отправка...' : 'Ответить'}
                </button>
              </div>
            </section>
          ))}
        </div>
      </aside>
    );
  }
);

CommentSidebar.displayName = 'CommentSidebar';
