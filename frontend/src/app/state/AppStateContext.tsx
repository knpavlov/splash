import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccountRecord, AccountRole, InterviewerSeniority } from '../../shared/types/account';
import { DomainResult } from '../../shared/types/results';
import {
  Initiative,
  InitiativeBusinessCaseFile,
  InitiativeFinancialKind,
  InitiativeStageKey,
  InitiativeSupportingDocument,
  InitiativeStageKPI,
  InitiativeRisk,
  initiativeStageKeys,
  initiativeFinancialKinds
} from '../../shared/types/initiative';
import {
  defaultWorkstreamRoleOptions,
  Workstream,
  WorkstreamRoleAssignment,
  WorkstreamRoleOption,
  WorkstreamRoleSelection
} from '../../shared/types/workstream';
import { accountsApi } from '../../modules/accounts/services/accountsApi';
import { initiativesApi } from '../../modules/initiatives/services/initiativesApi';
import { sanitizePlanModel } from '../../modules/initiatives/plan/planModel';
import { workstreamsApi } from '../../modules/workstreams/services/workstreamsApi';
import { ApiError } from '../../shared/api/httpClient';
import { useAuth } from '../../modules/auth/AuthContext';
import { Participant, ParticipantPayload, ParticipantUpdatePayload } from '../../shared/types/participant';
import { participantsApi } from '../../modules/participants/services/participantsApi';
import { FinancialBlueprint, FinancialBlueprintPayload } from '../../shared/types/financials';
import { financialsApi } from '../../modules/financials/services/financialsApi';
import { generateId } from '../../shared/ui/generateId';

const PLAN_MILESTONE_STORAGE_KEY = 'initiative-plan:milestone-types';
const DEFAULT_MILESTONE_TYPES = ['Standard', 'Value Step', 'Change Management'];
const VALUE_STEP_LABEL = 'Value Step';
const STATUS_REPORT_SETTINGS_KEY = 'initiative-plan:status-report-settings';
const PERIOD_SETTINGS_KEY = 'initiative-plan:period-settings';
const RISK_CATEGORY_STORAGE_KEY = 'initiative-plan:risk-categories';
const DEFAULT_RISK_CATEGORIES = [
  'Delivery & timeline',
  'Technical & architecture',
  'People & resourcing',
  'Financial & budget',
  'Compliance & regulatory',
  'External & market'
];
const statusFrequencyOptions = ['weekly', 'biweekly', 'every-4-weeks'] as const;
type StatusReportFrequency = (typeof statusFrequencyOptions)[number];

export interface PeriodSettings {
  periodMonth: number;
  periodYear: number;
}

export interface StatusReportSettings {
  refreshDay: string;
  refreshTime: string;
  templateResetDay: string;
  templateResetTime: string;
  submitDeadlineDay: string;
  submitDeadlineTime: string;
  refreshFrequency: StatusReportFrequency;
  upcomingWindowDays: number;
}

const DEFAULT_STATUS_REPORT_SETTINGS: StatusReportSettings = {
  refreshDay: 'monday',
  refreshTime: '09:00',
  templateResetDay: 'monday',
  templateResetTime: '09:00',
  submitDeadlineDay: 'thursday',
  submitDeadlineTime: '18:00',
  refreshFrequency: 'weekly',
  upcomingWindowDays: 14
};

const getDefaultPeriodSettings = (): PeriodSettings => {
  const now = new Date();
  return {
    periodMonth: now.getMonth() + 1,
    periodYear: now.getFullYear()
  };
};

const sanitizePeriodSettings = (value: unknown): PeriodSettings => {
  const fallback = getDefaultPeriodSettings();
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  const payload = value as Partial<PeriodSettings>;
  const month =
    typeof payload.periodMonth === 'number' && payload.periodMonth >= 1 && payload.periodMonth <= 12
      ? Math.trunc(payload.periodMonth)
      : fallback.periodMonth;
  const year =
    typeof payload.periodYear === 'number' && Number.isFinite(payload.periodYear)
      ? Math.max(2000, Math.trunc(payload.periodYear))
      : fallback.periodYear;
  return { periodMonth: month, periodYear: year };
};

const loadPeriodSettings = (): PeriodSettings => {
  if (typeof window === 'undefined') {
    return getDefaultPeriodSettings();
  }
  const raw = window.localStorage.getItem(PERIOD_SETTINGS_KEY);
  if (!raw) {
    return getDefaultPeriodSettings();
  }
  try {
    const parsed = JSON.parse(raw);
    return sanitizePeriodSettings(parsed);
  } catch {
    return getDefaultPeriodSettings();
  }
};

const sanitizeMilestoneTypes = (options: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  const source = Array.isArray(options) ? options : [];
  [...source, ...DEFAULT_MILESTONE_TYPES].forEach((option) => {
    if (typeof option !== 'string') {
      return;
    }
    const trimmed = option.trim();
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(trimmed);
  });
  return result;
};

const sanitizeDay = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  const options = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return options.includes(normalized) ? normalized : fallback;
};

const sanitizeTime = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    return fallback;
  }
  return trimmed;
};

const sanitizeStatusReportSettings = (value: unknown): StatusReportSettings => {
  if (!value || typeof value !== 'object') {
    return DEFAULT_STATUS_REPORT_SETTINGS;
  }
  const payload = value as Partial<StatusReportSettings>;
  const frequency =
    statusFrequencyOptions.includes(payload.refreshFrequency as StatusReportFrequency) &&
      (payload.refreshFrequency as StatusReportFrequency)
      ? (payload.refreshFrequency as StatusReportFrequency)
      : DEFAULT_STATUS_REPORT_SETTINGS.refreshFrequency;
  const upcomingWindowDays =
    typeof payload.upcomingWindowDays === 'number' && Number.isFinite(payload.upcomingWindowDays)
      ? Math.max(1, Math.trunc(payload.upcomingWindowDays))
      : DEFAULT_STATUS_REPORT_SETTINGS.upcomingWindowDays;
  return {
    refreshDay: sanitizeDay(payload.refreshDay, DEFAULT_STATUS_REPORT_SETTINGS.refreshDay),
    refreshTime: sanitizeTime(payload.refreshTime, DEFAULT_STATUS_REPORT_SETTINGS.refreshTime),
    templateResetDay: sanitizeDay(payload.templateResetDay, DEFAULT_STATUS_REPORT_SETTINGS.templateResetDay),
    templateResetTime: sanitizeTime(payload.templateResetTime, DEFAULT_STATUS_REPORT_SETTINGS.templateResetTime),
    submitDeadlineDay: sanitizeDay(payload.submitDeadlineDay, DEFAULT_STATUS_REPORT_SETTINGS.submitDeadlineDay),
    submitDeadlineTime: sanitizeTime(payload.submitDeadlineTime, DEFAULT_STATUS_REPORT_SETTINGS.submitDeadlineTime),
    refreshFrequency: frequency,
    upcomingWindowDays
  };
};

const sanitizeRiskCategories = (options: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  const source = Array.isArray(options) ? options : [];
  source.forEach((option) => {
    if (typeof option !== 'string') {
      return;
    }
    const trimmed = option.trim();
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(trimmed);
  });
  return result.length ? result : [...DEFAULT_RISK_CATEGORIES];
};

const loadMilestoneTypes = (): string[] => {
  if (typeof window === 'undefined') {
    return DEFAULT_MILESTONE_TYPES;
  }
  const raw = window.localStorage.getItem(PLAN_MILESTONE_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_MILESTONE_TYPES;
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const sanitized = sanitizeMilestoneTypes(parsed as string[]);
      return sanitized.length ? sanitized : DEFAULT_MILESTONE_TYPES;
    }
  } catch {
    return DEFAULT_MILESTONE_TYPES;
  }
  return DEFAULT_MILESTONE_TYPES;
};

const loadStatusReportSettings = (): StatusReportSettings => {
  if (typeof window === 'undefined') {
    return DEFAULT_STATUS_REPORT_SETTINGS;
  }
  const raw = window.localStorage.getItem(STATUS_REPORT_SETTINGS_KEY);
  if (!raw) {
    return DEFAULT_STATUS_REPORT_SETTINGS;
  }
  try {
    const parsed = JSON.parse(raw);
    return sanitizeStatusReportSettings(parsed);
  } catch {
    return DEFAULT_STATUS_REPORT_SETTINGS;
  }
};

const loadRiskCategories = (): string[] => {
  if (typeof window === 'undefined') {
    return [...DEFAULT_RISK_CATEGORIES];
  }
  const raw = window.localStorage.getItem(RISK_CATEGORY_STORAGE_KEY);
  if (!raw) {
    return [...DEFAULT_RISK_CATEGORIES];
  }
  try {
    const parsed = JSON.parse(raw);
    return sanitizeRiskCategories(parsed);
  } catch {
    return [...DEFAULT_RISK_CATEGORIES];
  }
};

const sanitizeNumber = (value: number) => (Number.isFinite(value) ? Number(value) : 0);

const sanitizeBusinessCaseFile = (file: InitiativeBusinessCaseFile): InitiativeBusinessCaseFile | null => {
  const fileName = typeof file.fileName === 'string' ? file.fileName.trim() : '';
  const dataUrl = typeof file.dataUrl === 'string' ? file.dataUrl : '';
  if (!fileName || !dataUrl) {
    return null;
  }
  const mimeType = typeof file.mimeType === 'string' ? file.mimeType.trim() || null : null;
  const size = Number.isFinite(file.size) ? Math.max(0, Number(file.size)) : 0;
  const uploadedAt =
    typeof file.uploadedAt === 'string' && file.uploadedAt.trim()
      ? new Date(file.uploadedAt).toISOString()
      : new Date().toISOString();
  return {
    id: typeof file.id === 'string' && file.id.trim() ? file.id.trim() : generateId(),
    fileName,
    mimeType,
    size,
    dataUrl,
    uploadedAt
  };
};

const sanitizeSupportingDoc = (file: InitiativeSupportingDocument): InitiativeSupportingDocument | null => {
  const fileName = typeof file.fileName === 'string' ? file.fileName.trim() : '';
  const dataUrl = typeof file.dataUrl === 'string' ? file.dataUrl : '';
  if (!fileName || !dataUrl) {
    return null;
  }
  const mimeType = typeof file.mimeType === 'string' ? file.mimeType.trim() || null : null;
  const size = Number.isFinite(file.size) ? Math.max(0, Number(file.size)) : 0;
  const uploadedAt =
    typeof file.uploadedAt === 'string' && file.uploadedAt.trim()
      ? new Date(file.uploadedAt).toISOString()
      : new Date().toISOString();
  const comment = typeof file.comment === 'string' ? file.comment.trim() : '';
  return {
    id: typeof file.id === 'string' && file.id.trim() ? file.id.trim() : generateId(),
    fileName,
    mimeType,
    size,
    dataUrl,
    uploadedAt,
    comment
  };
};

const sanitizeKpi = (kpi: InitiativeStageKPI): InitiativeStageKPI | null => {
  const name = typeof kpi.name === 'string' ? kpi.name.trim() : '';
  if (!name) {
    return null;
  }
  const unit = typeof kpi.unit === 'string' ? kpi.unit.trim() : '';
  const source = typeof kpi.source === 'string' ? kpi.source.trim() : '';
  const baseline =
    typeof kpi.baseline === 'number' && Number.isFinite(kpi.baseline) ? Number(kpi.baseline) : null;
  const distribution: Record<string, number> = {};
  const actuals: Record<string, number> = {};
  if (kpi.distribution && typeof kpi.distribution === 'object') {
    Object.entries(kpi.distribution).forEach(([key, value]) => {
      const trimmed = key.trim();
      const numeric = Number(value);
      if (!trimmed || Number.isNaN(numeric)) {
        return;
      }
      distribution[trimmed] = numeric;
    });
  }
  if (kpi.actuals && typeof kpi.actuals === 'object') {
    Object.entries(kpi.actuals).forEach(([key, value]) => {
      const trimmed = key.trim();
      const numeric = Number(value);
      if (!trimmed || Number.isNaN(numeric)) {
        return;
      }
      actuals[trimmed] = numeric;
    });
  }
  return {
    id: typeof kpi.id === 'string' && kpi.id.trim() ? kpi.id.trim() : generateId(),
    name,
    unit,
    source,
    isCustom: Boolean(kpi.isCustom),
    baseline,
    distribution,
    actuals
  };
};

const clampRiskScore = (value: unknown) => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.min(5, Math.max(1, Math.round(numeric)));
};

const sanitizeRiskEntry = (risk: InitiativeRisk, fallbackCategory: string): InitiativeRisk | null => {
  const title = typeof risk.title === 'string' ? risk.title.trim() : '';
  const mitigation = typeof risk.mitigation === 'string' ? risk.mitigation.trim() : '';
  const description = typeof risk.description === 'string' ? risk.description.trim() : '';
  const category = typeof risk.category === 'string' ? risk.category.trim() : fallbackCategory;
  if (!title && !description && !mitigation && !category) {
    return null;
  }
  return {
    id: typeof risk.id === 'string' && risk.id.trim() ? risk.id.trim() : generateId(),
    title,
    category: category || fallbackCategory,
    severity: clampRiskScore(risk.severity),
    likelihood: clampRiskScore(risk.likelihood),
    mitigation,
    description
  };
};

const normalizeParticipantOptional = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
};

interface AppStateContextValue {
  workstreams: {
    list: Workstream[];
    roleOptions: WorkstreamRoleOption[];
    saveRoleOptions: (options: WorkstreamRoleOption[]) => Promise<DomainResult<WorkstreamRoleOption[]>>;
    saveWorkstream: (
      workstream: Workstream,
      expectedVersion: number | null
    ) => Promise<DomainResult<Workstream>>;
    removeWorkstream: (id: string) => Promise<DomainResult<string>>;
    listAssignments: (accountId: string) => Promise<DomainResult<WorkstreamRoleAssignment[]>>;
    listAssignmentsByWorkstream: (
      workstreamId: string
    ) => Promise<DomainResult<WorkstreamRoleAssignment[]>>;
    saveAssignments: (
      accountId: string,
      roles: WorkstreamRoleSelection[]
    ) => Promise<DomainResult<WorkstreamRoleAssignment[]>>;
  };
  initiatives: {
    list: Initiative[];
    loaded: boolean;
    saveInitiative: (
      initiative: Initiative,
      expectedVersion: number | null
    ) => Promise<DomainResult<Initiative>>;
    removeInitiative: (id: string) => Promise<DomainResult<string>>;
    advanceStage: (
      id: string,
      targetStage?: InitiativeStageKey
    ) => Promise<DomainResult<Initiative>>;
    submitStage: (id: string) => Promise<DomainResult<Initiative>>;
  };
  accounts: {
    list: AccountRecord[];
    inviteAccount: (
      email: string,
      role: AccountRole,
      firstName: string,
      lastName: string,
      interviewerRole: InterviewerSeniority
    ) => Promise<DomainResult<AccountRecord>>;
    activateAccount: (id: string) => Promise<DomainResult<AccountRecord>>;
    removeAccount: (id: string) => Promise<DomainResult<string>>;
    updateRole: (id: string, role: 'admin' | 'user') => Promise<DomainResult<AccountRecord>>;
  };
  participants: {
    list: Participant[];
    createParticipant: (participant: ParticipantPayload) => Promise<DomainResult<Participant>>;
    updateParticipant: (id: string, changes: ParticipantUpdatePayload) => Promise<DomainResult<Participant>>;
    removeParticipant: (id: string) => Promise<DomainResult<string>>;
  };
  financials: {
    blueprint: FinancialBlueprint | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    saveBlueprint: (
      blueprint: FinancialBlueprintPayload,
      expectedVersion: number
    ) => Promise<DomainResult<FinancialBlueprint>>;
  };
  planSettings: {
    milestoneTypes: string[];
    saveMilestoneTypes: (options: string[]) => void;
    periodSettings: PeriodSettings;
    savePeriodSettings: (settings: PeriodSettings) => void;
    statusReportSettings: StatusReportSettings;
    saveStatusReportSettings: (settings: StatusReportSettings) => void;
    riskCategories: string[];
    saveRiskCategories: (options: string[]) => void;
  };
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export const AppStateProvider = ({ children }: { children: ReactNode }) => {
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [workstreamRoleOptions, setWorkstreamRoleOptions] = useState<WorkstreamRoleOption[]>([
    ...defaultWorkstreamRoleOptions
  ]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [financialBlueprint, setFinancialBlueprint] = useState<FinancialBlueprint | null>(null);
  const [financialBlueprintLoading, setFinancialBlueprintLoading] = useState(false);
  const [financialBlueprintError, setFinancialBlueprintError] = useState<string | null>(null);
  const [milestoneTypes, setMilestoneTypes] = useState<string[]>(() => loadMilestoneTypes());
  const [periodSettings, setPeriodSettings] = useState<PeriodSettings>(() => loadPeriodSettings());
  const [statusReportSettings, setStatusReportSettings] = useState<StatusReportSettings>(() =>
    loadStatusReportSettings()
  );
  const [riskCategories, setRiskCategories] = useState<string[]>(() => loadRiskCategories());
  const { session } = useAuth();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(PLAN_MILESTONE_STORAGE_KEY, JSON.stringify(milestoneTypes));
  }, [milestoneTypes]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(PERIOD_SETTINGS_KEY, JSON.stringify(periodSettings));
  }, [periodSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STATUS_REPORT_SETTINGS_KEY, JSON.stringify(statusReportSettings));
  }, [statusReportSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(RISK_CATEGORY_STORAGE_KEY, JSON.stringify(riskCategories));
  }, [riskCategories]);

  const saveMilestoneTypes = useCallback((options: string[]) => {
    const sanitized = sanitizeMilestoneTypes(options);
    setMilestoneTypes(sanitized.length ? sanitized : DEFAULT_MILESTONE_TYPES);
  }, []);

  const savePeriodSettings = useCallback((settings: PeriodSettings) => {
    const sanitized = sanitizePeriodSettings(settings);
    setPeriodSettings(sanitized);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PERIOD_SETTINGS_KEY, JSON.stringify(sanitized));
    }
  }, []);

  const saveStatusReportSettings = useCallback((settings: StatusReportSettings) => {
    const sanitized = sanitizeStatusReportSettings(settings);
    setStatusReportSettings(sanitized);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STATUS_REPORT_SETTINGS_KEY, JSON.stringify(sanitized));
    }
  }, []);

  const saveRiskCategories = useCallback((options: string[]) => {
    const sanitized = sanitizeRiskCategories(options);
    setRiskCategories(sanitized.length ? sanitized : DEFAULT_RISK_CATEGORIES);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RISK_CATEGORY_STORAGE_KEY, JSON.stringify(sanitized));
    }
  }, []);

  const applyPeriodSettings = useCallback(
    (initiative: Initiative): Initiative => {
      let changed = false;
      const stages = initiativeStageKeys.reduce((acc, key) => {
        const stage = initiative.stages[key];
        const nextStage =
          stage.periodMonth === periodSettings.periodMonth && stage.periodYear === periodSettings.periodYear
            ? stage
            : { ...stage, periodMonth: periodSettings.periodMonth, periodYear: periodSettings.periodYear };
        acc[key] = nextStage;
        changed = changed || nextStage !== stage;
        return acc;
      }, {} as Initiative['stages']);
      return changed ? { ...initiative, stages } : initiative;
    },
    [periodSettings.periodMonth, periodSettings.periodYear]
  );



  useEffect(() => {
    if (!session) {
      setAccounts([]);
      return;
    }
    const loadAccounts = async () => {
      try {
        const remote = await accountsApi.list();
        setAccounts(remote);
      } catch (error) {
        console.error('Failed to load accounts:', error);
      }
    };
    void loadAccounts();
  }, [session]);

  useEffect(() => {
    if (!session) {
      setParticipants([]);
      return;
    }
    const loadParticipants = async () => {
      try {
        const remote = await participantsApi.list();
        setParticipants(remote);
      } catch (error) {
        console.error('Failed to load participants:', error);
      }
    };
    void loadParticipants();
  }, [session]);

  const loadFinancialBlueprint = useCallback(async () => {
    if (!session) {
      return;
    }
    setFinancialBlueprintLoading(true);
    try {
      const remote = await financialsApi.getBlueprint();
      setFinancialBlueprint(remote);
      setFinancialBlueprintError(null);
    } catch (error) {
      console.error('Failed to load financial blueprint:', error);
      setFinancialBlueprintError('load_failed');
    } finally {
      setFinancialBlueprintLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) {
      setFinancialBlueprint(null);
      setFinancialBlueprintError(null);
      setFinancialBlueprintLoading(false);
      return;
    }
    void loadFinancialBlueprint();
  }, [session, loadFinancialBlueprint]);

  const saveFinancialBlueprint = useCallback(
    async (blueprint: FinancialBlueprintPayload, expectedVersion: number) => {
      if (!Number.isInteger(expectedVersion)) {
        return { ok: false, error: 'invalid-input' } as DomainResult<FinancialBlueprint>;
      }
      const result = await financialsApi.saveBlueprint(blueprint, expectedVersion);
      if (result.ok) {
        setFinancialBlueprint(result.data);
      } else if (result.error === 'version-conflict') {
        await loadFinancialBlueprint();
      }
      return result;
    },
    [loadFinancialBlueprint]
  );

  useEffect(() => {
    if (!session) {
      setWorkstreams([]);
      setWorkstreamRoleOptions([...defaultWorkstreamRoleOptions]);
      setInitiatives([]);
    }
  }, [session]);





  useEffect(() => {
    if (!session) {
      setWorkstreams([]);
      return;
    }
    const loadWorkstreams = async () => {
      try {
        const remote = await workstreamsApi.list();
        setWorkstreams(remote);
      } catch (error) {
        console.error('Failed to load workstreams:', error);
      }
    };
    void loadWorkstreams();
  }, [session]);

  useEffect(() => {
    if (!session) {
      setWorkstreamRoleOptions([...defaultWorkstreamRoleOptions]);
      return;
    }
    const loadRoleOptions = async () => {
      try {
        const remote = await workstreamsApi.roleOptions();
        setWorkstreamRoleOptions(remote);
      } catch (error) {
        console.error('Failed to load workstream role options:', error);
        setWorkstreamRoleOptions([...defaultWorkstreamRoleOptions]);
      }
    };
    void loadRoleOptions();
  }, [session]);

  const [initiativesLoaded, setInitiativesLoaded] = useState(false);
  useEffect(() => {
    if (!session) {
      setInitiatives([]);
      setInitiativesLoaded(false);
      return;
    }
    const loadInitiatives = async () => {
      try {
        const remote = await initiativesApi.list();
        setInitiatives(remote.map((item) => applyPeriodSettings(item)));
      } catch (error) {
        console.error('Failed to load initiatives:', error);
      } finally {
        setInitiativesLoaded(true);
      }
    };
    void loadInitiatives();
  }, [session, applyPeriodSettings]);

  useEffect(() => {
    setInitiatives((prev) => prev.map((item) => applyPeriodSettings(item)));
  }, [applyPeriodSettings]);







  const sortWorkstreamsByUpdated = (items: Workstream[]) =>
    [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const sortInitiativesByUpdated = (items: Initiative[]) =>
    [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const sanitizeInitiativeForSave = (initiative: Initiative, periodSettings: PeriodSettings): Initiative => {
    const trimmedId = initiative.id.trim();
    const trimmedWorkstream = initiative.workstreamId.trim();
    const trimmedName = initiative.name.trim();
    const trimmedDescription = initiative.description.trim();
    const trimmedStatus = initiative.currentStatus.trim() || 'draft';
    const trimmedOwnerName = initiative.ownerName?.trim() || null;
    const trimmedOwnerAccountId = initiative.ownerAccountId?.trim() || null;
    const sanitizedStages = initiativeStageKeys.reduce((acc, key) => {
      const stage = initiative.stages[key];
      const calcLogicSource =
        stage?.calculationLogic && typeof stage.calculationLogic === 'object'
          ? (stage.calculationLogic as Record<string, unknown>)
          : {};
      const businessCaseFiles = Array.isArray(stage?.businessCaseFiles)
        ? stage.businessCaseFiles
          .map((file) => sanitizeBusinessCaseFile(file))
          .filter((file): file is InitiativeBusinessCaseFile => Boolean(file))
        : [];
      const supportingDocs = Array.isArray(stage?.supportingDocs)
        ? stage.supportingDocs
          .map((file) => sanitizeSupportingDoc(file))
          .filter((file): file is InitiativeSupportingDocument => Boolean(file))
        : [];
      const kpis = Array.isArray(stage?.kpis)
        ? stage.kpis
          .map((entry) => sanitizeKpi(entry as InitiativeStageKPI))
          .filter((entry): entry is InitiativeStageKPI => Boolean(entry))
        : [];
      acc[key] = {
        ...stage,
        name: stage.name.trim(),
        description: stage.description.trim(),
        periodMonth: periodSettings.periodMonth,
        periodYear: periodSettings.periodYear,
        valueStepTaskId: stage.valueStepTaskId?.trim() || null,
        additionalCommentary: stage.additionalCommentary?.trim() ?? '',
        calculationLogic: initiativeFinancialKinds.reduce((logicAcc, kind) => {
          const raw = calcLogicSource[kind];
          logicAcc[kind] = typeof raw === 'string' ? raw.trim() : '';
          return logicAcc;
        }, {} as Record<InitiativeFinancialKind, string>),
        businessCaseFiles,
        supportingDocs,
        kpis,
        financials: initiativeFinancialKinds.reduce((finAcc, kind) => {
          finAcc[kind] = stage.financials[kind].map((entry) => ({
            ...entry,
            label: entry.label.trim(),
            category: entry.category.trim(),
            lineCode: entry.lineCode ? entry.lineCode.trim() : null,
            distribution: Object.fromEntries(
              Object.entries(entry.distribution).map(([month, amount]) => [month, sanitizeNumber(amount)])
            )
          }));
          return finAcc;
        }, {} as Initiative['stages'][InitiativeStageKey]['financials'])
      };
      return acc;
    }, {} as Initiative['stages']);
    const sanitizedStageState = initiativeStageKeys.reduce((acc, key) => {
      const state = initiative.stageState[key];
      acc[key] = {
        status: state?.status ?? 'draft',
        roundIndex: Number.isFinite(state?.roundIndex) ? Number(state?.roundIndex) : 0,
        comment: state?.comment?.trim() || null
      };
      return acc;
    }, {} as Initiative['stageState']);
    const sanitizedPlan = sanitizePlanModel(initiative.plan);
    const valueStepTaskId =
      sanitizedPlan.tasks.find(
        (task) => (task.milestoneType ?? '').toLowerCase() === VALUE_STEP_LABEL.toLowerCase()
      )?.id ?? null;
    const normalizedStages = initiativeStageKeys.reduce((acc, key) => {
      acc[key] = { ...sanitizedStages[key], valueStepTaskId };
      return acc;
    }, {} as Initiative['stages']);
    const defaultRiskCategory = riskCategories[0] ?? 'Uncategorized';
    const sanitizedRisks = Array.isArray(initiative.risks)
      ? initiative.risks
          .map((risk) => sanitizeRiskEntry(risk as InitiativeRisk, defaultRiskCategory))
          .filter((risk): risk is InitiativeRisk => Boolean(risk))
      : [];

    return {
      ...initiative,
      id: trimmedId,
      workstreamId: trimmedWorkstream,
      name: trimmedName,
      description: trimmedDescription,
      currentStatus: trimmedStatus,
      ownerName: trimmedOwnerName,
      ownerAccountId: trimmedOwnerAccountId,
      stages: normalizedStages,
      stageState: sanitizedStageState,
      plan: sanitizedPlan,
      risks: sanitizedRisks
    };
  };

  const value = useMemo<AppStateContextValue>(() => ({

    workstreams: {
      list: workstreams,
      roleOptions: workstreamRoleOptions,
      saveRoleOptions: async (options) => {
        try {
          const sanitized = options
            .map((option) => ({
              value: option.value.trim(),
              label: option.label.trim()
            }))
            .filter((option) => option.value && option.label);
          const saved = await workstreamsApi.saveRoleOptions(sanitized);
          setWorkstreamRoleOptions(saved);
          return { ok: true, data: saved };
        } catch (error) {
          console.error('Failed to save workstream roles:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      saveWorkstream: async (workstream, expectedVersion) => {
        const trimmedId = workstream.id.trim();
        if (!trimmedId) {
          return { ok: false, error: 'invalid-input' };
        }

        const sanitized: Workstream = {
          ...workstream,
          id: trimmedId,
          name: workstream.name.trim(),
          description: workstream.description.trim()
        };

        const exists = workstreams.some((item) => item.id === trimmedId);

        try {
          if (exists) {
            if (expectedVersion === null || expectedVersion === undefined) {
              return { ok: false, error: 'invalid-input' };
            }
            const updated = await workstreamsApi.update(trimmedId, sanitized, expectedVersion);
            setWorkstreams((prev) =>
              sortWorkstreamsByUpdated([...prev.filter((item) => item.id !== trimmedId), updated])
            );
            return { ok: true, data: updated };
          }

          const created = await workstreamsApi.create(sanitized);
          setWorkstreams((prev) => sortWorkstreamsByUpdated([...prev, created]));
          return { ok: true, data: created };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'version-conflict') {
              return { ok: false, error: 'version-conflict' };
            }
            if (error.code === 'invalid-input') {
              return { ok: false, error: 'invalid-input' };
            }
            if (error.code === 'not-found' || error.status === 404) {
              return { ok: false, error: 'not-found' };
            }
          }
          console.error('Failed to save workstream:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      removeWorkstream: async (id) => {
        const trimmed = id.trim();
        if (!trimmed) {
          return { ok: false, error: 'invalid-input' };
        }
        try {
          await workstreamsApi.remove(trimmed);
          setWorkstreams((prev) => prev.filter((item) => item.id !== trimmed));
          return { ok: true, data: trimmed };
        } catch (error) {
          if (error instanceof ApiError && (error.code === 'not-found' || error.status === 404)) {
            return { ok: false, error: 'not-found' };
          }
          console.error('Failed to delete workstream:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      listAssignments: async (accountId) => {
        const trimmed = accountId.trim();
        if (!trimmed) {
          return { ok: false, error: 'invalid-input' };
        }
        try {
          const assignments = await workstreamsApi.listAssignments(trimmed);
          return { ok: true, data: assignments };
        } catch (error) {
          if (error instanceof ApiError && (error.code === 'not-found' || error.status === 404)) {
            return { ok: false, error: 'not-found' };
          }
          console.error('Failed to load workstream roles:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      listAssignmentsByWorkstream: async (workstreamId) => {
        const trimmed = workstreamId.trim();
        if (!trimmed) {
          return { ok: false, error: 'invalid-input' };
        }
        try {
          const assignments = await workstreamsApi.listAssignmentsByWorkstream(trimmed);
          return { ok: true, data: assignments };
        } catch (error) {
          if (error instanceof ApiError && (error.code === 'not-found' || error.status === 404)) {
            return { ok: false, error: 'not-found' };
          }
          console.error('Failed to load workstream assignments:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      saveAssignments: async (accountId, roles) => {
        const trimmed = accountId.trim();
        if (!trimmed) {
          return { ok: false, error: 'invalid-input' };
        }
        try {
          const saved = await workstreamsApi.saveAssignments(trimmed, roles);
          return { ok: true, data: saved };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'not-found' || error.status === 404) {
              return { ok: false, error: 'not-found' };
            }
            if (error.code === 'invalid-input') {
              return { ok: false, error: 'invalid-input' };
            }
          }
          console.error('Failed to save workstream roles:', error);
          return { ok: false, error: 'unknown' };
        }
      }
    },
    initiatives: {
      list: initiatives,
      loaded: initiativesLoaded,
      saveInitiative: async (initiative, expectedVersion) => {
        const sanitized = sanitizeInitiativeForSave(initiative, periodSettings);
        if (!sanitized.id || !sanitized.workstreamId) {
          return { ok: false, error: 'invalid-input' };
        }

        const exists = initiatives.some((item) => item.id === sanitized.id);
        const actorMetadata = session ? { accountId: session.accountId, name: session.email } : undefined;

        try {
          if (exists) {
            if (expectedVersion === null || expectedVersion === undefined) {
              return { ok: false, error: 'invalid-input' };
            }
            const updated = await initiativesApi.update(sanitized.id, sanitized, expectedVersion, actorMetadata);
            setInitiatives((prev) =>
              sortInitiativesByUpdated(
                prev.map((item) => (item.id === sanitized.id ? applyPeriodSettings(updated) : item))
              )
            );
            return { ok: true, data: applyPeriodSettings(updated) };
          }

          const created = await initiativesApi.create(sanitized, actorMetadata);
          const normalized = applyPeriodSettings(created);
          setInitiatives((prev) => sortInitiativesByUpdated([...prev, normalized]));
          return { ok: true, data: normalized };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'version-conflict') {
              return { ok: false, error: 'version-conflict' };
            }
            if (error.code === 'invalid-input') {
              return { ok: false, error: 'invalid-input' };
            }
            if (error.code === 'not-found' || error.status === 404) {
              return { ok: false, error: 'not-found' };
            }
          }
          console.error('Failed to save initiative:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      removeInitiative: async (id) => {
        const trimmed = id.trim();
        if (!trimmed) {
          return { ok: false, error: 'invalid-input' };
        }
        try {
          await initiativesApi.remove(trimmed);
          setInitiatives((prev) => prev.filter((item) => item.id !== trimmed));
          return { ok: true, data: trimmed };
        } catch (error) {
          if (error instanceof ApiError && (error.code === 'not-found' || error.status === 404)) {
            return { ok: false, error: 'not-found' };
          }
          console.error('Failed to delete initiative:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      advanceStage: async (id, targetStage) => {
        const trimmed = id.trim();
        if (!trimmed) {
          return { ok: false, error: 'invalid-input' };
        }
        try {
          const actorMetadata = session ? { accountId: session.accountId, name: session.email } : undefined;
          const updated = applyPeriodSettings(await initiativesApi.advance(trimmed, targetStage, actorMetadata));
          setInitiatives((prev) =>
            sortInitiativesByUpdated(prev.map((item) => (item.id === trimmed ? updated : item)))
          );
          return { ok: true, data: updated };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'version-conflict') {
              return { ok: false, error: 'version-conflict' };
            }
            if (error.code === 'not-found' || error.status === 404) {
              return { ok: false, error: 'not-found' };
            }
            if (error.code === 'invalid-input') {
              return { ok: false, error: 'invalid-input' };
            }
          }
          console.error('Failed to advance initiative stage:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      submitStage: async (id) => {
        const trimmed = id.trim();
        if (!trimmed) {
          return { ok: false, error: 'invalid-input' };
        }
        try {
          const actorMetadata = session ? { accountId: session.accountId, name: session.email } : undefined;
          const updated = applyPeriodSettings(await initiativesApi.submit(trimmed, actorMetadata));
          setInitiatives((prev) =>
            sortInitiativesByUpdated(prev.map((item) => (item.id === trimmed ? updated : item)))
          );
          return { ok: true, data: updated };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'stage-pending') {
              return { ok: false, error: 'stage-pending' };
            }
            if (error.code === 'stage-approved') {
              return { ok: false, error: 'stage-approved' };
            }
            if (error.code === 'missing-approvers') {
              return { ok: false, error: 'missing-approvers' };
            }
            if (error.code === 'version-conflict') {
              return { ok: false, error: 'version-conflict' };
            }
            if (error.code === 'not-found' || error.status === 404) {
              return { ok: false, error: 'not-found' };
            }
          }
          console.error('Failed to submit initiative stage:', error);
          return { ok: false, error: 'unknown' };
        }
      }
    },

    accounts: {
      list: accounts,
      inviteAccount: async (email, role, firstName, lastName, interviewerRole) => {
        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail) {
          return { ok: false, error: 'invalid-input' };
        }
        const normalizedFirst = firstName.trim();
        const normalizedLast = lastName.trim();
        if (!normalizedFirst || !normalizedLast) {
          return { ok: false, error: 'invalid-input' };
        }
        if (!interviewerRole) {
          return { ok: false, error: 'invalid-input' };
        }
        try {
          const account = await accountsApi.invite(
            trimmedEmail,
            role,
            normalizedFirst,
            normalizedLast,
            interviewerRole
          );
          setAccounts((prev) => [...prev, account]);
          return { ok: true, data: account };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'duplicate' || error.status === 409) {
              return { ok: false, error: 'duplicate' };
            }
            if (error.code === 'invalid-input' || error.status === 400) {
              return { ok: false, error: 'invalid-input' };
            }
            if (error.code === 'mailer-unavailable' || error.status === 503) {
              return { ok: false, error: 'mailer-unavailable' };
            }
          }
          console.error('Failed to send invitation:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      activateAccount: async (id) => {
        const current = accounts.find((item) => item.id === id);
        if (!current) {
          return { ok: false, error: 'not-found' };
        }
        try {
          const updated = await accountsApi.activate(id);
          setAccounts((prev) => prev.map((item) => (item.id === id ? updated : item)));
          return { ok: true, data: updated };
        } catch (error) {
          if (error instanceof ApiError && (error.code === 'not-found' || error.status === 404)) {
            return { ok: false, error: 'not-found' };
          }
          console.error('Failed to activate account:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      removeAccount: async (id) => {
        const exists = accounts.some((item) => item.id === id);
        if (!exists) {
          return { ok: false, error: 'not-found' };
        }
        try {
          await accountsApi.remove(id);
          setAccounts((prev) => prev.filter((item) => item.id !== id));
          return { ok: true, data: id };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'not-found' || error.status === 404) {
              return { ok: false, error: 'not-found' };
            }
            if (error.status === 403) {
              return { ok: false, error: 'invalid-input' };
            }
          }
          console.error('Failed to delete account:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      updateRole: async (id, role) => {
        if (role !== 'admin' && role !== 'user') {
          return { ok: false, error: 'invalid-input' };
        }

        const existing = accounts.find((item) => item.id === id);
        if (!existing) {
          return { ok: false, error: 'not-found' };
        }

        if (existing.role === role) {
          return { ok: true, data: existing };
        }

        try {
          const updated = await accountsApi.updateRole(id, role);
          setAccounts((prev) => prev.map((item) => (item.id === id ? updated : item)));
          return { ok: true, data: updated };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'not-found' || error.status === 404) {
              return { ok: false, error: 'not-found' };
            }
            if (error.status === 403) {
              return { ok: false, error: 'invalid-input' };
            }
          }
          console.error('Failed to update account role:', error);
          return { ok: false, error: 'unknown' };
        }
      }
    },
    participants: {
      list: participants,
      createParticipant: async (input) => {
        const normalizedName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
        if (!normalizedName) {
          return { ok: false, error: 'invalid-input' };
        }
        const payload: ParticipantPayload = {
          displayName: normalizedName,
          email: normalizeParticipantOptional(input.email),
          role: normalizeParticipantOptional(input.role),
          hierarchyLevel1: normalizeParticipantOptional(input.hierarchyLevel1),
          hierarchyLevel2: normalizeParticipantOptional(input.hierarchyLevel2),
          hierarchyLevel3: normalizeParticipantOptional(input.hierarchyLevel3)
        };
        try {
          const participant = await participantsApi.create(payload);
          setParticipants((prev) => {
            const next = [...prev, participant];
            next.sort((a, b) => a.displayName.localeCompare(b.displayName));
            return next;
          });
          return { ok: true, data: participant };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'invalid-input' || error.status === 400) {
              return { ok: false, error: 'invalid-input' };
            }
          }
          console.error('Failed to create participant:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      updateParticipant: async (id, changes) => {
        const participant = participants.find((item) => item.id === id);
        if (!participant) {
          return { ok: false, error: 'not-found' };
        }
        const payload: ParticipantUpdatePayload = {};
        if (changes.displayName !== undefined) {
          const normalized = typeof changes.displayName === 'string' ? changes.displayName.trim() : '';
          if (!normalized) {
            return { ok: false, error: 'invalid-input' };
          }
          payload.displayName = normalized;
        }
        if (changes.email !== undefined) {
          payload.email = normalizeParticipantOptional(changes.email);
        }
        if (changes.role !== undefined) {
          payload.role = normalizeParticipantOptional(changes.role);
        }
        if (changes.hierarchyLevel1 !== undefined) {
          payload.hierarchyLevel1 = normalizeParticipantOptional(changes.hierarchyLevel1);
        }
        if (changes.hierarchyLevel2 !== undefined) {
          payload.hierarchyLevel2 = normalizeParticipantOptional(changes.hierarchyLevel2);
        }
        if (changes.hierarchyLevel3 !== undefined) {
          payload.hierarchyLevel3 = normalizeParticipantOptional(changes.hierarchyLevel3);
        }
        try {
          const updated = await participantsApi.update(id, payload);
          setParticipants((prev) => {
            const next = prev.map((item) => (item.id === id ? updated : item));
            next.sort((a, b) => a.displayName.localeCompare(b.displayName));
            return next;
          });
          return { ok: true, data: updated };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'not-found' || error.status === 404) {
              return { ok: false, error: 'not-found' };
            }
            if (error.code === 'invalid-input' || error.status === 400) {
              return { ok: false, error: 'invalid-input' };
            }
          }
          console.error('Failed to update participant:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      removeParticipant: async (id) => {
        const participant = participants.find((item) => item.id === id);
        if (!participant) {
          return { ok: false, error: 'not-found' };
        }
        try {
          await participantsApi.remove(id);
          setParticipants((prev) => prev.filter((item) => item.id !== id));
          return { ok: true, data: id };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'not-found' || error.status === 404) {
              return { ok: false, error: 'not-found' };
            }
          }
          console.error('Failed to delete participant:', error);
          return { ok: false, error: 'unknown' };
        }
      }
    },
    financials: {
      blueprint: financialBlueprint,
      loading: financialBlueprintLoading,
      error: financialBlueprintError,
      refresh: loadFinancialBlueprint,
      saveBlueprint: saveFinancialBlueprint
    },
    planSettings: {
      milestoneTypes,
      saveMilestoneTypes,
      periodSettings,
      savePeriodSettings,
      statusReportSettings,
      saveStatusReportSettings,
      riskCategories,
      saveRiskCategories
    }
  }), [
    workstreams,
    workstreamRoleOptions,
    initiatives,
    accounts,
    participants,
    financialBlueprint,
    financialBlueprintLoading,
    financialBlueprintError,
    loadFinancialBlueprint,
    saveFinancialBlueprint,
    milestoneTypes,
    saveMilestoneTypes,
    periodSettings,
    savePeriodSettings,
    statusReportSettings,
    saveStatusReportSettings,
    riskCategories,
    saveRiskCategories
  ]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('AppStateContext is missing. Wrap the component in AppStateProvider.');
  }
  return context;
};

export const useWorkstreamsState = () => useAppState().workstreams;
export const useInitiativesState = () => useAppState().initiatives;
export const useAccountsState = () => useAppState().accounts;
export const useParticipantsState = () => useAppState().participants;
export const useFinancialsState = () => useAppState().financials;
export const usePlanSettingsState = () => useAppState().planSettings;
