export type AccountRole = 'super-admin' | 'admin' | 'user';
export type AccountStatus = 'pending' | 'active';
export type InterviewerSeniority = 'MD' | 'SD' | 'D' | 'SM' | 'M' | 'SA' | 'A';

export interface UiPreferences {
  initiativesTableColumns?: Record<string, number>;
  [key: string]: unknown;
}

export interface AccountRecord {
  id: string;
  email: string;
  role: AccountRole;
  status: AccountStatus;
  interviewerRole?: InterviewerSeniority | null;
  name?: string;
  firstName?: string;
  lastName?: string;
  invitedAt: string;
  activatedAt?: string;
  invitationToken: string;
  uiPreferences?: UiPreferences;
}
