import { AnalyticsRepository } from './analytics.repository.js';
import type {
  AssignmentSnapshotRow,
  CandidateSnapshotRow,
  EvaluationSnapshotRow,
  InterviewerBucket,
  InterviewerDescriptor,
  InterviewerStatsResponse,
  InterviewerPeriodKey,
  SummaryMetricValue,
  SummaryPeriodKey,
  SummaryResponse,
  TimelineGrouping,
  TimelinePoint,
  TimelineResponse
} from './analytics.types.js';
import type { OfferDecisionStatus } from '../evaluations/evaluations.types.js';

const FISCAL_YEAR_START_MONTH = 4; // April
const MIN_TIMELINE_START = new Date(Date.UTC(2025, 8, 1));

const startOfDayUtc = (value: Date) => {
  const date = new Date(value.getTime());
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

const endOfDayUtc = (value: Date) => {
  const date = new Date(value.getTime());
  date.setUTCHours(23, 59, 59, 999);
  return date;
};

const startOfMonthUtc = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));

const addMonthsUtc = (value: Date, months: number) => {
  const date = new Date(value.getTime());
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetMonth = month + months;
  const result = new Date(Date.UTC(year, targetMonth, 1));
  const lastDayOfTargetMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDayOfTargetMonth);
  result.setUTCDate(safeDay);
  result.setUTCHours(date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds());
  return result;
};

const addDaysUtc = (value: Date, days: number) => {
  const result = new Date(value.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const startOfWeekUtc = (value: Date) => {
  const date = startOfDayUtc(value);
  const day = date.getUTCDay();
  const offset = (day + 6) % 7; // Offset to Monday
  if (offset !== 0) {
    date.setUTCDate(date.getUTCDate() - offset);
  }
  return date;
};

const startOfQuarterUtc = (value: Date) => {
  const quarterIndex = Math.floor(value.getUTCMonth() / 3);
  return new Date(Date.UTC(value.getUTCFullYear(), quarterIndex * 3, 1));
};

const isWithinRange = (value: Date, start: Date, end: Date) => value.getTime() >= start.getTime() && value.getTime() <= end.getTime();

const buildSummaryRange = (period: SummaryPeriodKey, reference: Date) => {
  const end = endOfDayUtc(reference);
  let start: Date;

  switch (period) {
    case 'rolling_3':
      start = startOfMonthUtc(addMonthsUtc(reference, -2));
      break;
    case 'rolling_12':
      start = startOfMonthUtc(addMonthsUtc(reference, -11));
      break;
    case 'fytd': {
      const fiscalStartMonthIndex = FISCAL_YEAR_START_MONTH - 1;
      let fiscalYear = reference.getUTCFullYear();
      if (reference.getUTCMonth() < fiscalStartMonthIndex) {
        fiscalYear -= 1;
      }
      start = new Date(Date.UTC(fiscalYear, fiscalStartMonthIndex, 1));
      break;
    }
    default:
      start = startOfMonthUtc(reference);
  }

  return { start, end };
};

const buildInterviewerRange = (period: InterviewerPeriodKey, reference: Date) => {
  const end = endOfDayUtc(reference);
  switch (period) {
    case 'last_month': {
      const start = startOfMonthUtc(addMonthsUtc(reference, -1));
      return { start, end };
    }
    case 'rolling_12':
      return { start: startOfMonthUtc(addMonthsUtc(reference, -11)), end };
    case 'fytd': {
      const fiscalStartMonthIndex = FISCAL_YEAR_START_MONTH - 1;
      let fiscalYear = reference.getUTCFullYear();
      if (reference.getUTCMonth() < fiscalStartMonthIndex) {
        fiscalYear -= 1;
      }
      return { start: new Date(Date.UTC(fiscalYear, fiscalStartMonthIndex, 1)), end };
    }
    case 'rolling_3':
    default:
      return { start: startOfMonthUtc(addMonthsUtc(reference, -2)), end };
  }
};

const alignToBucketStart = (value: Date, groupBy: TimelineGrouping) => {
  switch (groupBy) {
    case 'week':
      return startOfWeekUtc(value);
    case 'month':
      return startOfMonthUtc(value);
    case 'quarter':
      return startOfQuarterUtc(value);
    default:
      return startOfMonthUtc(value);
  }
};

const advanceBucket = (value: Date, groupBy: TimelineGrouping) => {
  switch (groupBy) {
    case 'week':
      return addDaysUtc(value, 7);
    case 'month':
      return addMonthsUtc(value, 1);
    case 'quarter':
      return addMonthsUtc(value, 3);
    default:
      return addMonthsUtc(value, 1);
  }
};

const ratio = (numerator: number, denominator: number): number | null => {
  if (!denominator) {
    return null;
  }
  return numerator / denominator;
};

const toIso = (date: Date) => date.toISOString();

const parseDate = (value: string | undefined | null): Date | null => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const mapGender = (value: string | null): string => value?.toLowerCase() ?? '';

const mapRecommendation = (value: string | undefined): 'hire' | 'reject' | null => {
  if (!value) {
    return null;
  }
  if (value === 'no_offer') {
    return 'reject';
  }
  return 'hire';
};

interface MonthlyMetricAccumulator {
  start: Date;
  candidateCount: number;
  femaleCount: number;
  acceptedOffers: number;
  acceptedCrossOffers: number;
  declinedOffers: number;
  declinedCrossOffers: number;
  pendingOffers: number;
  rejectedOffers: number;
}

interface TimelineBucketAccumulator {
  date: Date;
  resumes: number;
  firstRoundInterviews: number;
  secondRoundInterviews: number;
  totalInterviews: number;
  rejects: number;
  offers: number;
  caseScoreSum: number;
  caseScoreCount: number;
  fitScoreSum: number;
  fitScoreCount: number;
  femaleCount: number;
  candidateCount: number;
}

const INTERVIEWER_ROLE_CODES = ['MD', 'SD', 'D', 'SM', 'M', 'SA', 'A'] as const;
type InterviewerRoleCode = (typeof INTERVIEWER_ROLE_CODES)[number];

interface InterviewerBucketAccumulator {
  interviewerId: string;
  interviewerName: string;
  interviewerEmail: string;
  interviewerRole: InterviewerRoleCode | null;
  date: Date;
  interviewCount: number;
  caseScoreSum: number;
  caseScoreCount: number;
  fitScoreSum: number;
  fitScoreCount: number;
  hireRecommendations: number;
  rejectRecommendations: number;
}

const buildMonthlyMetrics = (
  candidates: CandidateSnapshotRow[],
  evaluations: EvaluationSnapshotRow[],
  rangeEnd: Date
) => {
  const map = new Map<string, MonthlyMetricAccumulator>();

  const ensureMonth = (date: Date) => {
    const monthStart = startOfMonthUtc(date);
    const key = toIso(monthStart);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        start: monthStart,
        candidateCount: 0,
        femaleCount: 0,
        acceptedCrossOffers: 0,
        pendingOffers: 0,
        acceptedOffers: 0,
        declinedOffers: 0,
        declinedCrossOffers: 0,
        rejectedOffers: 0
      };
      map.set(key, bucket);
    }
    return bucket;
  };

  const resolveStatus = (evaluation: EvaluationSnapshotRow): OfferDecisionStatus => {
    const status = evaluation.offerDecisionStatus;
    if (
      status === 'pending' ||
      status === 'accepted' ||
      status === 'accepted-co' ||
      status === 'declined' ||
      status === 'declined-co'
    ) {
      return status;
    }
    if (evaluation.decision === 'accepted-offer') {
      return 'accepted';
    }
    return 'pending';
  };

  for (const candidate of candidates) {
    const createdAt = parseDate(candidate.createdAt);
    if (!createdAt || createdAt.getTime() > rangeEnd.getTime()) {
      continue;
    }
    const bucket = ensureMonth(createdAt);
    bucket.candidateCount += 1;
    if (mapGender(candidate.gender) === 'female') {
      bucket.femaleCount += 1;
    }
  }

  for (const evaluation of evaluations) {
    const updatedAt = parseDate(evaluation.updatedAt);
    if (!updatedAt || updatedAt.getTime() > rangeEnd.getTime()) {
      continue;
    }
    const bucket = ensureMonth(updatedAt);
    if (evaluation.decision === 'offer' || evaluation.decision === 'accepted-offer') {
      const status = resolveStatus(evaluation);
      switch (status) {
        case 'accepted':
          bucket.acceptedOffers += 1;
          break;
        case 'accepted-co':
          bucket.acceptedCrossOffers += 1;
          break;
        case 'declined':
          bucket.declinedOffers += 1;
          break;
        case 'declined-co':
          bucket.declinedCrossOffers += 1;
          break;
        default:
          bucket.pendingOffers += 1;
      }
    } else if (evaluation.decision === 'reject') {
      bucket.rejectedOffers += 1;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
};

const resolveRoundDate = (round: EvaluationSnapshotRow['roundHistory'][number], evaluation: EvaluationSnapshotRow) => {
  const candidates = [round.completedAt, round.processStartedAt, round.createdAt, evaluation.updatedAt, evaluation.createdAt];
  for (const candidate of candidates) {
    const date = parseDate(candidate);
    if (date) {
      return date;
    }
  }
  return null;
};

const resolveFormDate = (
  form: EvaluationSnapshotRow['forms'][number],
  roundDate: Date | null,
  evaluation: EvaluationSnapshotRow
) => {
  const candidates = [form.submittedAt, roundDate?.toISOString(), evaluation.updatedAt, evaluation.createdAt];
  for (const candidate of candidates) {
    const date = parseDate(candidate ?? undefined);
    if (date) {
      return date;
    }
  }
  return null;
};

const normalizeInterviewerRole = (value: string | null | undefined): InterviewerRoleCode | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return INTERVIEWER_ROLE_CODES.includes(normalized as InterviewerRoleCode)
    ? (normalized as InterviewerRoleCode)
    : null;
};

const buildInterviewerDescriptor = (assignment: AssignmentSnapshotRow) => {
  const email = assignment.interviewerEmail?.trim() ?? '';
  const normalizedEmail = email.toLowerCase();
  const normalizedName = assignment.interviewerName?.trim().toLowerCase() ?? '';
  const normalizedSlot = assignment.slotId?.trim().toLowerCase() ?? '';
  const id = normalizedEmail || normalizedName || normalizedSlot || assignment.slotId;
  return {
    id: id,
    name: assignment.interviewerName?.trim() || 'Interviewer',
    email: email,
    role: normalizeInterviewerRole(assignment.interviewerRole)
  };
};

const buildBucketSequence = (start: Date, end: Date, groupBy: TimelineGrouping) => {
  const alignedStart = alignToBucketStart(start, groupBy);
  const alignedEnd = alignToBucketStart(end, groupBy);
  const buckets: Date[] = [];
  let cursor = alignedStart;
  while (cursor.getTime() <= alignedEnd.getTime()) {
    buckets.push(new Date(cursor.getTime()));
    cursor = advanceBucket(cursor, groupBy);
  }
  return buckets;
};

const formatRatio = (numerator: number, denominator: number): string => {
  if (!denominator) {
    return '';
  }
  return (numerator / denominator).toFixed(4);
};

const csvEscape = (value: string) => {
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export class AnalyticsService {
  constructor(private readonly repository: AnalyticsRepository) {}

  async getSummary(period: SummaryPeriodKey): Promise<SummaryResponse> {
    const reference = new Date();
    const range = buildSummaryRange(period, reference);
    const [candidates, evaluations] = await Promise.all([
      this.repository.listCandidates(),
      this.repository.listEvaluations()
    ]);

    const monthly = buildMonthlyMetrics(candidates, evaluations, range.end);
    const startMonth = startOfMonthUtc(range.start);
    const endMonth = startOfMonthUtc(range.end);

    let femaleCount = 0;
    let candidateCount = 0;
    let acceptedOffers = 0;
    let acceptedCrossOffers = 0;
    let declinedOffers = 0;
    let declinedCrossOffers = 0;
    let pendingOffers = 0;
    let rejectedOffers = 0;

    for (const month of monthly) {
      if (month.start.getTime() < startMonth.getTime() || month.start.getTime() > endMonth.getTime()) {
        continue;
      }
      femaleCount += month.femaleCount;
      candidateCount += month.candidateCount;
      acceptedOffers += month.acceptedOffers;
      acceptedCrossOffers += month.acceptedCrossOffers;
      declinedOffers += month.declinedOffers;
      declinedCrossOffers += month.declinedCrossOffers;
      pendingOffers += month.pendingOffers;
      rejectedOffers += month.rejectedOffers;
    }

    const offersIssued =
      acceptedOffers + acceptedCrossOffers + declinedOffers + declinedCrossOffers + pendingOffers;
    const decisionsWithOutcome = offersIssued + rejectedOffers;

    const buildMetric = (numerator: number, denominator: number): SummaryMetricValue => ({
      value: ratio(numerator, denominator),
      numerator,
      denominator
    });

    return {
      period,
      range: { start: range.start.toISOString(), end: range.end.toISOString() },
      metrics: {
        femaleShare: buildMetric(femaleCount, candidateCount),
        offerAcceptance: buildMetric(acceptedOffers, offersIssued),
        crossOfferAcceptance: buildMetric(acceptedCrossOffers, offersIssued),
        offerRate: buildMetric(offersIssued, decisionsWithOutcome)
      }
    };
  }

  async getTimeline(
    groupBy: TimelineGrouping,
    options: { from?: string; to?: string } = {}
  ): Promise<TimelineResponse> {
    const referenceEnd = options.to ? parseDate(options.to) ?? new Date() : new Date();
    const rangeEnd = endOfDayUtc(referenceEnd);
    const defaultStartCandidate = startOfMonthUtc(addMonthsUtc(rangeEnd, -11));
    const minimumStart = startOfMonthUtc(MIN_TIMELINE_START);
    const defaultStart =
      defaultStartCandidate.getTime() < minimumStart.getTime() ? minimumStart : defaultStartCandidate;
    const providedStart = options.from ? parseDate(options.from) : null;
    const rangeStart = providedStart ?? defaultStart;
    const alignedStart = startOfDayUtc(rangeStart);

    const [candidates, evaluations] = await Promise.all([
      this.repository.listCandidates(),
      this.repository.listEvaluations()
    ]);

    const buckets = new Map<string, TimelineBucketAccumulator>();
    const ensureBucket = (date: Date) => {
      const bucketDate = alignToBucketStart(date, groupBy);
      const key = toIso(bucketDate);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          date: bucketDate,
          resumes: 0,
          firstRoundInterviews: 0,
          secondRoundInterviews: 0,
          totalInterviews: 0,
          rejects: 0,
          offers: 0,
          caseScoreSum: 0,
          caseScoreCount: 0,
          fitScoreSum: 0,
          fitScoreCount: 0,
          femaleCount: 0,
          candidateCount: 0
        };
        buckets.set(key, bucket);
      }
      return bucket;
    };

    for (const candidate of candidates) {
      const createdAt = parseDate(candidate.createdAt);
      if (!createdAt || !isWithinRange(createdAt, alignedStart, rangeEnd)) {
        continue;
      }
      const bucket = ensureBucket(createdAt);
      bucket.resumes += 1;
      bucket.candidateCount += 1;
      if (mapGender(candidate.gender) === 'female') {
        bucket.femaleCount += 1;
      }
    }

    for (const evaluation of evaluations) {
      const updatedAt = parseDate(evaluation.updatedAt);
      if (updatedAt && isWithinRange(updatedAt, alignedStart, rangeEnd)) {
        const decisionBucket = ensureBucket(updatedAt);
        if (evaluation.decision === 'offer' || evaluation.decision === 'accepted-offer') {
          decisionBucket.offers += 1;
        } else if (evaluation.decision === 'reject') {
          decisionBucket.rejects += 1;
        }
      }

      const processedForms = new Set<string>();

      for (const round of evaluation.roundHistory) {
        const roundDate = resolveRoundDate(round, evaluation);

        for (const form of round.forms) {
          const formKey = `${round.roundNumber}|${form.slotId}`;
          if (processedForms.has(formKey)) {
            continue;
          }
          const formDate = resolveFormDate(form, roundDate, evaluation);
          if (!formDate || !isWithinRange(formDate, alignedStart, rangeEnd)) {
            continue;
          }
          const bucket = ensureBucket(formDate);
          bucket.totalInterviews += 1;
          if (round.roundNumber === 1) {
            bucket.firstRoundInterviews += 1;
          }
          if (round.roundNumber === 2) {
            bucket.secondRoundInterviews += 1;
          }
          if (typeof form.caseScore === 'number' && Number.isFinite(form.caseScore)) {
            bucket.caseScoreSum += form.caseScore;
            bucket.caseScoreCount += 1;
          }
          if (typeof form.fitScore === 'number' && Number.isFinite(form.fitScore)) {
            bucket.fitScoreSum += form.fitScore;
            bucket.fitScoreCount += 1;
          }
          processedForms.add(formKey);
        }
      }

      for (const form of evaluation.forms) {
        const formKey = `current|${form.slotId}`;
        if (processedForms.has(formKey)) {
          continue;
        }
        const formDate = resolveFormDate(form, null, evaluation);
        if (!formDate || !isWithinRange(formDate, alignedStart, rangeEnd)) {
          continue;
        }
        const bucket = ensureBucket(formDate);
        bucket.totalInterviews += 1;
        if (typeof form.caseScore === 'number' && Number.isFinite(form.caseScore)) {
          bucket.caseScoreSum += form.caseScore;
          bucket.caseScoreCount += 1;
        }
        if (typeof form.fitScore === 'number' && Number.isFinite(form.fitScore)) {
          bucket.fitScoreSum += form.fitScore;
          bucket.fitScoreCount += 1;
        }
        processedForms.add(formKey);
      }
    }

    const sequence = buildBucketSequence(alignedStart, rangeEnd, groupBy);
    const points: TimelinePoint[] = sequence.map((bucketDate) => {
      const key = toIso(bucketDate);
      const bucket = buckets.get(key);
      if (!bucket) {
        return {
          bucket: key,
          resumes: 0,
          firstRoundInterviews: 0,
          secondRoundInterviews: 0,
          totalInterviews: 0,
          rejects: 0,
          offers: 0,
          avgCaseScore: null,
          avgFitScore: null,
          femaleShare: null
        };
      }

      return {
        bucket: key,
        resumes: bucket.resumes,
        firstRoundInterviews: bucket.firstRoundInterviews,
        secondRoundInterviews: bucket.secondRoundInterviews,
        totalInterviews: bucket.totalInterviews,
        rejects: bucket.rejects,
        offers: bucket.offers,
        avgCaseScore: bucket.caseScoreCount ? bucket.caseScoreSum / bucket.caseScoreCount : null,
        avgFitScore: bucket.fitScoreCount ? bucket.fitScoreSum / bucket.fitScoreCount : null,
        femaleShare: bucket.candidateCount ? bucket.femaleCount / bucket.candidateCount : null
      };
    });

    return {
      groupBy,
      range: { start: alignedStart.toISOString(), end: rangeEnd.toISOString() },
      points
    };
  }

  async getInterviewerStats(
    period: InterviewerPeriodKey,
    options: {
      interviewerIds?: string[];
      roles?: string[];
      groupBy?: TimelineGrouping;
      from?: string;
      to?: string;
    } = {}
  ): Promise<InterviewerStatsResponse> {
    const explicitEnd = options.to ? parseDate(options.to) : null;
    const reference = explicitEnd ?? new Date();
    const range = buildInterviewerRange(period, reference);
    const groupBy = options.groupBy ?? 'month';
    const defaultEnd = endOfDayUtc(range.end);
    const defaultStart = startOfDayUtc(range.start);
    const customStart = options.from ? parseDate(options.from) : null;
    const rangeEnd = explicitEnd ? endOfDayUtc(explicitEnd) : defaultEnd;
    let alignedStart = customStart ? startOfDayUtc(customStart) : defaultStart;
    if (alignedStart.getTime() > rangeEnd.getTime()) {
      alignedStart = startOfDayUtc(rangeEnd);
    }
    const filterSet = options.interviewerIds && options.interviewerIds.length
      ? new Set(options.interviewerIds.map((id) => id.trim().toLowerCase()).filter((id) => id.length > 0))
      : null;
    const roleFilterSet = options.roles && options.roles.length
      ? new Set(
          options.roles
            .map((role) => role.trim().toUpperCase())
            .filter((role) => INTERVIEWER_ROLE_CODES.includes(role as InterviewerRoleCode))
        )
      : null;

    const [assignments, evaluations] = await Promise.all([
      this.repository.listAssignments(),
      this.repository.listEvaluations()
    ]);

    const evaluationMap = new Map<string, EvaluationSnapshotRow>();
    for (const evaluation of evaluations) {
      evaluationMap.set(evaluation.id, evaluation);
    }

    const interviewerDescriptors = new Map<string, InterviewerDescriptor>();
    const buckets = new Map<string, InterviewerBucketAccumulator>();

    const ensureBucket = (descriptor: InterviewerDescriptor, date: Date) => {
      const bucketDate = alignToBucketStart(date, groupBy);
      const key = `${descriptor.id}__${toIso(bucketDate)}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          interviewerId: descriptor.id,
          interviewerName: descriptor.name,
          interviewerEmail: descriptor.email,
          interviewerRole: descriptor.role ? normalizeInterviewerRole(descriptor.role) : null,
          date: bucketDate,
          interviewCount: 0,
          caseScoreSum: 0,
          caseScoreCount: 0,
          fitScoreSum: 0,
          fitScoreCount: 0,
          hireRecommendations: 0,
          rejectRecommendations: 0
        };
        buckets.set(key, bucket);
      }
      return bucket;
    };

    const collectForms = (evaluation: EvaluationSnapshotRow) => {
      const forms = new Map<string, { form: EvaluationSnapshotRow['forms'][number]; roundNumber?: number; roundDate: Date | null }>();

      for (const round of evaluation.roundHistory) {
        const roundDate = resolveRoundDate(round, evaluation);
        for (const form of round.forms) {
          forms.set(form.slotId, { form, roundNumber: round.roundNumber, roundDate });
        }
      }

      for (const form of evaluation.forms) {
        forms.set(form.slotId, { form, roundNumber: undefined, roundDate: null });
      }

      return forms;
    };

    for (const assignment of assignments) {
    const descriptor = buildInterviewerDescriptor(assignment);
    const descriptorId = descriptor.id.toLowerCase();
    const descriptorRecord = { ...descriptor, id: descriptorId };
    const existingDescriptor = interviewerDescriptors.get(descriptorId);
    if (existingDescriptor) {
      interviewerDescriptors.set(descriptorId, {
        ...existingDescriptor,
        ...descriptorRecord,
        role: descriptor.role ?? existingDescriptor.role ?? null
      });
    } else {
      interviewerDescriptors.set(descriptorId, descriptorRecord);
    }

    if (roleFilterSet && (!descriptor.role || !roleFilterSet.has(descriptor.role))) {
      continue;
    }

    if (filterSet && !filterSet.has(descriptorId)) {
      continue;
    }

      const evaluation = evaluationMap.get(assignment.evaluationId);
      if (!evaluation) {
        continue;
      }

      const forms = collectForms(evaluation);
      const slotData = forms.get(assignment.slotId);

      const preferredDate = slotData
        ? resolveFormDate(slotData.form, slotData.roundDate, evaluation)
        : parseDate(assignment.invitationSentAt) ?? parseDate(assignment.createdAt);

      if (!preferredDate || !isWithinRange(preferredDate, alignedStart, rangeEnd)) {
        continue;
      }

      const bucket = ensureBucket(descriptorRecord, preferredDate);
      bucket.interviewCount += 1;

      if (slotData) {
        const { form } = slotData;
        if (typeof form.caseScore === 'number' && Number.isFinite(form.caseScore)) {
          bucket.caseScoreSum += form.caseScore;
          bucket.caseScoreCount += 1;
        }
        if (typeof form.fitScore === 'number' && Number.isFinite(form.fitScore)) {
          bucket.fitScoreSum += form.fitScore;
          bucket.fitScoreCount += 1;
        }
        const recommendation = mapRecommendation(form.offerRecommendation);
        if (recommendation === 'hire') {
          bucket.hireRecommendations += 1;
        } else if (recommendation === 'reject') {
          bucket.rejectRecommendations += 1;
        }
      }
    }

    const descriptorList = Array.from(interviewerDescriptors.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'en')
    );

    const relevantBuckets = Array.from(buckets.values())
      .filter((bucket) => !filterSet || filterSet.has(bucket.interviewerId.toLowerCase()))
      .filter((bucket) => !roleFilterSet || (bucket.interviewerRole && roleFilterSet.has(bucket.interviewerRole)))
      .sort((a, b) => {
        const dateDiff = a.date.getTime() - b.date.getTime();
        if (dateDiff !== 0) {
          return dateDiff;
        }
        return a.interviewerName.localeCompare(b.interviewerName, 'en');
      })
      .map<InterviewerBucket>((bucket) => ({
        interviewerId: bucket.interviewerId,
        interviewerName: bucket.interviewerName,
        interviewerEmail: bucket.interviewerEmail,
        interviewerRole: bucket.interviewerRole,
        bucket: bucket.date.toISOString(),
        interviewCount: bucket.interviewCount,
        avgCaseScore: bucket.caseScoreCount ? bucket.caseScoreSum / bucket.caseScoreCount : null,
        avgFitScore: bucket.fitScoreCount ? bucket.fitScoreSum / bucket.fitScoreCount : null,
        caseScoreCount: bucket.caseScoreCount,
        fitScoreCount: bucket.fitScoreCount,
        hireRecommendations: bucket.hireRecommendations,
        rejectRecommendations: bucket.rejectRecommendations
      }));

    return {
      period,
      groupBy,
      range: { start: alignedStart.toISOString(), end: rangeEnd.toISOString() },
      interviewers: descriptorList,
      buckets: relevantBuckets
    };
  }

  async exportSummary(period: SummaryPeriodKey): Promise<string> {
    const reference = new Date();
    const range = buildSummaryRange(period, reference);
    const [candidates, evaluations] = await Promise.all([
      this.repository.listCandidates(),
      this.repository.listEvaluations()
    ]);

    const monthly = buildMonthlyMetrics(candidates, evaluations, range.end);
    const startMonth = startOfMonthUtc(range.start);
    const endMonth = startOfMonthUtc(range.end);

    const rows = monthly.filter(
      (month) => month.start.getTime() >= startMonth.getTime() && month.start.getTime() <= endMonth.getTime()
    );

    const header = [
      'period_start',
      'period_end',
      'candidate_count',
      'female_count',
      'female_share',
      'offers_issued',
      'offers_accepted',
      'cross_offers_accepted',
      'offer_acceptance',
      'cross_offer_acceptance',
      'offer_rate'
    ];

    const lines = [header.join(',')];

    for (const row of rows) {
      const periodEnd = addDaysUtc(addMonthsUtc(row.start, 1), -1);
      const offersIssued =
        row.acceptedOffers +
        row.acceptedCrossOffers +
        row.declinedOffers +
        row.declinedCrossOffers +
        row.pendingOffers;
      const acceptance = formatRatio(row.acceptedOffers, offersIssued);
      const crossAcceptance = formatRatio(row.acceptedCrossOffers, offersIssued);
      const offerRate = formatRatio(offersIssued, offersIssued + row.rejectedOffers);
      lines.push(
        [
          row.start.toISOString(),
          periodEnd.toISOString(),
          String(row.candidateCount),
          String(row.femaleCount),
          formatRatio(row.femaleCount, row.candidateCount),
          String(offersIssued),
          String(row.acceptedOffers),
          String(row.acceptedCrossOffers),
          acceptance,
          crossAcceptance,
          offerRate
        ].join(',')
      );
    }

    return lines.join('\n');
  }

  async exportTimeline(
    groupBy: TimelineGrouping,
    options: { from?: string; to?: string } = {}
  ): Promise<string> {
    const timeline = await this.getTimeline(groupBy, options);
    const header = [
      'bucket_start',
      'resumes',
      'first_round_interviews',
      'second_round_interviews',
      'total_interviews',
      'rejects',
      'offers',
      'avg_case_score',
      'avg_fit_score',
      'female_share'
    ];
    const lines = [header.join(',')];

    for (const point of timeline.points) {
      lines.push(
        [
          point.bucket,
          String(point.resumes),
          String(point.firstRoundInterviews),
          String(point.secondRoundInterviews),
          String(point.totalInterviews),
          String(point.rejects),
          String(point.offers),
          point.avgCaseScore == null ? '' : point.avgCaseScore.toFixed(2),
          point.avgFitScore == null ? '' : point.avgFitScore.toFixed(2),
          point.femaleShare == null ? '' : point.femaleShare.toFixed(4)
        ].join(',')
      );
    }

    return lines.join('\n');
  }

  async exportInterviewers(
    period: InterviewerPeriodKey,
    options: {
      interviewerIds?: string[];
      roles?: string[];
      groupBy?: TimelineGrouping;
      from?: string;
      to?: string;
    } = {}
  ): Promise<string> {
    const stats = await this.getInterviewerStats(period, options);
    const header = [
      'interviewer_id',
      'interviewer_name',
      'interviewer_email',
      'interviewer_role',
      'bucket_start',
      'interview_count',
      'avg_case_score',
      'avg_fit_score',
      'case_score_count',
      'fit_score_count',
      'hire_recommendations',
      'reject_recommendations'
    ];
    const lines = [header.join(',')];

    for (const bucket of stats.buckets) {
      lines.push(
        [
          csvEscape(bucket.interviewerId),
          csvEscape(bucket.interviewerName),
          csvEscape(bucket.interviewerEmail),
          bucket.interviewerRole ?? '',
          bucket.bucket,
          String(bucket.interviewCount),
          bucket.avgCaseScore == null ? '' : bucket.avgCaseScore.toFixed(2),
          bucket.avgFitScore == null ? '' : bucket.avgFitScore.toFixed(2),
          String(bucket.caseScoreCount),
          String(bucket.fitScoreCount),
          String(bucket.hireRecommendations),
          String(bucket.rejectRecommendations)
        ].join(',')
      );
    }

    return lines.join('\n');
  }
}
