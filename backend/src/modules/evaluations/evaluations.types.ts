import type { CandidateRecord } from '../candidates/candidates.types.js';
import type { CaseFolder } from '../cases/cases.types.js';
import type { FitQuestionRecord } from '../questions/questions.types.js';

export interface InterviewSlotModel {
  id: string;
  interviewerName: string;
  interviewerEmail: string;
  caseFolderId?: string;
  fitQuestionId?: string;
}

export interface InterviewStatusModel {
  slotId: string;
  interviewerName: string;
  submitted: boolean;
  submittedAt?: string;
  notes?: string;
  fitScore?: number;
  caseScore?: number;
  fitNotes?: string;
  caseNotes?: string;
  fitCriteria?: EvaluationCriterionScore[];
  caseCriteria?: EvaluationCriterionScore[];
  interestNotes?: string;
  issuesToTest?: string;
  offerRecommendation?: OfferRecommendationValue;
}

export interface EvaluationCriterionScore {
  criterionId: string;
  score?: number;
  notApplicable?: boolean;
}

export type OfferRecommendationValue =
  | 'yes_priority'
  | 'yes_strong'
  | 'yes_keep_warm'
  | 'no_offer';

export type EvaluationDecision = 'offer' | 'accepted-offer' | 'reject' | 'progress';

export type OfferDecisionStatus =
  | 'pending'
  | 'accepted'
  | 'accepted-co'
  | 'declined'
  | 'declined-co';

export type EvaluationProcessStatus = 'draft' | 'in-progress' | 'completed';

export interface InterviewAssignmentModel {
  slotId: string;
  interviewerEmail: string;
  interviewerName: string;
  caseFolderId: string;
  fitQuestionId: string;
}

export interface EvaluationRoundSnapshot {
  roundNumber: number;
  interviewCount: number;
  interviews: InterviewSlotModel[];
  forms: InterviewStatusModel[];
  fitQuestionId?: string;
  processStatus: EvaluationProcessStatus;
  processStartedAt?: string;
  completedAt?: string;
  createdAt: string;
  decision?: EvaluationDecision | null;
  offerDecisionStatus?: OfferDecisionStatus | null;
}

export type InvitationSlotStatus = 'pending' | 'delivered' | 'stale' | 'failed' | 'unassigned';

export interface InvitationSlotState {
  slotId: string;
  interviewerName: string;
  interviewerEmail: string;
  status: InvitationSlotStatus;
  invitationSentAt?: string | null;
  lastDeliveryAttemptAt?: string | null;
  lastDeliveryErrorCode?: string | null;
  lastDeliveryError?: string | null;
}

export interface EvaluationInvitationState {
  hasInvitations: boolean;
  hasPendingChanges: boolean;
  lastSentAt?: string;
  slots: InvitationSlotState[];
}

export interface InvitationDeliveryFailure {
  slotId: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface InvitationDeliveryReport {
  sent: string[];
  failed: InvitationDeliveryFailure[];
  skipped: string[];
}

export interface StoredInterviewAssignmentModel extends InterviewAssignmentModel {
  detailsChecksum: string;
}

export interface InterviewAssignmentRecord extends InterviewAssignmentModel {
  id: string;
  evaluationId: string;
  roundNumber: number;
  invitationSentAt?: string | null;
  detailsChecksum: string;
  lastSentChecksum?: string | null;
  lastDeliveryErrorCode?: string | null;
  lastDeliveryError?: string | null;
  lastDeliveryAttemptAt?: string | null;
  createdAt: string;
}

export interface EvaluationRecord {
  id: string;
  candidateId?: string;
  roundNumber?: number;
  interviewCount: number;
  interviews: InterviewSlotModel[];
  fitQuestionId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  forms: InterviewStatusModel[];
  processStatus: EvaluationProcessStatus;
  processStartedAt?: string;
  roundHistory: EvaluationRoundSnapshot[];
  invitationState: EvaluationInvitationState;
  decision?: EvaluationDecision | null;
  offerDecisionStatus?: OfferDecisionStatus | null;
}

export interface EvaluationWriteModel {
  id: string;
  candidateId?: string;
  roundNumber?: number;
  interviewCount: number;
  interviews: InterviewSlotModel[];
  fitQuestionId?: string;
  forms: InterviewStatusModel[];
  processStatus?: EvaluationProcessStatus;
  processStartedAt?: string | null;
  roundHistory: EvaluationRoundSnapshot[];
  decision?: EvaluationDecision | null;
  offerDecisionStatus?: OfferDecisionStatus | null;
}

export interface InterviewPeerFormView {
  slotId: string;
  interviewerName: string;
  interviewerEmail: string;
  submitted: boolean;
  form: InterviewStatusModel | null;
}

export interface InterviewerAssignmentView {
  evaluationId: string;
  slotId: string;
  interviewerEmail: string;
  interviewerName: string;
  invitationSentAt?: string | null;
  roundNumber: number;
  evaluationUpdatedAt: string;
  evaluationProcessStatus: EvaluationProcessStatus;
  candidate?: CandidateRecord;
  caseFolder?: CaseFolder;
  fitQuestion?: FitQuestionRecord;
  form: InterviewStatusModel | null;
  peerForms: InterviewPeerFormView[];
  decision?: EvaluationDecision | null;
}
