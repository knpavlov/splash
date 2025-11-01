import type { InterviewerStatsResponse } from '../types/analytics';
import type { InterviewerSeniority } from '../../../shared/types/account';

export interface InterviewerTotal {
  id: string;
  name: string;
  email: string;
  role: InterviewerSeniority | null;
  interviewCount: number;
  hire: number;
  reject: number;
  caseScoreSum: number;
  caseScoreCount: number;
  fitScoreSum: number;
  fitScoreCount: number;
}

export const buildInterviewerTotals = (
  data: InterviewerStatsResponse | null
): InterviewerTotal[] => {
  if (!data) {
    return [];
  }

  const map = new Map<string, InterviewerTotal>();
  const descriptorRoles = new Map<string, InterviewerSeniority | null>();

  data.interviewers.forEach((descriptor) => {
    descriptorRoles.set(descriptor.id, descriptor.role ?? null);
  });

  data.buckets.forEach((bucket) => {
    const existing = map.get(bucket.interviewerId) ?? {
      id: bucket.interviewerId,
      name: bucket.interviewerName,
      email: bucket.interviewerEmail,
      role: descriptorRoles.get(bucket.interviewerId) ?? bucket.interviewerRole ?? null,
      interviewCount: 0,
      hire: 0,
      reject: 0,
      caseScoreSum: 0,
      caseScoreCount: 0,
      fitScoreSum: 0,
      fitScoreCount: 0
    };

    existing.interviewCount += bucket.interviewCount;
    existing.hire += bucket.hireRecommendations;
    existing.reject += bucket.rejectRecommendations;

    if (bucket.avgCaseScore != null) {
      existing.caseScoreSum += bucket.avgCaseScore * bucket.caseScoreCount;
      existing.caseScoreCount += bucket.caseScoreCount;
    }

    if (bucket.avgFitScore != null) {
      existing.fitScoreSum += bucket.avgFitScore * bucket.fitScoreCount;
      existing.fitScoreCount += bucket.fitScoreCount;
    }

    map.set(bucket.interviewerId, existing);
  });

  return Array.from(map.values()).sort((a, b) => b.interviewCount - a.interviewCount);
};
