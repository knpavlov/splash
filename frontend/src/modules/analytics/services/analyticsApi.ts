import { buildApiUrl } from '../../../shared/config/runtimeConfig';
import { apiRequest } from '../../../shared/api/httpClient';
import type {
  AnalyticsDataset,
  InterviewerPeriod,
  InterviewerStatsResponse,
  SummaryPeriod,
  SummaryResponse,
  TimelineGrouping,
  TimelineResponse
} from '../types/analytics';
import type { InterviewerSeniority } from '../../../shared/types/account';

const buildQueryString = (params: Record<string, string | undefined>) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && value.length > 0) {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
};

const readFileName = (contentDisposition: string | null): string | undefined => {
  if (!contentDisposition) {
    return undefined;
  }
  const match = contentDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  if (!match) {
    return undefined;
  }
  const encoded = match[1] || match[2];
  if (!encoded) {
    return undefined;
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
};

export const analyticsApi = {
  async getSummary(period: SummaryPeriod): Promise<SummaryResponse> {
    return apiRequest<SummaryResponse>(`/analytics/summary${buildQueryString({ period })}`);
  },

  async getTimeline(
    groupBy: TimelineGrouping,
    options: { from?: string; to?: string } = {}
  ): Promise<TimelineResponse> {
    const query = buildQueryString({ groupBy, from: options.from, to: options.to });
    return apiRequest<TimelineResponse>(`/analytics/timeline${query}`);
  },

  async getInterviewerStats(
    period: InterviewerPeriod,
    options: {
      interviewerIds?: string[];
      roles?: InterviewerSeniority[];
      groupBy?: TimelineGrouping;
      from?: string;
      to?: string;
    } = {}
  ): Promise<InterviewerStatsResponse> {
    const interviewerValue = options.interviewerIds?.length ? options.interviewerIds.join(',') : undefined;
    const roleValue = options.roles?.length ? options.roles.join(',') : undefined;
    const query = buildQueryString({
      period,
      interviewers: interviewerValue,
      roles: roleValue,
      groupBy: options.groupBy,
      from: options.from,
      to: options.to
    });
    return apiRequest<InterviewerStatsResponse>(`/analytics/interviewers${query}`);
  },

  async downloadDataset(
    dataset: AnalyticsDataset,
    params: Record<string, string | undefined>
  ): Promise<void> {
    const query = buildQueryString(params);
    const url = buildApiUrl(`/analytics/export/${dataset}${query}`);
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error('Unable to download the file.');
    }
    const blob = await response.blob();
    const fileName = readFileName(response.headers.get('Content-Disposition')) ?? `${dataset}.csv`;
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  }
};
