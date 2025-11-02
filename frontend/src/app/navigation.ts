import { AccountRole } from '../shared/types/account';

export type NavigationKey =
  | 'cases'
  | 'case-criteria'
  | 'questions'
  | 'candidates'
  | 'evaluation'
  | 'interviews'
  | 'stats'
  | 'accounts';

export interface NavigationItem {
  key: NavigationKey;
  label: string;
  roleAccess: AccountRole[];
}

export const navigationItems: NavigationItem[] = [
  { key: 'cases', label: 'Case library', roleAccess: ['super-admin', 'admin'] },
  { key: 'case-criteria', label: 'Case criteria', roleAccess: ['super-admin', 'admin'] },
  { key: 'questions', label: 'Fit questions', roleAccess: ['super-admin', 'admin'] },
  { key: 'candidates', label: 'Candidate database', roleAccess: ['super-admin', 'admin'] },
  { key: 'evaluation', label: 'Evaluations', roleAccess: ['super-admin', 'admin'] },
  { key: 'interviews', label: 'Interviews', roleAccess: ['super-admin', 'admin', 'user'] },
  { key: 'stats', label: 'Analytics', roleAccess: ['super-admin', 'admin'] },
  { key: 'accounts', label: 'Account management', roleAccess: ['super-admin', 'admin'] }
];

export const navigationPaths: Record<NavigationKey, string> = {
  cases: '/cases',
  'case-criteria': '/case-criteria',
  questions: '/questions',
  candidates: '/candidates',
  evaluation: '/evaluations',
  interviews: '/interviews',
  stats: '/stats',
  accounts: '/accounts'
};

export const resolveNavigationKey = (pathname: string): NavigationKey => {
  if (pathname.startsWith('/evaluations')) {
    return 'evaluation';
  }
  if (pathname.startsWith('/case-criteria')) {
    return 'case-criteria';
  }
  if (pathname.startsWith('/questions')) {
    return 'questions';
  }
  if (pathname.startsWith('/candidates')) {
    return 'candidates';
  }
  if (pathname.startsWith('/interviews')) {
    return 'interviews';
  }
  if (pathname.startsWith('/stats')) {
    return 'stats';
  }
  if (pathname.startsWith('/accounts')) {
    return 'accounts';
  }
  return 'cases';
};
