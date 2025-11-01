import { apiRequest } from '../../../shared/api/httpClient';
import {
  EvaluationConfig,
  EvaluationProcessStatus,
  InterviewSlot,
  InterviewStatusRecord,
  EvaluationCriterionScore,
  EvaluationRoundSnapshot,
  EvaluationInvitationState,
  InvitationSlotState,
  InvitationDeliveryReport,
  InvitationDeliveryFailure,
  OfferDecisionStatus
} from '../../../shared/types/evaluation';

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
};

const normalizeIsoString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const normalizeNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const normalizeBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }
  return undefined;
};

const normalizeScore = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const normalizeDecision = (
  value: unknown
): EvaluationConfig['decision'] | undefined => {
  if (value === 'offer' || value === 'accepted-offer' || value === 'reject' || value === 'progress') {
    return value;
  }
  if (value === null) {
    return null;
  }
  return undefined;
};

const normalizeOfferDecisionStatus = (
  value: unknown
): OfferDecisionStatus | null | undefined => {
  if (
    value === 'pending' ||
    value === 'accepted' ||
    value === 'accepted-co' ||
    value === 'declined' ||
    value === 'declined-co'
  ) {
    return value;
  }
  if (value === null) {
    return null;
  }
  return undefined;
};

const normalizeRoundHistory = (value: unknown): EvaluationRoundSnapshot[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const rounds: EvaluationRoundSnapshot[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const payload = entry as Record<string, unknown>;
    const roundNumber = normalizeNumber(payload.roundNumber);
    if (typeof roundNumber !== 'number' || !Number.isFinite(roundNumber) || roundNumber <= 0) {
      continue;
    }
    const interviews = Array.isArray(payload.interviews)
      ? payload.interviews
          .map((item) => normalizeSlot(item))
          .filter((slot): slot is InterviewSlot => Boolean(slot))
      : [];
    const forms = Array.isArray(payload.forms)
      ? payload.forms
          .map((item) => normalizeForm(item))
          .filter((form): form is InterviewStatusRecord => Boolean(form))
      : [];
    rounds.push({
      roundNumber,
      interviewCount: normalizeNumber(payload.interviewCount) ?? interviews.length,
      interviews,
      forms,
      fitQuestionId: normalizeString(payload.fitQuestionId)?.trim() || undefined,
      processStatus: (normalizeString(payload.processStatus) as EvaluationProcessStatus | undefined) ?? 'draft',
      processStartedAt: normalizeIsoString(payload.processStartedAt),
      completedAt: normalizeIsoString(payload.completedAt),
      createdAt: normalizeIsoString(payload.createdAt) ?? new Date().toISOString(),
      decision: normalizeDecision(payload.decision),
      offerDecisionStatus:
        normalizeOfferDecisionStatus(payload.offerDecisionStatus) ?? ('pending' as OfferDecisionStatus)
    });
  }
  return rounds.sort((a, b) => a.roundNumber - b.roundNumber);
};

const normalizeInvitationSlot = (value: unknown): InvitationSlotState | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const slotId = normalizeString(payload.slotId)?.trim();
  if (!slotId) {
    return null;
  }
  const status = normalizeString(payload.status);
  const allowedStatuses: InvitationSlotState['status'][] = ['pending', 'delivered', 'stale', 'failed', 'unassigned'];
  const resolvedStatus = allowedStatuses.includes(status as InvitationSlotState['status'])
    ? (status as InvitationSlotState['status'])
    : 'pending';
  return {
    slotId,
    interviewerName: normalizeString(payload.interviewerName) ?? 'Interviewer',
    interviewerEmail: normalizeString(payload.interviewerEmail) ?? '',
    status: resolvedStatus,
    invitationSentAt: normalizeIsoString(payload.invitationSentAt) ?? null,
    lastDeliveryAttemptAt: normalizeIsoString(payload.lastDeliveryAttemptAt) ?? null,
    lastDeliveryErrorCode: normalizeString(payload.lastDeliveryErrorCode)?.trim() || null,
    lastDeliveryError: normalizeString(payload.lastDeliveryError)?.trim() || null
  };
};

const normalizeInvitationState = (value: unknown): EvaluationInvitationState => {
  if (!value || typeof value !== 'object') {
    return { hasInvitations: false, hasPendingChanges: true, slots: [] };
  }
  const payload = value as Record<string, unknown>;
  const hasInvitations = typeof payload.hasInvitations === 'boolean' ? payload.hasInvitations : false;
  const hasPendingChanges =
    typeof payload.hasPendingChanges === 'boolean' ? payload.hasPendingChanges : !hasInvitations;
  const lastSentAt = normalizeIsoString(payload.lastSentAt) ?? undefined;
  const slots = Array.isArray(payload.slots)
    ? payload.slots
        .map((slot) => normalizeInvitationSlot(slot))
        .filter((slot): slot is InvitationSlotState => Boolean(slot))
    : [];
  return { hasInvitations, hasPendingChanges, lastSentAt, slots };
};

const normalizeSlot = (value: unknown): InterviewSlot | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Partial<InterviewSlot> & {
    id?: unknown;
    interviewerName?: unknown;
    interviewerEmail?: unknown;
    caseFolderId?: unknown;
    fitQuestionId?: unknown;
  };

  const id = normalizeString(payload.id)?.trim();
  if (!id) {
    return null;
  }

  return {
    id,
    interviewerName: normalizeString(payload.interviewerName) ?? 'Interviewer',
    interviewerEmail: normalizeString(payload.interviewerEmail) ?? '',
    caseFolderId: normalizeString(payload.caseFolderId)?.trim() || undefined,
    fitQuestionId: normalizeString(payload.fitQuestionId)?.trim() || undefined
  };
};

const normalizeCriterion = (value: unknown): EvaluationCriterionScore | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const criterionId = normalizeString(payload.criterionId)?.trim();
  if (!criterionId) {
    return null;
  }
  const rawScore = payload.score;
  let score: number | undefined;
  if (typeof rawScore === 'number' && Number.isFinite(rawScore)) {
    score = rawScore;
  } else if (typeof rawScore === 'string' && rawScore.trim()) {
    const parsed = Number(rawScore);
    if (!Number.isNaN(parsed)) {
      score = parsed;
    }
  }
  const notApplicable = payload.notApplicable === true;
  return { criterionId, score, notApplicable };
};

const normalizeCriteriaList = (value: unknown): EvaluationCriterionScore[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeCriterion(item))
    .filter((entry): entry is EvaluationCriterionScore => Boolean(entry));
};

const normalizeOfferRecommendation = (
  value: unknown
): InterviewStatusRecord['offerRecommendation'] | undefined => {
  if (value === 'yes_priority' || value === 'yes_strong' || value === 'yes_keep_warm' || value === 'no_offer') {
    return value;
  }
  return undefined;
};

const computePortalBaseUrl = (): string | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  try {
    return new URL('/interviewer', window.location.origin).toString();
  } catch {
    return window.location.origin;
  }
};

const normalizeForm = (value: unknown): InterviewStatusRecord | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Partial<InterviewStatusRecord> & {
    slotId?: unknown;
    interviewerName?: unknown;
    submitted?: unknown;
    submittedAt?: unknown;
    notes?: unknown;
  };

  const slotId = normalizeString(payload.slotId)?.trim();
  if (!slotId) {
    return null;
  }

  return {
    slotId,
    interviewerName: normalizeString(payload.interviewerName) ?? 'Interviewer',
    submitted: normalizeBoolean(payload.submitted) ?? false,
    submittedAt: normalizeIsoString(payload.submittedAt),
    notes: normalizeString(payload.notes) ?? undefined,
    fitScore: normalizeScore(payload.fitScore),
    caseScore: normalizeScore(payload.caseScore),
    fitNotes: normalizeString(payload.fitNotes) ?? undefined,
    caseNotes: normalizeString(payload.caseNotes) ?? undefined,
    fitCriteria: normalizeCriteriaList(payload.fitCriteria),
    caseCriteria: normalizeCriteriaList(payload.caseCriteria),
    interestNotes: normalizeString(payload.interestNotes) ?? undefined,
    issuesToTest: normalizeString(payload.issuesToTest) ?? undefined,
    offerRecommendation: normalizeOfferRecommendation(payload.offerRecommendation)
  };
};

const normalizeEvaluation = (value: unknown): EvaluationConfig | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const payload = value as Partial<EvaluationConfig> & {
    id?: unknown;
    candidateId?: unknown;
    roundNumber?: unknown;
    interviewCount?: unknown;
    interviews?: unknown;
    fitQuestionId?: unknown;
    version?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    forms?: unknown;
    processStatus?: unknown;
    processStartedAt?: unknown;
    roundHistory?: unknown;
    invitationState?: unknown;
  };

  const id = normalizeString(payload.id)?.trim();
  const version = normalizeNumber(payload.version);
  const createdAt = normalizeIsoString(payload.createdAt);
  const updatedAt = normalizeIsoString(payload.updatedAt);

  if (!id || version === undefined || !createdAt || !updatedAt) {
    return null;
  }

  const interviews = Array.isArray(payload.interviews)
    ? payload.interviews
        .map((item) => normalizeSlot(item))
        .filter((slot): slot is InterviewSlot => Boolean(slot))
    : [];

  const forms = Array.isArray(payload.forms)
    ? payload.forms
        .map((item) => normalizeForm(item))
        .filter((form): form is InterviewStatusRecord => Boolean(form))
    : [];

  return {
    id,
    candidateId: normalizeString(payload.candidateId)?.trim() || undefined,
    roundNumber: normalizeNumber(payload.roundNumber),
    interviewCount: normalizeNumber(payload.interviewCount) ?? interviews.length,
    interviews,
    fitQuestionId: normalizeString(payload.fitQuestionId)?.trim() || undefined,
    version,
    createdAt,
    updatedAt,
    forms,
    processStatus: (normalizeString(payload.processStatus) as EvaluationProcessStatus | undefined) ?? 'draft',
    processStartedAt: normalizeIsoString(payload.processStartedAt),
    roundHistory: normalizeRoundHistory(payload.roundHistory),
    invitationState: normalizeInvitationState(payload.invitationState),
    decision: normalizeDecision(payload.decision),
    offerDecisionStatus:
      normalizeOfferDecisionStatus(payload.offerDecisionStatus) === undefined
        ? ('pending' as OfferDecisionStatus)
        : normalizeOfferDecisionStatus(payload.offerDecisionStatus) ?? null
  };
};

const ensureEvaluation = (value: unknown): EvaluationConfig => {
  const evaluation = normalizeEvaluation(value);
  if (!evaluation) {
    throw new Error('Failed to parse evaluation payload.');
  }
  return evaluation;
};

const ensureEvaluationList = (value: unknown): EvaluationConfig[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeEvaluation(item))
    .filter((evaluation): evaluation is EvaluationConfig => Boolean(evaluation));
};

const ensureSendInvitationsResult = (
  value: unknown
): { evaluation: EvaluationConfig; deliveryReport: InvitationDeliveryReport } => {
  if (!value || typeof value !== 'object') {
    throw new Error('Failed to parse send invitations result.');
  }
  const payload = value as { evaluation?: unknown; deliveryReport?: unknown };
  const evaluation = ensureEvaluation(payload.evaluation);
  const deliveryReport = normalizeDeliveryReport(payload.deliveryReport);
  return { evaluation, deliveryReport };
};

const normalizeDeliveryFailure = (value: unknown): InvitationDeliveryFailure | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const slotId = normalizeString(payload.slotId)?.trim();
  if (!slotId) {
    return null;
  }
  return {
    slotId,
    errorCode: normalizeString(payload.errorCode)?.trim() || undefined,
    errorMessage: normalizeString(payload.errorMessage)?.trim() || undefined
  };
};

const normalizeDeliveryReport = (value: unknown): InvitationDeliveryReport => {
  if (!value || typeof value !== 'object') {
    return { sent: [], failed: [], skipped: [] };
  }
  const payload = value as Record<string, unknown>;
  const sent = Array.isArray(payload.sent)
    ? payload.sent
        .map((item) => normalizeString(item)?.trim())
        .filter((item): item is string => Boolean(item))
    : [];
  const skipped = Array.isArray(payload.skipped)
    ? payload.skipped
        .map((item) => normalizeString(item)?.trim())
        .filter((item): item is string => Boolean(item))
    : [];
  const failed = Array.isArray(payload.failed)
    ? payload.failed
        .map((item) => normalizeDeliveryFailure(item))
        .filter((item): item is InvitationDeliveryFailure => Boolean(item))
    : [];
  return { sent, failed, skipped };
};

const serializeRoundHistory = (history: EvaluationRoundSnapshot[]) =>
  history.map((round) => ({
    ...round,
    fitQuestionId: round.fitQuestionId ?? null,
    processStartedAt: round.processStartedAt ?? null,
    completedAt: round.completedAt ?? null,
    decision: round.decision ?? null,
    offerDecisionStatus: round.offerDecisionStatus ?? null,
    interviews: round.interviews.map((slot) => ({
      ...slot,
      caseFolderId: slot.caseFolderId ?? null,
      fitQuestionId: slot.fitQuestionId ?? null
    })),
    forms: round.forms.map((form) => ({
      ...form,
      submittedAt: form.submittedAt ?? null,
      notes: form.notes ?? null,
      fitCriteria: Array.isArray(form.fitCriteria)
        ? form.fitCriteria.map((criterion) => ({
            criterionId: criterion.criterionId,
            score: typeof criterion.score === 'number' ? criterion.score : null,
            notApplicable: criterion.notApplicable === true
          }))
        : [],
      caseCriteria: Array.isArray(form.caseCriteria)
        ? form.caseCriteria.map((criterion) => ({
            criterionId: criterion.criterionId,
            score: typeof criterion.score === 'number' ? criterion.score : null,
            notApplicable: criterion.notApplicable === true
          }))
        : [],
      interestNotes: form.interestNotes ?? null,
      issuesToTest: form.issuesToTest ?? null,
      offerRecommendation: form.offerRecommendation ?? null
    }))
  }));

const serializeEvaluation = (config: EvaluationConfig) => ({
  id: config.id,
  candidateId: config.candidateId ?? null,
  roundNumber: config.roundNumber ?? null,
  interviewCount: config.interviewCount,
  interviews: config.interviews.map((slot) => ({
    ...slot,
    caseFolderId: slot.caseFolderId ?? null,
    fitQuestionId: slot.fitQuestionId ?? null
  })),
  fitQuestionId: config.fitQuestionId ?? null,
  forms: config.forms.map((form) => ({
    ...form,
    submittedAt: form.submittedAt ?? null,
    notes: form.notes ?? null,
    fitCriteria: Array.isArray(form.fitCriteria)
      ? form.fitCriteria.map((criterion) => ({
          criterionId: criterion.criterionId,
          score: typeof criterion.score === 'number' ? criterion.score : null,
          notApplicable: criterion.notApplicable === true
        }))
      : [],
    caseCriteria: Array.isArray(form.caseCriteria)
      ? form.caseCriteria.map((criterion) => ({
          criterionId: criterion.criterionId,
          score: typeof criterion.score === 'number' ? criterion.score : null,
          notApplicable: criterion.notApplicable === true
        }))
      : [],
    interestNotes: form.interestNotes ?? null,
    issuesToTest: form.issuesToTest ?? null,
    offerRecommendation: form.offerRecommendation ?? null
  })),
  processStatus: config.processStatus,
  processStartedAt: config.processStartedAt ?? null,
  roundHistory: serializeRoundHistory(config.roundHistory),
  decision: config.decision ?? null,
  offerDecisionStatus:
    config.offerDecisionStatus === undefined
      ? 'pending'
      : config.offerDecisionStatus ?? null
});

export const evaluationsApi = {
  list: async () => ensureEvaluationList(await apiRequest<unknown>('/evaluations')),
  create: async (config: EvaluationConfig) =>
    ensureEvaluation(
      await apiRequest<unknown>('/evaluations', {
        method: 'POST',
        body: { config: serializeEvaluation(config) }
      })
    ),
  update: async (id: string, config: EvaluationConfig, expectedVersion: number) =>
    ensureEvaluation(
      await apiRequest<unknown>(`/evaluations/${id}`, {
        method: 'PUT',
        body: { config: serializeEvaluation(config), expectedVersion }
      })
    ),
  start: async (id: string) =>
    apiRequest<{ id: string }>(`/evaluations/${id}/start`, {
      method: 'POST',
      body: { portalBaseUrl: computePortalBaseUrl() }
    }),
  sendInvitations: async (id: string, slotIds?: string[]) => {
    const payload: Record<string, unknown> = { portalBaseUrl: computePortalBaseUrl() };
    if (Array.isArray(slotIds) && slotIds.length > 0) {
      payload.slotIds = slotIds;
    }
    return ensureSendInvitationsResult(
      await apiRequest<unknown>(`/evaluations/${id}/invitations`, {
        method: 'POST',
        body: payload
      })
    );
  },
  advance: async (id: string) =>
    ensureEvaluation(
      await apiRequest<unknown>(`/evaluations/${id}/advance`, {
        method: 'POST'
      })
    ),
  setDecision: async (id: string, decision: 'offer' | 'reject' | null, expectedVersion: number) =>
    ensureEvaluation(
      await apiRequest<unknown>(`/evaluations/${id}/decision`, {
        method: 'POST',
        body: { decision, expectedVersion }
      })
    ),
  setOfferStatus: async (id: string, status: OfferDecisionStatus, expectedVersion: number) =>
    ensureEvaluation(
      await apiRequest<unknown>(`/evaluations/${id}/decision-status`, {
        method: 'POST',
        body: { status, expectedVersion }
      })
    ),
  remove: async (id: string) =>
    apiRequest<{ id?: unknown }>(`/evaluations/${id}`, {
      method: 'DELETE'
    }).then((result) => (typeof result.id === 'string' ? result.id : id))
};
