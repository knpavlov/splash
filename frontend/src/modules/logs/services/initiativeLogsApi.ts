import { apiRequest } from '../../../shared/api/httpClient';
import { InitiativeLogEntry } from '../../../shared/types/initiativeLog';

export type EventCategory =
  | 'created'
  | 'approvals'
  | 'financials'
  | 'timeline'
  | 'ownership'
  | 'content'
  | 'documents'
  | 'risks';

export interface EventCategoryOption {
  key: EventCategory;
  label: string;
}

export interface InitiativeLogFilters {
  limit?: number;
  before?: string;
  after?: string;
  workstreamIds?: string[];
  initiativeIds?: string[];
  eventCategories?: EventCategory[];
}

const buildQuery = (filters: InitiativeLogFilters) => {
  const params = new URLSearchParams();
  if (filters.limit) {
    params.set('limit', String(filters.limit));
  }
  if (filters.before) {
    params.set('before', filters.before);
  }
  if (filters.after) {
    params.set('after', filters.after);
  }
  if (filters.workstreamIds?.length) {
    params.set('workstreams', filters.workstreamIds.join(','));
  }
  if (filters.initiativeIds?.length) {
    params.set('initiatives', filters.initiativeIds.join(','));
  }
  if (filters.eventCategories?.length) {
    params.set('categories', filters.eventCategories.join(','));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
};

export const initiativeLogsApi = {
  list: (accountId: string, filters: InitiativeLogFilters) =>
    apiRequest<InitiativeLogEntry[]>(`/initiative-logs${buildQuery(filters)}`, {
      headers: { 'X-Account-Id': accountId }
    }),
  getCategories: () =>
    apiRequest<EventCategoryOption[]>('/initiative-logs/categories'),
  markAsRead: (accountId: string, eventIds: string[]) =>
    apiRequest('/initiative-logs/mark-read', {
      method: 'POST',
      body: { eventIds },
      headers: { 'X-Account-Id': accountId }
    })
};
