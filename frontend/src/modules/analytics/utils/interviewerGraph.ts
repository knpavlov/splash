import type { InterviewerStatsResponse, TimelineGrouping } from '../types/analytics';

export interface InterviewerGraphPoint {
  bucket: string;
  label: string;
  interviews: number;
  hireShare: number;
  caseScore: number;
  fitScore: number;
}

const formatQuarterLabel = (date: Date) => {
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${date.getUTCFullYear()}`;
};

export const formatInterviewerBucketLabel = (bucket: string, groupBy: TimelineGrouping) => {
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) {
    return bucket;
  }
  if (groupBy === 'quarter') {
    return formatQuarterLabel(date);
  }
  if (groupBy === 'week') {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
  }
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(date);
};

const alignToBucketStart = (value: Date, groupBy: TimelineGrouping) => {
  const aligned = new Date(value.getTime());
  if (Number.isNaN(aligned.getTime())) {
    return aligned;
  }
  switch (groupBy) {
    case 'week': {
      const day = aligned.getUTCDay();
      const diff = (day + 6) % 7;
      aligned.setUTCDate(aligned.getUTCDate() - diff);
      aligned.setUTCHours(0, 0, 0, 0);
      return aligned;
    }
    case 'quarter': {
      const month = aligned.getUTCMonth();
      const quarterStart = month - (month % 3);
      aligned.setUTCMonth(quarterStart, 1);
      aligned.setUTCHours(0, 0, 0, 0);
      return aligned;
    }
    case 'month':
    default: {
      aligned.setUTCDate(1);
      aligned.setUTCHours(0, 0, 0, 0);
      return aligned;
    }
  }
};

const advanceBucket = (value: Date, groupBy: TimelineGrouping) => {
  const next = new Date(value.getTime());
  switch (groupBy) {
    case 'week':
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    case 'quarter':
      next.setUTCMonth(next.getUTCMonth() + 3);
      return next;
    case 'month':
    default:
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next;
  }
};

const buildBucketSequence = (startIso: string, endIso: string, groupBy: TimelineGrouping) => {
  const startDate = new Date(startIso);
  const endDate = new Date(endIso);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return [];
  }
  const buckets: string[] = [];
  let cursor = alignToBucketStart(startDate, groupBy);
  const alignedEnd = alignToBucketStart(endDate, groupBy);
  while (cursor.getTime() <= alignedEnd.getTime()) {
    buckets.push(cursor.toISOString());
    cursor = advanceBucket(cursor, groupBy);
  }
  return buckets;
};

export const buildInterviewerGraphPoints = (
  data: InterviewerStatsResponse
): InterviewerGraphPoint[] => {
  const byBucket = new Map<string, typeof data.buckets>();
  data.buckets.forEach((bucket) => {
    const existing = byBucket.get(bucket.bucket) ?? [];
    existing.push(bucket);
    byBucket.set(bucket.bucket, existing);
  });

  const sequence = buildBucketSequence(data.range.start, data.range.end, data.groupBy);

  return sequence.map((bucketKey) => {
    const bucketEntries = byBucket.get(bucketKey) ?? [];
    const interviewerCount = bucketEntries.length;

    let interviewSum = 0;
    let hireShareSum = 0;
    let hireShareCount = 0;
    let caseScoreWeighted = 0;
    let caseScoreCount = 0;
    let fitScoreWeighted = 0;
    let fitScoreCount = 0;

    bucketEntries.forEach((entry) => {
      interviewSum += entry.interviewCount;
      const decisions = entry.hireRecommendations + entry.rejectRecommendations;
      if (decisions > 0) {
        hireShareSum += entry.hireRecommendations / decisions;
        hireShareCount += 1;
      }
      if (entry.avgCaseScore != null && entry.caseScoreCount > 0) {
        caseScoreWeighted += entry.avgCaseScore * entry.caseScoreCount;
        caseScoreCount += entry.caseScoreCount;
      }
      if (entry.avgFitScore != null && entry.fitScoreCount > 0) {
        fitScoreWeighted += entry.avgFitScore * entry.fitScoreCount;
        fitScoreCount += entry.fitScoreCount;
      }
    });

    const averageInterviews = interviewerCount ? interviewSum / interviewerCount : 0;
    const averageHireShare = hireShareCount ? hireShareSum / hireShareCount : 0;
    const averageCaseScore = caseScoreCount ? caseScoreWeighted / caseScoreCount : 0;
    const averageFitScore = fitScoreCount ? fitScoreWeighted / fitScoreCount : 0;

    return {
      bucket: bucketKey,
      label: formatInterviewerBucketLabel(bucketKey, data.groupBy),
      interviews: averageInterviews,
      hireShare: averageHireShare,
      caseScore: averageCaseScore,
      fitScore: averageFitScore
    };
  });
};

const escapeCsvCell = (value: string) => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const formatDecimal = (value: number) => {
  if (!Number.isFinite(value)) {
    return '';
  }
  return value.toFixed(2);
};

export const createInterviewerGraphCsv = (data: InterviewerStatsResponse) => {
  const points = buildInterviewerGraphPoints(data);
  const rows: string[][] = [
    ['bucket', 'average_interviews', 'average_hire_share', 'average_case_score', 'average_fit_score']
  ];

  points.forEach((point) => {
    rows.push([
      point.bucket,
      formatDecimal(point.interviews),
      formatDecimal(point.hireShare),
      formatDecimal(point.caseScore),
      formatDecimal(point.fitScore)
    ]);
  });

  return rows
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\n');
};

export const downloadInterviewerGraphCsv = (data: InterviewerStatsResponse) => {
  // Формируем CSV в том же табличном виде, что и блок Performance over time
  const csvContent = createInterviewerGraphCsv(data);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const fileName = `interviewer-performance-${data.groupBy}.csv`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
