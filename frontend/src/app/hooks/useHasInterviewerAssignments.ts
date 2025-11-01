import { useEffect, useState } from 'react';
import { interviewerApi } from '../../modules/evaluation/services/interviewerApi';

/**
 * Хук определяет, есть ли у текущего пользователя хотя бы одно назначение интервьюера.
 * Это позволяет динамически добавлять раздел "Interviews" в навигацию админа.
 */
export const useHasInterviewerAssignments = (email: string | null | undefined): boolean => {
  const [hasAssignments, setHasAssignments] = useState(false);

  useEffect(() => {
    if (!email) {
      setHasAssignments(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const items = await interviewerApi.listAssignments(email);
        if (!cancelled) {
          setHasAssignments(items.length > 0);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Не удалось проверить назначения интервьюера:', error);
          setHasAssignments(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [email]);

  return hasAssignments;
};
