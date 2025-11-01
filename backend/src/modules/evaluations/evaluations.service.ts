import { EvaluationsRepository } from './evaluations.repository.js';
import { EvaluationRecord, EvaluationRoundSnapshot, EvaluationWriteModel } from './evaluations.types.js';
import { computeInvitationState } from './evaluationAssignments.utils.js';

const readOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const readOptionalPositiveInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
};

const readOptionalPositiveScore = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value * 10) / 10;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed * 10) / 10;
    }
  }
  return undefined;
};

const readOptionalIsoDate = (value: unknown): string | undefined => {
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

const readDecision = (value: unknown): EvaluationRecord['decision'] | undefined => {
  if (
    value === 'offer' ||
    value === 'accepted-offer' ||
    value === 'reject' ||
    value === 'progress'
  ) {
    return value;
  }
  if (value === null) {
    return null;
  }
  return undefined;
};

const readOfferDecisionStatus = (
  value: unknown
): EvaluationRecord['offerDecisionStatus'] | undefined => {
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

const sanitizeSlots = (value: unknown): EvaluationWriteModel['interviews'] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('INVALID_INPUT');
    }
    const payload = entry as Record<string, unknown>;
    const id = readOptionalString(payload.id);
    if (!id) {
      throw new Error('INVALID_INPUT');
    }
    const interviewerName = readOptionalString(payload.interviewerName) ?? 'Interviewer';
    const interviewerEmail = readOptionalString(payload.interviewerEmail) ?? '';
    const caseFolderId = readOptionalString(payload.caseFolderId);
    const fitQuestionId = readOptionalString(payload.fitQuestionId);

    return {
      id,
      interviewerName,
      interviewerEmail,
      caseFolderId,
      fitQuestionId
    };
  });
};

const sanitizeForms = (
  value: unknown,
  allowedSlotIds: Set<string>
): EvaluationWriteModel['forms'] => {
  if (!Array.isArray(value)) {
    return [];
  }

    const sanitizeCriteria = (input: unknown): EvaluationWriteModel['forms'][number]['fitCriteria'] => {
      if (!Array.isArray(input)) {
        return [];
      }
      const result: EvaluationWriteModel['forms'][number]['fitCriteria'] = [];
      for (const entry of input) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const payload = entry as Record<string, unknown>;
      const criterionId = readOptionalString(payload.criterionId);
      if (!criterionId) {
        continue;
        }
        const score = readOptionalPositiveScore(payload.score);
        const notApplicable = payload.notApplicable === true;
        result.push({ criterionId, score, notApplicable });
      }
      return result;
    };

  const sanitizeOfferRecommendation = (
    input: unknown
  ): EvaluationWriteModel['forms'][number]['offerRecommendation'] | undefined => {
    if (input === 'yes_priority' || input === 'yes_strong' || input === 'yes_keep_warm' || input === 'no_offer') {
      return input;
    }
    return undefined;
  };

  const forms: EvaluationWriteModel['forms'] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const payload = entry as Record<string, unknown>;
    const slotId = readOptionalString(payload.slotId);
    if (!slotId || !allowedSlotIds.has(slotId)) {
      continue;
    }
    const interviewerName = readOptionalString(payload.interviewerName) ?? 'Interviewer';
    const submitted = typeof payload.submitted === 'boolean' ? payload.submitted : false;
    const submittedAt = readOptionalIsoDate(payload.submittedAt);
    const notes = readOptionalString(payload.notes);
    const fitScore = readOptionalPositiveScore(payload.fitScore);
    const caseScore = readOptionalPositiveScore(payload.caseScore);
    const fitNotes = readOptionalString(payload.fitNotes);
    const caseNotes = readOptionalString(payload.caseNotes);

    forms.push({
      slotId,
      interviewerName,
      submitted,
      submittedAt,
      notes,
      fitScore,
      caseScore,
      fitNotes,
      caseNotes,
      fitCriteria: sanitizeCriteria(payload.fitCriteria),
      caseCriteria: sanitizeCriteria(payload.caseCriteria),
      interestNotes: readOptionalString(payload.interestNotes),
      issuesToTest: readOptionalString(payload.issuesToTest),
      offerRecommendation: sanitizeOfferRecommendation(payload.offerRecommendation)
    });
  }
  return forms;
};

const sanitizeRoundHistory = (value: unknown): EvaluationRoundSnapshot[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const history: EvaluationRoundSnapshot[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const payload = entry as Record<string, unknown>;
    const roundNumber = readOptionalPositiveInteger(payload.roundNumber);
    if (!roundNumber) {
      continue;
    }
    const interviews = sanitizeSlots(payload.interviews);
    const slotIds = new Set(interviews.map((slot) => slot.id));
    const forms = sanitizeForms(payload.forms, slotIds);
    history.push({
      roundNumber,
      interviewCount: interviews.length,
      interviews,
      forms,
      fitQuestionId: readOptionalString(payload.fitQuestionId),
      processStatus: readProcessStatus(payload.processStatus),
      processStartedAt: readOptionalIsoDate(payload.processStartedAt),
      completedAt: readOptionalIsoDate(payload.completedAt),
      createdAt: readOptionalIsoDate(payload.createdAt) ?? new Date().toISOString(),
      decision: readDecision(payload.decision),
      offerDecisionStatus: readOfferDecisionStatus(payload.offerDecisionStatus) ?? null
    });
  }

  return history.sort((a, b) => a.roundNumber - b.roundNumber);
};

const readProcessStatus = (value: unknown): EvaluationRecord['processStatus'] => {
  if (value === 'in-progress' || value === 'completed' || value === 'draft') {
    return value;
  }
  return 'draft';
};

const ensurePositiveInteger = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
};

const buildWriteModel = (payload: unknown): EvaluationWriteModel => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('INVALID_INPUT');
  }

  const source = payload as Record<string, unknown>;
  const id = readOptionalString(source.id);
  if (!id) {
    throw new Error('INVALID_INPUT');
  }

  const interviews = sanitizeSlots(source.interviews);
  if (interviews.length === 0) {
    throw new Error('INVALID_INPUT');
  }

  const slotIds = new Set(interviews.map((slot) => slot.id));
  const forms = sanitizeForms(source.forms, slotIds);
  const roundHistory = sanitizeRoundHistory(source.roundHistory);
  const rawProcessStarted = (source as Record<string, unknown>).processStartedAt;
  const processStartedAt =
    rawProcessStarted === null ? null : readOptionalIsoDate(rawProcessStarted);

  return {
    id,
    candidateId: readOptionalString(source.candidateId),
    roundNumber: readOptionalPositiveInteger(source.roundNumber),
    interviewCount: interviews.length,
    interviews,
    fitQuestionId: readOptionalString(source.fitQuestionId),
    forms,
    processStatus: readProcessStatus(source.processStatus),
    processStartedAt,
    roundHistory,
    decision: readDecision(source.decision) ?? null,
    offerDecisionStatus: readOfferDecisionStatus(source.offerDecisionStatus) ?? 'pending'
  };
};


export class EvaluationsService {
  constructor(private readonly repository: EvaluationsRepository) {}

  private async attachInvitationState(record: EvaluationRecord): Promise<EvaluationRecord> {
    const assignments = await this.repository.listAssignmentsForEvaluation(record.id);
    const invitationState = computeInvitationState(record, assignments);
    return { ...record, invitationState };
  }

  async listEvaluations(): Promise<EvaluationRecord[]> {
    const evaluations = await this.repository.listEvaluations();
    return Promise.all(evaluations.map((record) => this.attachInvitationState(record)));
  }

  async createEvaluation(payload: unknown): Promise<EvaluationRecord> {
    const model = buildWriteModel(payload);
    const record = await this.repository.createEvaluation(model);
    return this.attachInvitationState(record);
  }

  async updateEvaluation(
    id: string,
    payload: unknown,
    expectedVersion: number
  ): Promise<EvaluationRecord> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }

    const version = ensurePositiveInteger(expectedVersion);
    if (version === null) {
      throw new Error('INVALID_INPUT');
    }

    const model = buildWriteModel(payload);
    model.id = trimmed;

    const result = await this.repository.updateEvaluation(model, version);
    if (result === 'version-conflict') {
      throw new Error('VERSION_CONFLICT');
    }
    if (!result) {
      throw new Error('NOT_FOUND');
    }
    return this.attachInvitationState(result);
  }

  async deleteEvaluation(id: string): Promise<string> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }
    const deleted = await this.repository.deleteEvaluation(trimmed);
    if (!deleted) {
      throw new Error('NOT_FOUND');
    }
    return trimmed;
  }
}
