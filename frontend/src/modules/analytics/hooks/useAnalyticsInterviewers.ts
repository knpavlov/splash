import { useCallback, useEffect, useState } from 'react';
import { analyticsApi } from '../services/analyticsApi';
import type { InterviewerPeriod, InterviewerStatsResponse, TimelineGrouping } from '../types/analytics';
import type { InterviewerSeniority } from '../../../shared/types/account';

interface HookState {
  data: InterviewerStatsResponse | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export const useAnalyticsInterviewers = (
  period: InterviewerPeriod,
  options: {
    interviewerIds?: string[];
    roles?: InterviewerSeniority[];
    groupBy?: TimelineGrouping;
    from?: string;
    to?: string;
  }
): HookState => {
  const [data, setData] = useState<InterviewerStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await analyticsApi.getInterviewerStats(period, options);
      setData(response);
      setError(null);
    } catch (err) {
      console.error('Failed to load interviewer analytics:', err);
      setError('Unable to load interviewer statistics. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [
    period,
    options.interviewerIds?.join(','),
    options.roles?.join(','),
    options.groupBy,
    options.from,
    options.to
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
};
