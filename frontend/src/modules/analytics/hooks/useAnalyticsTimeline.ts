import { useCallback, useEffect, useState } from 'react';
import { analyticsApi } from '../services/analyticsApi';
import type { TimelineGrouping, TimelineResponse } from '../types/analytics';

interface HookState {
  data: TimelineResponse | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export const useAnalyticsTimeline = (
  groupBy: TimelineGrouping,
  range: { from?: string; to?: string }
): HookState => {
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await analyticsApi.getTimeline(groupBy, range);
      setData(response);
      setError(null);
    } catch (err) {
      console.error('Failed to load analytics timeline:', err);
      setError('Unable to load the chart. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [groupBy, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
};
