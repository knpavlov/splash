import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from '../../../styles/InitiativeProfile.module.css';
import type { ReactNode } from 'react';
import { ChevronIcon } from '../../../components/icons/ChevronIcon';
import {
  Initiative,
  InitiativeStageData,
  InitiativeStageKey,
  initiativeStageKeys,
  initiativeStageLabels,
  InitiativeStageState,
  initiativeFinancialKinds,
  InitiativeFinancialKind,
  InitiativePlanActualsModel,
  InitiativePlanModel,
  InitiativePlanTask,
  InitiativeRisk,
  InitiativeRiskComment
} from '../../../shared/types/initiative';
import { Workstream, WorkstreamGateKey, WorkstreamRoleAssignment } from '../../../shared/types/workstream';
import { AccountRecord } from '../../../shared/types/account';
import { StageGatePanel } from './StageGatePanel';
import { FinancialActuals, FinancialEditor } from './FinancialEditor';
import { generateId } from '../../../shared/ui/generateId';
import { DomainResult } from '../../../shared/types/results';
import { resolveAccountName } from '../../../shared/utils/accountName';
import { initiativesApi, InitiativeEventEntry } from '../services/initiativesApi';
import { buildKindActualMonthlyTotals, buildKindMonthlyTotals, buildMonthRange, calculateRunRate } from './financials.helpers';
import { CommentSidebar } from '../comments/CommentSidebar';
import { CommentSelectionOverlay } from '../comments/CommentSelectionOverlay';
import { CommentHighlights } from '../comments/CommentHighlights';
import { CommentInputPopover } from '../comments/CommentInputPopover';
import { CommentSelectionDraft, CommentSelectionTarget } from '../comments/types';
import { useCommentAnchors } from '../comments/useCommentAnchors';
import { createCommentAnchor } from '../comments/commentAnchors';
import { useInitiativeComments } from '../hooks/useInitiativeComments';
import { useAuth } from '../../auth/AuthContext';
import { PeriodSettings, usePlanSettingsState, useWorkstreamsState } from '../../../app/state/AppStateContext';
import { createEmptyPlanActualsModel, createEmptyPlanModel, sanitizePlanModel } from '../plan/planModel';
import { InitiativePlanModule } from './plan/InitiativePlanModule';
import { StageKpiEditor } from './StageKpiEditor';
import { StageKpiActuals } from './StageKpiActuals';
import { snapshotsApi } from '../../snapshots/services/snapshotsApi';
import { StageSupportingDocs } from './StageSupportingDocs';
import { initiativeFormSettingsApi } from '../services/initiativeFormSettingsApi';
import { StickyTopPanel } from '../../../components/layout/StickyTopPanel';
import {
  createDefaultInitiativeFormSettingsMatrix,
  initiativeFormBlocks,
  initiativeFormBlockKeys,
  type InitiativeFormBlockKey,
  type InitiativeFormFieldRequirement,
  type InitiativeFormSettingsPayload
} from '../../../shared/types/initiativeFormSettings';

interface InitiativeProfileProps {
  mode: 'create' | 'view';
  initiative: Initiative | null;
  allInitiatives: Initiative[];
  workstreams: Workstream[];
  accounts: AccountRecord[];
  initialWorkstreamId?: string;
  onBack: (workstreamId?: string) => void;
  onSave: (initiative: Initiative, options: { closeAfterSave: boolean }) => Promise<DomainResult<Initiative>>;
  onDelete: (id: string) => Promise<DomainResult<string>>;
  onSubmitStage: (id: string) => Promise<DomainResult<Initiative>>;
  readOnly?: boolean;
  hideBackLink?: boolean;
  focusPlanTaskId?: string | null;
  openPlanFullscreen?: boolean;
  onPlanFocusClear?: () => void;
  dataLoaded?: boolean;
  initialCommentThreadId?: string | null;
  openComments?: boolean;
  topPanelExtraLeft?: ReactNode;
  topPanelExtraRight?: ReactNode;
  topPanelMessage?: ReactNode;
}

type Banner = { type: 'info' | 'error'; text: string } | null;
type ValidationErrors = {
  initiativeName?: boolean;
  workstream?: boolean;
  stageName?: boolean;
  stageDescription?: boolean;
};

const VALUE_STEP_LABEL = 'Value Step';

const initiativeFormBlockByKey = initiativeFormBlocks.reduce(
  (acc, block) => {
    acc[block.key] = block;
    return acc;
  },
  {} as Record<InitiativeFormBlockKey, (typeof initiativeFormBlocks)[number]>
);
const defaultInitiativeFormMatrix = createDefaultInitiativeFormSettingsMatrix();

const hasNumericEntry = (input: Record<string, number> | null | undefined) =>
  Boolean(input && Object.values(input).some((value) => Number.isFinite(value)));

const isFormBlockFilled = (initiative: Initiative, stageKey: InitiativeStageKey, blockKey: InitiativeFormBlockKey) => {
  const stage = initiative.stages?.[stageKey];
  switch (blockKey) {
    case 'financial-outlook':
      return initiativeFinancialKinds.some((kind) =>
        (stage?.financials?.[kind] ?? []).some((entry) => entry.label.trim() !== '' && hasNumericEntry(entry.distribution))
      );
    case 'pnl-actuals':
      return initiativeFinancialKinds.some((kind) =>
        (stage?.financials?.[kind] ?? []).some((entry) => entry.label.trim() !== '' && hasNumericEntry(entry.actuals))
      );
    case 'kpis':
      return (stage?.kpis ?? []).some((kpi) => kpi.name.trim() !== '' && hasNumericEntry(kpi.distribution));
    case 'kpi-actuals':
      return (stage?.kpis ?? []).some((kpi) => kpi.name.trim() !== '' && hasNumericEntry(kpi.actuals));
    case 'supporting-docs':
      return (stage?.supportingDocs ?? []).length > 0;
    case 'implementation-plan':
      return (initiative.plan?.tasks ?? []).some((task) => task.name.trim() !== '');
    case 'implementation-plan-actuals':
      return (initiative.plan?.actuals?.tasks ?? []).some((task) => task.name.trim() !== '');
    case 'risks':
      return (initiative.risks ?? []).some((risk) => risk.title.trim() !== '');
    default:
      return true;
  }
};

const resolveFormRequirement = (
  settings: InitiativeFormSettingsPayload | null,
  stageKey: InitiativeStageKey,
  blockKey: InitiativeFormBlockKey
): InitiativeFormFieldRequirement => {
  const stage = settings?.stages?.[stageKey] ?? defaultInitiativeFormMatrix.stages[stageKey];
  return stage?.[blockKey] ?? 'optional';
};

const createEmptyStage = (key: InitiativeStageKey, period?: PeriodSettings): InitiativeStageData => {
  const now = new Date();
  return {
    key,
    name: '',
    description: '',
    periodMonth: period?.periodMonth ?? now.getMonth() + 1,
    periodYear: period?.periodYear ?? now.getFullYear(),
    l4Date: null,
    valueStepTaskId: null,
    additionalCommentary: '',
    calculationLogic: initiativeFinancialKinds.reduce(
      (acc, kind) => {
        acc[kind] = '';
        return acc;
      },
      {} as InitiativeStageData['calculationLogic']
    ),
    businessCaseFiles: [],
    supportingDocs: [],
    kpis: [],
    financials: {
      'recurring-benefits': [],
      'recurring-costs': [],
      'oneoff-benefits': [],
      'oneoff-costs': []
    }
  };
};

const calculateTotals = (stages: Initiative['stages']) => {
  const sum = (kind: keyof Initiative['totals']) => {
    let total = 0;
    for (const stageKey of initiativeStageKeys) {
      const entries = stages[stageKey].financials[
        kind === 'recurringBenefits'
          ? 'recurring-benefits'
          : kind === 'recurringCosts'
            ? 'recurring-costs'
            : kind === 'oneoffBenefits'
              ? 'oneoff-benefits'
              : 'oneoff-costs'
      ];
      for (const entry of entries) {
        for (const value of Object.values(entry.distribution)) {
          if (Number.isFinite(value)) {
            total += value;
          }
        }
      }
    }
    return total;
  };

  const recurringBenefits = sum('recurringBenefits');
  const recurringCosts = sum('recurringCosts');
  const oneoffBenefits = sum('oneoffBenefits');
  const oneoffCosts = sum('oneoffCosts');

  return {
    recurringBenefits,
    recurringCosts,
    oneoffBenefits,
    oneoffCosts,
    recurringImpact: recurringBenefits - recurringCosts
  };
};

const calculateFinancialSummary = (totals: Initiative['totals']): Initiative['financialSummary'] => {
  const denominator = totals.oneoffCosts;
  if (!Number.isFinite(denominator) || denominator === 0) {
    return { roi: null };
  }
  const roi =
    (totals.recurringBenefits + totals.oneoffBenefits - totals.recurringCosts - totals.oneoffCosts) / denominator;
  return { roi: Number.isFinite(roi) ? roi : null };
};

const createDefaultStageState = () =>
  initiativeStageKeys.reduce(
    (acc, key) => {
      acc[key] = { status: 'draft', roundIndex: 0, comment: null };
      return acc;
    },
    {} as Initiative['stageState']
  );

const getGateKeyForStage = (key: InitiativeStageKey): WorkstreamGateKey | null => {
  const index = initiativeStageKeys.indexOf(key);
  if (index === -1) {
    return null;
  }
  const next = initiativeStageKeys[index + 1];
  if (!next || next === 'l0') {
    return null;
  }
  return next as WorkstreamGateKey;
};

const createEmptyInitiative = (workstreamId?: string, period?: PeriodSettings): Initiative => {
  const now = new Date().toISOString();
  const stages = initiativeStageKeys.reduce((acc, key) => {
    acc[key] = createEmptyStage(key, period);
    return acc;
  }, {} as Initiative['stages']);

  return {
    id: generateId(),
    workstreamId: workstreamId ?? '',
    name: '',
    description: '',
    ownerAccountId: null,
    ownerName: null,
    currentStatus: 'draft',
    activeStage: 'l0',
    l4Date: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    stages,
    stageState: createDefaultStageState(),
    totals: calculateTotals(stages),
    financialSummary: { roi: null },
    risks: [],
    plan: createEmptyPlanModel()
  };
};

const formatImpact = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const formatRoi = (value: number | null) =>
  value === null || Number.isNaN(value)
    ? '-'
    : new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      }).format(value);

const clampRiskValue = (value: number) => {
  const numeric = Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.min(5, Math.max(1, Math.round(numeric)));
};

const getRiskTone = (severity: number, likelihood: number) => {
  const score = clampRiskValue(severity) * clampRiskValue(likelihood);
  if (score <= 0) {
    return 'unset';
  }
  if (score >= 16) {
    return 'high';
  }
  if (score >= 9) {
    return 'medium';
  }
  return 'low';
};

const severityScaleLabels = ['Minimal impact', 'Manageable', 'Material', 'Major', 'Critical'];
const likelihoodScaleLabels = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];

const formatDate = (value: string | null) => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
};

interface SparklineCardProps {
  label: string;
  value: string;
  valueLabel: string;
  periodStart: string;
  periodEnd: string;
  values: number[];
  color: string;
  formatValue?: (value: number) => string;
  yBounds?: { min: number; max: number };
}

const SparklineCard = ({
  label,
  value,
  valueLabel,
  periodStart,
  periodEnd,
  values,
  color,
  formatValue,
  yBounds
}: SparklineCardProps) => {
  const [plotWidth, setPlotWidth] = useState(240);
  const height = 70;

  const figureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = figureRef.current;
    if (!node) {
      return;
    }
    const updateWidth = () => {
      const nextWidth = node.clientWidth;
      if (Number.isFinite(nextWidth) && nextWidth > 0) {
        setPlotWidth(Math.max(140, nextWidth));
      }
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateWidth());
      observer.observe(node);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const baseMin = values.length ? Math.min(...values) : 0;
  const baseMax = values.length ? Math.max(...values) : 0;
  const domainMin = Number.isFinite(yBounds?.min) ? (yBounds?.min as number) : baseMin;
  const domainMax = Number.isFinite(yBounds?.max) ? (yBounds?.max as number) : baseMax;
  const span = domainMax - domainMin || 1;
  const padding = Math.max(6, Math.abs(span) * 0.1);
  const paddedMin = domainMin - padding;
  const paddedMax = domainMax + padding;
  const range = paddedMax - paddedMin || 1;

  const axisMin = domainMin;
  const axisMax = domainMax;

  const points =
    values.length === 0
      ? [
          { x: 0, y: height / 2 },
          { x: plotWidth, y: height / 2 }
        ]
      : values.map((point, index) => {
          const x = values.length === 1 ? plotWidth / 2 : (index / (values.length - 1)) * plotWidth;
          const normalized = (point - paddedMin) / range;
          const y = height - normalized * height;
          return { x, y };
        });

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');

  return (
    <div className={styles.sparkCard}>
      <div className={styles.sparkHeader}>
        <div>
          <span className={styles.quickLabel}>{label}</span>
          <span className={styles.sparkSubLabel}>{valueLabel}</span>
        </div>
        <div className={styles.sparkValue}>{value}</div>
      </div>
      <div className={styles.sparkBody}>
        <div className={styles.sparkAxis}>
          <span className={styles.sparkAxisLabel}>{(formatValue ?? ((v: number) => v.toFixed(0)))(axisMax)}</span>
          <span className={styles.sparkAxisLabel}>{(formatValue ?? ((v: number) => v.toFixed(0)))(axisMin)}</span>
        </div>
        <div className={styles.sparkFigure} ref={figureRef}>
          <svg
            className={styles.sparkline}
            width="100%"
            height={height}
            viewBox={`0 0 ${plotWidth} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={label}
          >
            <defs>
              <linearGradient id={`spark-gradient-${label.replace(/\s+/g, '-')}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={color} stopOpacity="0.05" />
              </linearGradient>
            </defs>
            <path
              d={`${path} V ${height} H 0 Z`}
              fill={`url(#spark-gradient-${label.replace(/\s+/g, '-')})`}
              stroke="none"
            />
            <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
            {points.map((point, index) => (
              <circle key={`${label}-${index}`} cx={point.x} cy={point.y} r={2.4} fill={color} />
            ))}
          </svg>
          <div className={styles.sparkPeriodRange}>
            <span>{periodStart}</span>
            <span>{periodEnd}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const RoiCard = ({ value, periodStart, periodEnd }: { value: string; periodStart: string; periodEnd: string }) => (
  <div className={`${styles.sparkCard} ${styles.roiCard}`}>
    <div className={styles.sparkHeader}>
      <div>
        <span className={styles.quickLabel}>ROI</span>
        <span className={styles.sparkSubLabel}>Full-period benefits vs costs</span>
      </div>
      <div className={styles.sparkValue}>{value}</div>
    </div>
    <div className={styles.roiPlaceholder}>Includes recurring and one-off totals for the entire timeline.</div>
    <div className={styles.sparkPeriodRange}>
      <span>{periodStart}</span>
      <span>{periodEnd}</span>
    </div>
  </div>
);

const logFieldLabels: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  workstream: 'Workstream',
  owner: 'Owner',
  status: 'Status',
  activeStage: 'Active stage',
  l4Date: 'L4 date',
  recurringImpact: 'Recurring impact',
  created: 'Created',
  updated: 'Update',
  risks: 'Risk register',
  'stage-content': 'Stage details',
  kpi: 'KPIs',
  'execution-plan': 'Timeline',
  'plan.timeline': 'Execution plan',
  'plan.actuals': 'Plan actuals'
};

const financialKindLabels: Record<string, string> = {
  'recurring-benefits': 'Recurring benefits',
  'recurring-costs': 'Recurring costs',
  'oneoff-benefits': 'One-off benefits',
  'oneoff-costs': 'One-off costs'
};

const resolveStageLabel = (key: string) => initiativeStageLabels[key as InitiativeStageKey] ?? key.toUpperCase();

const buildChangeLabel = (field: string): string => {
  if (field === 'created') {
    return 'Initiative created';
  }
  if (field === 'updated') {
    return 'Update';
  }
  if (field === 'stage-content') {
    return 'Stage content updated';
  }
  if (field === 'execution-plan') {
    return 'Timeline updated';
  }
  if (field === 'kpi') {
    return 'KPIs updated';
  }
  if (field.startsWith('stageState.')) {
    const stageKey = field.split('.')[1] ?? '';
    return `${resolveStageLabel(stageKey)} · Stage status`;
  }
  if (field.startsWith('stage.')) {
    const [, stageKey, ...rest] = field.split('.');
    const suffix = rest.join('.');
    const stageLabel = resolveStageLabel(stageKey);
    if (suffix === 'name') {
      return `${stageLabel} · Stage name`;
    }
    if (suffix === 'description') {
      return `${stageLabel} · Stage description`;
    }
    if (suffix === 'period') {
      return `${stageLabel} · Period`;
    }
    if (suffix === 'commentary') {
      return `${stageLabel} · Additional commentary`;
    }
    if (suffix === 'valueStep') {
      return `${stageLabel} · Value Step`;
    }
    if (suffix === 'l4Date') {
      return `${stageLabel} · L4 date`;
    }
    if (suffix === 'calcLogic') {
      return `${stageLabel} · Calculation logic`;
    }
    if (suffix === 'businessCase') {
      return `${stageLabel} · Business case`;
    }
    if (suffix === 'supportingDocs') {
      return `${stageLabel} · Supporting docs`;
    }
    if (suffix.startsWith('financials.')) {
      const kindKey = suffix.replace('financials.', '');
      const kindLabel = financialKindLabels[kindKey] ?? kindKey;
      return `${stageLabel} · ${kindLabel}`;
    }
    if (suffix === 'kpis') {
      return `${stageLabel} · KPIs`;
    }
  }
  if (field.startsWith('plan.')) {
    if (field === 'plan.actuals') {
      return 'Plan actuals';
    }
    if (field === 'plan.timeline') {
      return 'Execution plan';
    }
  }
  if (field === 'risks') {
    return 'Risk register';
  }
  return logFieldLabels[field] ?? field;
};

const formatLogValue = (field: string, value: unknown): string => {
  if (value === null || value === undefined) {
    return '-';
  }
  if (field === 'activeStage' && typeof value === 'string') {
    return resolveStageLabel(value);
  }
  if (field === 'risks' && value && typeof value === 'object') {
    const payload = value as {
      count?: number;
      top?: Array<{ title?: string; category?: string; score?: number }>;
    };
    const count = Number.isFinite(payload.count) ? Number(payload.count) : Array.isArray(payload.top) ? payload.top.length : 0;
    const topEntries = Array.isArray(payload.top) ? payload.top : [];
    const topLabels = topEntries
      .map((item) => {
        const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : null;
        const category = typeof item.category === 'string' && item.category.trim() ? item.category.trim() : null;
        const score = Number.isFinite(item.score) ? Number(item.score) : null;
        if (!title && !category && score === null) {
          return null;
        }
        const parts = [title ?? 'Untitled risk', category, score !== null ? `score ${score}` : null].filter(Boolean);
        return parts.join(' · ');
      })
      .filter((entry): entry is string => Boolean(entry));
    const baseCount = count || topLabels.length;
    return `${baseCount} risk${baseCount === 1 ? '' : 's'}${topLabels.length ? `, top: ${topLabels.slice(0, 3).join('; ')}` : ''}`;
  }
  if (field.startsWith('stageState.') && value && typeof value === 'object') {
    const payload = value as { status?: string; roundIndex?: number; comment?: string | null };
    const status = payload.status ?? 'unknown';
    const round =
      typeof payload.roundIndex === 'number' && Number.isFinite(payload.roundIndex)
        ? ` (round ${Math.trunc(payload.roundIndex) + 1})`
        : '';
    const comment = payload.comment ? ` — ${payload.comment}` : '';
    return `${status}${round}${comment}`;
  }
  if (field.startsWith('stage.') && field.endsWith('.period') && value && typeof value === 'object') {
    const payload = value as { month?: number | null; year?: number | null };
    if (payload.month && payload.year) {
      return new Date(payload.year, payload.month - 1, 1).toLocaleString('en-US', {
        month: 'short',
        year: 'numeric'
      });
    }
  }
  if (field.startsWith('stage.') && field.endsWith('.calcLogic') && value && typeof value === 'object') {
    const parts = Object.entries(value as Record<string, string>)
      .map(([key, formula]) => (formula ? `${financialKindLabels[key] ?? key}: ${formula}` : null))
      .filter((item): item is string => Boolean(item));
    return parts.length ? parts.join('; ') : '-';
  }
  if (field.startsWith('stage.') && field.includes('.financials.') && value && typeof value === 'object') {
    const payload = value as { planTotal?: number; actualTotal?: number };
    const plan = Number.isFinite(payload.planTotal) ? Number(payload.planTotal) : 0;
    const actual = Number.isFinite(payload.actualTotal) ? Number(payload.actualTotal) : 0;
    return `Plan ${formatImpact(plan)} / Actual ${formatImpact(actual)}`;
  }
  if (
    field.startsWith('stage.') &&
    (field.endsWith('.businessCase') || field.endsWith('.supportingDocs')) &&
    value &&
    typeof value === 'object'
  ) {
    const payload = value as { count?: number; names?: string[] };
    const count = Number(payload.count ?? 0);
    const names = (payload.names ?? []).filter(Boolean);
    const base = `${count} file${count === 1 ? '' : 's'}`;
    return names.length ? `${base}: ${names.join(', ')}` : base;
  }
  if (field.startsWith('stage.') && field.endsWith('.kpis') && value && typeof value === 'object') {
    const payload = value as { count?: number; names?: string[] };
    const count = Number(payload.count ?? 0);
    const names = (payload.names ?? []).filter(Boolean);
    const base = `${count} KPI${count === 1 ? '' : 's'}`;
    return names.length ? `${base} (${names.join(', ')})` : base;
  }
  if (field.startsWith('plan.') && value && typeof value === 'object') {
    const payload = value as { taskCount?: number; milestoneCount?: number; startDate?: string | null; endDate?: string | null };
    const tasks = Number(payload.taskCount ?? 0);
    const milestones = Number(payload.milestoneCount ?? 0);
    const range =
      payload.startDate || payload.endDate
        ? `${payload.startDate ? formatDate(payload.startDate) : 'No start'} -> ${payload.endDate ? formatDate(payload.endDate) : 'No end'}`
        : 'No dates';
    return `${tasks} tasks, ${milestones} milestones (${range})`;
  }
  if (field === 'recurringImpact') {
    const numeric = typeof value === 'number' ? value : Number(value);
    return formatImpact(Number.isFinite(numeric) ? numeric : 0);
  }
  if ((field === 'l4Date' || field.endsWith('.l4Date')) && typeof value === 'string') {
    return formatDate(value);
  }
  if (field === 'owner' && value && typeof value === 'object') {
    const payload = value as { name?: string | null };
    return payload.name ?? 'Unassigned';
  }
  if (field === 'workstream' && typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

export const InitiativeProfile = ({
  mode,
  initiative,
  allInitiatives = [],
  workstreams,
  accounts,
  initialWorkstreamId,
  onBack,
  onSave,
  onDelete,
  onSubmitStage,
  readOnly = false,
  hideBackLink = false,
  focusPlanTaskId = null,
  openPlanFullscreen = false,
  onPlanFocusClear,
  dataLoaded = true,
  initialCommentThreadId = null,
  openComments = false,
  topPanelExtraLeft,
  topPanelExtraRight,
  topPanelMessage
}: InitiativeProfileProps) => {
  const { periodSettings, riskCategories } = usePlanSettingsState();
  const { listAssignmentsByWorkstream } = useWorkstreamsState();
  const [draft, setDraft] = useState<Initiative>(() =>
    initiative ?? createEmptyInitiative(initialWorkstreamId ?? workstreams[0]?.id, periodSettings)
  );
  const [selectedStage, setSelectedStage] = useState<InitiativeStageKey>(draft.activeStage);
  const [banner, setBanner] = useState<Banner>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [changeLog, setChangeLog] = useState<InitiativeEventEntry[]>([]);
  const [isLogLoading, setIsLogLoading] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [includeOneOffs, setIncludeOneOffs] = useState(true);
  const [seriesMode, setSeriesMode] = useState<'plan' | 'actuals'>('plan');
  const [kpiOptions, setKpiOptions] = useState<string[]>([]);
  const [initiativeFormSettings, setInitiativeFormSettings] = useState<InitiativeFormSettingsPayload | null>(null);
  const [initiativeFormSettingsError, setInitiativeFormSettingsError] = useState<string | null>(null);
  const [workstreamAssignments, setWorkstreamAssignments] = useState<WorkstreamRoleAssignment[]>([]);
  const { session } = useAuth();
  const commentActor = useMemo(
    () => (session ? { accountId: session.accountId, name: session.email } : undefined),
    [session]
  );
  const applyPeriodToInitiative = useCallback(
    (source: Initiative): Initiative => {
      let changed = false;
      const nextStages = { ...source.stages };
      initiativeStageKeys.forEach((key) => {
        const stage = nextStages[key];
        if (!stage) {
          return;
        }
        if (stage.periodMonth !== periodSettings.periodMonth || stage.periodYear !== periodSettings.periodYear) {
          nextStages[key] = {
            ...stage,
            periodMonth: periodSettings.periodMonth,
            periodYear: periodSettings.periodYear
          };
          changed = true;
        }
      });
      return changed ? { ...source, stages: nextStages } : source;
    },
    [periodSettings.periodMonth, periodSettings.periodYear]
  );
  const {
    threads: commentThreads,
    isLoading: isLoadingComments,
    isSaving: isSavingComment,
    error: commentError,
    createComment,
    replyToComment,
    toggleResolved,
    deleteComment
  } = useInitiativeComments(initiative?.id ?? null, {
    actor: commentActor,
    enabled: Boolean(initiative?.id)
  });
  const [isCommentMode, setIsCommentMode] = useState(Boolean(openComments));
  const [pendingSelection, setPendingSelection] = useState<CommentSelectionDraft | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const tooltipHostRef = useRef<HTMLDivElement>(null);
  const [valueStepTooltip, setValueStepTooltip] = useState<{ visible: boolean; x: number; y: number }>({
    visible: false,
    x: 0,
    y: 0
  });
  const initialCommentHandledRef = useRef(false);
  const commentAnchors = useCommentAnchors(commentThreads, contentRef);
  const changeLogLoadedKeyRef = useRef<string | null>(null);
  const initiativeId = initiative?.id ?? null;
  const initiativeUpdatedAt = initiative?.updatedAt ?? null;
  const planCacheKey = useMemo(() => (initiativeId ? `initiative-plan-cache:${initiativeId}` : null), [initiativeId]);
  const [logVisibleCount, setLogVisibleCount] = useState(20);

  const mergePlanDependencies = useCallback(
    (primary: Initiative['plan'], fallback?: Initiative['plan'] | null) => {
      if (!fallback || !fallback.tasks?.length) {
        return primary;
      }
      const fallbackMap = new Map<string, string[]>();
      fallback.tasks.forEach((task) => {
        if (task.id) {
          fallbackMap.set(task.id, (task.dependencies ?? []).filter(Boolean));
        }
      });
      const tasks = primary.tasks.map((task) => {
        const backupDeps = fallbackMap.get(task.id);
        if (backupDeps && backupDeps.length && (!task.dependencies || !task.dependencies.length)) {
          return { ...task, dependencies: Array.from(new Set(backupDeps)) };
        }
        return task;
      });
      return sanitizePlanModel({ ...primary, tasks });
    },
    []
  );
  const handleSectionToggle = useCallback((key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  useEffect(() => {
    const loadKpiOptions = async () => {
      try {
        const settings = await snapshotsApi.getSettings();
        setKpiOptions((settings.kpiOptions ?? []).map((item) => item.trim()).filter(Boolean));
      } catch (error) {
        console.error('Failed to load KPI options:', error);
      }
    };
    void loadKpiOptions();
  }, []);
  useEffect(() => {
    if (initiative) {
      let mergedPlan = initiative.plan;
      if (planCacheKey) {
        try {
          const cached = sessionStorage.getItem(planCacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            mergedPlan = mergePlanDependencies(initiative.plan, parsed);
          }
      } catch (error) {
        console.warn('Failed to read cached plan', error);
      }
    }
    setDraft({ ...initiative, plan: mergedPlan, risks: initiative.risks ?? [] });
    setSelectedStage(initiative.activeStage);
  } else {
    setDraft(createEmptyInitiative(initialWorkstreamId ?? workstreams[0]?.id, periodSettings));
    setSelectedStage('l0');
  }
    // periodSettings intentionally omitted to avoid wiping local edits when defaults change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initiative, initialWorkstreamId, workstreams, planCacheKey, mergePlanDependencies]);

  useEffect(() => {
    setDraft((prev) => applyPeriodToInitiative(prev));
  }, [applyPeriodToInitiative]);

  useEffect(() => {
    setLogVisibleCount((count) => Math.min(20, changeLog.length || count));
  }, [changeLog]);

  useEffect(() => {
    if (!planCacheKey) {
      return;
    }
    try {
      sessionStorage.setItem(planCacheKey, JSON.stringify(draft.plan));
    } catch (error) {
      console.warn('Failed to persist plan cache', error);
    }
  }, [draft.plan, planCacheKey]);

  useEffect(() => {
    if (!planCacheKey) {
      return;
    }
    try {
      sessionStorage.setItem(planCacheKey, JSON.stringify(draft.plan));
    } catch (error) {
      console.warn('Failed to persist plan cache', error);
    }
  }, [draft.plan, planCacheKey]);

  useEffect(() => {
    if (!initiative?.id) {
      setIsCommentMode(false);
      setPendingSelection(null);
      setActiveThreadId(null);
    }
  }, [initiative?.id]);

  const loadChangeLog = useCallback(
    async (force = false) => {
      if (!initiativeId) {
        changeLogLoadedKeyRef.current = null;
        setChangeLog([]);
        setIsLogLoading(false);
        return;
      }
      const key = `${initiativeId}:${initiativeUpdatedAt ?? ''}`;
      if (!force && changeLogLoadedKeyRef.current === key) {
        return;
      }
      setIsLogLoading(true);
      try {
        const entries = await initiativesApi.events(initiativeId);
        setChangeLog(entries);
        changeLogLoadedKeyRef.current = key;
      } catch (error) {
        console.error('Failed to load initiative change log:', error);
        setChangeLog([]);
        changeLogLoadedKeyRef.current = null;
      } finally {
        setIsLogLoading(false);
      }
    },
    [initiativeId, initiativeUpdatedAt]
  );

  useEffect(() => {
    void loadChangeLog();
  }, [loadChangeLog]);

  useEffect(() => {
    let active = true;
    setInitiativeFormSettingsError(null);
    initiativeFormSettingsApi
      .get()
      .then((settings) => {
        if (!active) {
          return;
        }
        setInitiativeFormSettings(settings);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        console.error('Failed to load initiative form settings:', error);
        setInitiativeFormSettingsError('Could not load stage gate requirements.');
      });
    return () => {
      active = false;
    };
  }, []);

  const initiativeFormSettingsLoading = initiativeFormSettings === null && !initiativeFormSettingsError;

  const riskCategoryOptions = useMemo(
    () => (riskCategories.length ? riskCategories : ['Uncategorized']),
    [riskCategories]
  );

  const currentStage = draft.stages[selectedStage];
  const activeStageData = draft.stages[draft.activeStage];
  const activeIndex = initiativeStageKeys.indexOf(draft.activeStage);
  const selectedIndex = initiativeStageKeys.indexOf(selectedStage);
  const isStageEditable = selectedIndex === activeIndex;
  const stageLocked = selectedIndex > activeIndex;
  const l4Date = draft.stages.l4.l4Date ?? draft.l4Date;
  const hasWorkstreams = workstreams.length > 0;
  const currentStageState: InitiativeStageState =
    draft.stageState[selectedStage] ??
    { status: 'draft', roundIndex: 0, comment: null };
  const selectedWorkstream = workstreams.find((ws) => ws.id === draft.workstreamId) ?? null;
  const selectedStageFormSettings = useMemo(
    () =>
      initiativeFormBlockKeys.reduce(
        (acc, blockKey) => {
          acc[blockKey] = resolveFormRequirement(initiativeFormSettings, selectedStage, blockKey);
          return acc;
        },
        {} as Record<InitiativeFormBlockKey, InitiativeFormFieldRequirement>
      ),
    [initiativeFormSettings, selectedStage]
  );
  const isBlockVisibleForSelectedStage = (blockKey: InitiativeFormBlockKey) =>
    selectedStageFormSettings[blockKey] !== 'hidden';
  const isBlockRequiredForSelectedStage = (blockKey: InitiativeFormBlockKey) =>
    selectedStageFormSettings[blockKey] === 'required';

  useEffect(() => {
    if (!selectedWorkstream) {
      setWorkstreamAssignments([]);
      return;
    }
    let cancelled = false;
    void listAssignmentsByWorkstream(selectedWorkstream.id).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setWorkstreamAssignments(result.data);
      } else {
        setWorkstreamAssignments([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [listAssignmentsByWorkstream, selectedWorkstream?.id]);

  const stageGateKey = getGateKeyForStage(selectedStage);
  const planValueStepTask =
    useMemo(
      () =>
        draft.plan.tasks.find(
          (task) => (task.milestoneType ?? '').toLowerCase() === VALUE_STEP_LABEL.toLowerCase()
        ) ?? null,
      [draft.plan.tasks]
    );
  const planValueStepTaskId = planValueStepTask?.id ?? null;
  const stageRounds = stageGateKey && selectedWorkstream ? selectedWorkstream.gates[stageGateKey]?.length ?? 0 : 0;
  const requiredBlocksForSubmitStage = useMemo(
    () => {
      if (initiativeFormSettingsLoading || initiativeFormSettingsError) {
        return [];
      }
      return initiativeFormBlockKeys.filter(
        (blockKey) => resolveFormRequirement(initiativeFormSettings, draft.activeStage, blockKey) === 'required'
      );
    },
    [draft.activeStage, initiativeFormSettings, initiativeFormSettingsError, initiativeFormSettingsLoading]
  );
  const missingRequiredBlocksForSubmitStage = useMemo(
    () => requiredBlocksForSubmitStage.filter((blockKey) => !isFormBlockFilled(draft, draft.activeStage, blockKey)),
    [draft, requiredBlocksForSubmitStage]
  );
  const submitChecklistEntries = useMemo(() => {
    if (initiativeFormSettingsLoading) {
      return [{ blockKey: null, missing: false, text: 'Loading stage gate requirements...' }];
    }
    if (initiativeFormSettingsError) {
      return [
        {
          blockKey: null,
          missing: false,
          text: 'Stage gate requirements could not be loaded. Submission will be validated on the server.'
        }
      ];
    }
    if (requiredBlocksForSubmitStage.length === 0) {
      return [{ blockKey: null, missing: false, text: 'No required checklist items are configured for this stage gate.' }];
    }
    return requiredBlocksForSubmitStage.map((blockKey) => {
      const block = initiativeFormBlockByKey[blockKey];
      return {
        blockKey,
        missing: missingRequiredBlocksForSubmitStage.includes(blockKey),
        text: block ? `${block.label} — ${block.submitHint}` : blockKey
      };
    });
  }, [initiativeFormSettingsError, initiativeFormSettingsLoading, missingRequiredBlocksForSubmitStage, requiredBlocksForSubmitStage]);
  const selectedStageLabel = initiativeStageLabels[selectedStage] ?? selectedStage.toUpperCase();
  const canSubmitStage = isStageEditable && currentStageState.status !== 'pending';
  const isReadOnlyMode = readOnly;
  const stageStatusLabel = (() => {
    switch (currentStageState.status) {
      case 'pending':
        return 'Awaiting approvals';
      case 'approved':
        return 'Gate approved';
      case 'returned':
        return 'Returned for updates';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Not started';
    }
  })();
  const stageStatusDetails = (() => {
    if (currentStageState.status === 'pending') {
      if (stageRounds > 0) {
        return `Round ${Math.min(currentStageState.roundIndex + 1, stageRounds)} of ${stageRounds}`;
      }
      return `Round ${currentStageState.roundIndex + 1}`;
    }
    if (currentStageState.status === 'returned' || currentStageState.status === 'rejected') {
      return 'Review the feedback below and resubmit.';
    }
    if (currentStageState.status === 'approved') {
      return 'You can start preparing the next gate.';
    }
    return 'Not yet submitted.';
  })();
  const submitButtonDisabled =
    isSubmitting ||
    mode !== 'view' ||
    !initiative ||
    initiativeFormSettingsLoading ||
    !isStageEditable ||
    stageLocked ||
    currentStageState.status === 'pending' ||
    isReadOnlyMode;
  const submitButtonTooltip = (() => {
    if (isSubmitting) {
      return 'Submitting stage...';
    }
    if (!initiative) {
      return 'Save the initiative before submitting.';
    }
    if (initiativeFormSettingsLoading) {
      return 'Loading stage gate requirements...';
    }
    if (initiativeFormSettingsError) {
      return 'Stage gate requirements could not be loaded. Submission will be validated on the server.';
    }
    if (mode !== 'view') {
      return 'Submission is available after creating the initiative.';
    }
    if (isReadOnlyMode) {
      return 'Read-only mode is enabled for this initiative.';
    }
    if (currentStageState.status === 'pending') {
      return 'Waiting for approvals';
    }
    if (!isStageEditable) {
      return selectedIndex > activeIndex ? 'Stage not active yet' : 'Earlier gates are view-only';
    }
    if (missingRequiredBlocksForSubmitStage.length > 0) {
      const missingList = missingRequiredBlocksForSubmitStage
        .map((blockKey) => initiativeFormBlockByKey[blockKey]?.label ?? blockKey)
        .join('\n• ');
      return `Complete required items before submitting:\n• ${missingList}`;
    }
    if (requiredBlocksForSubmitStage.length > 0) {
      const requiredList = requiredBlocksForSubmitStage
        .map((blockKey) => initiativeFormBlockByKey[blockKey]?.label ?? blockKey)
        .join('\n• ');
      return `Required for submission:\n• ${requiredList}`;
    }
    return 'Ready to submit for the next gate';
  })();
  const commentsAvailable = Boolean(initiative?.id);
  useEffect(() => {
    if (!openComments || !commentsAvailable) {
      return;
    }
    setIsCommentMode(true);
  }, [openComments, commentsAvailable]);
  useEffect(() => {
    if (!initialCommentThreadId || !commentsAvailable || initialCommentHandledRef.current) {
      return;
    }
    setIsCommentMode(true);
    setActiveThreadId(initialCommentThreadId);
    initialCommentHandledRef.current = true;
  }, [initialCommentThreadId, commentsAvailable, commentThreads.length]);
  useEffect(() => {
    if (!initialCommentThreadId || !isCommentMode) {
      return;
    }
    const anchor = commentAnchors.get(initialCommentThreadId);
    if (anchor && contentRef.current) {
      contentRef.current.scrollTo({ top: Math.max(0, anchor.top - 120), behavior: 'smooth' });
    }
  }, [initialCommentThreadId, commentAnchors, isCommentMode]);

  useEffect(() => {
    setDraft((prev) => {
      let changed = false;
      const nextStages = { ...prev.stages };
      initiativeStageKeys.forEach((key) => {
        const stage = nextStages[key];
        if (!stage || stage.valueStepTaskId === planValueStepTaskId) {
          return;
        }
        nextStages[key] = { ...stage, valueStepTaskId: planValueStepTaskId };
        changed = true;
      });
      return changed ? { ...prev, stages: nextStages } : prev;
    });
  }, [planValueStepTaskId]);

  const clearPendingSelection = useCallback(() => {
    setPendingSelection(null);
    const selection = window.getSelection?.();
    if (selection && selection.removeAllRanges) {
      selection.removeAllRanges();
    }
  }, []);

  const handleCommentToggle = () => {
    if (!commentsAvailable) {
      return;
    }
    setIsCommentMode((prev) => {
      if (prev) {
        clearPendingSelection();
        setActiveThreadId(null);
      }
      return !prev;
    });
  };

  const handleSelectionTarget = useCallback(
    (target: CommentSelectionTarget) => {
      if (!commentsAvailable) {
        return;
      }
      setPendingSelection({ ...target, stageKey: selectedStage });
      setActiveThreadId(null);
    },
    [commentsAvailable, selectedStage]
  );

  const handleSubmitComment = useCallback(
    async (body: string) => {
      if (!pendingSelection || !commentsAvailable) {
        return;
      }
      const created = await createComment({
        targetId: pendingSelection.targetId,
        targetLabel: pendingSelection.targetLabel,
        targetPath: pendingSelection.targetPath,
        stageKey: pendingSelection.stageKey,
        selection: pendingSelection.selection,
        body
      });
      if (created) {
        clearPendingSelection();
      }
    },
    [clearPendingSelection, commentsAvailable, createComment, pendingSelection]
  );

  const handleReplyComment = useCallback(
    async (threadId: string, body: string) => {
      if (!commentsAvailable) {
        return;
      }
      await replyToComment(threadId, { body });
    },
    [commentsAvailable, replyToComment]
  );

  const handleDeleteComment = useCallback(
    async (threadId: string, messageId: string | null) => {
      if (!commentsAvailable) {
        return;
      }
      await deleteComment(threadId, messageId);
    },
    [commentsAvailable, deleteComment]
  );

  const handleScrollToElement = useCallback(
    (threadId: string) => {
      const anchor = commentAnchors.get(threadId);
      if (!anchor || !contentRef.current) {
        return;
      }
      const container = contentRef.current;
      const scrollTarget = anchor.top - 100;
      container.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
      setActiveThreadId(threadId);
    },
    [commentAnchors]
  );

  const clearErrors = (next: ValidationErrors) => {
    setErrors((prev) => ({ ...prev, ...next }));
  };

  const handleFieldChange = <K extends keyof Initiative>(key: K, value: Initiative[K]) => {
    if (key === 'name') {
      clearErrors({ initiativeName: false });
    }
    if (key === 'workstreamId') {
      clearErrors({ workstream: false });
    }
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleStageChange = (stageKey: InitiativeStageKey) => {
    setSelectedStage(stageKey);
  };

  const updateStage = (stageKey: InitiativeStageKey, nextStage: InitiativeStageData) => {
    setDraft((prev) => {
      const stages = { ...prev.stages, [stageKey]: nextStage };
      const totals = calculateTotals(stages);
      return { ...prev, stages, totals, financialSummary: calculateFinancialSummary(totals) };
    });
  };

  const handleStageFieldChange = <K extends keyof InitiativeStageData>(key: K, value: InitiativeStageData[K]) => {
    if (key === 'name') {
      clearErrors({ stageName: false, initiativeName: false });
      if (typeof value === 'string' && (selectedStage === 'l0' || selectedStage === draft.activeStage)) {
        handleFieldChange('name', value as Initiative['name']);
      }
    }
    if (key === 'description') {
      clearErrors({ stageDescription: false });
    }
    updateStage(selectedStage, { ...currentStage, [key]: value });
  };

  const handleOwnerSelect = (accountId: string) => {
    if (!accountId) {
      handleFieldChange('ownerAccountId', null);
      return;
    }
    const account = accounts.find((item) => item.id === accountId);
    const ownerName = account ? resolveAccountName(account) || account.email : '';
    handleFieldChange('ownerAccountId', account ? account.id : null);
    handleFieldChange('ownerName', ownerName);
  };

  const handlePlanChange = (nextPlan: Initiative['plan']) => {
    setDraft((prev) => ({ ...prev, plan: sanitizePlanModel(nextPlan) }));
  };

  const handlePlanActualsChange = (nextActuals: InitiativePlanActualsModel | InitiativePlanModel) => {
    setDraft((prev) => ({ ...prev, plan: { ...prev.plan, actuals: nextActuals as InitiativePlanActualsModel } }));
  };

  type RiskSortKey = 'score' | 'title' | 'category' | 'severity' | 'likelihood';
  const [riskSort, setRiskSort] = useState<{ key: RiskSortKey; direction: 'asc' | 'desc' }>({
    key: 'score',
    direction: 'desc'
  });
  const [riskReviewComments, setRiskReviewComments] = useState<InitiativeRiskComment[]>([]);
  const [riskReviewCommentsLoading, setRiskReviewCommentsLoading] = useState(false);
  const [riskReviewCommentsError, setRiskReviewCommentsError] = useState<string>('');
  const [expandedRiskReviewComments, setExpandedRiskReviewComments] = useState<Set<string>>(new Set());

  const handleRiskChange = (id: string, field: keyof InitiativeRisk, value: string | number) => {
    setDraft((prev) => {
      const risks = Array.isArray(prev.risks) ? prev.risks : [];
      const nextRisks = risks.map((risk) => {
        if (risk.id !== id) {
          return risk;
        }
        if (field === 'severity' || field === 'likelihood') {
          return { ...risk, [field]: clampRiskValue(Number(value)) };
        }
        return { ...risk, [field]: typeof value === 'string' ? value : String(value) };
      });
      return { ...prev, risks: nextRisks };
    });
  };

  const handleAddRisk = () => {
    setDraft((prev) => ({
      ...prev,
      risks: [
        {
          id: generateId(),
          title: '',
          category: '',
          description: '',
          severity: 0,
          likelihood: 0,
          mitigation: ''
        },
        ...(prev.risks ?? [])
      ]
    }));
  };

  const handleRemoveRisk = (id: string) => {
    setDraft((prev) => ({ ...prev, risks: (prev.risks ?? []).filter((risk) => risk.id !== id) }));
  };

  const sortedRisks = useMemo(() => {
    const risks = (draft.risks ?? []).map((risk) => {
      const severity = clampRiskValue(risk.severity);
      const likelihood = clampRiskValue(risk.likelihood);
      const score = severity * likelihood;
      return { ...risk, severity, likelihood, score };
    });
    const { key, direction } = riskSort;
    const sorted = [...risks].sort((a, b) => {
      const directionFactor = direction === 'asc' ? 1 : -1;
      if (key === 'title' || key === 'category') {
        return a[key].localeCompare(b[key]) * directionFactor;
      }
      return (a[key] - b[key]) * directionFactor;
    });
    return sorted;
  }, [draft.risks, riskSort]);

  const handleRiskSort = (key: RiskSortKey) => {
    setRiskSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: key === 'title' || key === 'category' ? 'asc' : 'desc' };
    });
  };

  const validateDraft = () => {
    const nextErrors: ValidationErrors = {};
    if (!draft.name.trim()) {
      nextErrors.initiativeName = true;
    }
    if (!draft.workstreamId) {
      nextErrors.workstream = true;
    }
    if (!activeStageData.name.trim()) {
      nextErrors.stageName = true;
    }
    if (!activeStageData.description.trim()) {
      nextErrors.stageDescription = true;
    }
    const periodValid =
      Number.isFinite(periodSettings.periodMonth) &&
      Number.isFinite(periodSettings.periodYear) &&
      (periodSettings.periodMonth ?? 0) >= 1 &&
      (periodSettings.periodMonth ?? 0) <= 12;
    if (draft.activeStage !== selectedStage) {
      setSelectedStage(draft.activeStage);
    }
    setErrors(nextErrors);
    if (!periodValid) {
      setBanner({ type: 'error', text: 'Set a default period month and year in General settings.' });
      return false;
    }
    return Object.values(nextErrors).every((value) => !value);
  };

  const handleSaveClick = async (closeAfterSave: boolean) => {
    if (!validateDraft()) {
      setBanner({ type: 'error', text: 'Please fill in all required fields.' });
      return;
    }
    if (!hasWorkstreams) {
      setBanner({ type: 'error', text: 'Create a workstream before saving an initiative.' });
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent('initiative-save-draft', { detail: { initiativeId: draft.id } }));
    } catch (error) {
      console.error('Failed to trigger status report draft save', error);
    }
    setIsSaving(true);
    setBanner(null);
    const normalizedPlan = sanitizePlanModel(mergePlanDependencies(draft.plan, draft.plan));
    const normalizedDraft: Initiative = {
      ...draft,
      plan: normalizedPlan,
      risks: stripIncompleteRisks(draft.risks)
    };
    const result = await onSave(normalizedDraft, { closeAfterSave });
    setIsSaving(false);
    if (!result.ok) {
      const message =
        result.error === 'version-conflict'
          ? 'Changes could not be saved because the initiative was updated elsewhere.'
          : result.error === 'invalid-input'
            ? 'Fill in the required fields before saving.'
            : result.error === 'not-found'
              ? 'Initiative not found. Please reload.'
              : 'Failed to save initiative.';
      setBanner({ type: 'error', text: message });
    } else {
      const mergedPlan = mergePlanDependencies(result.data.plan, draft.plan);
      setDraft({ ...result.data, plan: mergedPlan });
      setSelectedStage(result.data.activeStage);
      setBanner({ type: 'info', text: 'Initiative saved.' });
      void loadChangeLog(true);
    }
  };

  const handleDeleteClick = async () => {
    if (!initiative) {
      onBack(draft.workstreamId);
      return;
    }
    const confirmed = window.confirm('Delete this initiative permanently?');
    if (!confirmed) {
      return;
    }
    setIsDeleting(true);
    const result = await onDelete(initiative.id);
    setIsDeleting(false);
    if (!result.ok) {
      setBanner({ type: 'error', text: result.error === 'not-found' ? 'Initiative already removed.' : 'Failed to delete initiative.' });
    }
  };

  const handleSubmitPrompt = () => {
    if (!initiative || submitButtonDisabled) {
      return;
    }
    setIsSubmitConfirmOpen(true);
  };

  const handleCancelSubmit = () => {
    setIsSubmitConfirmOpen(false);
  };

  const handleSubmitClick = async () => {
    if (!initiative || submitButtonDisabled) {
      return;
    }
    if (!canSubmitStage) {
      return;
    }
    if (missingRequiredBlocksForSubmitStage.length > 0) {
      setBanner({ type: 'error', text: 'Complete the required items listed in the checklist before submitting.' });
      return;
    }
    setIsSubmitting(true);
    const result = await onSubmitStage(initiative.id);
    setIsSubmitting(false);
    setIsSubmitConfirmOpen(false);
    if (!result.ok) {
      const message =
        result.error === 'stage-pending'
          ? 'This stage is already awaiting approvals.'
          : result.error === 'stage-approved'
            ? 'The current stage has already been approved.'
            : result.error === 'missing-approvers'
              ? 'Assign account roles for all approvers in the workstream before submitting.'
              : result.error === 'required-fields-missing'
                ? 'Complete all required checklist items before submitting.'
              : result.error === 'version-conflict'
                ? 'Could not submit because the initiative was updated elsewhere.'
                : result.error === 'not-found'
                  ? 'Initiative not found. Please reload.'
                  : 'Failed to submit the stage for approval.';
      setBanner({ type: 'error', text: message });
    } else {
      setDraft(result.data);
      setSelectedStage(result.data.activeStage);
      setBanner({ type: 'info', text: 'Stage submitted for approval.' });
      void loadChangeLog(true);
    }
  };

  const financialSeries = useMemo(() => {
    const stageData = draft.stages[draft.activeStage];
    const months = buildMonthRange(stageData, {
      endYear: periodSettings.periodYear,
      endMonth: periodSettings.periodMonth
    });
    const monthKeys = months.map((month) => month.key);
    const totalsByKind = initiativeFinancialKinds.reduce(
      (acc, kind) => {
        acc[kind] =
          seriesMode === 'actuals' ? buildKindActualMonthlyTotals(stageData, kind) : buildKindMonthlyTotals(stageData, kind);
        return acc;
      },
      {} as Record<InitiativeFinancialKind, Record<string, number>>
    );
    const benefitsByMonth: Record<string, number> = {};
    const costsByMonth: Record<string, number> = {};

    monthKeys.forEach((key) => {
      const recurringBenefits = totalsByKind['recurring-benefits'][key] ?? 0;
      const recurringCosts = totalsByKind['recurring-costs'][key] ?? 0;
      const oneoffBenefits = totalsByKind['oneoff-benefits'][key] ?? 0;
      const oneoffCosts = totalsByKind['oneoff-costs'][key] ?? 0;
      benefitsByMonth[key] = recurringBenefits + (includeOneOffs ? oneoffBenefits : 0);
      const rawCosts = recurringCosts + (includeOneOffs ? oneoffCosts : 0);
      costsByMonth[key] = Math.abs(rawCosts);
    });

    const impactByMonth: Record<string, number> = {};
    monthKeys.forEach((key) => {
      impactByMonth[key] = (benefitsByMonth[key] ?? 0) - (costsByMonth[key] ?? 0);
    });

    const benefits = monthKeys.map((key) => benefitsByMonth[key] ?? 0);
    const costs = monthKeys.map((key) => costsByMonth[key] ?? 0);
    const impact = monthKeys.map((key) => impactByMonth[key] ?? 0);

    const lastValueIndex = monthKeys.reduce((idx, key, index) => {
      const hasValue =
        Math.abs(benefitsByMonth[key] ?? 0) > 0 ||
        Math.abs(costsByMonth[key] ?? 0) > 0 ||
        Math.abs(impactByMonth[key] ?? 0) > 0;
      return hasValue ? index : idx;
    }, -1);
    const endIndex = lastValueIndex >= 0 ? lastValueIndex : monthKeys.length - 1;
    const startIndex = Math.max(0, endIndex - 11);
    const runRateKeys = monthKeys.slice(startIndex, endIndex + 1);

    const periodStartLabel = months.length >= 1 ? `${months[0].label} ${months[0].year}` : 'Awaiting financial data';
    const periodEndLabel =
      months.length >= 1 ? `${months[months.length - 1].label} ${months[months.length - 1].year}` : 'Awaiting financial data';
    const periodLabel = months.length >= 2 ? `${periodStartLabel} - ${periodEndLabel}` : periodStartLabel;

    return {
      benefits,
      costs,
      impact,
      runRates: {
        benefits: calculateRunRate(runRateKeys, benefitsByMonth),
        costs: calculateRunRate(runRateKeys, costsByMonth),
        impact: calculateRunRate(runRateKeys, impactByMonth)
      },
      totals: {
        benefits: benefits.reduce((acc, value) => acc + value, 0),
        costs: costs.reduce((acc, value) => acc + value, 0),
        impact: impact.reduce((acc, value) => acc + value, 0)
      },
      periodStartLabel,
      periodEndLabel,
      periodLabel,
      modeLabel: seriesMode === 'actuals' ? 'Actuals' : 'Plan',
      oneOffLabel: includeOneOffs ? 'With one-offs' : 'Recurring only'
    };
  }, [draft, includeOneOffs, periodSettings.periodMonth, periodSettings.periodYear, seriesMode]);

  const sparklineBounds = useMemo(() => {
    const combined = [...financialSeries.benefits, ...financialSeries.costs, ...financialSeries.impact];
    if (!combined.length) {
      return { min: 0, max: 0 };
    }
    const min = Math.min(...combined, 0);
    const max = Math.max(...combined, 0);
    if (min === max) {
      const padding = Math.max(10, Math.abs(max || 0) * 0.2);
      return { min: min - padding, max: max + padding };
    }
    return { min, max };
  }, [financialSeries]);

  const formatTaskDateRange = (task: InitiativePlanTask | null) => {
    if (!task) {
      return '';
    }
    if (task.startDate && task.endDate) {
      return task.startDate === task.endDate ? task.startDate : `${task.startDate} -> ${task.endDate}`;
    }
    return task.startDate ?? task.endDate ?? '';
  };

  const valueStepSummary = planValueStepTask
    ? [planValueStepTask.name || VALUE_STEP_LABEL, formatTaskDateRange(planValueStepTask)]
        .filter(Boolean)
        .join(' | ')
    : 'Not set in plan';

  const showValueStepTooltip = (event: React.MouseEvent) => {
    const host = tooltipHostRef.current;
    if (!host) {
      return;
    }
    const rect = host.getBoundingClientRect();
    setValueStepTooltip({
      visible: true,
      x: event.clientX - rect.left + 12,
      y: event.clientY - rect.top + 12
    });
  };

  const hideValueStepTooltip = () => {
    setValueStepTooltip((prev) => ({ ...prev, visible: false }));
  };

  if (mode === 'view' && !initiative) {
    if (!dataLoaded) {
      return (
        <section className={styles.placeholder}>
          <p>Loading initiative details...</p>
        </section>
      );
    }
    return (
      <section className={styles.placeholder}>
        <h2>Initiative not found</h2>
        <p>The initiative may have been deleted. Refresh the list and try again.</p>
        <button className={styles.secondaryButton} onClick={() => onBack()} type="button">
          Back to list
        </button>
      </section>
    );
  }
  const roiValue = draft.financialSummary?.roi ?? calculateFinancialSummary(draft.totals).roi;
  const commentButtonLabel = isLoadingComments ? 'Loading comments...' : `Comments${commentThreads.length ? ` (${commentThreads.length})` : ''}`;
  const profileContentClass = `${styles.profileContent}${hideBackLink ? ` ${styles.profileContentNoBack}` : ''}`;
  const buildProfileAnchor = (key: string, label?: string) => createCommentAnchor(`profile.${key}`, label);
  const buildStageAnchor = (key: string, label?: string) => createCommentAnchor(`stage.${selectedStage}.${key}`, label);
  const stageProgressCollapsed = collapsedSections['stage-progress'] ?? false;
  const stageDetailsCollapsed = collapsedSections['stage-details'] ?? false;
  const financialCollapsed = collapsedSections['financial'] ?? false;
  const actualsCollapsed = collapsedSections['pnl-actuals'] ?? false;
  const changeLogCollapsed = collapsedSections['change-log'] ?? false;
  const risksCollapsed = collapsedSections['risks'] ?? false;
  const stageTitle = initiativeStageLabels[selectedStage].replace(/\s+Gate$/i, '');

  const refreshRiskReviewComments = useCallback(() => {
    if (!draft.id) {
      return;
    }
    setRiskReviewCommentsLoading(true);
    setRiskReviewCommentsError('');
    void initiativesApi
      .listRiskComments(draft.id)
      .then((list) => setRiskReviewComments(list))
      .catch((error) => {
        console.error('Failed to load risk review comments', error);
        setRiskReviewCommentsError('load_failed');
      })
      .finally(() => setRiskReviewCommentsLoading(false));
  }, [draft.id]);

  useEffect(() => {
    if (risksCollapsed) {
      return;
    }
    if (!draft.id) {
      return;
    }
    refreshRiskReviewComments();
  }, [draft.id, refreshRiskReviewComments, risksCollapsed]);

  const toggleExpandedRiskReviewComments = (riskId: string) => {
    setExpandedRiskReviewComments((prev) => {
      const next = new Set(prev);
      if (next.has(riskId)) {
        next.delete(riskId);
      } else {
        next.add(riskId);
      }
      return next;
    });
  };

  const stripIncompleteRisks = useCallback((risks: InitiativeRisk[] | undefined | null) => {
    const list = Array.isArray(risks) ? risks : [];
    return list.filter((risk) => {
      const titleOk = Boolean((risk.title ?? '').trim());
      const categoryOk = Boolean((risk.category ?? '').trim());
      const severityOk = clampRiskValue(risk.severity) > 0;
      const likelihoodOk = clampRiskValue(risk.likelihood) > 0;
      return titleOk && categoryOk && severityOk && likelihoodOk;
    });
  }, []);

  const riskReviewCommentsByRiskId = useMemo(() => {
    const byRisk = new Map<string, InitiativeRiskComment[]>();
    riskReviewComments.forEach((comment) => {
      const list = byRisk.get(comment.riskId) ?? [];
      list.push(comment);
      byRisk.set(comment.riskId, list);
    });
    for (const list of byRisk.values()) {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return byRisk;
  }, [riskReviewComments]);

  const resolvedTopPanelMessage = banner || topPanelMessage ? (
    <>
      {banner && (
        <div className={banner.type === 'info' ? styles.bannerInfo : styles.bannerError}>{banner.text}</div>
      )}
      {topPanelMessage}
    </>
  ) : null;

  return (
    <section className={styles.profileWrapper}>
      <StickyTopPanel
        left={
          <>
            {topPanelExtraLeft}
            {!hideBackLink && (
              <button className={styles.backLink} onClick={() => onBack(draft.workstreamId)} type="button">
                Back to initiatives
              </button>
            )}
          </>
        }
        right={
          <>
            <button
              className={isCommentMode ? styles.commentButtonActive : styles.commentButton}
              type="button"
              onClick={handleCommentToggle}
              disabled={!commentsAvailable}
            >
              {commentButtonLabel}
            </button>
            {topPanelExtraRight}
            {!isReadOnlyMode && (
              <>
                <button
                  className={styles.secondaryButton}
                  onClick={() => handleSaveClick(false)}
                  disabled={isSaving}
                  type="button"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  className={styles.primaryButton}
                  onClick={() => handleSaveClick(true)}
                  disabled={isSaving}
                  type="button"
                >
                  {isSaving ? 'Saving...' : 'Save and close'}
                </button>
              </>
            )}
          </>
        }
        message={resolvedTopPanelMessage}
      />
      <div className={`${styles.profileBody} ${isCommentMode ? styles.profileBodyWithComments : ''}`}>
        <div className={profileContentClass} ref={contentRef}>
          {isCommentMode && (
            <CommentHighlights
              containerRef={contentRef}
              threads={commentThreads}
              isVisible
              activeThreadId={activeThreadId}
              onSelect={setActiveThreadId}
              anchors={commentAnchors}
            />
          )}
        <div className={styles.quickInfoCard}>
          <div className={styles.quickInfoGrid}>
            <div className={styles.quickInfoTop}>
              <div className={styles.initiativeSummary}>
                <div {...buildProfileAnchor('overview.name', 'Initiative name')}>
                  <p className={styles.quickLabel}>Initiative</p>
                  <h2>{draft.name || 'Unnamed initiative'}</h2>
                </div>
                <div className={styles.summaryMetaRow}>
                  <div className={styles.summaryMeta} {...buildProfileAnchor('overview.owner', 'Initiative owner display')}>
                    <p className={styles.quickLabel}>Owner</p>
                    <h3>{draft.ownerName || 'Unassigned'}</h3>
                  </div>
                  <div className={styles.summaryMeta} {...buildProfileAnchor('overview.l4', 'Stage L4 date')}>
                    <p className={styles.quickLabel}>L4 date</p>
                    <h3>{formatDate(l4Date)}</h3>
                  </div>
                </div>
              </div>
              <div className={styles.sparkControls}>
                <div className={styles.toggleGroup} role="group" aria-label="Run rate source">
                  <button
                    className={seriesMode === 'plan' ? styles.toggleButtonActive : styles.toggleButton}
                    type="button"
                    onClick={() => setSeriesMode('plan')}
                    aria-pressed={seriesMode === 'plan'}
                  >
                    Plan
                  </button>
                  <button
                    className={seriesMode === 'actuals' ? styles.toggleButtonActive : styles.toggleButton}
                    type="button"
                    onClick={() => setSeriesMode('actuals')}
                    aria-pressed={seriesMode === 'actuals'}
                  >
                    Actuals
                  </button>
                </div>
                <div className={styles.toggleGroup} role="group" aria-label="One-off inclusion toggle">
                  <button
                    className={includeOneOffs ? styles.toggleButtonActive : styles.toggleButton}
                    type="button"
                    onClick={() => setIncludeOneOffs(true)}
                    aria-pressed={includeOneOffs}
                  >
                    With one-offs
                  </button>
                  <button
                    className={!includeOneOffs ? styles.toggleButtonActive : styles.toggleButton}
                    type="button"
                    onClick={() => setIncludeOneOffs(false)}
                    aria-pressed={!includeOneOffs}
                  >
                    Recurring only
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.chartRow}>
              <SparklineCard
                label="Impact profile"
                value={formatImpact(financialSeries.runRates.impact)}
                valueLabel="12m run rate"
                periodStart={financialSeries.periodStartLabel}
                periodEnd={financialSeries.periodEndLabel}
                color="#0ea5e9"
                values={financialSeries.impact}
                formatValue={formatImpact}
                yBounds={sparklineBounds}
              />
              <SparklineCard
                label="Benefits profile"
                value={formatImpact(financialSeries.runRates.benefits)}
                valueLabel="12m run rate"
                periodStart={financialSeries.periodStartLabel}
                periodEnd={financialSeries.periodEndLabel}
                color="#22c55e"
                values={financialSeries.benefits}
                formatValue={formatImpact}
                yBounds={sparklineBounds}
              />
              <SparklineCard
                label="Cost profile"
                value={formatImpact(financialSeries.runRates.costs)}
                valueLabel="12m run rate"
                periodStart={financialSeries.periodStartLabel}
                periodEnd={financialSeries.periodEndLabel}
                color="#f97316"
                values={financialSeries.costs}
                formatValue={formatImpact}
                yBounds={sparklineBounds}
              />
              <RoiCard
                value={formatRoi(roiValue)}
                periodStart={financialSeries.periodStartLabel}
                periodEnd={financialSeries.periodEndLabel}
              />
            </div>
          </div>
        </div>

      <section className={styles.cardSection} {...buildProfileAnchor('stage-gates', 'Stage progression')}>
        <header className={styles.cardHeader}>
          <div className={styles.cardHeaderTitle}>
            <button
              className={styles.sectionToggle}
              type="button"
              onClick={() => handleSectionToggle('stage-progress')}
              aria-expanded={!stageProgressCollapsed}
              aria-label={stageProgressCollapsed ? 'Expand stage progression' : 'Collapse stage progression'}
            >
              <ChevronIcon direction={stageProgressCollapsed ? 'right' : 'down'} size={16} />
            </button>
            <div>
              <h3>Stage progression</h3>
              <p>Track each L gate and review status in one place.</p>
            </div>
          </div>
        </header>
        {!stageProgressCollapsed && (
          <>
            <StageGatePanel
              activeStage={draft.activeStage}
              selectedStage={selectedStage}
              stages={draft.stages}
              stageState={draft.stageState}
              initiativeName={draft.name}
              onSelectStage={handleStageChange}
              workstream={selectedWorkstream}
              accounts={accounts}
              roleAssignments={workstreamAssignments}
            />
            <div className={styles.stageProgressSummary}>
              <div className={styles.stageSummaryRow} {...buildStageAnchor('status', 'Stage status')}>
                <div className={styles.stageSummaryActions}>
                  <div className={styles.submitButtonWrapper} data-tooltip={submitButtonTooltip}>
                    <button
                      className={styles.secondaryButton}
                      onClick={handleSubmitPrompt}
                      disabled={submitButtonDisabled}
                      type="button"
                    >
                      {currentStageState.status === 'pending'
                        ? 'Waiting for approvals'
                        : isSubmitting
                          ? 'Submitting...'
                          : 'Submit for next gate'}
                    </button>
                  </div>
                </div>
                <div className={styles.stageStatusRow}>
                  <span className={`${styles.stageStatusBadge} ${styles[`status-${currentStageState.status}`]}`}>
                    {stageStatusLabel}
                  </span>
                  <span className={styles.stageStatusMeta}>{stageStatusDetails}</span>
                </div>
              </div>
              {currentStageState.comment && currentStageState.status !== 'draft' && (
                <div className={styles.stageAlert}>
                  <strong>Reviewer note:</strong>
                  <p>{currentStageState.comment}</p>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <div className={styles.stagePanel}>
        <header className={styles.stageHeader}>
          <div className={styles.stageHeaderLeft}>
            <button
              className={styles.sectionToggle}
              type="button"
              onClick={() => handleSectionToggle('stage-details')}
              aria-expanded={!stageDetailsCollapsed}
              aria-label={stageDetailsCollapsed ? 'Expand stage details' : 'Collapse stage details'}
            >
              <ChevronIcon direction={stageDetailsCollapsed ? 'right' : 'down'} size={16} />
            </button>
            <div>
              <h3>{stageTitle}</h3>
              {!isStageEditable && <p className={styles.stageHint}>Fields are read-only for this gate.</p>}
            </div>
          </div>
        </header>
        {!stageDetailsCollapsed && (
          <>
        {stageLocked && <p className={styles.lockedNote}>Complete previous gates before editing this stage.</p>}

        <label
          className={`${styles.fieldBlock} ${errors.stageName ? styles.fieldError : ''}`}
          {...buildStageAnchor('name', 'Stage name')}
        >
          <span>Stage name</span>
          <input
            type="text"
            className={errors.stageName ? styles.inputError : undefined}
            value={currentStage.name}
            onChange={(event) => handleStageFieldChange('name', event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            disabled={!isStageEditable}
          />
        </label>

        <div className={styles.stageMetaGrid}>
          <label
            className={`${styles.fieldBlock} ${errors.workstream ? styles.fieldError : ''}`}
            {...buildProfileAnchor('meta.workstream', 'Workstream')}
          >
            <span>Workstream</span>
            <select
              className={errors.workstream ? styles.inputError : undefined}
              value={draft.workstreamId}
              onChange={(event) => handleFieldChange('workstreamId', event.target.value)}
              disabled={!hasWorkstreams}
            >
              {!hasWorkstreams && <option value="">Create a workstream first</option>}
              {workstreams.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.fieldBlock} {...buildProfileAnchor('meta.status', 'Current status')}>
            <span>Current status</span>
            <input
              type="text"
              value={draft.currentStatus}
              onChange={(event) => handleFieldChange('currentStatus', event.target.value)}
            />
          </label>
          <label className={styles.fieldBlock} {...buildProfileAnchor('meta.l4-target', 'Portfolio L4 date')}>
            <span>Target L4 date</span>
            <input
              type="date"
              value={draft.l4Date ?? ''}
              onChange={(event) => handleFieldChange('l4Date', event.target.value || null)}
            />
          </label>
          <label className={styles.fieldBlock} {...buildProfileAnchor('meta.owner-account', 'Owner account')}>
            <span>Initiative owner</span>
            <select value={draft.ownerAccountId ?? ''} onChange={(event) => handleOwnerSelect(event.target.value)}>
              <option value="">No linked account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {resolveAccountName(account) || account.email}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.valueStepRow} ref={tooltipHostRef}>
          <label className={styles.fieldBlock} {...buildStageAnchor('value-step', 'Value Step')}>
            <span className={styles.labelWithIcon}>
              <span>Value Step</span>
              <span
                className={styles.helpIcon}
                onMouseEnter={showValueStepTooltip}
                onMouseMove={showValueStepTooltip}
                onMouseLeave={hideValueStepTooltip}
                aria-label="Value step explanation"
                role="presentation"
              >
                ?
              </span>
            </span>
            <input type="text" value={valueStepSummary} disabled />
            <p className={styles.fieldHint}>Managed via the plan module.</p>
            {valueStepTooltip.visible && (
              <div
                className={styles.tooltip}
                style={{ left: `${valueStepTooltip.x}px`, top: `${valueStepTooltip.y}px` }}
              >
                A value step is an activity after which no further action is required for the initiative to begin accruing value.
              </div>
            )}
          </label>

          <label
            className={styles.fieldBlock}
            {...buildStageAnchor('additional-commentary', 'Additional commentary')}
          >
            <span>Additional Commentary</span>
            <textarea
              value={currentStage.additionalCommentary}
              onChange={(event) => handleStageFieldChange('additionalCommentary', event.target.value)}
              disabled={!isStageEditable}
              rows={3}
            />
          </label>
        </div>

        <label
          className={`${styles.fieldBlock} ${errors.stageDescription ? styles.fieldError : ''}`}
          {...buildStageAnchor('description', 'Stage description')}
        >
          <span>Description</span>
          <textarea
            className={errors.stageDescription ? styles.inputError : undefined}
            value={currentStage.description}
            onChange={(event) => handleStageFieldChange('description', event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            disabled={!isStageEditable}
            rows={4}
          />
        </label>

        {selectedStage === 'l4' && (
          <div className={styles.periodRow}>
            <label {...buildStageAnchor('stage-l4-date', 'Stage L4 date')}>
              <span>L4 date</span>
              <input
                type="date"
                value={currentStage.l4Date ?? ''}
                onChange={(event) => handleStageFieldChange('l4Date', event.target.value)}
                disabled={!isStageEditable}
              />
            </label>
          </div>
        )}

          </>
        )}
      </div>

      {isBlockVisibleForSelectedStage('financial-outlook') && (
      <section className={`${styles.cardSection} ${styles.financialCard}`} {...buildProfileAnchor('financial-outlook', 'Financial outlook')}>
        <header className={styles.cardHeader}>
          <div className={styles.cardHeaderTitle}>
            <button
              className={styles.sectionToggle}
              type="button"
              onClick={() => handleSectionToggle('financial')}
              aria-expanded={!financialCollapsed}
              aria-label={financialCollapsed ? 'Expand financial outlook' : 'Collapse financial outlook'}
            >
              <ChevronIcon direction={financialCollapsed ? 'right' : 'down'} size={16} />
            </button>
            <div>
              <div className={styles.sectionTitleRow}>
                <h3>Financial outlook</h3>
                {isBlockRequiredForSelectedStage('financial-outlook') && (
                  <span className={styles.requiredBadge}>Required</span>
                )}
              </div>
              <p>Balance recurring and one-off impacts for this stage.</p>
            </div>
          </div>
        </header>
        {!financialCollapsed && (
          <FinancialEditor
            stage={currentStage}
            disabled={!isStageEditable}
            onChange={(nextStage) => updateStage(selectedStage, nextStage)}
            commentScope={selectedStage}
          />
        )}
      </section>
      )}

      {isBlockVisibleForSelectedStage('pnl-actuals') && (
      <section
        className={`${styles.cardSection} ${styles.financialCard}`}
        {...buildProfileAnchor('pnl-actuals', 'P&L actuals')}
      >
        <header className={styles.cardHeader}>
          <div className={styles.cardHeaderTitle}>
            <button
              className={styles.sectionToggle}
              type="button"
              onClick={() => handleSectionToggle('pnl-actuals')}
              aria-expanded={!actualsCollapsed}
              aria-label={actualsCollapsed ? 'Expand P&L actuals' : 'Collapse P&L actuals'}
            >
              <ChevronIcon direction={actualsCollapsed ? 'right' : 'down'} size={16} />
            </button>
            <div>
              <div className={styles.sectionTitleRow}>
                <h3>P&amp;L actuals</h3>
                {isBlockRequiredForSelectedStage('pnl-actuals') && <span className={styles.requiredBadge}>Required</span>}
              </div>
              <p>Input realised benefits and costs side-by-side with plan.</p>
            </div>
          </div>
        </header>
        {!actualsCollapsed && (
          <FinancialActuals
            stage={currentStage}
            disabled={!isStageEditable}
            onChange={(nextStage) => updateStage(selectedStage, nextStage)}
            commentScope={`${selectedStage}-actuals`}
          />
        )}
      </section>
      )}

      {isBlockVisibleForSelectedStage('kpis') && (
      <section className={styles.cardSection} {...buildProfileAnchor('kpis', 'KPIs')}>
        <header className={styles.cardHeader}>
          <div className={styles.cardHeaderTitle}>
            <button
              className={styles.sectionToggle}
              type="button"
              onClick={() => handleSectionToggle('kpis')}
              aria-expanded={!(collapsedSections['kpis'] ?? false)}
              aria-label={collapsedSections['kpis'] ? 'Expand KPIs' : 'Collapse KPIs'}
            >
              <ChevronIcon direction={collapsedSections['kpis'] ? 'right' : 'down'} size={16} />
            </button>
            <div>
              <div className={styles.sectionTitleRow}>
                <h3>KPIs</h3>
                {isBlockRequiredForSelectedStage('kpis') && <span className={styles.requiredBadge}>Required</span>}
              </div>
              <p>Track KPIs with monthly values per stage.</p>
            </div>
          </div>
        </header>
        {!(collapsedSections['kpis'] ?? false) && (
          <StageKpiEditor
            stage={currentStage}
            disabled={!isStageEditable}
            kpiOptions={kpiOptions}
            onChange={(nextStage) => updateStage(selectedStage, nextStage)}
            commentScope={selectedStage}
          />
        )}
      </section>
      )}

      {isBlockVisibleForSelectedStage('kpi-actuals') && (
      <section className={styles.cardSection} {...buildProfileAnchor('kpi-actuals', 'KPI actuals')}>
        <header className={styles.cardHeader}>
          <div className={styles.cardHeaderTitle}>
            <button
              className={styles.sectionToggle}
              type="button"
              onClick={() => handleSectionToggle('kpi-actuals')}
              aria-expanded={!(collapsedSections['kpi-actuals'] ?? false)}
              aria-label={collapsedSections['kpi-actuals'] ? 'Expand KPI actuals' : 'Collapse KPI actuals'}
            >
              <ChevronIcon direction={collapsedSections['kpi-actuals'] ? 'right' : 'down'} size={16} />
            </button>
            <div>
              <div className={styles.sectionTitleRow}>
                <h3>KPI actuals</h3>
                {isBlockRequiredForSelectedStage('kpi-actuals') && <span className={styles.requiredBadge}>Required</span>}
              </div>
              <p>Mirror KPI plans and capture actual results.</p>
            </div>
          </div>
        </header>
        {!(collapsedSections['kpi-actuals'] ?? false) && (
          <StageKpiActuals
            stage={currentStage}
            disabled={!isStageEditable}
            onChange={(nextStage) => updateStage(selectedStage, nextStage)}
            commentScope={`${selectedStage}-kpi-actuals`}
          />
        )}
      </section>
      )}

      {isBlockVisibleForSelectedStage('supporting-docs') && (
      <section className={`${styles.cardSection} ${styles.supportingCard}`} {...buildProfileAnchor('supporting-docs', 'Supporting documentation')}>
        <header className={styles.cardHeader}>
          <div className={styles.cardHeaderTitle}>
            <div>
              <div className={styles.sectionTitleRow}>
                <h3>Supporting documentation</h3>
                {isBlockRequiredForSelectedStage('supporting-docs') && (
                  <span className={styles.requiredBadge}>Required</span>
                )}
              </div>
              <p>Upload evidence and add a short note.</p>
            </div>
          </div>
        </header>
        <StageSupportingDocs
          stage={currentStage}
          disabled={!isStageEditable}
          onChange={(nextStage) => updateStage(selectedStage, nextStage)}
        />
      </section>
      )}

      {isBlockVisibleForSelectedStage('implementation-plan') && (
        <div className={styles.formBlockWrapper}>
          {isBlockRequiredForSelectedStage('implementation-plan') && (
            <div className={styles.requiredNotice}>Required for submission</div>
          )}
          <InitiativePlanModule
            plan={draft.plan}
            initiativeId={draft.id}
            allInitiatives={allInitiatives}
            onChange={handlePlanChange}
            readOnly={isReadOnlyMode}
            focusTaskId={focusPlanTaskId}
            openFullscreen={openPlanFullscreen}
            onFocusHandled={onPlanFocusClear}
          />
        </div>
      )}

      {isBlockVisibleForSelectedStage('implementation-plan-actuals') && (
        <div className={styles.formBlockWrapper}>
          {isBlockRequiredForSelectedStage('implementation-plan-actuals') && (
            <div className={styles.requiredNotice}>Required for submission</div>
          )}
          <InitiativePlanModule
            plan={draft.plan.actuals ?? createEmptyPlanActualsModel()}
            baselinePlan={draft.plan}
            variant="actuals"
            initiativeId={draft.id}
            allInitiatives={allInitiatives}
            onChange={handlePlanActualsChange}
            readOnly={isReadOnlyMode}
            title="Implementation plan - actuals"
            subtitle="Track real delivery, compare against the baseline, and highlight variance."
          />
        </div>
      )}

      {isBlockVisibleForSelectedStage('risks') && (
      <section className={`${styles.cardSection} ${styles.riskSection}`} {...buildProfileAnchor('risks', 'Risks')}>
        <header className={styles.cardHeader}>
          <div className={styles.cardHeaderTitle}>
            <button
              className={styles.sectionToggle}
              type="button"
              onClick={() => handleSectionToggle('risks')}
              aria-expanded={!risksCollapsed}
              aria-label={risksCollapsed ? 'Expand risks' : 'Collapse risks'}
            >
              <ChevronIcon direction={risksCollapsed ? 'right' : 'down'} size={16} />
            </button>
            <div>
              <div className={styles.sectionTitleRow}>
                <h3>Risks</h3>
                {isBlockRequiredForSelectedStage('risks') && <span className={styles.requiredBadge}>Required</span>}
              </div>
              <p>Compact register with sortable score to highlight what needs mitigation.</p>
            </div>
          </div>
          <button className={styles.primaryButton} type="button" onClick={handleAddRisk} disabled={isReadOnlyMode}>
            Add risk
          </button>
        </header>

        {!risksCollapsed &&
          (!sortedRisks.length ? (
            <p className={styles.placeholder}>No risks logged yet. Add the first one to show up before approvals.</p>
          ) : (
            <div className={styles.riskTable}>
              <div className={styles.riskHeaderRow}>
                {(
                  [
                    { key: 'title' as const, label: 'Title' },
                    { key: 'description' as const, label: 'Description' },
                    { key: 'category' as const, label: 'Category' },
                    { key: 'severity' as const, label: 'Severity' },
                    { key: 'likelihood' as const, label: 'Likelihood' },
                    { key: 'score' as const, label: 'Score' },
                    { key: 'mitigation' as const, label: 'Mitigation', sortable: false },
                    { key: 'review-comments' as const, label: 'Review comments', sortable: false }
                  ] as Array<{ key: RiskSortKey | 'mitigation' | 'review-comments'; label: string; sortable?: boolean }>
                ).map((column) => {
                  const sortable = column.sortable !== false && column.key !== 'mitigation';
                  return (
                    <button
                      key={column.key}
                      type="button"
                      className={styles.riskSortButton}
                      onClick={() => sortable && handleRiskSort(column.key as RiskSortKey)}
                      disabled={!sortable}
                      aria-label={
                        !sortable
                          ? undefined
                          : `Sort by ${column.label} ${riskSort.key === column.key ? riskSort.direction : ''}`
                      }
                    >
                      <span>{column.label}</span>
                      {sortable && (
                        <span className={styles.sortIndicator}>
                          {riskSort.key === column.key ? (riskSort.direction === 'asc' ? '^' : 'v') : '·'}
                        </span>
                      )}
                    </button>
                  );
                })}
                <span className={styles.riskHeaderPlaceholder} />
              </div>

              {sortedRisks.map((risk) => {
                const severity = clampRiskValue(risk.severity);
                const likelihood = clampRiskValue(risk.likelihood);
                const score = severity * likelihood;
                const tone = getRiskTone(severity, likelihood);
                const toneClass =
                  tone === 'unset'
                    ? styles.riskToneUnset
                    : tone === 'high'
                      ? styles.riskToneHigh
                      : tone === 'medium'
                        ? styles.riskToneMedium
                        : styles.riskToneLow;
                return (
                  <div key={risk.id} className={`${styles.riskRow} ${toneClass}`}>
                    <input
                      className={styles.riskTitleInput}
                      value={risk.title}
                      placeholder="Name the risk"
                      onChange={(event) => handleRiskChange(risk.id, 'title', event.target.value)}
                      disabled={isReadOnlyMode}
                    />
                    <textarea
                      className={styles.riskDescriptionArea}
                      rows={2}
                      value={risk.description}
                      placeholder="Short description"
                      onChange={(event) => handleRiskChange(risk.id, 'description', event.target.value)}
                      disabled={isReadOnlyMode}
                    />
                    <select
                      className={styles.riskSelect}
                      value={risk.category}
                      onChange={(event) => handleRiskChange(risk.id, 'category', event.target.value)}
                      disabled={isReadOnlyMode}
                    >
                      <option value="">{'\u2014'}</option>
                      {riskCategoryOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                      {!riskCategoryOptions.includes(risk.category) && risk.category && (
                        <option value={risk.category}>{risk.category}</option>
                      )}
                      {!riskCategoryOptions.includes('Uncategorized') && <option value="Uncategorized">Uncategorized</option>}
                    </select>
                    <select
                      className={styles.riskSelect}
                      value={severity}
                      onChange={(event) => handleRiskChange(risk.id, 'severity', Number(event.target.value))}
                      disabled={isReadOnlyMode}
                      title="1 = Minimal impact, 5 = Critical impact"
                    >
                      <option value={0}>{'\u2014'}</option>
                      {[1, 2, 3, 4, 5].map((option) => (
                        <option key={`sev-${option}`} value={option}>
                          {option} - {severityScaleLabels[option - 1]}
                        </option>
                      ))}
                    </select>
                    <select
                      className={styles.riskSelect}
                      value={likelihood}
                      onChange={(event) => handleRiskChange(risk.id, 'likelihood', Number(event.target.value))}
                      disabled={isReadOnlyMode}
                      title="1 = Rare, 5 = Almost certain"
                    >
                      <option value={0}>{'\u2014'}</option>
                      {[1, 2, 3, 4, 5].map((option) => (
                        <option key={`like-${option}`} value={option}>
                          {option} - {likelihoodScaleLabels[option - 1]}
                        </option>
                      ))}
                    </select>
                    <div className={`${styles.riskScoreBadge} ${score <= 0 ? styles.riskScoreBadgeUnset : ''}`}>
                      <span className={styles.riskScoreText}>
                        {score <= 0 ? '\u2014' : `${score} ${tone === 'high' ? 'High' : tone === 'medium' ? 'Medium' : 'Low'}`}
                      </span>
                    </div>
                    <textarea
                      className={styles.riskTextArea}
                      rows={2}
                      value={risk.mitigation}
                      onChange={(event) => handleRiskChange(risk.id, 'mitigation', event.target.value)}
                      placeholder="Mitigation plan"
                      disabled={isReadOnlyMode}
                    />
                    <div className={styles.riskCommentsCell}>
                      {(() => {
                        const comments = riskReviewCommentsByRiskId.get(risk.id) ?? [];
                        const openCount = comments.filter((comment) => !comment.resolvedAt).length;
                        const isExpanded = expandedRiskReviewComments.has(risk.id);
                        const visible = isExpanded ? comments : comments.slice(0, 1);
                        const status = riskReviewCommentsLoading
                          ? 'loading'
                          : riskReviewCommentsError
                            ? 'error'
                            : 'ready';
                        return (
                          <>
                            <div className={styles.riskCommentsHeader}>
                              <span className={styles.riskCommentsMeta}>
                                {status === 'loading'
                                  ? 'Loading...'
                                  : status === 'error'
                                    ? 'Failed to load.'
                                    : openCount
                                      ? `${openCount} open`
                                      : comments.length
                                        ? 'All resolved'
                                        : 'No comments'}
                              </span>
                              <div className={styles.riskCommentsHeaderRight}>
                                {comments.length > 1 && (
                                  <button
                                    type="button"
                                    className={styles.riskInlineLink}
                                    onClick={() => toggleExpandedRiskReviewComments(risk.id)}
                                  >
                                    {isExpanded ? 'Show less' : `Show all (${comments.length})`}
                                  </button>
                                )}
                              </div>
                            </div>

                            {status === 'ready' && visible.length > 0 && (
                              <div className={styles.riskCommentList}>
                                {visible.map((comment) => (
                                  <div
                                    key={comment.id}
                                    className={`${styles.riskCommentBubble} ${
                                      comment.resolvedAt ? styles.riskCommentBubbleResolved : ''
                                    }`}
                                  >
                                    <div className={styles.riskCommentBody} title={comment.body}>
                                      {comment.body}
                                    </div>
                                    {!comment.resolvedAt && (
                                      <div className={styles.riskCommentMetaRow}>
                                        <span className={styles.riskCommentMetaText}>
                                          {(comment.authorName ?? 'Unknown') +
                                            ' - ' +
                                            new Date(comment.createdAt).toLocaleString('en-AU', {
                                              dateStyle: 'medium',
                                              timeStyle: 'short'
                                            })}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div className={styles.riskActions}>
                      <button
                        type="button"
                        className={styles.riskRemoveButton}
                        onClick={() => handleRemoveRisk(risk.id)}
                        disabled={isReadOnlyMode}
                        title="Remove risk"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}


      </section>
      )}

      <section className={styles.changeLogSection} {...buildProfileAnchor('change-log', 'Change log')}>
        <header className={styles.changeLogHeader}>
          <button
            className={styles.sectionToggle}
            type="button"
            onClick={() => handleSectionToggle('change-log')}
            aria-expanded={!changeLogCollapsed}
            aria-label={changeLogCollapsed ? 'Expand change log' : 'Collapse change log'}
          >
            <ChevronIcon direction={changeLogCollapsed ? 'right' : 'down'} size={16} />
          </button>
          <h4>Change log</h4>
        </header>
        {!changeLogCollapsed &&
          (isLogLoading ? (
            <p className={styles.placeholder}>Loading change log...</p>
          ) : changeLog.length === 0 ? (
            <p className={styles.placeholder}>No changes recorded yet.</p>
          ) : (
            <>
              <ul className={styles.changeLogList}>
                {changeLog.slice(0, logVisibleCount).map((entry) => {
                  const summaryParts = entry.changes
                    .map((change) => {
                      if (change.field === 'created') {
                        return 'Initiative created';
                      }
                    if (change.field === 'stage-content') {
                      return 'Stage content updated';
                    }
                    if (change.field === 'execution-plan') {
                      return 'Timeline updated';
                    }
                    if (change.field === 'kpi') {
                      return 'KPIs updated';
                    }
                    if (change.field === 'updated') {
                      return null;
                    }
                    const label = buildChangeLabel(change.field);
                    const previous = formatLogValue(change.field, change.previousValue);
                    const next = formatLogValue(change.field, change.nextValue);
                    if (previous === next) {
                      return null;
                    }
                    return `${label}: ${previous} > ${next}`;
                  })
                  .filter((value): value is string => Boolean(value));
                const summary = summaryParts.length ? summaryParts.join('; ') : 'Updated';
                  return (
                    <li key={entry.id} className={styles.changeLogLine}>
                      <span className={styles.logTime}>{new Date(entry.createdAt).toLocaleString()}</span>
                      <span className={styles.logActor}>{entry.actorName ?? 'System'}</span>
                      <span className={styles.logSummary}>{summary}</span>
                    </li>
                  );
                })}
              </ul>
              {logVisibleCount < changeLog.length && (
                <div className={styles.changeLogActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setLogVisibleCount((count) => Math.min(changeLog.length, count + 20))}
                  >
                    Show more
                  </button>
                  <span className={styles.changeLogMeta}>
                    Showing {Math.min(logVisibleCount, changeLog.length)} of {changeLog.length}
                  </span>
                </div>
              )}
            </>
          ))}
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <button className={styles.secondaryButton} onClick={() => onBack(draft.workstreamId)} type="button">
            {isReadOnlyMode ? 'Close' : 'Cancel'}
          </button>
          {!isReadOnlyMode && mode === 'view' && (
            <button className={styles.dangerButton} onClick={handleDeleteClick} disabled={isDeleting} type="button">
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          )}
        </div>
      </footer>
      {isSubmitConfirmOpen && (
        <div
          className={styles.submitOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm stage submission"
          onClick={handleCancelSubmit}
        >
          <div className={styles.submitModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.submitHeader}>
              <h4>Submit {selectedStageLabel}</h4>
              <p className={styles.submitPrompt}>
                {missingRequiredBlocksForSubmitStage.length > 0
                  ? 'Complete the required items below before submitting this stage gate:'
                  : 'Required items for this stage gate submission:'}
              </p>
            </div>
            <ul className={styles.submitChecklist}>
              {submitChecklistEntries.map((entry, index) => (
                <li
                  key={`${selectedStage}-${entry.blockKey ?? 'none'}-${index}`}
                  className={entry.missing ? styles.submitChecklistMissing : undefined}
                >
                  {entry.text}
                </li>
              ))}
            </ul>
            <div className={styles.submitActions}>
              <button className={styles.cancelSubmitButton} onClick={handleCancelSubmit} type="button" disabled={isSubmitting}>
                Hold on, don't submit
              </button>
              <button
                className={styles.confirmSubmitButton}
                onClick={handleSubmitClick}
                type="button"
                disabled={isSubmitting || missingRequiredBlocksForSubmitStage.length > 0}
                title={
                  missingRequiredBlocksForSubmitStage.length > 0
                    ? 'Complete required items before submitting.'
                    : undefined
                }
              >
                {isSubmitting ? 'Submitting...' : 'I confirm, submit'}
              </button>
            </div>
          </div>
        </div>
      )}
      <CommentInputPopover
        containerRef={contentRef}
        draft={pendingSelection}
        isSaving={isSavingComment}
        onSubmit={handleSubmitComment}
        onCancel={clearPendingSelection}
      />
      <CommentSelectionOverlay
        isActive={isCommentMode && commentsAvailable}
        containerRef={contentRef}
        sidebarRef={sidebarRef}
        onSelect={handleSelectionTarget}
        onExit={() => {
          setIsCommentMode(false);
          clearPendingSelection();
          setActiveThreadId(null);
        }}
      />
    </div>
    {isCommentMode && commentsAvailable && (
      <CommentSidebar
        ref={sidebarRef}
        threads={commentThreads}
        isLoading={isLoadingComments}
        isSaving={isSavingComment}
        error={commentError}
        pendingSelection={pendingSelection}
        onCancelPending={clearPendingSelection}
        onReply={handleReplyComment}
        onClose={() => {
          setIsCommentMode(false);
          clearPendingSelection();
          setActiveThreadId(null);
        }}
        onSelectThread={setActiveThreadId}
        activeThreadId={activeThreadId}
        onToggleResolved={async (threadId, next) => {
          await toggleResolved(threadId, next);
        }}
        onDeleteComment={handleDeleteComment}
        currentActorId={session?.accountId ?? null}
        anchorMap={commentAnchors}
        onScrollToElement={handleScrollToElement}
      />
    )}
      </div>
  </section>
);
};
