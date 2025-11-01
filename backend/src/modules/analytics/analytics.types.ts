import type { EvaluationDecision, EvaluationRoundSnapshot, InterviewStatusModel } from '../evaluations/evaluations.types.js';

export type SummaryPeriodKey = 'rolling_3' | 'fytd' | 'rolling_12';
export type InterviewerPeriodKey = 'last_month' | 'rolling_3' | 'fytd' | 'rolling_12';

export interface SummaryMetricValue {
  value: number | null;
  numerator: number;
  denominator: number;
}

export interface SummaryResponse {
  period: SummaryPeriodKey;
  range: { start: string; end: string };
  metrics: {
    femaleShare: SummaryMetricValue;
    offerAcceptance: SummaryMetricValue;
    offerRate: SummaryMetricValue;
    crossOfferAcceptance: SummaryMetricValue;
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
  role: string | null;
}

export interface InterviewerBucket {
  interviewerId: string;
  interviewerName: string;
  interviewerEmail: string;
  interviewerRole: string | null;
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
  period: InterviewerPeriodKey;
  groupBy: TimelineGrouping;
  range: { start: string; end: string };
  interviewers: InterviewerDescriptor[];
  buckets: InterviewerBucket[];
}

export interface CandidateSnapshotRow {
  id: string;
  createdAt: string;
  gender: string | null;
}

export interface EvaluationSnapshotRow {
  id: string;
  candidateId: string | null;
  createdAt: string;
  updatedAt: string;
  decision: EvaluationDecision | null;
  offerDecisionStatus: import('../evaluations/evaluations.types.js').OfferDecisionStatus | null;
  roundHistory: EvaluationRoundSnapshot[];
  forms: InterviewStatusModel[];
}

export interface AssignmentSnapshotRow {
  evaluationId: string;
  slotId: string;
  interviewerEmail: string;
  interviewerName: string;
  interviewerRole: string | null;
  roundNumber: number;
  createdAt: string;
  invitationSentAt?: string | null;
}
