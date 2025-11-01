export interface InterviewSlot {
  id: string;
  interviewerName: string;
  interviewerEmail: string;
  caseFolderId?: string;
  fitQuestionId?: string;
}

export interface InterviewStatusRecord {
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

export type EvaluationProcessStatus = 'draft' | 'in-progress' | 'completed';

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

export interface EvaluationConfig {
  id: string;
  candidateId?: string;
  roundNumber?: number;
  interviewCount: number;
  interviews: InterviewSlot[];
  fitQuestionId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  forms: InterviewStatusRecord[];
  processStatus: EvaluationProcessStatus;
  processStartedAt?: string;
  roundHistory: EvaluationRoundSnapshot[];
  invitationState: EvaluationInvitationState;
  decision?: 'offer' | 'accepted-offer' | 'reject' | 'progress' | null;
  offerDecisionStatus?: OfferDecisionStatus | null;
}

export interface EvaluationRoundSnapshot {
  roundNumber: number;
  interviewCount: number;
  interviews: InterviewSlot[];
  forms: InterviewStatusRecord[];
  fitQuestionId?: string;
  processStatus: EvaluationProcessStatus;
  processStartedAt?: string;
  completedAt?: string;
  createdAt: string;
  decision?: 'offer' | 'accepted-offer' | 'reject' | 'progress' | null;
  offerDecisionStatus?: OfferDecisionStatus | null;
}

export interface EvaluationInvitationState {
  hasInvitations: boolean;
  hasPendingChanges: boolean;
  lastSentAt?: string;
  slots: InvitationSlotState[];
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

export interface InterviewerAssignmentView {
  evaluationId: string;
  slotId: string;
  interviewerEmail: string;
  interviewerName: string;
  invitationSentAt: string;
  roundNumber: number;
  evaluationUpdatedAt: string;
  evaluationProcessStatus: EvaluationProcessStatus;
  candidate?: import('./candidate').CandidateProfile;
  caseFolder?: import('./caseLibrary').CaseFolder;
  fitQuestion?: import('./fitQuestion').FitQuestion;
  form: InterviewStatusRecord | null;
  peerForms: InterviewPeerFormView[];
  decision?: EvaluationDecision | null;
}

export interface InterviewPeerFormView {
  slotId: string;
  interviewerName: string;
  interviewerEmail: string;
  submitted: boolean;
  form: InterviewStatusRecord | null;
}
