import {
  EvaluationInvitationState,
  EvaluationRecord,
  InterviewAssignmentRecord,
  InvitationSlotState,
  InvitationSlotStatus
} from './evaluations.types.js';

const resolveStatus = (
  assignment: InterviewAssignmentRecord,
  slot: EvaluationRecord['interviews'][number]
): InvitationSlotState => {
  const sentAt = assignment.invitationSentAt ?? null;
  const attemptAt = assignment.lastDeliveryAttemptAt ?? null;
  const sentChecksum = assignment.lastSentChecksum ?? null;
  const detailsChecksum = assignment.detailsChecksum;
  const hasPendingDetails = !sentChecksum || sentChecksum !== detailsChecksum;
  const lastSuccessTime = sentAt ? new Date(sentAt).getTime() : null;
  const lastAttemptTime = attemptAt ? new Date(attemptAt).getTime() : null;
  const errorActive =
    typeof assignment.lastDeliveryError === 'string' && assignment.lastDeliveryError.trim().length > 0 &&
    (!lastSuccessTime || (lastAttemptTime ?? Number.NaN) >= (lastSuccessTime ?? Number.NEGATIVE_INFINITY));

  let status: InvitationSlotStatus;
  if (errorActive) {
    status = 'failed';
  } else if (!sentAt) {
    status = 'pending';
  } else if (hasPendingDetails) {
    status = 'stale';
  } else {
    status = 'delivered';
  }

  return {
    slotId: assignment.slotId,
    interviewerName: slot.interviewerName,
    interviewerEmail: slot.interviewerEmail,
    status,
    invitationSentAt: sentAt,
    lastDeliveryAttemptAt: attemptAt,
    lastDeliveryErrorCode: assignment.lastDeliveryErrorCode ?? null,
    lastDeliveryError: assignment.lastDeliveryError ?? null
  } satisfies InvitationSlotState;
};

export const computeInvitationState = (
  evaluation: EvaluationRecord,
  assignments: InterviewAssignmentRecord[]
): EvaluationInvitationState => {
  const currentRound = evaluation.roundNumber ?? 1;
  const currentAssignments = assignments.filter(
    (assignment) => assignment.roundNumber === currentRound
  );
  const slotMap = new Map(evaluation.interviews.map((slot) => [slot.id, slot]));
  const matchingAssignments = currentAssignments.filter((assignment) => slotMap.has(assignment.slotId));
  const slotStates: InvitationSlotState[] = [];

  for (const slot of evaluation.interviews) {
    const assignment = matchingAssignments.find((item) => item.slotId === slot.id);
    if (!assignment) {
      slotStates.push({
        slotId: slot.id,
        interviewerName: slot.interviewerName,
        interviewerEmail: slot.interviewerEmail,
        status: 'unassigned',
        invitationSentAt: null,
        lastDeliveryAttemptAt: null,
        lastDeliveryErrorCode: null,
        lastDeliveryError: null
      });
      continue;
    }
    slotStates.push(resolveStatus(assignment, slot));
  }

  const sentAssignments = matchingAssignments.filter((assignment) => assignment.invitationSentAt);
  const hasInvitations = sentAssignments.length > 0;

  const extraAssignments = currentAssignments.filter((assignment) => !slotMap.has(assignment.slotId));

  const hasPendingChanges = slotStates.some((state) => state.status !== 'delivered') || extraAssignments.length > 0;

  const lastSentAt = sentAssignments.length
    ? sentAssignments
        .map((item) => (item.invitationSentAt ? new Date(item.invitationSentAt).getTime() : Number.NaN))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => b - a)[0]
    : undefined;

  return {
    hasInvitations,
    hasPendingChanges,
    lastSentAt: lastSentAt ? new Date(lastSentAt).toISOString() : undefined,
    slots: slotStates
  };
};
