import type { InterviewerSeniority } from '../../../shared/types/account';

export type SummaryPeriod = 'rolling_3' | 'fytd' | 'rolling_12';
export type InterviewerPeriod = 'last_month' | 'rolling_3' | 'fytd' | 'rolling_12';

export interface SummaryMetricValue {
  value: number | null;
  numerator: number;
  denominator: number;
}

export interface SummaryResponse {
  period: SummaryPeriod;
  range: { start: string; end: string };
  metrics: {
    femaleShare: SummaryMetricValue;
    offerAcceptance: SummaryMetricValue;
    crossOfferAcceptance: SummaryMetricValue;
    offerRate: SummaryMetricValue;
  };
}

export type TimelineGrouping = 'week' | 'month' | 'quarter';

export interface TimelinePoint {
  bucket: string;
  resumes: number;
  firstRoundInterviews: number;
  secondRoundInterviews: number;
  totalInterviews: number;
  rejects: number;
  offers: number;
  avgCaseScore: number | null;
  avgFitScore: number | null;
  femaleShare: number | null;
}

export interface TimelineResponse {
  groupBy: TimelineGrouping;
  range: { start: string; end: string };
  points: TimelinePoint[];
}

export interface InterviewerDescriptor {
  id: string;
  name: string;
  email: string;
  role: InterviewerSeniority | null;
}

export interface InterviewerBucket {
  interviewerId: string;
  interviewerName: string;
  interviewerEmail: string;
  interviewerRole: InterviewerSeniority | null;
  bucket: string;
  interviewCount: number;
  avgCaseScore: number | null;
  avgFitScore: number | null;
  caseScoreCount: number;
  fitScoreCount: number;
  hireRecommendations: number;
  rejectRecommendations: number;
}

export interface InterviewerStatsResponse {
  period: InterviewerPeriod;
  groupBy: TimelineGrouping;
  range: { start: string; end: string };
  interviewers: InterviewerDescriptor[];
  buckets: InterviewerBucket[];
}

export type AnalyticsDataset = 'summary' | 'timeline' | 'interviewers';
