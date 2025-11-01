import { apiRequest } from '../../../shared/api/httpClient';
import { AccountRecord, AccountRole, InterviewerSeniority } from '../../../shared/types/account';

type AccountStatus = 'pending' | 'active';

type AccountPayload = Partial<AccountRecord> & {
  id?: unknown;
  email?: unknown;
  role?: unknown;
  status?: unknown;
  invitedAt?: unknown;
  activatedAt?: unknown;
  invitationToken?: unknown;
  createdAt?: unknown;
  name?: unknown;
  displayName?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  interviewerRole?: unknown;
};

const isRole = (value: unknown): value is AccountRole =>
  value === 'super-admin' || value === 'admin' || value === 'user';

const isStatus = (value: unknown): value is AccountStatus => value === 'pending' || value === 'active';

const isInterviewerRole = (value: unknown): value is InterviewerSeniority =>
  value === 'MD' || value === 'SD' || value === 'D' || value === 'SM' || value === 'M' || value === 'SA' || value === 'A';

const asIsoString = (value: unknown): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
  }
  return undefined;
};

const normalizeAccount = (payload: unknown): AccountRecord | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as AccountPayload;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id : null;
  const email = typeof record.email === 'string' && record.email.trim() ? record.email : null;
  const role = isRole(record.role) ? record.role : null;
  const status = isStatus(record.status) ? record.status : null;
  const invitationToken = typeof record.invitationToken === 'string' ? record.invitationToken : null;
  const interviewerRole = isInterviewerRole(record.interviewerRole) ? record.interviewerRole : null;

  if (!id || !email || !role || !status || !invitationToken) {
    return null;
  }

  const invitedAt = asIsoString(record.invitedAt ?? record.createdAt);
  const activatedAt = asIsoString(record.activatedAt);

  const primaryName = typeof record.name === 'string' ? record.name.trim() : '';
  const displayName = typeof record.displayName === 'string' ? record.displayName.trim() : '';
  const firstNameRaw = typeof record.firstName === 'string' ? record.firstName.trim() : '';
  const lastNameRaw = typeof record.lastName === 'string' ? record.lastName.trim() : '';
  const composedName = [firstNameRaw, lastNameRaw].filter((value) => Boolean(value)).join(' ').trim();

  let name: string | undefined;
  if (primaryName) {
    name = primaryName;
  } else if (displayName) {
    name = displayName;
  } else if (composedName) {
    name = composedName;
  } else {
    const legacy = [lastNameRaw, firstNameRaw].filter((value) => Boolean(value)).join(' ').trim();
    name = legacy || undefined;
  }

  return {
    id,
    email,
    role,
    status,
    interviewerRole,
    name,
    firstName: firstNameRaw || undefined,
    lastName: lastNameRaw || undefined,
    invitedAt: invitedAt ?? new Date(0).toISOString(),
    activatedAt,
    invitationToken
  };
};

const ensureAccount = (payload: unknown): AccountRecord => {
  const account = normalizeAccount(payload);
  if (!account) {
    throw new Error('Failed to parse the account payload.');
  }
  return account;
};

const ensureAccountList = (value: unknown): AccountRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeAccount(item))
    .filter((account): account is AccountRecord => Boolean(account));
};

export const accountsApi = {
  list: async () => ensureAccountList(await apiRequest<unknown>('/accounts')),
  invite: async (
    email: string,
    role: AccountRole,
    firstName: string,
    lastName: string,
    interviewerRole: InterviewerSeniority
  ) =>
    ensureAccount(
      await apiRequest<unknown>('/accounts/invite', {
        method: 'POST',
        body: { email, role, firstName, lastName, interviewerRole }
      })
    ),
  activate: async (id: string) =>
    ensureAccount(
      await apiRequest<unknown>(`/accounts/${id}/activate`, {
        method: 'POST'
      })
    ),
  remove: async (id: string) =>
    ensureAccount(
      await apiRequest<unknown>(`/accounts/${id}`, {
        method: 'DELETE'
      })
    ),
  updateRole: async (id: string, role: 'admin' | 'user') =>
    ensureAccount(
      await apiRequest<unknown>(`/accounts/${id}/role`, {
        method: 'POST',
        body: { role }
      })
    )
};
