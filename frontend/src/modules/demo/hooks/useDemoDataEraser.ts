import { useCallback, useState } from 'react';
import { ApiError } from '../../../shared/api/httpClient';
import { demoDataApi, DemoEraseSummary } from '../services/demoDataApi';

type EraseState = 'idle' | 'loading' | 'success' | 'error';

// Хук инкапсулирует сетевую логику очистки демо-данных
export const useDemoDataEraser = (email: string | null) => {
  const [state, setState] = useState<EraseState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DemoEraseSummary | null>(null);

  const trigger = useCallback(async () => {
    if (!email || state === 'loading') {
      return null;
    }

    setState('loading');
    setError(null);

    try {
      const response = await demoDataApi.erase(email);
      setSummary(response.summary);
      setState('success');
      return response.summary;
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError
          ? unknownError.message
          : 'Failed to erase demo data. Try again later.';
      setError(message);
      setState('error');
      return null;
    }
  }, [email, state]);

  return { state, error, summary, trigger };
};
