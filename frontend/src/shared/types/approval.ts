import { InitiativeStageData, InitiativeStageKey, InitiativeStageState, InitiativeTotals } from './initiative';

export type ApprovalDecision = 'approve' | 'return' | 'reject';
export type ApprovalRule = 'any' | 'all' | 'majority';
export type ApprovalStatus = 'pending' | 'approved' | 'returned' | 'rejected';

export interface ApprovalTask {
  id: string;
  initiativeId: string;
  initiativeName: string;
  workstreamId: string;
  workstreamName: string;
  workstreamDescription: string | null;
  stageKey: InitiativeStageKey;
  roundIndex: number;
  roundCount: number;
  role: string;
  accountRole: string | null;
  rule: ApprovalRule;
  status: ApprovalStatus;
  accountId: string | null;
  accountName: string | null;
  accountEmail: string | null;
  requestedAt: string;
  decidedAt: string | null;
  ownerName: string | null;
  ownerAccountId: string | null;
  stage: InitiativeStageData;
  stageState: InitiativeStageState;
  totals: InitiativeTotals;
  roundTotal: number;
  roundApproved: number;
  roundPending: number;
}
