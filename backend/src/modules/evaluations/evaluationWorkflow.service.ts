import { randomUUID } from 'crypto';
import { MailerDeliveryError, MailerService, MAILER_NOT_CONFIGURED } from '../../shared/mailer.service.js';
import { EvaluationsRepository } from './evaluations.repository.js';
import {
  EvaluationRecord,
  EvaluationWriteModel,
  InterviewAssignmentModel,
  InterviewerAssignmentView,
  EvaluationCriterionScore,
  OfferRecommendationValue,
  InvitationDeliveryReport,
  InvitationDeliveryFailure,
  InterviewPeerFormView,
  EvaluationRoundSnapshot,
  InterviewStatusModel,
  OfferDecisionStatus
} from './evaluations.types.js';
import { computeInvitationState } from './evaluationAssignments.utils.js';
import type { AccountRecord } from '../accounts/accounts.types.js';
import type { AccountsService } from '../accounts/accounts.service.js';
import type { CandidatesService } from '../candidates/candidates.service.js';
import type { CasesService } from '../cases/cases.service.js';
import type { QuestionsService } from '../questions/questions.service.js';

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const resolvePortalBaseUrl = (override?: string): string => {
  const candidates = [override, process.env.INTERVIEW_PORTAL_URL].map((value) => value?.trim()).filter(Boolean) as string[];
  for (const value of candidates) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        continue;
      }
      return parsed.toString().replace(/\/$/, '');
    } catch {
      continue;
    }
  }
  throw new Error('INVALID_PORTAL_URL');
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const buildPortalLink = (baseUrl: string, evaluationId: string, slotId: string) => {
  const url = new URL(baseUrl);
  url.searchParams.set('evaluation', evaluationId);
  url.searchParams.set('slot', slotId);
  return url.toString();
};

const toTitleCase = (value: string): string =>
  value.replace(/\b\w+/g, (segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase());

const extractFirstName = (value: string | undefined | null): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const token = value.trim().split(/\s+/)[0] ?? '';
  if (!token) {
    return undefined;
  }
  return toTitleCase(token);
};

const deriveFirstNameFromEmail = (email: string | undefined): string | undefined => {
  if (typeof email !== 'string') {
    return undefined;
  }
  const localPart = email.split('@')[0] ?? '';
  const normalized = localPart.replace(/[._-]+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }
  return extractFirstName(normalized);
};

const collectFormsBySlot = (
  evaluation: EvaluationRecord | undefined,
  snapshot: EvaluationRoundSnapshot | undefined
): Map<string, InterviewStatusModel> => {
  const formEntries: InterviewStatusModel[] = [];
  if (snapshot?.forms?.length) {
    formEntries.push(...snapshot.forms);
  }
  if (evaluation?.forms?.length) {
    formEntries.push(...evaluation.forms);
  }
  return new Map(formEntries.map((form) => [form.slotId, form]));
};

const buildPeerForms = (
  evaluation: EvaluationRecord | undefined,
  snapshot: EvaluationRoundSnapshot | undefined
): InterviewPeerFormView[] => {
  if (!evaluation) {
    return [];
  }
  const interviews = snapshot?.interviews ?? evaluation.interviews ?? [];
  if (!interviews.length) {
    return [];
  }
  const formMap = collectFormsBySlot(evaluation, snapshot);
  return interviews.map((slot) => {
    const form = formMap.get(slot.id) ?? null;
    return {
      slotId: slot.id,
      interviewerName: slot.interviewerName || 'Interviewer',
      interviewerEmail: slot.interviewerEmail,
      submitted: Boolean(form?.submitted),
      form
    } satisfies InterviewPeerFormView;
  });
};

const buildWriteModelFromRecord = (record: EvaluationRecord): EvaluationWriteModel => ({
  id: record.id,
  candidateId: record.candidateId,
  roundNumber: record.roundNumber,
  interviewCount: record.interviewCount,
  interviews: record.interviews,
  fitQuestionId: record.fitQuestionId,
  forms: record.forms,
  processStatus: record.processStatus,
  processStartedAt: record.processStartedAt ?? null,
  roundHistory: record.roundHistory,
  decision: record.decision ?? null,
  offerDecisionStatus: record.offerDecisionStatus ?? 'pending'
});

const createEmptySlot = (): EvaluationRecord['interviews'][number] => ({
  id: randomUUID(),
  interviewerName: 'Interviewer',
  interviewerEmail: ''
});

const readScore = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const readCriteriaList = (value: unknown): EvaluationCriterionScore[] => {
  const result: EvaluationCriterionScore[] = [];
  const appendFromPayload = (payload: unknown, fallbackId?: string) => {
    if (payload && typeof payload === 'object') {
      const source = payload as Record<string, unknown>;
      const explicitId = typeof source.criterionId === 'string' ? source.criterionId.trim() : '';
      const criterionId = explicitId || (fallbackId ?? '');
      if (!criterionId) {
        return;
      }
      const scoreSource = explicitId ? source.score : source.score ?? source.value ?? payload;
      const scoreValue = readScore(scoreSource);
      const notApplicable = source.notApplicable === true;
      result.push({ criterionId, score: scoreValue, notApplicable });
      return;
    }
    if (!fallbackId) {
      return;
    }
    result.push({ criterionId: fallbackId, score: readScore(payload) });
  };

  if (Array.isArray(value)) {
    for (const entry of value) {
      appendFromPayload(entry);
    }
    return result;
  }

  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      appendFromPayload(entry, key);
    }
    return result;
  }

  return result;
};

const computeAverageFromCriteria = (criteria: EvaluationCriterionScore[]): number | undefined => {
  const numericScores = criteria
    .map((item) => (typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : null))
    .filter((value): value is number => value != null);
  if (!numericScores.length) {
    return undefined;
  }
  const sum = numericScores.reduce((total, current) => total + current, 0);
  return Math.round((sum / numericScores.length) * 10) / 10;
};

const readOfferRecommendation = (value: unknown): OfferRecommendationValue | undefined => {
  if (value === 'yes_priority' || value === 'yes_strong' || value === 'yes_keep_warm' || value === 'no_offer') {
    return value;
  }
  return undefined;
};

export class EvaluationWorkflowService {
  constructor(
    private readonly evaluations: EvaluationsRepository,
    private readonly accounts: AccountsService,
    private readonly candidates: CandidatesService,
    private readonly cases: CasesService,
    private readonly questions: QuestionsService,
    private readonly mailer = new MailerService()
  ) {}

  private async loadEvaluationWithState(id: string): Promise<EvaluationRecord> {
    const record = await this.evaluations.findEvaluation(id);
    if (!record) {
      throw new Error('NOT_FOUND');
    }
    const assignments = await this.evaluations.listAssignmentsForEvaluation(id);
    const invitationState = computeInvitationState(record, assignments);
    return { ...record, invitationState };
  }

  private buildAssignments(
    evaluation: EvaluationRecord,
    options?: { skipIncomplete?: boolean }
  ): InterviewAssignmentModel[] {
    if (!evaluation.interviews.length) {
      if (options?.skipIncomplete) {
        return [];
      }
      throw new Error('INVALID_INPUT');
    }
    const assignments: InterviewAssignmentModel[] = [];
    for (const slot of evaluation.interviews) {
      const email = slot.interviewerEmail?.trim().toLowerCase() ?? '';
      const caseId = slot.caseFolderId?.trim() ?? '';
      const questionId = slot.fitQuestionId?.trim() ?? '';
      const interviewerName = slot.interviewerName?.trim() || 'Interviewer';
      if (!email || !caseId || !questionId) {
        if (options?.skipIncomplete) {
          continue;
        }
        throw new Error('MISSING_ASSIGNMENT_DATA');
      }
      if (!this.isUuid(caseId) || !this.isUuid(questionId)) {
        if (options?.skipIncomplete) {
          continue;
        }
        throw new Error('INVALID_ASSIGNMENT_DATA');
      }
      assignments.push({
        slotId: slot.id,
        interviewerEmail: email,
        interviewerName,
        caseFolderId: caseId,
        fitQuestionId: questionId
      });
    }
    return assignments;
  }

  private isUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
  }

  private async ensureAccounts(assignments: InterviewAssignmentModel[]) {
    for (const assignment of assignments) {
      await this.accounts.ensureUserAccount(assignment.interviewerEmail, assignment.interviewerName);
    }
  }

  private resolveInterviewerFirstName(assignment: InterviewAssignmentModel, account: AccountRecord | null): string {
    const candidates = [
      extractFirstName(account?.firstName),
      extractFirstName(account?.name),
      extractFirstName(assignment.interviewerName),
      deriveFirstNameFromEmail(assignment.interviewerEmail)
    ];
    for (const candidate of candidates) {
      if (candidate) {
        return candidate;
      }
    }
    return 'Interviewer';
  }

  private async loadContext(assignments: InterviewAssignmentModel[], evaluation: EvaluationRecord) {
    const candidate = await this.loadCandidate(evaluation.candidateId);

    const uniqueCaseIds = Array.from(new Set(assignments.map((item) => item.caseFolderId)));
    const uniqueQuestionIds = Array.from(new Set(assignments.map((item) => item.fitQuestionId)));

    const caseMap = new Map<string, Awaited<ReturnType<CasesService['getFolder']>> | null>();
    for (const id of uniqueCaseIds) {
      const folder = await this.loadCaseFolder(id);
      caseMap.set(id, folder);
    }

    const questionMap = new Map<string, Awaited<ReturnType<QuestionsService['getQuestion']>> | null>();
    for (const id of uniqueQuestionIds) {
      const question = await this.loadFitQuestion(id);
      questionMap.set(id, question);
    }

    return { candidate, caseMap, questionMap };
  }

  private async loadCandidate(
    id: string | undefined
  ): Promise<Awaited<ReturnType<CandidatesService['getCandidate']>> | null> {
    if (!id) {
      return null;
    }
    try {
      return await this.candidates.getCandidate(id);
    } catch (error) {
      if (this.isMissingResourceError(error)) {
        console.warn('Не удалось загрузить кандидата для интервью', id, error);
        return null;
      }
      throw error;
    }
  }

  private async loadCaseFolder(
    id: string
  ): Promise<Awaited<ReturnType<CasesService['getFolder']>> | null> {
    try {
      return await this.cases.getFolder(id);
    } catch (error) {
      if (this.isMissingResourceError(error) || this.isInvalidUuidError(error)) {
        console.warn('Не удалось загрузить кейс для интервью', id, error);
        return null;
      }
      throw error;
    }
  }

  private async loadFitQuestion(
    id: string
  ): Promise<Awaited<ReturnType<QuestionsService['getQuestion']>> | null> {
    try {
      return await this.questions.getQuestion(id);
    } catch (error) {
      if (this.isMissingResourceError(error) || this.isInvalidUuidError(error)) {
        console.warn('Не удалось загрузить fit-вопрос для интервью', id, error);
        return null;
      }
      throw error;
    }
  }

  private isMissingResourceError(error: unknown): boolean {
    return error instanceof Error && (error.message === 'NOT_FOUND' || error.message === 'INVALID_INPUT');
  }

  private isInvalidUuidError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const withCode = error as { code?: unknown };
    if (withCode.code === '22P02') {
      return true;
    }
    return /invalid input syntax for type uuid/i.test(error.message);
  }

  private ensureContextResources(
    assignments: InterviewAssignmentModel[],
    context: {
      candidate: Awaited<ReturnType<CandidatesService['getCandidate']>> | null;
      caseMap: Map<string, Awaited<ReturnType<CasesService['getFolder']>> | null>;
      questionMap: Map<string, Awaited<ReturnType<QuestionsService['getQuestion']>> | null>;
    }
  ) {
    const missingCases = assignments.filter((assignment) => !context.caseMap.get(assignment.caseFolderId));
    const missingQuestions = assignments.filter((assignment) => !context.questionMap.get(assignment.fitQuestionId));
    if (missingCases.length > 0 || missingQuestions.length > 0) {
      throw new Error('INVALID_ASSIGNMENT_RESOURCES');
    }
  }

  private normalizeDeliveryError(error: unknown): Omit<InvitationDeliveryFailure, 'slotId'> {
    if (error instanceof MailerDeliveryError) {
      const message =
        error.reason === 'domain-not-verified'
          ? 'Домен отправителя не подтверждён в настройках почтового сервиса.'
          : error.message || 'Почтовый сервис вернул ошибку.';
      return {
        errorCode: error.reason,
        errorMessage: message.slice(0, 500)
      };
    }
    if (error instanceof Error) {
      const message = `Почтовый сервис вернул ошибку: ${error.message}`;
      return {
        errorCode: 'provider-error',
        errorMessage: message.slice(0, 500)
      };
    }
    return {
      errorCode: 'unknown',
      errorMessage: 'Неизвестная ошибка доставки письма.'
    };
  }

  private async deliverInvitations(
    assignments: InterviewAssignmentModel[],
    evaluation: EvaluationRecord,
    portalBaseUrl: string,
    context: {
      candidate: Awaited<ReturnType<CandidatesService['getCandidate']>> | null;
      caseMap: Map<string, Awaited<ReturnType<CasesService['getFolder']>> | null>;
      questionMap: Map<string, Awaited<ReturnType<QuestionsService['getQuestion']>> | null>;
    }
  ): Promise<{
    sent: string[];
    failed: InvitationDeliveryFailure[];
  }> {
    const candidateName = context.candidate
      ? `${context.candidate.lastName} ${context.candidate.firstName}`.trim() || context.candidate.id
      : 'candidate';

    const sent: string[] = [];
    const failed: InvitationDeliveryFailure[] = [];
    const accountCache = new Map<string, AccountRecord | null>();

    for (const assignment of assignments) {
      const caseFolder = context.caseMap.get(assignment.caseFolderId);
      const question = context.questionMap.get(assignment.fitQuestionId);
      const link = buildPortalLink(portalBaseUrl, evaluation.id, assignment.slotId);
      const normalizedEmail = normalizeEmail(assignment.interviewerEmail);
      let account = accountCache.get(normalizedEmail);
      if (account === undefined) {
        account = (await this.accounts.findByEmail(normalizedEmail)) ?? null;
        accountCache.set(normalizedEmail, account);
      }
      const interviewerFirstName = this.resolveInterviewerFirstName(assignment, account);
      try {
        await this.mailer.sendInterviewAssignment(assignment.interviewerEmail, {
          candidateName,
          interviewerName: assignment.interviewerName,
          interviewerFirstName,
          caseTitle: caseFolder?.name ?? 'Case',
          fitQuestionTitle: question?.shortTitle ?? 'Fit question',
          link
        });
        sent.push(assignment.slotId);
      } catch (error) {
        if (error instanceof Error && error.message === MAILER_NOT_CONFIGURED) {
          throw error;
        }
        const deliveryError = this.normalizeDeliveryError(error);
        console.error(
          'Не удалось отправить приглашение интервьюеру',
          assignment.interviewerEmail,
          deliveryError.errorMessage,
          error
        );
        failed.push({ slotId: assignment.slotId, ...deliveryError });
      }
    }

    return { sent, failed };
  }

  async startProcess(id: string, options?: { portalBaseUrl?: string }) {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }
    await this.sendInvitations(trimmed, { portalBaseUrl: options?.portalBaseUrl });
    return { id: trimmed };
  }

  async sendInvitations(
    id: string,
    options: { slotIds?: string[]; portalBaseUrl?: string }
  ): Promise<{ evaluation: EvaluationRecord; deliveryReport: InvitationDeliveryReport }> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }

    const evaluation = await this.loadEvaluationWithState(trimmed);
    const assignments = this.buildAssignments(evaluation);

    const selectedSlotIds = new Set(
      Array.isArray(options.slotIds)
        ? options.slotIds
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value): value is string => value.length > 0)
        : []
    );
    const selectionProvided = selectedSlotIds.size > 0;
    const assignmentsToSend = selectionProvided
      ? assignments.filter((assignment) => selectedSlotIds.has(assignment.slotId))
      : assignments;
    if (selectionProvided && assignmentsToSend.length === 0) {
      throw new Error('INVALID_SELECTION');
    }

    await this.ensureAccounts(assignments);
    const context = await this.loadContext(assignments, evaluation);
    this.ensureContextResources(assignments, context);

    const roundNumber = evaluation.roundNumber ?? 1;

    try {
      await this.evaluations.storeAssignments(trimmed, assignments, {
        status: 'in-progress',
        updateStartedAt: evaluation.processStatus === 'draft',
        roundNumber
      });
    } catch (error) {
      if (this.isInvalidUuidError(error)) {
        throw new Error('INVALID_ASSIGNMENT_RESOURCES');
      }
      throw error;
    }

    const skipped = selectionProvided
      ? assignments
          .map((assignment) => assignment.slotId)
          .filter((slotId) => !selectedSlotIds.has(slotId))
      : [];

    const deliveryReport: InvitationDeliveryReport = { sent: [], failed: [], skipped };

    if (assignmentsToSend.length > 0) {
      const portalBaseUrl = resolvePortalBaseUrl(options.portalBaseUrl);

      try {
        const delivery = await this.deliverInvitations(assignmentsToSend, evaluation, portalBaseUrl, context);
        if (delivery.sent.length > 0) {
          await this.evaluations.markInvitationsSent(trimmed, delivery.sent, roundNumber);
          deliveryReport.sent.push(...delivery.sent);
        }
        if (delivery.failed.length > 0) {
          await this.evaluations.markInvitationsFailed(trimmed, delivery.failed, roundNumber);
          deliveryReport.failed.push(...delivery.failed);
        }
      } catch (error) {
        if (error instanceof Error && error.message === MAILER_NOT_CONFIGURED) {
          throw new Error('MAILER_UNAVAILABLE');
        }
        throw error;
      }
    }

    const nextEvaluation = await this.loadEvaluationWithState(trimmed);
    return { evaluation: nextEvaluation, deliveryReport };
  }

  async refreshAssignmentsFromRecord(evaluation: EvaluationRecord): Promise<EvaluationRecord> {
    const normalizedRound = evaluation.roundNumber ?? 1;
    const completeAssignments = this.buildAssignments(evaluation, { skipIncomplete: true });
    let assignmentsToPersist = completeAssignments;

    if (completeAssignments.length > 0) {
      const context = await this.loadContext(completeAssignments, evaluation);
      assignmentsToPersist = completeAssignments.filter((assignment) => {
        const hasCase = context.caseMap.get(assignment.caseFolderId);
        const hasQuestion = context.questionMap.get(assignment.fitQuestionId);
        if (!hasCase || !hasQuestion) {
          console.warn(
            'Пропускаем назначение интервью: отсутствует кейс или fit-вопрос',
            assignment.interviewerEmail,
            assignment.caseFolderId,
            assignment.fitQuestionId
          );
          return false;
        }
        return true;
      });
      if (assignmentsToPersist.length > 0) {
        await this.ensureAccounts(assignmentsToPersist);
      }
    }

    try {
      await this.evaluations.storeAssignments(evaluation.id, assignmentsToPersist, {
        status: evaluation.processStatus,
        updateStartedAt: false,
        roundNumber: normalizedRound,
        touchEvaluation: false
      });
    } catch (error) {
      if (this.isInvalidUuidError(error)) {
        throw new Error('INVALID_ASSIGNMENT_RESOURCES');
      }
      throw error;
    }

    return this.loadEvaluationWithState(evaluation.id);
  }

  async refreshAssignmentsById(id: string): Promise<EvaluationRecord> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }
    const evaluation = await this.loadEvaluationWithState(trimmed);
    return this.refreshAssignmentsFromRecord(evaluation);
  }

  async advanceRound(id: string): Promise<EvaluationRecord> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }

    const evaluation = await this.loadEvaluationWithState(trimmed);
    const allSubmitted = evaluation.forms.length > 0 && evaluation.forms.every((form) => form.submitted);
    if (!allSubmitted) {
      throw new Error('FORMS_PENDING');
    }

    const currentRound = evaluation.roundNumber ?? 1;
    const snapshotCreatedAt = evaluation.processStartedAt ?? evaluation.createdAt;
    const snapshot = {
      roundNumber: currentRound,
      interviewCount: evaluation.interviewCount,
      interviews: evaluation.interviews,
      forms: evaluation.forms,
      fitQuestionId: evaluation.fitQuestionId,
      processStatus: 'completed' as const,
      processStartedAt: evaluation.processStartedAt,
      completedAt: new Date().toISOString(),
      createdAt: snapshotCreatedAt,
      decision: 'progress' as const,
      offerDecisionStatus: evaluation.offerDecisionStatus ?? null
    };

    const filteredHistory = evaluation.roundHistory.filter((entry) => entry.roundNumber !== currentRound);

    const nextRoundNumber = currentRound + 1;
    const newSlots = [createEmptySlot()];
    const newForms = newSlots.map((slot) => ({
      slotId: slot.id,
      interviewerName: slot.interviewerName,
      submitted: false
    }));

    const writeModel = buildWriteModelFromRecord(evaluation);
    writeModel.roundNumber = nextRoundNumber;
    writeModel.interviewCount = newSlots.length;
    writeModel.interviews = newSlots;
    writeModel.forms = newForms;
    writeModel.fitQuestionId = undefined;
    writeModel.processStatus = 'draft';
    writeModel.processStartedAt = null;
    writeModel.decision = null;
    writeModel.offerDecisionStatus = 'pending';
    writeModel.roundHistory = [...filteredHistory, snapshot].sort((a, b) => a.roundNumber - b.roundNumber);

    const updated = await this.evaluations.updateEvaluation(writeModel, evaluation.version);
    if (updated === 'version-conflict') {
      throw new Error('VERSION_CONFLICT');
    }
    if (!updated) {
      throw new Error('NOT_FOUND');
    }

    return this.loadEvaluationWithState(trimmed);
  }

  async updateDecision(
    id: string,
    decision: 'offer' | 'accepted-offer' | 'reject' | null,
    expectedVersion: number
  ): Promise<EvaluationRecord> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }

    if (decision !== 'offer' && decision !== 'accepted-offer' && decision !== 'reject' && decision !== null) {
      throw new Error('INVALID_INPUT');
    }

    if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
      throw new Error('INVALID_INPUT');
    }

    const evaluation = await this.evaluations.findEvaluation(trimmed);
    if (!evaluation) {
      throw new Error('NOT_FOUND');
    }

    const allSubmitted = evaluation.forms.length > 0 && evaluation.forms.every((form) => form.submitted);
    if (!allSubmitted) {
      throw new Error('FORMS_PENDING');
    }

    const writeModel = buildWriteModelFromRecord(evaluation);
    const legacyAccepted = decision === 'accepted-offer';
    const normalizedDecision = legacyAccepted ? 'offer' : decision;

    writeModel.decision = normalizedDecision;
    if (normalizedDecision === 'offer') {
      const currentStatus = evaluation.offerDecisionStatus;
      const allowedStatuses: OfferDecisionStatus[] = [
        'pending',
        'accepted',
        'accepted-co',
        'declined',
        'declined-co'
      ];
      if (legacyAccepted) {
        writeModel.offerDecisionStatus = 'accepted';
      } else {
        writeModel.offerDecisionStatus = allowedStatuses.includes(currentStatus ?? 'pending')
          ? (currentStatus as OfferDecisionStatus)
          : 'pending';
      }
    } else {
      writeModel.offerDecisionStatus = 'pending';
    }

    const result = await this.evaluations.updateEvaluation(writeModel, expectedVersion);
    if (result === 'version-conflict') {
      throw new Error('VERSION_CONFLICT');
    }
    if (!result) {
      throw new Error('NOT_FOUND');
    }

    return this.loadEvaluationWithState(trimmed);
  }

  async updateOfferDecisionStatus(
    id: string,
    status: OfferDecisionStatus,
    expectedVersion: number
  ): Promise<EvaluationRecord> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }

    const allowed: OfferDecisionStatus[] = [
      'pending',
      'accepted',
      'accepted-co',
      'declined',
      'declined-co'
    ];
    if (!allowed.includes(status)) {
      throw new Error('INVALID_INPUT');
    }

    if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
      throw new Error('INVALID_INPUT');
    }

    const evaluation = await this.evaluations.findEvaluation(trimmed);
    if (!evaluation) {
      throw new Error('NOT_FOUND');
    }

    if (evaluation.decision !== 'offer') {
      throw new Error('FORBIDDEN');
    }

    const allSubmitted = evaluation.forms.length > 0 && evaluation.forms.every((form) => form.submitted);
    if (!allSubmitted) {
      throw new Error('FORMS_PENDING');
    }

    const writeModel = buildWriteModelFromRecord(evaluation);
    writeModel.offerDecisionStatus = status;

    const result = await this.evaluations.updateEvaluation(writeModel, expectedVersion);
    if (result === 'version-conflict') {
      throw new Error('VERSION_CONFLICT');
    }
    if (!result) {
      throw new Error('NOT_FOUND');
    }

    return this.loadEvaluationWithState(trimmed);
  }

  async listAssignmentsForInterviewer(email: string): Promise<InterviewerAssignmentView[]> {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      return [];
    }
    const assignments = await this.evaluations.listAssignmentsByEmail(normalized);
    if (assignments.length === 0) {
      return [];
    }

    const evaluationMap = new Map<string, EvaluationRecord>();
    for (const assignment of assignments) {
      if (!evaluationMap.has(assignment.evaluationId)) {
        const record = await this.evaluations.findEvaluation(assignment.evaluationId);
        if (record) {
          evaluationMap.set(assignment.evaluationId, record);
        }
      }
    }

    const candidateMap = new Map<string, Awaited<ReturnType<CandidatesService['getCandidate']>> | null>();
    const caseMap = new Map<string, Awaited<ReturnType<CasesService['getFolder']>> | null>();
    const questionMap = new Map<string, Awaited<ReturnType<QuestionsService['getQuestion']>> | null>();

    for (const assignment of assignments) {
      const evaluation = evaluationMap.get(assignment.evaluationId);
      if (!evaluation) {
        continue;
      }
      if (evaluation.candidateId && !candidateMap.has(evaluation.candidateId)) {
        try {
          candidateMap.set(evaluation.candidateId, await this.candidates.getCandidate(evaluation.candidateId));
        } catch (error) {
          console.warn('Failed to load candidate', evaluation.candidateId, error);
          candidateMap.set(evaluation.candidateId, null);
        }
      }
      if (!caseMap.has(assignment.caseFolderId)) {
        try {
          caseMap.set(assignment.caseFolderId, await this.cases.getFolder(assignment.caseFolderId));
        } catch (error) {
          console.warn('Failed to load case folder', assignment.caseFolderId, error);
          caseMap.set(assignment.caseFolderId, null);
        }
      }
      if (!questionMap.has(assignment.fitQuestionId)) {
        try {
          questionMap.set(assignment.fitQuestionId, await this.questions.getQuestion(assignment.fitQuestionId));
        } catch (error) {
          console.warn('Failed to load fit question', assignment.fitQuestionId, error);
          questionMap.set(assignment.fitQuestionId, null);
        }
      }
    }

    return assignments.map((assignment) => {
      const evaluation = evaluationMap.get(assignment.evaluationId);
      const currentForm = evaluation?.forms.find((item) => item.slotId === assignment.slotId) ?? null;
      const snapshot = evaluation?.roundHistory.find(
        (entry) => entry.roundNumber === assignment.roundNumber
      );
      const historicalForm = snapshot?.forms.find((item) => item.slotId === assignment.slotId) ?? null;
      const form = currentForm ?? historicalForm;
      const peerForms = buildPeerForms(evaluation, snapshot);
      const candidate = evaluation?.candidateId ? candidateMap.get(evaluation.candidateId) ?? undefined : undefined;
      const processStatus =
        assignment.roundNumber === (evaluation?.roundNumber ?? assignment.roundNumber)
          ? evaluation?.processStatus ?? 'draft'
          : snapshot?.processStatus ?? 'completed';
      const evaluationUpdatedAt = snapshot?.completedAt ?? evaluation?.updatedAt ?? assignment.createdAt;
      return {
        evaluationId: assignment.evaluationId,
        slotId: assignment.slotId,
        interviewerEmail: assignment.interviewerEmail,
        interviewerName: assignment.interviewerName,
        invitationSentAt: assignment.invitationSentAt,
        roundNumber: assignment.roundNumber,
        evaluationUpdatedAt,
        evaluationProcessStatus: processStatus,
        candidate: candidate ?? undefined,
        caseFolder: caseMap.get(assignment.caseFolderId) ?? undefined,
        fitQuestion: questionMap.get(assignment.fitQuestionId) ?? undefined,
        form,
        peerForms,
        decision: snapshot?.decision ?? evaluation?.decision ?? null
      } satisfies InterviewerAssignmentView;
    });
  }

  async submitInterviewForm(
    evaluationId: string,
    slotId: string,
    email: string,
    payload: {
      submitted?: boolean;
      notes?: string;
      fitScore?: number | string;
      caseScore?: number | string;
      fitNotes?: string;
      caseNotes?: string;
      fitCriteria?: unknown;
      caseCriteria?: unknown;
      interestNotes?: string;
      issuesToTest?: string;
      offerRecommendation?: unknown;
    }
  ): Promise<EvaluationRecord> {
    const trimmedEvaluation = evaluationId.trim();
    const trimmedSlot = slotId.trim();
    if (!trimmedEvaluation || !trimmedSlot) {
      throw new Error('INVALID_INPUT');
    }
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new Error('INVALID_INPUT');
    }
    const assignment = await this.evaluations.findAssignment(trimmedEvaluation, trimmedSlot);
    if (!assignment || normalizeEmail(assignment.interviewerEmail) !== normalizedEmail) {
      throw new Error('ACCESS_DENIED');
    }
    const evaluation = await this.evaluations.findEvaluation(trimmedEvaluation);
    if (!evaluation) {
      throw new Error('NOT_FOUND');
    }

    const currentForm = evaluation.forms.find((form) => form.slotId === trimmedSlot);
    if (!currentForm) {
      throw new Error('NOT_FOUND');
    }
    if (currentForm.submitted) {
      throw new Error('FORM_ALREADY_SUBMITTED');
    }

    const submitted = payload.submitted === true;
    const submittedAt = submitted ? new Date().toISOString() : currentForm.submittedAt;
    const updatedForms = evaluation.forms.map((form) => {
      if (form.slotId !== trimmedSlot) {
        return form;
      }
      const nextFitCriteria = Array.isArray(payload.fitCriteria)
        ? readCriteriaList(payload.fitCriteria)
        : form.fitCriteria ?? [];
      const nextCaseCriteria = Array.isArray(payload.caseCriteria)
        ? readCriteriaList(payload.caseCriteria)
        : form.caseCriteria ?? [];
      const averageFitScore = computeAverageFromCriteria(nextFitCriteria);
      const averageCaseScore = computeAverageFromCriteria(nextCaseCriteria);
      const providedFitScore = readScore(payload.fitScore);
      const providedCaseScore = readScore(payload.caseScore);

      return {
        ...form,
        interviewerName: assignment.interviewerName,
        submitted,
        submittedAt,
        notes: typeof payload.notes === 'string' ? payload.notes : form.notes,
        fitScore: averageFitScore ?? providedFitScore ?? form.fitScore,
        caseScore: averageCaseScore ?? providedCaseScore ?? form.caseScore,
        fitNotes: typeof payload.fitNotes === 'string' ? payload.fitNotes : form.fitNotes,
        caseNotes: typeof payload.caseNotes === 'string' ? payload.caseNotes : form.caseNotes,
        fitCriteria: nextFitCriteria,
        caseCriteria: nextCaseCriteria,
        interestNotes:
          typeof payload.interestNotes === 'string' ? payload.interestNotes : form.interestNotes,
        issuesToTest: typeof payload.issuesToTest === 'string' ? payload.issuesToTest : form.issuesToTest,
        offerRecommendation:
          payload.offerRecommendation !== undefined
            ? readOfferRecommendation(payload.offerRecommendation) ?? form.offerRecommendation
            : form.offerRecommendation
      };
    });

    const allSubmitted = updatedForms.length > 0 && updatedForms.every((form) => form.submitted);
    const nextStatus = allSubmitted ? 'completed' : evaluation.processStatus;
    const writeModel = buildWriteModelFromRecord({
      ...evaluation,
      forms: updatedForms,
      processStatus: nextStatus
    });
    const result = await this.evaluations.updateEvaluation(writeModel, evaluation.version);
    if (result === 'version-conflict') {
      throw new Error('VERSION_CONFLICT');
    }
    if (!result) {
      throw new Error('NOT_FOUND');
    }
    return result;
  }
}
