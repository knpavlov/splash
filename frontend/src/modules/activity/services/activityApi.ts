import { apiRequest } from '../../../shared/api/httpClient';
import {
  ActivityCommentFeedResponse,
  ActivityPreferenceBundle,
  ActivityPreferencesUpdate,
  ActivitySummaryResponse,
  ActivityTimeframeKey
} from '../../../shared/types/activity';

const buildQuery = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (!value) {
      return;
    }
    search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

const formatList = (list?: string[]) => (list && list.length ? list.join(',') : undefined);

export const activityApi = {
  getPreferences: (accountId: string) =>
    apiRequest<ActivityPreferenceBundle>('/activity/preferences', {
      headers: { 'X-Account-Id': accountId }
    }),
  updatePreferences: (accountId: string, payload: ActivityPreferencesUpdate) =>
    apiRequest<ActivityPreferenceBundle>('/activity/preferences', {
      method: 'PUT',
      headers: { 'X-Account-Id': accountId },
      body: payload
    }),
  markVisited: (accountId: string) =>
    apiRequest<{ lastVisitedAt: string }>('/activity/preferences/visit', {
      method: 'POST',
      headers: { 'X-Account-Id': accountId }
    }),
  getSummary: (accountId: string, options: { timeframe?: ActivityTimeframeKey; workstreamIds?: string[]; metricKeys?: string[] }) => {
    const query = buildQuery({
      timeframe: options.timeframe,
      workstreams: formatList(options.workstreamIds),
      metrics: formatList(options.metricKeys)
    });
    return apiRequest<ActivitySummaryResponse>(`/activity/summary${query}`, {
      headers: { 'X-Account-Id': accountId }
    });
  },
  getCommentFeed: (
    accountId: string,
    options: { timeframe?: ActivityTimeframeKey; workstreamIds?: string[]; initiativeIds?: string[]; limit?: number }
  ) => {
    const query = buildQuery({
      timeframe: options.timeframe,
      workstreams: formatList(options.workstreamIds),
      initiatives: formatList(options.initiativeIds),
      limit: options.limit ? String(options.limit) : undefined
    });
    return apiRequest<ActivityCommentFeedResponse>(`/activity/comment-feed${query}`, {
      headers: { 'X-Account-Id': accountId }
    });
  }
};
