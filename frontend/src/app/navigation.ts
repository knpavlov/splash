import { AccountRole } from '../shared/types/account';
import {
  Activity,
  Library,
  ListChecks,
  HelpCircle,
  Users,
  BarChart2,
  ClipboardCheck,
  Workflow,
  DollarSign,
  Target,
  Layers,
  CheckSquare,
  MessageSquare,
  LayoutDashboard,
  TrendingUp,
  Map,
  Clock,
  Grid,
  Network,
  UserCog,
  Settings,
  Camera,
  FileText,
  LucideIcon
} from 'lucide-react';

export type NavigationKey =
  | 'activity'
  | 'cases'
  | 'case-criteria'
  | 'questions'
  | 'workstreams'
  | 'initiatives'
  | 'approvals'
  | 'candidates'
  | 'evaluation'
  | 'interviews'
  | 'stats'
  | 'accounts'
  | 'participants'
  | 'stage-gate-dashboard'
  | 'capacity-heatmap'
  | 'deadline-dashboard'
  | 'financial-tree'
  | 'portfolio-plan'
  | 'financial-dynamics'
  | 'financials'
  | 'kpis'
  | 'general-settings'
  | 'snapshot-settings'
  | 'initiative-logs';

export type NavigationGroupKey = 'old' | 'program' | 'dashboards' | 'settings';

export interface NavigationItem {
  key: NavigationKey;
  label: string;
  roleAccess: AccountRole[];
  group?: NavigationGroupKey;
  disabled?: boolean;
  hidden?: boolean;
  icon?: LucideIcon;
}

export const navigationGroups: { id: NavigationGroupKey; label: string; collapsed?: boolean }[] = [
  { id: 'old', label: 'Old', collapsed: true },
  { id: 'program', label: 'Program setup', collapsed: false },
  { id: 'dashboards', label: 'Dashboards', collapsed: false },
  { id: 'settings', label: 'Settings', collapsed: false }
];

export const navigationItems: NavigationItem[] = [
  { key: 'activity', label: "What's new", roleAccess: ['super-admin', 'admin', 'user'], icon: Activity },
  { key: 'cases', label: 'Case library', roleAccess: ['super-admin', 'admin'], group: 'old', icon: Library },
  { key: 'case-criteria', label: 'Case criteria', roleAccess: ['super-admin', 'admin'], group: 'old', icon: ListChecks },
  { key: 'questions', label: 'Fit questions', roleAccess: ['super-admin', 'admin'], group: 'old', icon: HelpCircle },
  { key: 'candidates', label: 'Candidate database', roleAccess: ['super-admin', 'admin'], group: 'old', icon: Users },
  { key: 'stats', label: 'Analytics', roleAccess: ['super-admin', 'admin'], group: 'old', icon: BarChart2 },
  { key: 'evaluation', label: 'Evaluations', roleAccess: ['super-admin', 'admin'], group: 'old', icon: ClipboardCheck },
  { key: 'workstreams', label: 'Workstreams', roleAccess: ['super-admin', 'admin'], group: 'program', icon: Workflow },
  { key: 'participants', label: 'Participants', roleAccess: ['super-admin', 'admin'], group: 'program', icon: Users },
  { key: 'financials', label: 'Financials', roleAccess: ['super-admin', 'admin'], group: 'program', icon: DollarSign },
  { key: 'kpis', label: 'KPIs', roleAccess: ['super-admin', 'admin'], group: 'program', disabled: true, icon: Target },
  { key: 'initiatives', label: 'Initiatives', roleAccess: ['super-admin', 'admin'], icon: Layers },
  { key: 'approvals', label: 'Approvals', roleAccess: ['super-admin', 'admin', 'user'], icon: CheckSquare },
  { key: 'interviews', label: 'Interviews', roleAccess: ['super-admin', 'admin', 'user'], group: 'old', icon: MessageSquare },
  {
    key: 'stage-gate-dashboard',
    label: 'Stage-gate pipeline',
    roleAccess: ['super-admin', 'admin'],
    group: 'dashboards',
    icon: LayoutDashboard
  },
  {
    key: 'financial-dynamics',
    label: 'P&L dynamics',
    roleAccess: ['super-admin', 'admin'],
    group: 'dashboards',
    icon: TrendingUp
  },
  {
    key: 'portfolio-plan',
    label: 'Portfolio plan',
    roleAccess: ['super-admin', 'admin'],
    group: 'dashboards',
    icon: Map
  },
  { key: 'deadline-dashboard', label: 'Deadline radar', roleAccess: ['super-admin', 'admin'], group: 'dashboards', icon: Clock },
  { key: 'capacity-heatmap', label: 'Capacity heatmap', roleAccess: ['super-admin', 'admin'], group: 'dashboards', icon: Grid },
  { key: 'financial-tree', label: 'P&L tree', roleAccess: ['super-admin', 'admin'], group: 'dashboards', icon: Network },
  { key: 'accounts', label: 'Account management', roleAccess: ['super-admin', 'admin'], group: 'settings', icon: UserCog },
  { key: 'general-settings', label: 'General settings', roleAccess: ['super-admin', 'admin'], group: 'settings', icon: Settings },
  {
    key: 'snapshot-settings',
    label: 'Snapshot settings',
    roleAccess: ['super-admin', 'admin'],
    group: 'settings',
    hidden: true,
    icon: Camera
  },
  { key: 'initiative-logs', label: 'Initiative log', roleAccess: ['super-admin', 'admin'], group: 'settings', icon: FileText }
];

