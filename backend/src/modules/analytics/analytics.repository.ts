import { postgresPool } from '../../shared/database/postgres.client.js';
import type {
  AssignmentSnapshotRow,
  CandidateSnapshotRow,
  EvaluationSnapshotRow
} from './analytics.types.js';
import type {
  EvaluationCriterionScore,
  EvaluationRoundSnapshot,
  InterviewSlotModel,
  InterviewStatusModel
} from '../evaluations/evaluations.types.js';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseIsoDate = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const parseBoolean = (value: unknown): boolean => value === true;

const parseCriterionList = (value: unknown): EvaluationCriterionScore[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const list: EvaluationCriterionScore[] = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) {
      continue;
    }
    const criterionId = typeof entry.criterionId === 'string' ? entry.criterionId.trim() : '';
    if (!criterionId) {
      continue;
    }
    const score = parseNumber(entry.score) ?? undefined;
    const notApplicable = entry.notApplicable === true;
    list.push({ criterionId, score, notApplicable });
  }
  return list;
};

const parseForm = (value: unknown): InterviewStatusModel | null => {
  if (!isPlainObject(value)) {
    return null;
  }
  const slotId = typeof value.slotId === 'string' ? value.slotId.trim() : '';
  if (!slotId) {
    return null;
  }
  const submittedAt = parseIsoDate(value.submittedAt) ?? undefined;
  const submitted = parseBoolean(value.submitted);
  const fitScore = parseNumber(value.fitScore) ?? undefined;
  const caseScore = parseNumber(value.caseScore) ?? undefined;
  const interviewerName = typeof value.interviewerName === 'string' ? value.interviewerName : 'Interviewer';
  const notes = typeof value.notes === 'string' ? value.notes : undefined;
  const fitNotes = typeof value.fitNotes === 'string' ? value.fitNotes : undefined;
  const caseNotes = typeof value.caseNotes === 'string' ? value.caseNotes : undefined;
  const offerRecommendation =
    value.offerRecommendation === 'yes_priority' ||
    value.offerRecommendation === 'yes_strong' ||
    value.offerRecommendation === 'yes_keep_warm' ||
    value.offerRecommendation === 'no_offer'
      ? value.offerRecommendation
      : undefined;

  return {
    slotId,
    interviewerName,
    submitted,
    submittedAt,
    notes,
    fitScore,
    caseScore,
    fitNotes,
    caseNotes,
    fitCriteria: parseCriterionList(value.fitCriteria),
    caseCriteria: parseCriterionList(value.caseCriteria),
    interestNotes: typeof value.interestNotes === 'string' ? value.interestNotes : undefined,
    issuesToTest: typeof value.issuesToTest === 'string' ? value.issuesToTest : undefined,
    offerRecommendation
  };
};

const parseFormList = (value: unknown): InterviewStatusModel[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => parseForm(entry)).filter((form): form is InterviewStatusModel => Boolean(form));
};

const parseSlot = (value: unknown): InterviewSlotModel | null => {
  if (!isPlainObject(value)) {
    return null;
  }
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  if (!id) {
    return null;
  }
  const interviewerName = typeof value.interviewerName === 'string' ? value.interviewerName : 'Interviewer';
  const interviewerEmail = typeof value.interviewerEmail === 'string' ? value.interviewerEmail : '';
  const result: InterviewSlotModel = { id, interviewerName, interviewerEmail };
  const caseFolderId = typeof value.caseFolderId === 'string' ? value.caseFolderId.trim() : '';
  if (caseFolderId) {
    result.caseFolderId = caseFolderId;
  }
  const fitQuestionId = typeof value.fitQuestionId === 'string' ? value.fitQuestionId.trim() : '';
  if (fitQuestionId) {
    result.fitQuestionId = fitQuestionId;
  }
  return result;
};

const parseSlotList = (value: unknown): InterviewSlotModel[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const slots: InterviewSlotModel[] = [];
  for (const entry of value) {
    const slot = parseSlot(entry);
    if (slot) {
      slots.push(slot);
    }
  }
  return slots;
};

const parseRound = (value: unknown): EvaluationRoundSnapshot | null => {
  if (!isPlainObject(value)) {
    return null;
  }
  const roundNumber = parseNumber(value.roundNumber);
  if (!roundNumber || !Number.isInteger(roundNumber) || roundNumber <= 0) {
    return null;
  }
  const interviewCount = parseNumber(value.interviewCount) ?? undefined;
  const processStatus =
    value.processStatus === 'draft' || value.processStatus === 'in-progress' || value.processStatus === 'completed'
      ? value.processStatus
      : 'draft';
  const decision =
    value.decision === 'offer' ||
    value.decision === 'accepted-offer' ||
    value.decision === 'reject' ||
    value.decision === 'progress' ||
    value.decision === null
      ? value.decision ?? undefined
      : undefined;
  let decisionStatus: EvaluationRoundSnapshot['offerDecisionStatus'];
  if (
    value.offerDecisionStatus === 'pending' ||
    value.offerDecisionStatus === 'accepted' ||
    value.offerDecisionStatus === 'accepted-co' ||
    value.offerDecisionStatus === 'declined' ||
    value.offerDecisionStatus === 'declined-co'
  ) {
    decisionStatus = value.offerDecisionStatus;
  } else if (value.offerDecisionStatus === null) {
    decisionStatus = null;
  }
  return {
    roundNumber,
    interviewCount: interviewCount ?? parseFormList(value.forms).length,
    interviews: parseSlotList(value.interviews),
    forms: parseFormList(value.forms),
    fitQuestionId: typeof value.fitQuestionId === 'string' ? value.fitQuestionId : undefined,
    processStatus,
    processStartedAt: parseIsoDate(value.processStartedAt) ?? undefined,
    completedAt: parseIsoDate(value.completedAt) ?? undefined,
    createdAt: parseIsoDate(value.createdAt) ?? new Date().toISOString(),
    decision,
    offerDecisionStatus: decisionStatus
  };
};

const parseRoundHistory = (value: unknown): EvaluationRoundSnapshot[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => parseRound(entry))
    .filter((round): round is EvaluationRoundSnapshot => Boolean(round))
    .sort((a, b) => a.roundNumber - b.roundNumber);
};

export class AnalyticsRepository {
  async listCandidates(): Promise<CandidateSnapshotRow[]> {
    const result = await postgresPool.query<{
      id: string;
      created_at: Date;
      gender: string | null;
    }>(
      `SELECT id, created_at, gender FROM candidates`
    );

    return result.rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at.toISOString(),
      gender: row.gender
    }));
  }

  async listEvaluations(): Promise<EvaluationSnapshotRow[]> {
    const result = await postgresPool.query<{
      id: string;
      candidate_id: string | null;
      created_at: Date;
      updated_at: Date;
      decision: string | null;
      decision_status: string | null;
      round_history: unknown;
      forms: unknown;
    }>(
      `SELECT id,
              candidate_id,
              created_at,
              updated_at,
              decision,
              decision_status,
              round_history,
              forms
         FROM evaluations`
    );

    return result.rows.map((row) => ({
      id: row.id,
      candidateId: row.candidate_id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      decision:
        row.decision === 'offer' ||
        row.decision === 'accepted-offer' ||
        row.decision === 'reject' ||
        row.decision === 'progress'
          ? row.decision
          : row.decision === null
          ? null
          : null,
      offerDecisionStatus:
        row.decision_status === 'pending' ||
        row.decision_status === 'accepted' ||
        row.decision_status === 'accepted-co' ||
        row.decision_status === 'declined' ||
        row.decision_status === 'declined-co'
          ? row.decision_status
          : row.decision_status === null
            ? null
            : null,
      roundHistory: parseRoundHistory(row.round_history),
      forms: parseFormList(row.forms)
    }));
  }

  async listAssignments(): Promise<AssignmentSnapshotRow[]> {
    const result = await postgresPool.query<{
      evaluation_id: string;
      slot_id: string;
      interviewer_email: string;
      interviewer_name: string;
      interviewer_role: string | null;
      round_number: number;
      created_at: Date;
      invitation_sent_at: Date | null;
    }>(
      `SELECT ea.evaluation_id,
              ea.slot_id,
              ea.interviewer_email,
              ea.interviewer_name,
              acc.interviewer_role,
              ea.round_number,
              ea.created_at,
              ea.invitation_sent_at
         FROM evaluation_assignments ea
         LEFT JOIN accounts acc ON acc.email = ea.interviewer_email`
    );

    return result.rows.map((row) => ({
      evaluationId: row.evaluation_id,
      slotId: row.slot_id,
      interviewerEmail: row.interviewer_email,
      interviewerName: row.interviewer_name,
      interviewerRole: row.interviewer_role,
      roundNumber: row.round_number,
      createdAt: row.created_at.toISOString(),
      invitationSentAt: row.invitation_sent_at ? row.invitation_sent_at.toISOString() : null
    }));
  }
}
