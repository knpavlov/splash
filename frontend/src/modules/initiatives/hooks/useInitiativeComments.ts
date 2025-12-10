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
      setError('Unable to load comments.');
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
        setError('Unable to save comment.');
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
        setError('Unable to send reply.');
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [actor, initiativeId]
  );

  const toggleResolved = useCallback(
    async (threadId: string, resolved: boolean) => {
      if (!initiativeId) {
        return null;
      }
      setIsSaving(true);
      setError(null);
      try {
        const updated = await initiativesApi.setCommentResolution(initiativeId, threadId, resolved, actor);
        setThreads((prev) => prev.map((thread) => (thread.id === updated.id ? updated : thread)));
        return updated;
      } catch (err) {
        console.error('Failed to update comment status:', err);
        setError('Unable to update comment status.');
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [actor, initiativeId]
  );

  const deleteComment = useCallback(
    async (threadId: string, messageId: string | null = null) => {
      if (!initiativeId) {
        return null;
      }
      setIsSaving(true);
      setError(null);
      try {
        const result = await initiativesApi.deleteComment(initiativeId, threadId, messageId, actor);
        if (result.deleted === 'thread') {
          setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
        } else if (result.deleted === 'message' && result.messageId) {
          setThreads((prev) =>
            prev.map((thread) => {
              if (thread.id !== threadId) {
                return thread;
              }
              return {
                ...thread,
                comments: thread.comments.filter((msg) => msg.id !== result.messageId)
              };
            })
          );
        }
        return result;
      } catch (err) {
        console.error('Failed to delete comment:', err);
        setError('Unable to delete comment.');
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
    replyToComment,
    toggleResolved,
    deleteComment
  };
};
