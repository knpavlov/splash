import { useCallback, useState } from 'react';
import { ApiError } from '../../../shared/api/httpClient';
import { demoDataApi, DemoSeedSummary } from '../services/demoDataApi';

type LoaderState = 'idle' | 'loading' | 'success' | 'error';

// Хук инкапсулирует сетевую логику запуска сидера
export const useDemoDataLoader = (email: string | null) => {
  const [state, setState] = useState<LoaderState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DemoSeedSummary | null>(null);

  const trigger = useCallback(async () => {
    if (!email || state === 'loading') {
      return null;
    }

    setState('loading');
    setError(null);

    try {
      const response = await demoDataApi.seed(email);
      setSummary(response.summary);
      setState('success');
      return response.summary;
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError
          ? unknownError.message
          : 'Failed to load demo data. Try again later.';
      setError(message);
      setState('error');
      return null;
    }
  }, [email, state]);

  return { state, error, summary, trigger };
};
