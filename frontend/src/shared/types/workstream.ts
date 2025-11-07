export type WorkstreamGateKey = 'l1' | 'l2' | 'l3' | 'l4' | 'l5';

export type ApprovalRule = 'any' | 'all' | 'majority';

export interface WorkstreamApproverRequirement {
  id: string;
  role: string;
  rule: ApprovalRule;
}

export interface WorkstreamApprovalRound {
  id: string;
  approvers: WorkstreamApproverRequirement[];
}

export type WorkstreamGates = Record<WorkstreamGateKey, WorkstreamApprovalRound[]>;

export interface Workstream {
  id: string;
  name: string;
  description: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  gates: WorkstreamGates;
}

export const gateLabels: Record<WorkstreamGateKey, string> = {
  l1: 'L1 Gate',
  l2: 'L2 Gate',
  l3: 'L3 Gate',
  l4: 'L4 Gate',
  l5: 'L5 Gate'
};

export const approvalRuleOptions: { label: string; value: ApprovalRule }[] = [
  { label: 'Any', value: 'any' },
  { label: 'All', value: 'all' },
  { label: 'Majority', value: 'majority' }
];
