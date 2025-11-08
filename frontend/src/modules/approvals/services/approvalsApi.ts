import { apiRequest } from '../../../shared/api/httpClient';
import { ApprovalTask, ApprovalDecision } from '../../../shared/types/approval';

const normalizeTask = (value: unknown): ApprovalTask | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const id = typeof payload.id === 'string' ? payload.id : null;
  const initiativeId = typeof payload.initiativeId === 'string' ? payload.initiativeId : null;
  const stageKey = typeof payload.stageKey === 'string' ? payload.stageKey : null;
  if (!id || !initiativeId || !stageKey) {
    return null;
  }
  return {
    id,
    initiativeId,
    initiativeName: typeof payload.initiativeName === 'string' ? payload.initiativeName : 'Untitled initiative',
    workstreamId: typeof payload.workstreamId === 'string' ? payload.workstreamId : '',
    workstreamName: typeof payload.workstreamName === 'string' ? payload.workstreamName : 'Workstream',
    workstreamDescription: typeof payload.workstreamDescription === 'string' ? payload.workstreamDescription : null,
    stageKey: stageKey as ApprovalTask['stageKey'],
    roundIndex: Number(payload.roundIndex ?? 0),
    roundCount: Number(payload.roundCount ?? 0),
    role: typeof payload.role === 'string' ? payload.role : '',
    rule: (payload.rule as ApprovalTask['rule']) ?? 'any',
    status: (payload.status as ApprovalTask['status']) ?? 'pending',
    accountId: typeof payload.accountId === 'string' ? payload.accountId : null,
    accountName: typeof payload.accountName === 'string' ? payload.accountName : null,
    accountEmail: typeof payload.accountEmail === 'string' ? payload.accountEmail : null,
    requestedAt: typeof payload.requestedAt === 'string' ? payload.requestedAt : new Date().toISOString(),
    decidedAt: typeof payload.decidedAt === 'string' ? payload.decidedAt : null,
    ownerName: typeof payload.ownerName === 'string' ? payload.ownerName : null,
    ownerAccountId: typeof payload.ownerAccountId === 'string' ? payload.ownerAccountId : null,
    stage: (payload.stage as ApprovalTask['stage']) ?? {
      key: stageKey as ApprovalTask['stageKey'],
      name: '',
      description: '',
      periodMonth: null,
      periodYear: null,
      financials: {
        'recurring-benefits': [],
        'recurring-costs': [],
        'oneoff-benefits': [],
        'oneoff-costs': []
      }
    },
    stageState: (payload.stageState as ApprovalTask['stageState']) ?? {
      status: 'draft',
      roundIndex: 0,
      comment: null
    },
    totals: (payload.totals as ApprovalTask['totals']) ?? {
      recurringBenefits: 0,
      recurringCosts: 0,
      oneoffBenefits: 0,
      oneoffCosts: 0,
      recurringImpact: 0
    },
    roleTotal: Number(payload.roleTotal ?? 0),
    roleApproved: Number(payload.roleApproved ?? 0),
    rolePending: Number(payload.rolePending ?? 0)
  };
};

const ensureTaskList = (value: unknown): ApprovalTask[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeTask(item)).filter((item): item is ApprovalTask => Boolean(item));
};

export const approvalsApi = {
  list: async (params: { status?: string; accountId?: string | null } = {}) => {
    const search = new URLSearchParams();
    if (params.status) {
      search.set('status', params.status);
    }
    if (params.accountId) {
      search.set('accountId', params.accountId);
    }
    const query = search.toString();
    return ensureTaskList(await apiRequest<unknown>(`/approvals${query ? `?${query}` : ''}`));
  },
  decide: async (
    approvalId: string,
    decision: ApprovalDecision,
    payload: { comment?: string | null; accountId?: string | null }
  ) =>
    apiRequest(`/approvals/${approvalId}/decision`, {
      method: 'POST',
      body: {
        decision,
        comment: payload.comment,
        accountId: payload.accountId
      }
    })
};
