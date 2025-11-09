import { useCallback, useEffect, useState } from 'react';
import { InitiativeCommentThread } from '../../../shared/types/initiative';
import {
  InitiativeActorMetadata,
  InitiativeCommentInput,
  InitiativeCommentReplyInput,
  initiativesApi
} from '../services/initiativesApi';

interface UseInitiativeCommentsOptions {
  actor?: InitiativeActorMetadata;
  enabled?: boolean;
}

export const useInitiativeComments = (initiativeId: string | null, options: UseInitiativeCommentsOptions = {}) => {
  const { actor, enabled = true } = options;
  const [threads, setThreads] = useState<InitiativeCommentThread[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !initiativeId) {
      setThreads([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const list = await initiativesApi.listComments(initiativeId);
      setThreads(list);
    } catch (err) {
      console.error('Failed to load initiative comments:', err);
      setError('Не удалось загрузить комментарии.');
    } finally {
      setIsLoading(false);
    }
  }, [enabled, initiativeId]);

  useEffect(() => {
    if (!enabled) {
      setThreads([]);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  const createComment = useCallback(
    async (input: InitiativeCommentInput) => {
      if (!initiativeId) {
        return null;
      }
      setIsSaving(true);
      setError(null);
      try {
        const thread = await initiativesApi.createComment(initiativeId, input, actor);
        setThreads((prev) => [thread, ...prev]);
        return thread;
      } catch (err) {
        console.error('Failed to create initiative comment:', err);
        setError('Не удалось сохранить комментарий.');
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [actor, initiativeId]
  );

  const replyToComment = useCallback(
    async (threadId: string, input: InitiativeCommentReplyInput) => {
      if (!initiativeId) {
        return null;
      }
      setIsSaving(true);
      setError(null);
      try {
        const updated = await initiativesApi.replyToComment(initiativeId, threadId, input, actor);
        setThreads((prev) => {
          const index = prev.findIndex((thread) => thread.id === updated.id);
          if (index === -1) {
            return [updated, ...prev];
          }
          const next = [...prev];
          next[index] = updated;
          return next;
        });
        return updated;
      } catch (err) {
        console.error('Failed to reply to initiative comment:', err);
        setError('Не удалось отправить ответ.');
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [actor, initiativeId]
  );

  return {
    threads,
    isLoading,
    isSaving,
    error,
    refresh,
    createComment,
    replyToComment
  };
};
