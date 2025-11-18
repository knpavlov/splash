import { apiRequest } from '../../../shared/api/httpClient';
import { InitiativeLogEntry } from '../../../shared/types/initiativeLog';

export interface InitiativeLogFilters {
  limit?: number;
  before?: string;
  after?: string;
  workstreamIds?: string[];
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
  const query = params.toString();
  return query ? `?${query}` : '';
};

export const initiativeLogsApi = {
  list: (filters: InitiativeLogFilters) =>
    apiRequest<InitiativeLogEntry[]>(`/initiative-logs${buildQuery(filters)}`),
  markAsRead: (eventIds: string[]) =>
    apiRequest('/initiative-logs/mark-read', {
      method: 'POST',
      body: { eventIds }
    })
};
