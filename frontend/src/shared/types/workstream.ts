export const workstreamGateKeys = ['l1', 'l2', 'l3', 'l4', 'l5'] as const;
export type WorkstreamGateKey = (typeof workstreamGateKeys)[number];

export type ApprovalRule = 'any' | 'all' | 'majority';

export interface WorkstreamApproverRequirement {
  id: string;
  accountId: string | null;
  role?: string | null;
}

export interface WorkstreamApprovalRound {
  id: string;
  rule: ApprovalRule;
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

export const defaultWorkstreamRoleOptions = [
  { value: 'initiative-owner', label: 'Initiative Owner' },
  { value: 'milestone-owner', label: 'Milestone Owner' },
  { value: 'workstream-lead', label: 'Workstream Lead' },
  { value: 'manager-full-viewing-rights', label: 'Manager (Full Viewing Rights)' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'head-of-transformation', label: 'Head of Transformation' },
  { value: 'transformation-lead', label: 'Transformation Lead' },
  { value: 'transformation-office-team-member', label: 'Transformation Office Team Member' },
  { value: 'finance-team-member', label: 'Finance Team Member' },
  { value: 'head-of-finance', label: 'Head of Finance' },
  { value: 'manager-limited-viewing-rights', label: 'Manager (Limited Viewing Rights)' }
] as const;

export type WorkstreamRole = string;

export interface WorkstreamRoleOption {
  value: WorkstreamRole;
  label: string;
}

export interface WorkstreamRoleAssignment {
  id: string;
  accountId: string;
  workstreamId: string;
  role: WorkstreamRole;
  createdAt: string;
  updatedAt: string;
}

export interface WorkstreamRoleSelection {
  workstreamId: string;
  role: WorkstreamRole | null;
}
