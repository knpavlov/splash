import { apiRequest } from '../../../shared/api/httpClient';
import {
  ProgramSnapshotDetail,
  ProgramSnapshotSummary,
  SnapshotSessionEvent,
  SnapshotSettingsPayload
} from '../../../shared/types/snapshot';

const buildQueryString = (params?: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  if (!params) {
    return '';
  }
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const snapshotsApi = {
  getSettings: () => apiRequest<SnapshotSettingsPayload>('/snapshots/settings'),
  updateSettings: (payload: Partial<{ enabled: boolean; retentionDays: number; timezone: string; scheduleHour: number; scheduleMinute: number }>) =>
    apiRequest<SnapshotSettingsPayload>('/snapshots/settings', {
      method: 'PUT',
      body: payload
    }),
  listProgramSnapshots: (options?: { limit?: number; from?: string; to?: string }) => {
    const query = buildQueryString({
      limit: options?.limit,
      from: options?.from,
      to: options?.to
    });
    return apiRequest<ProgramSnapshotSummary[]>(`/snapshots/program${query}`);
  },
  captureProgramSnapshot: (detailLevel: 'full' | 'summary' = 'full') =>
    apiRequest<ProgramSnapshotSummary>('/snapshots/capture', {
      method: 'POST',
      body: { detailLevel }
    }),
  getProgramSnapshot: (id: string) => apiRequest<ProgramSnapshotDetail>(`/snapshots/program/${id}`),
  getLatestProgramSnapshot: () => apiRequest<ProgramSnapshotDetail>('/snapshots/program/latest'),
  recordSessionEvent: (event: SnapshotSessionEvent, accountId: string | null) =>
    apiRequest<{ accepted: boolean }>('/snapshots/session-events', {
      method: 'POST',
      body: { event, accountId }
    }).then(() => undefined)
};
