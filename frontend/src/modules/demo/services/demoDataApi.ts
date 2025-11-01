import { apiRequest } from '../../../shared/api/httpClient';

export interface DemoSeedSummary {
  candidatesProcessed: number;
  evaluationsProcessed: number;
  interviewsProcessed: number;
}

export interface DemoEraseSummary {
  candidatesRemoved: number;
  evaluationsRemoved: number;
}

interface DemoSeedResponse {
  status: 'ok';
  summary: DemoSeedSummary;
}

interface DemoEraseResponse {
  status: 'ok';
  summary: DemoEraseSummary;
}

export const demoDataApi = {
  seed: async (email: string) =>
    apiRequest<DemoSeedResponse>('/demo/seed', {
      method: 'POST',
      body: { email }
    }),
  erase: async (email: string) =>
    apiRequest<DemoEraseResponse>('/demo/erase', {
      method: 'POST',
      body: { email }
    })
};
