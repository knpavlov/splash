import { createHash, randomUUID } from 'crypto';
import { postgresPool } from '../../shared/database/postgres.client.js';
import {
  EvaluationRecord,
  EvaluationWriteModel,
  InterviewSlotModel,
  InterviewStatusModel,
  InterviewAssignmentModel,
  InterviewAssignmentRecord,
  EvaluationCriterionScore,
  EvaluationRoundSnapshot
} from './evaluations.types.js';

interface EvaluationRow extends Record<string, unknown> {
  id: string;
  candidate_id: string | null;
  round_number: number | null;
  interview_count: number | null;
  interviews: unknown;
  fit_question_id: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  forms: unknown;
  process_status: string | null;
  process_started_at: Date | null;
  round_history: unknown;
  decision: string | null;
  decision_status: string | null;
}

const mapSlots = (value: unknown): InterviewSlotModel[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const slots: InterviewSlotModel[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const item = entry as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const interviewerName = typeof item.interviewerName === 'string' ? item.interviewerName : '';
    const interviewerEmail = typeof item.interviewerEmail === 'string' ? item.interviewerEmail : '';
    if (!id || !interviewerName) {
      continue;
    }
    const caseFolderId = typeof item.caseFolderId === 'string' ? item.caseFolderId.trim() || undefined : undefined;
    const fitQuestionId = typeof item.fitQuestionId === 'string' ? item.fitQuestionId.trim() || undefined : undefined;
    slots.push({ id, interviewerName, interviewerEmail, caseFolderId, fitQuestionId });
  }
  return slots;
};

const mapCriterionScore = (value: unknown): EvaluationCriterionScore | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const criterionId = typeof payload.criterionId === 'string' ? payload.criterionId.trim() : '';
  if (!criterionId) {
    return null;
  }
  const rawScore = payload.score;
  let score: number | undefined;
  if (typeof rawScore === 'number' && Number.isFinite(rawScore)) {
    score = rawScore;
  } else if (typeof rawScore === 'string' && rawScore.trim()) {
    const parsed = Number(rawScore);
    if (Number.isFinite(parsed)) {
      score = parsed;
    }
  }
  const notApplicable = payload.notApplicable === true;
  return { criterionId, score, notApplicable };
};

const mapCriteriaList = (value: unknown): EvaluationCriterionScore[] => {
  const bucket: EvaluationCriterionScore[] = [];
  const pushIfValid = (candidate: unknown) => {
    const mapped = mapCriterionScore(candidate);
    if (mapped) {
      bucket.push(mapped);
    }
  };

  if (Array.isArray(value)) {
    for (const entry of value) {
      pushIfValid(entry);
    }
    return bucket;
  }

  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry && typeof entry === 'object' && 'criterionId' in entry) {
        pushIfValid(entry);
        continue;
      }
      pushIfValid({ criterionId: key, score: entry });
    }
    return bucket;
  }

  return bucket;
};

const readOfferRecommendation = (value: unknown): InterviewStatusModel['offerRecommendation'] | undefined => {
  if (value === 'yes_priority' || value === 'yes_strong' || value === 'yes_keep_warm' || value === 'no_offer') {
    return value;
  }
  return undefined;
};

const mapForms = (value: unknown): InterviewStatusModel[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const forms: InterviewStatusModel[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const item = entry as Record<string, unknown>;
    const slotId = typeof item.slotId === 'string' ? item.slotId.trim() : '';
    if (!slotId) {
      continue;
    }
    const interviewerName = typeof item.interviewerName === 'string' ? item.interviewerName : 'Interviewer';
    const submitted = typeof item.submitted === 'boolean' ? item.submitted : false;
    const submittedAt =
      typeof item.submittedAt === 'string' && item.submittedAt.trim()
        ? new Date(item.submittedAt).toISOString()
        : undefined;
    const notes = typeof item.notes === 'string' ? item.notes : undefined;
    const fitScore = typeof item.fitScore === 'number' ? item.fitScore : undefined;
    const caseScore = typeof item.caseScore === 'number' ? item.caseScore : undefined;
    const fitNotes = typeof item.fitNotes === 'string' ? item.fitNotes : undefined;
    const caseNotes = typeof item.caseNotes === 'string' ? item.caseNotes : undefined;
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
      fitCriteria: mapCriteriaList(item.fitCriteria),
      caseCriteria: mapCriteriaList(item.caseCriteria),
      interestNotes: typeof item.interestNotes === 'string' ? item.interestNotes : undefined,
      issuesToTest: typeof item.issuesToTest === 'string' ? item.issuesToTest : undefined,
      offerRecommendation: readOfferRecommendation(item.offerRecommendation)
    });
  }
  return forms;
};

const mapRoundHistory = (value: unknown): EvaluationRoundSnapshot[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const history: EvaluationRoundSnapshot[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const item = entry as Record<string, unknown>;
    const rawRoundNumber = item.roundNumber;
    const roundNumber =
      typeof rawRoundNumber === 'number' && Number.isInteger(rawRoundNumber) && rawRoundNumber > 0
        ? rawRoundNumber
        : undefined;
    if (!roundNumber) {
      continue;
    }
    const interviews = mapSlots(item.interviews);
    const forms = mapForms(item.forms);
    const interviewCount =
      typeof item.interviewCount === 'number' && Number.isFinite(item.interviewCount)
        ? item.interviewCount
        : interviews.length;
    const fitQuestionId =
      typeof item.fitQuestionId === 'string' ? item.fitQuestionId.trim() || undefined : undefined;
    const processStatus =
      item.processStatus === 'completed' || item.processStatus === 'in-progress'
        ? item.processStatus
        : 'draft';
    const processStartedAt =
      typeof item.processStartedAt === 'string' && item.processStartedAt.trim()
        ? new Date(item.processStartedAt).toISOString()
        : undefined;
    const completedAt =
      typeof item.completedAt === 'string' && item.completedAt.trim()
        ? new Date(item.completedAt).toISOString()
        : undefined;
    const createdAt =
      typeof item.createdAt === 'string' && item.createdAt.trim()
        ? new Date(item.createdAt).toISOString()
        : new Date().toISOString();

    let decision: EvaluationRoundSnapshot['decision'];
    if (
      item.decision === 'offer' ||
      item.decision === 'accepted-offer' ||
      item.decision === 'reject' ||
      item.decision === 'progress'
    ) {
      decision = item.decision;
    } else if (item.decision === null) {
      decision = null;
    }

    let decisionStatus: EvaluationRoundSnapshot['offerDecisionStatus'];
    if (
      item.offerDecisionStatus === 'pending' ||
      item.offerDecisionStatus === 'accepted' ||
      item.offerDecisionStatus === 'accepted-co' ||
      item.offerDecisionStatus === 'declined' ||
      item.offerDecisionStatus === 'declined-co'
    ) {
      decisionStatus = item.offerDecisionStatus;
    } else if (item.offerDecisionStatus === null) {
      decisionStatus = null;
    }

    history.push({
      roundNumber,
      interviewCount,
      interviews,
      forms,
      fitQuestionId,
      processStatus,
      processStartedAt,
      completedAt,
      createdAt,
      decision,
      offerDecisionStatus: decisionStatus
    });
  }

  return history;
};

const mapRowToRecord = (row: EvaluationRow): EvaluationRecord => {
  const interviews = mapSlots(row.interviews);
  const forms = mapForms(row.forms);
  const interviewCount =
    typeof row.interview_count === 'number' && Number.isFinite(row.interview_count)
      ? row.interview_count
      : interviews.length;

  let decision: EvaluationRecord['decision'];
  if (
    row.decision === 'offer' ||
    row.decision === 'accepted-offer' ||
    row.decision === 'reject' ||
    row.decision === 'progress'
  ) {
    decision = row.decision;
  } else if (row.decision === null) {
    decision = null;
  }

  let decisionStatus: EvaluationRecord['offerDecisionStatus'];
  if (
    row.decision_status === 'pending' ||
    row.decision_status === 'accepted' ||
    row.decision_status === 'accepted-co' ||
    row.decision_status === 'declined' ||
    row.decision_status === 'declined-co'
  ) {
    decisionStatus = row.decision_status;
  } else if (row.decision_status === null) {
    decisionStatus = null;
  }

  return {
    id: row.id,
    candidateId: row.candidate_id ?? undefined,
    roundNumber: row.round_number ?? undefined,
    interviewCount,
    interviews,
    fitQuestionId: row.fit_question_id ?? undefined,
    version: Number(row.version ?? 1),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    forms,
    processStatus: (row.process_status as EvaluationRecord['processStatus']) ?? 'draft',
    processStartedAt: row.process_started_at ? row.process_started_at.toISOString() : undefined,
    roundHistory: mapRoundHistory(row.round_history),
    invitationState: { hasInvitations: false, hasPendingChanges: false, slots: [] },
    decision,
    offerDecisionStatus: decisionStatus
  } satisfies EvaluationRecord;
};

interface AssignmentRow extends Record<string, unknown> {
  id: string;
  evaluation_id: string;
  slot_id: string;
  interviewer_email: string;
  interviewer_name: string;
  case_folder_id: string;
  fit_question_id: string;
  round_number: number;
  invitation_sent_at: Date | null;
  details_checksum: string | null;
  last_sent_checksum: string | null;
  last_delivery_error_code: string | null;
  last_delivery_error: string | null;
  last_delivery_attempt_at: Date | null;
  created_at: Date;
}

interface ExistingAssignmentRow extends Record<string, unknown> {
  id: string;
  slot_id: string;
  round_number: number | null;
  invitation_sent_at: Date | null;
  details_checksum: string | null;
  last_sent_checksum: string | null;
  last_delivery_error_code: string | null;
  last_delivery_error: string | null;
  last_delivery_attempt_at: Date | null;
  created_at: Date;
}

const mapRowToAssignment = (row: AssignmentRow): InterviewAssignmentRecord => ({
  id: row.id,
  evaluationId: row.evaluation_id,
  slotId: row.slot_id,
  interviewerEmail: row.interviewer_email,
  interviewerName: row.interviewer_name,
  caseFolderId: row.case_folder_id,
  fitQuestionId: row.fit_question_id,
  roundNumber: Number(row.round_number ?? 1) || 1,
  invitationSentAt: row.invitation_sent_at ? row.invitation_sent_at.toISOString() : null,
  detailsChecksum: row.details_checksum ?? '',
  lastSentChecksum: row.last_sent_checksum,
  lastDeliveryErrorCode: row.last_delivery_error_code,
  lastDeliveryError: row.last_delivery_error,
  lastDeliveryAttemptAt: row.last_delivery_attempt_at ? row.last_delivery_attempt_at.toISOString() : null,
  createdAt: row.created_at.toISOString()
});

export class EvaluationsRepository {
  async listEvaluations(): Promise<EvaluationRecord[]> {
    const result = await postgresPool.query<EvaluationRow>(
      `SELECT id,
              candidate_id,
              round_number,
              interview_count,
              interviews,
              fit_question_id,
              version,
              created_at,
              updated_at,
              forms,
              process_status,
              process_started_at,
              round_history,
              decision,
              decision_status
         FROM evaluations
        ORDER BY updated_at DESC, created_at DESC;`
    );
    return result.rows.map((row) => mapRowToRecord(row));
  }

  async findEvaluation(id: string): Promise<EvaluationRecord | null> {
    const result = await postgresPool.query<EvaluationRow>(
      `SELECT id,
              candidate_id,
              round_number,
              interview_count,
              interviews,
              fit_question_id,
              version,
              created_at,
              updated_at,
              forms,
              process_status,
              process_started_at,
              round_history,
              decision,
              decision_status
         FROM evaluations
        WHERE id = $1
        LIMIT 1;`,
      [id]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return mapRowToRecord(result.rows[0]);
  }

  async createEvaluation(model: EvaluationWriteModel): Promise<EvaluationRecord> {
    const interviewsJson = JSON.stringify(model.interviews);
    const formsJson = JSON.stringify(model.forms);
    const historyJson = JSON.stringify(model.roundHistory ?? []);

    const result = await postgresPool.query<EvaluationRow>(
      `INSERT INTO evaluations (id, candidate_id, round_number, interview_count, interviews, fit_question_id, version, created_at, updated_at, forms, round_history, process_status, process_started_at, decision, decision_status)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, 1, NOW(), NOW(), $7::jsonb, $8::jsonb, $9, $10, $11, $12)
      RETURNING id,
                candidate_id,
                round_number,
                interview_count,
                interviews,
                fit_question_id,
                version,
                created_at,
                updated_at,
                forms,
                process_status,
                process_started_at,
                round_history,
                decision,
                decision_status;`,
      [
        model.id,
        model.candidateId ?? null,
        model.roundNumber ?? null,
        model.interviewCount,
        interviewsJson,
        model.fitQuestionId ?? null,
        formsJson,
        historyJson,
        model.processStatus ?? 'draft',
        model.processStartedAt ?? null,
        model.decision ?? null,
        model.offerDecisionStatus ?? 'pending'
      ]
    );

    return mapRowToRecord(result.rows[0]);
  }

  async updateEvaluation(
    model: EvaluationWriteModel,
    expectedVersion: number
  ): Promise<'version-conflict' | EvaluationRecord | null> {
    const interviewsJson = JSON.stringify(model.interviews);
    const formsJson = JSON.stringify(model.forms);
    const historyJson = JSON.stringify(model.roundHistory ?? []);

    const result = await postgresPool.query<EvaluationRow>(
      `UPDATE evaluations
          SET candidate_id = $1,
              round_number = $2,
              interview_count = $3,
              interviews = $4::jsonb,
              fit_question_id = $5,
              forms = $6::jsonb,
              round_history = $7::jsonb,
              process_status = $8,
              process_started_at = $9,
              decision = $10,
              decision_status = $11,
              version = version + 1,
              updated_at = NOW()
        WHERE id = $12 AND version = $13
      RETURNING id,
                candidate_id,
                round_number,
                interview_count,
                interviews,
                fit_question_id,
                version,
                created_at,
                updated_at,
                forms,
                process_status,
                process_started_at,
                round_history,
                decision,
                decision_status;`,
      [
        model.candidateId ?? null,
        model.roundNumber ?? null,
        model.interviewCount,
        interviewsJson,
        model.fitQuestionId ?? null,
        formsJson,
        historyJson,
        model.processStatus ?? 'draft',
        model.processStartedAt ?? null,
        model.decision ?? null,
        model.offerDecisionStatus ?? 'pending',
        model.id,
        expectedVersion
      ]
    );

    if (result.rows.length === 0) {
      const exists = await postgresPool.query('SELECT id FROM evaluations WHERE id = $1 LIMIT 1;', [model.id]);
      if (exists.rows.length === 0) {
        return null;
      }
      return 'version-conflict';
    }

    return mapRowToRecord(result.rows[0]);
  }

  async deleteEvaluation(id: string): Promise<boolean> {
    const result = await postgresPool.query('DELETE FROM evaluations WHERE id = $1 RETURNING id;', [id]);
    return result.rows.length > 0;
  }

  async storeAssignments(
    evaluationId: string,
    assignments: InterviewAssignmentModel[],
    options: {
      status: EvaluationRecord['processStatus'];
      updateStartedAt: boolean;
      roundNumber: number;
      touchEvaluation?: boolean;
    }
  ): Promise<void> {
    const client = await (postgresPool as unknown as { connect: () => Promise<any> }).connect();
    try {
      await client.query('BEGIN');

      const statusResult = await client.query(
        'SELECT process_status FROM evaluations WHERE id = $1 FOR UPDATE;',
        [evaluationId]
      );

      if (statusResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('NOT_FOUND');
      }

      const normalizedRound = Number.isFinite(options.roundNumber)
        ? Math.max(1, Math.trunc(options.roundNumber))
        : 1;

      const existingAssignmentsResult = await client.query(
        `SELECT id,
                slot_id,
                round_number,
                invitation_sent_at,
                details_checksum,
                last_sent_checksum,
                last_delivery_error_code,
                last_delivery_error,
                last_delivery_attempt_at,
                created_at
           FROM evaluation_assignments
          WHERE evaluation_id = $1;`,
        [evaluationId]
      );

      const normalizeRowRound = (value: number | null): number => {
        if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
          return value;
        }
        return 1;
      };

      const existingRows = existingAssignmentsResult.rows as ExistingAssignmentRow[];
      const existingBySlot = new Map(
        existingRows.map((row) => [
          row.slot_id,
          {
            id: row.id,
            roundNumber: normalizeRowRound(row.round_number),
            invitationSentAt: row.invitation_sent_at,
            createdAt: row.created_at,
            detailsChecksum: row.details_checksum ?? '',
            lastSentChecksum: row.last_sent_checksum ?? null,
            lastDeliveryErrorCode: row.last_delivery_error_code ?? null,
            lastDeliveryError: row.last_delivery_error ?? null,
            lastDeliveryAttemptAt: row.last_delivery_attempt_at ?? null
          }
        ])
      );

      const currentSlotIds = new Set(assignments.map((assignment) => assignment.slotId));
      const slotsToRemove = existingRows
        .filter((row) => normalizeRowRound(row.round_number) === normalizedRound)
        .map((row) => row.slot_id)
        .filter((slotId) => !currentSlotIds.has(slotId));

      if (assignments.length === 0) {
        await client.query(
          `DELETE FROM evaluation_assignments
            WHERE evaluation_id = $1 AND round_number = $2;`,
          [evaluationId, normalizedRound]
        );
      } else if (slotsToRemove.length > 0) {
        await client.query(
          `DELETE FROM evaluation_assignments
            WHERE evaluation_id = $1
              AND round_number = $3
              AND slot_id = ANY($2::text[]);`,
          [evaluationId, slotsToRemove, normalizedRound]
        );
      }

      const computeChecksum = (payload: InterviewAssignmentModel): string => {
        const hash = createHash('sha256');
        hash.update(payload.interviewerEmail);
        hash.update('|');
        hash.update(payload.interviewerName.trim());
        hash.update('|');
        hash.update(payload.caseFolderId);
        hash.update('|');
        hash.update(payload.fitQuestionId);
        return hash.digest('hex');
      };

      for (const assignment of assignments) {
        const detailsChecksum = computeChecksum(assignment);
        const existing = existingBySlot.get(assignment.slotId);
        const isSameRound = existing?.roundNumber === normalizedRound;
        const assignmentId = isSameRound && existing?.id ? existing.id : randomUUID();
        const previousInvitation = isSameRound ? existing?.invitationSentAt ?? null : null;
        const previousCreatedAt = isSameRound ? existing?.createdAt ?? null : null;
        const previousLastSentChecksum = isSameRound ? existing?.lastSentChecksum ?? null : null;
        const hasDetailsChanged = !isSameRound || (existing?.detailsChecksum ?? '') !== detailsChecksum;
        const preservedErrorCode = isSameRound && !hasDetailsChanged ? existing?.lastDeliveryErrorCode ?? null : null;
        const preservedError = isSameRound && !hasDetailsChanged ? existing?.lastDeliveryError ?? null : null;
        const preservedErrorAt = isSameRound && !hasDetailsChanged ? existing?.lastDeliveryAttemptAt ?? null : null;
        await client.query(
          `INSERT INTO evaluation_assignments (
             id,
             evaluation_id,
             slot_id,
             interviewer_email,
             interviewer_name,
             case_folder_id,
             fit_question_id,
              round_number,
              invitation_sent_at,
             created_at,
             details_checksum,
             last_sent_checksum,
             last_delivery_error_code,
             last_delivery_error,
             last_delivery_attempt_at
           ) VALUES (
             $1,
             $2,
             $3,
             $4,
             $5,
             $6,
             $7,
             $8,
             $9,
             $10,
             $11,
             $12,
             $13,
             $14,
             $15
           )
           ON CONFLICT (evaluation_id, slot_id) DO UPDATE
             SET interviewer_email = EXCLUDED.interviewer_email,
                 interviewer_name = EXCLUDED.interviewer_name,
                 case_folder_id = EXCLUDED.case_folder_id,
                 fit_question_id = EXCLUDED.fit_question_id,
                 round_number = EXCLUDED.round_number,
                 invitation_sent_at = COALESCE(
                   evaluation_assignments.invitation_sent_at,
                   EXCLUDED.invitation_sent_at
                 ),
                 created_at = EXCLUDED.created_at,
                 details_checksum = EXCLUDED.details_checksum,
                 last_sent_checksum = EXCLUDED.last_sent_checksum,
                 last_delivery_error_code = EXCLUDED.last_delivery_error_code,
                 last_delivery_error = EXCLUDED.last_delivery_error,
                 last_delivery_attempt_at = EXCLUDED.last_delivery_attempt_at,
                 id = EXCLUDED.id;`,
          [
            assignmentId,
            evaluationId,
            assignment.slotId,
            assignment.interviewerEmail,
            assignment.interviewerName,
            assignment.caseFolderId,
            assignment.fitQuestionId,
            normalizedRound,
            previousInvitation,
            previousCreatedAt ?? new Date(),
            detailsChecksum,
            previousLastSentChecksum,
            preservedErrorCode,
            preservedError,
            preservedErrorAt
          ]
        );
      }

      if (options.touchEvaluation !== false) {
        await client.query(
          `UPDATE evaluations
              SET process_status = $2,
                  process_started_at = CASE
                    WHEN $3::boolean IS TRUE THEN COALESCE(process_started_at, NOW())
                    ELSE process_started_at
                  END,
                  updated_at = NOW()
            WHERE id = $1;`,
          [evaluationId, options.status, options.updateStartedAt]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async markInvitationsSent(
    evaluationId: string,
    slotIds: string[],
    roundNumber: number
  ): Promise<void> {
    const normalizedIds = Array.from(
      new Set(
        slotIds
          .map((id) => (typeof id === 'string' ? id.trim() : ''))
          .filter((id): id is string => id.length > 0)
      )
    );
    if (normalizedIds.length === 0) {
      return;
    }
    await postgresPool.query(
      `UPDATE evaluation_assignments
          SET invitation_sent_at = NOW(),
              last_sent_checksum = details_checksum,
              last_delivery_error_code = NULL,
              last_delivery_error = NULL,
              last_delivery_attempt_at = NOW()
        WHERE evaluation_id = $1
          AND round_number = $3
          AND slot_id = ANY($2::text[]);`,
      [evaluationId, normalizedIds, roundNumber]
    );
  }

  async markInvitationsFailed(
    evaluationId: string,
    failures: Array<{ slotId: string; errorCode?: string; errorMessage?: string }>,
    roundNumber: number
  ): Promise<void> {
    if (failures.length === 0) {
      return;
    }
    for (const failure of failures) {
      const slotId = typeof failure.slotId === 'string' ? failure.slotId.trim() : '';
      if (!slotId) {
        continue;
      }
      const errorCode = failure.errorCode?.toString().slice(0, 120) ?? null;
      const errorMessage = failure.errorMessage?.toString().slice(0, 500) ?? null;
      await postgresPool.query(
        `UPDATE evaluation_assignments
            SET last_delivery_error_code = $4,
                last_delivery_error = $5,
                last_delivery_attempt_at = NOW()
          WHERE evaluation_id = $1
            AND round_number = $2
            AND slot_id = $3;`,
        [evaluationId, roundNumber, slotId, errorCode, errorMessage]
      );
    }
  }

  async markInvitationsPending(
    evaluationId: string,
    slotIds: string[],
    roundNumber: number
  ): Promise<void> {
    const normalizedIds = Array.from(
      new Set(
        slotIds
          .map((id) => (typeof id === 'string' ? id.trim() : ''))
          .filter((id): id is string => id.length > 0)
      )
    );
    if (normalizedIds.length === 0) {
      return;
    }
    await postgresPool.query(
      `UPDATE evaluation_assignments
          SET invitation_sent_at = NULL
        WHERE evaluation_id = $1
          AND round_number = $3
          AND slot_id = ANY($2::text[]);`,
      [evaluationId, normalizedIds, roundNumber]
    );
  }

  async listAssignmentsByEmail(email: string): Promise<InterviewAssignmentRecord[]> {
    const result = await postgresPool.query<AssignmentRow>(
      `SELECT id,
              evaluation_id,
              slot_id,
              interviewer_email,
              interviewer_name,
              case_folder_id,
              fit_question_id,
              round_number,
              invitation_sent_at,
              details_checksum,
              last_sent_checksum,
              last_delivery_error_code,
              last_delivery_error,
              last_delivery_attempt_at,
              created_at
         FROM evaluation_assignments
        WHERE lower(interviewer_email) = lower($1)
        ORDER BY invitation_sent_at DESC, created_at DESC;`,
      [email]
    );
    return result.rows.map((row) => mapRowToAssignment(row));
  }

  async listAssignmentsForEvaluation(evaluationId: string): Promise<InterviewAssignmentRecord[]> {
    const result = await postgresPool.query<AssignmentRow>(
      `SELECT id,
              evaluation_id,
              slot_id,
              interviewer_email,
              interviewer_name,
              case_folder_id,
              fit_question_id,
              round_number,
              invitation_sent_at,
              details_checksum,
              last_sent_checksum,
              last_delivery_error_code,
              last_delivery_error,
              last_delivery_attempt_at,
              created_at
         FROM evaluation_assignments
        WHERE evaluation_id = $1
        ORDER BY invitation_sent_at DESC, created_at DESC;`,
      [evaluationId]
    );
    return result.rows.map((row) => mapRowToAssignment(row));
  }

  async findAssignment(
    evaluationId: string,
    slotId: string
  ): Promise<InterviewAssignmentRecord | null> {
    const result = await postgresPool.query<AssignmentRow>(
      `SELECT id,
              evaluation_id,
              slot_id,
              interviewer_email,
              interviewer_name,
              case_folder_id,
              fit_question_id,
              round_number,
              invitation_sent_at,
              details_checksum,
              last_sent_checksum,
              last_delivery_error_code,
              last_delivery_error,
              last_delivery_attempt_at,
              created_at
         FROM evaluation_assignments
        WHERE evaluation_id = $1 AND slot_id = $2
        LIMIT 1;`,
      [evaluationId, slotId]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return mapRowToAssignment(result.rows[0]);
  }
}
