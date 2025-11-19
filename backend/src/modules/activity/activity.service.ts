import { ActivityRepository } from './activity.repository.js';
import {
  ActivityCommentFeedResponse,
  ActivityCommentEntry,
  ActivityMetricDefinition,
  ActivityMetricResult,
  ActivityModuleDefinition,
  ActivityPreferences,
  ActivityPreferencesUpdate,
  ActivitySummaryParams,
  ActivitySummaryResponse,
  ActivityTimeframeKey,
  ActivityTimeframeOption
} from './activity.types.js';
import { InitiativesRepository } from '../initiatives/initiatives.repository.js';
import { WorkstreamsRepository } from '../workstreams/workstreams.repository.js';
import { buildInitiativeTotals } from '../initiatives/initiativeTotals.js';
import { InitiativeRecord, InitiativeTotals } from '../initiatives/initiatives.types.js';
import { WorkstreamRecord } from '../workstreams/workstreams.types.js';

const DAY = 24 * 60 * 60 * 1000;
const timeframeLabels: Record<ActivityTimeframeKey, { label: string; description: string }> = {
  'since-last-login': { label: 'Since you last logged in', description: 'Captures activity from your previous session.' },
  'since-last-visit': { label: 'Since you last checked this page', description: 'Focuses on updates since your previous visit.' },
  'since-yesterday': { label: 'Since yesterday', description: 'Rolling 24-hour view of program momentum.' },
  'since-7-days': { label: 'Last 7 days', description: 'Week-on-week transformation progress.' },
  'since-last-month': { label: 'Last 30 days', description: 'Month-to-date shifts in the portfolio.' }
};

const moduleCatalog: ActivityModuleDefinition[] = [
  {
    key: 'insights',
    label: 'Impact dashboard',
    description: 'Key metrics summarising portfolio health and financial impact.'
  },
  {
    key: 'updates',
    label: 'Initiative updates',
    description: 'Chronological log of structural changes across initiatives.'
  },
  {
    key: 'comments',
    label: 'Comment feed',
    description: 'Latest conversations and answers within tracked initiatives.'
  }
];

const metricCatalog: ActivityMetricDefinition[] = [
  {
    key: 'impact-total',
    label: 'Total recurring impact',
    description: 'Aggregate recurring financial impact for the filtered scope.',
    category: 'impact',
    format: 'currency',
    granularity: 'program'
  },
  {
    key: 'impact-change',
    label: 'Impact change',
    description: 'Net change in recurring impact within the selected timeframe.',
    category: 'impact',
    format: 'currency',
    granularity: 'program'
  },
  {
    key: 'impact-l3-share',
    label: 'Impact at L3',
    description: 'Share of recurring impact delivered by initiatives sitting at L3.',
    category: 'impact',
    format: 'percentage',
    granularity: 'stage'
  },
  {
    key: 'impact-l4-share',
    label: 'Impact at L4',
    description: 'Share of recurring impact locked in at L4.',
    category: 'impact',
    format: 'percentage',
    granularity: 'stage'
  },
  {
    key: 'initiatives-total',
    label: 'Total initiatives',
    description: 'Number of initiatives within scope.',
    category: 'pipeline',
    format: 'count',
    granularity: 'program'
  },
  {
    key: 'initiatives-started',
    label: 'New initiatives',
    description: 'Fresh initiatives created during the timeframe.',
    category: 'pipeline',
    format: 'count',
    granularity: 'program'
  },
  {
    key: 'initiatives-l3-share',
    label: 'Initiatives at L3',
    description: 'Share of initiatives that progressed to L3.',
    category: 'pipeline',
    format: 'percentage',
    granularity: 'stage'
  },
  {
    key: 'initiatives-l4-share',
    label: 'Initiatives at L4',
    description: 'Share of initiatives that reached L4.',
    category: 'pipeline',
    format: 'percentage',
    granularity: 'stage'
  },
  {
    key: 'pending-approvals',
    label: 'Pending approvals',
    description: 'Stage gates waiting for decisions.',
    category: 'execution',
    format: 'count',
    granularity: 'stage'
  },
  {
    key: 'overdue-l4',
    label: 'Overdue L4 commitments',
    description: 'Initiatives with L4 dates in the past but not yet approved.',
    category: 'execution',
    format: 'count',
    granularity: 'stage'
  },
  {
    key: 'plan-changes',
    label: 'Plan revisions',
    description: 'Execution-plan overhauls captured in the timeframe.',
    category: 'execution',
    format: 'count',
    granularity: 'program'
  },
  {
    key: 'top-workstreams-impact',
    label: 'Top workstreams by impact',
    description: 'Workstreams contributing the largest share of impact.',
    category: 'impact',
    format: 'currency',
    granularity: 'workstream'
  }
];

const defaultMetricKeys = [
  'impact-total',
  'impact-change',
  'initiatives-total',
  'initiatives-started',
  'impact-l3-share',
  'initiatives-l3-share'
] as const;

const defaultModuleKeys = moduleCatalog.map((item) => item.key);

type InitiativeWithTotals = InitiativeRecord & { totals: InitiativeTotals };

type MetricCalculator = (context: MetricComputationContext) => ActivityMetricResult;

interface MetricComputationContext {
  initiatives: InitiativeWithTotals[];
  totalImpact: number;
  totalInitiatives: number;
  l3Impact: number;
  l4Impact: number;
  l3Count: number;
  l4Count: number;
  impactDelta: number;
  newInitiatives: number;
  pendingApprovals: number;
  overdueL4: number;
  planChanges: number;
  timeframeStart: Date;
  eventsByWorkstream: Map<string, number>;
  workstreamImpact: Map<string, number>;
  workstreams: Map<string, WorkstreamRecord>;
}

const trendFromDelta = (delta: number | null | undefined): 'up' | 'down' | 'flat' | undefined => {
  if (delta === undefined || delta === null) {
    return undefined;
  }
  if (delta > 0) {
    return 'up';
  }
  if (delta < 0) {
    return 'down';
  }
  return 'flat';
};

const metricCalculators: Record<string, MetricCalculator> = {
  'impact-total': (context) => ({
    key: 'impact-total',
    unit: 'currency',
    value: context.totalImpact,
    delta: context.impactDelta,
    trend: trendFromDelta(context.impactDelta)
  }),
  'impact-change': (context) => ({
    key: 'impact-change',
    unit: 'currency',
    value: context.impactDelta,
    delta: null,
    trend: trendFromDelta(context.impactDelta)
  }),
  'impact-l3-share': (context) => ({
    key: 'impact-l3-share',
    unit: 'percentage',
    value: context.totalImpact > 0 ? (context.l3Impact / context.totalImpact) * 100 : 0
  }),
  'impact-l4-share': (context) => ({
    key: 'impact-l4-share',
    unit: 'percentage',
    value: context.totalImpact > 0 ? (context.l4Impact / context.totalImpact) * 100 : 0
  }),
  'initiatives-total': (context) => ({
    key: 'initiatives-total',
    unit: 'count',
    value: context.totalInitiatives,
    delta: context.newInitiatives,
    trend: trendFromDelta(context.newInitiatives)
  }),
  'initiatives-started': (context) => ({
    key: 'initiatives-started',
    unit: 'count',
    value: context.newInitiatives,
    trend: trendFromDelta(context.newInitiatives)
  }),
  'initiatives-l3-share': (context) => ({
    key: 'initiatives-l3-share',
    unit: 'percentage',
    value: context.totalInitiatives > 0 ? (context.l3Count / context.totalInitiatives) * 100 : 0
  }),
  'initiatives-l4-share': (context) => ({
    key: 'initiatives-l4-share',
    unit: 'percentage',
    value: context.totalInitiatives > 0 ? (context.l4Count / context.totalInitiatives) * 100 : 0
  }),
  'pending-approvals': (context) => ({
    key: 'pending-approvals',
    unit: 'count',
    value: context.pendingApprovals
  }),
  'overdue-l4': (context) => ({
    key: 'overdue-l4',
    unit: 'count',
    value: context.overdueL4
  }),
  'plan-changes': (context) => ({
    key: 'plan-changes',
    unit: 'count',
    value: context.planChanges
  }),
  'top-workstreams-impact': (context) => {
    const entries = Array.from(context.workstreamImpact.entries())
      .map(([workstreamId, impact]) => ({
        key: workstreamId,
        label: context.workstreams.get(workstreamId)?.name ?? 'Unknown stream',
        value: impact,
        delta: context.eventsByWorkstream.get(workstreamId) ?? 0
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    return {
      key: 'top-workstreams-impact',
      unit: 'currency',
      value: entries.reduce((sum, entry) => sum + entry.value, 0),
      breakdown: entries
    };
  }
};

export class ActivityService {
  constructor(
    private readonly repository: ActivityRepository,
    private readonly initiativesRepository: InitiativesRepository,
    private readonly workstreamsRepository: WorkstreamsRepository
  ) {}

  private metricCatalog = metricCatalog;
  private moduleCatalog = moduleCatalog;

  private normalizeIds(list: string[] | undefined | null): string[] {
    if (!Array.isArray(list)) {
      return [];
    }
    const unique = Array.from(new Set(list.map((value) => value.trim()).filter(Boolean)));
    return unique;
  }

  private normalizeModuleKeys(keys: string[] | undefined | null): string[] {
    const allowed = new Set(this.moduleCatalog.map((item) => item.key));
    const normalized = this.normalizeIds(keys).filter((key) => allowed.has(key));
    return normalized.length ? normalized : [...defaultModuleKeys];
  }

  private normalizeMetricKeys(keys: string[] | undefined | null): string[] {
    const allowed = new Set(this.metricCatalog.map((item) => item.key));
    const normalized = this.normalizeIds(keys).filter((key) => allowed.has(key));
    return normalized.length ? normalized : [...defaultMetricKeys];
  }

  private normalizeTimeframe(key: ActivityTimeframeKey | undefined | null): ActivityTimeframeKey {
    if (key && timeframeLabels[key]) {
      return key;
    }
    return 'since-last-login';
  }

  async getPreferences(accountId: string): Promise<ActivityPreferences> {
    const stored = await this.repository.getPreferences(accountId);
    if (stored) {
      return {
        ...stored,
        moduleKeys: this.normalizeModuleKeys(stored.moduleKeys),
        metricKeys: this.normalizeMetricKeys(stored.metricKeys),
        defaultTimeframe: this.normalizeTimeframe(stored.defaultTimeframe)
      };
    }
    return this.repository.upsertPreferences(accountId, {
      workstreamIds: [],
      initiativeIds: [],
      moduleKeys: [...defaultModuleKeys],
      metricKeys: [...defaultMetricKeys],
      defaultTimeframe: 'since-last-login'
    });
  }

  async updatePreferences(accountId: string, payload: ActivityPreferencesUpdate) {
    const current = await this.getPreferences(accountId);
    const next = await this.repository.upsertPreferences(accountId, {
      workstreamIds: this.normalizeIds(payload.workstreamIds ?? current.workstreamIds),
      initiativeIds: this.normalizeIds(payload.initiativeIds ?? current.initiativeIds),
      moduleKeys: this.normalizeModuleKeys(payload.moduleKeys ?? current.moduleKeys),
      metricKeys: this.normalizeMetricKeys(payload.metricKeys ?? current.metricKeys),
      defaultTimeframe: this.normalizeTimeframe(payload.defaultTimeframe ?? current.defaultTimeframe)
    });
    return next;
  }

  async markVisited(accountId: string) {
    const visitedAt = await this.repository.updateLastChecked(accountId, new Date());
    return visitedAt.toISOString();
  }

  private async resolveTimeMarkers(accountId: string, preferences: ActivityPreferences) {
    const [lastLoginAt] = await Promise.all([this.repository.getLastLoginAt(accountId)]);
    const lastVisitAt = preferences.lastVisitedAt ? new Date(preferences.lastVisitedAt) : null;
    return { lastLoginAt, lastVisitAt };
  }

  private resolveTimeframe(
    key: ActivityTimeframeKey,
    markers: { lastLoginAt: Date | null; lastVisitAt: Date | null }
  ) {
    const now = new Date();
    let start: Date | null = null;
    let fallback = false;
    let fallbackReason: string | null = null;

    switch (key) {
      case 'since-last-login':
        if (markers.lastLoginAt) {
          start = markers.lastLoginAt;
        } else {
          fallback = true;
          fallbackReason = 'missing-last-login';
          start = new Date(now.getTime() - 7 * DAY);
        }
        break;
      case 'since-last-visit':
        if (markers.lastVisitAt) {
          start = markers.lastVisitAt;
        } else {
          fallback = true;
          fallbackReason = 'missing-last-visit';
          start = new Date(now.getTime() - 7 * DAY);
        }
        break;
      case 'since-yesterday':
        start = new Date(now.getTime() - DAY);
        break;
      case 'since-7-days':
        start = new Date(now.getTime() - 7 * DAY);
        break;
      case 'since-last-month':
        start = new Date(now.getTime() - 30 * DAY);
        break;
      default:
        start = new Date(now.getTime() - 7 * DAY);
        break;
    }

    if (!start || Number.isNaN(start.getTime())) {
      start = new Date(now.getTime() - 7 * DAY);
      fallback = true;
      fallbackReason = fallbackReason ?? 'invalid-start';
    }

    if (start > now) {
      start = now;
    }

    return {
      key,
      label: timeframeLabels[key].label,
      start,
      fallback,
      fallbackReason
    };
  }

  async getTimeframeOptions(accountId: string): Promise<ActivityTimeframeOption[]> {
    const preferences = await this.getPreferences(accountId);
    const markers = await this.resolveTimeMarkers(accountId, preferences);
    return (Object.keys(timeframeLabels) as ActivityTimeframeKey[]).map((key) => {
      let source: Date | null = null;
      if (key === 'since-last-login') {
        source = markers.lastLoginAt;
      } else if (key === 'since-last-visit') {
        source = markers.lastVisitAt;
      } else if (key === 'since-yesterday') {
        source = new Date(Date.now() - DAY);
      } else if (key === 'since-7-days') {
        source = new Date(Date.now() - 7 * DAY);
      } else if (key === 'since-last-month') {
        source = new Date(Date.now() - 30 * DAY);
      }
      return {
        key,
        label: timeframeLabels[key].label,
        description: timeframeLabels[key].description,
        available: source !== null,
        start: source ? source.toISOString() : null
      };
    });
  }

  private async resolveContext(accountId: string, params: ActivitySummaryParams) {
    const preferences = await this.getPreferences(accountId);
    const markers = await this.resolveTimeMarkers(accountId, preferences);
    const timeframeKey = this.normalizeTimeframe(params.timeframe ?? preferences.defaultTimeframe);
    const timeframe = this.resolveTimeframe(timeframeKey, markers);
    const workstreamIds = this.normalizeIds(params.workstreamIds ?? preferences.workstreamIds);
    const metricKeys = this.normalizeMetricKeys(params.metricKeys ?? preferences.metricKeys);
    return { preferences, timeframe, workstreamIds, metricKeys };
  }

  private mapTimeframePayload(timeframe: {
    key: ActivityTimeframeKey;
    label: string;
    start: Date;
    fallback: boolean;
    fallbackReason: string | null;
  }) {
    return {
      key: timeframe.key,
      label: timeframe.label,
      start: timeframe.start.toISOString(),
      fallback: timeframe.fallback,
      fallbackReason: timeframe.fallbackReason
    };
  }

  async getSummary(accountId: string, params: ActivitySummaryParams): Promise<ActivitySummaryResponse> {
    const { timeframe, workstreamIds, metricKeys } = await this.resolveContext(accountId, params);
    const initiatives = await this.initiativesRepository.listInitiatives();
    const scopedInitiatives = (initiatives ?? []).filter((item) =>
      workstreamIds.length ? workstreamIds.includes(item.workstreamId) : true
    );
    const initiativeWithTotals: InitiativeWithTotals[] = scopedInitiatives.map((record) => ({
      ...record,
      totals: buildInitiativeTotals(record)
    }));

    const workstreams = await this.workstreamsRepository.listWorkstreams();
    const workstreamMap = new Map(workstreams.map((ws) => [ws.id, ws]));

    const events = await this.repository.listEvents({
      start: timeframe.start,
      workstreamIds,
      limit: 2000
    });

    const impactDelta = events.reduce((sum, event) => {
      if (event.field !== 'recurringImpact') {
        return sum;
      }
      const previous = typeof event.previous_value === 'number' ? event.previous_value : Number(event.previous_value ?? 0);
      const next = typeof event.next_value === 'number' ? event.next_value : Number(event.next_value ?? 0);
      if (!Number.isFinite(previous) || !Number.isFinite(next)) {
        return sum;
      }
      return sum + (next - previous);
    }, 0);

    const newInitiatives = events.filter((event) => event.event_type === 'create' && event.field === 'created').length;
    const planChanges = events.filter((event) => event.field === 'execution-plan').length;

    const eventsByWorkstream = events.reduce((map, event) => {
      if (event.field !== 'recurringImpact') {
        return map;
      }
      const delta =
        (typeof event.next_value === 'number' ? event.next_value : Number(event.next_value ?? 0)) -
        (typeof event.previous_value === 'number' ? event.previous_value : Number(event.previous_value ?? 0));
      if (!Number.isFinite(delta)) {
        return map;
      }
      const current = map.get(event.workstream_id) ?? 0;
      map.set(event.workstream_id, current + delta);
      return map;
    }, new Map<string, number>());

    const totals = initiativeWithTotals.reduce(
      (acc, initiative) => {
        const impact = initiative.totals.recurringImpact;
        acc.totalImpact += impact;
        acc.totalInitiatives += 1;
        if (initiative.activeStage === 'l3') {
          acc.l3Impact += impact;
          acc.l3Count += 1;
        }
        if (initiative.activeStage === 'l4') {
          acc.l4Impact += impact;
          acc.l4Count += 1;
        }
        const workstreamImpact = acc.workstreamImpact.get(initiative.workstreamId) ?? 0;
        acc.workstreamImpact.set(initiative.workstreamId, workstreamImpact + impact);
        acc.pendingApprovals += Object.values(initiative.stageState).filter((state) => state.status === 'pending').length;

        const l4Date = initiative.stages.l4?.l4Date;
        if (l4Date) {
          const due = new Date(l4Date);
          if (!Number.isNaN(due.getTime()) && due < new Date() && initiative.stageState.l4?.status !== 'approved') {
            acc.overdueL4 += 1;
          }
        }
        return acc;
      },
      {
        totalImpact: 0,
        totalInitiatives: 0,
        l3Impact: 0,
        l4Impact: 0,
        l3Count: 0,
        l4Count: 0,
        pendingApprovals: 0,
        overdueL4: 0,
        workstreamImpact: new Map<string, number>()
      }
    );

    const context: MetricComputationContext = {
      initiatives: initiativeWithTotals,
      totalImpact: totals.totalImpact,
      totalInitiatives: totals.totalInitiatives,
      l3Impact: totals.l3Impact,
      l4Impact: totals.l4Impact,
      l3Count: totals.l3Count,
      l4Count: totals.l4Count,
      impactDelta,
      newInitiatives,
      pendingApprovals: totals.pendingApprovals,
      overdueL4: totals.overdueL4,
      planChanges,
      timeframeStart: timeframe.start,
      eventsByWorkstream,
      workstreamImpact: totals.workstreamImpact,
      workstreams: workstreamMap
    };

    const metrics: ActivityMetricResult[] = metricKeys.map((key) => {
      const calculator = metricCalculators[key];
      if (!calculator) {
        return { key, unit: 'count', value: null, missing: true };
      }
      return calculator(context);
    });

    return {
      timeframe: this.mapTimeframePayload(timeframe),
      filters: { workstreamIds },
      metrics
    };
  }

  async listCommentFeed(
    accountId: string,
    params: ActivitySummaryParams & { initiativeIds?: string[]; limit?: number }
  ): Promise<ActivityCommentFeedResponse> {
    const { timeframe, workstreamIds, preferences } = await this.resolveContext(accountId, params);
    const initiativeIds = this.normalizeIds(params.initiativeIds ?? preferences.initiativeIds);
    const rows = await this.repository.listCommentEntries({
      start: timeframe.start,
      workstreamIds,
      initiativeIds,
      limit: params.limit ?? 60
    });

    const entries: ActivityCommentEntry[] = rows.map((row) => ({
      id: row.message_id,
      threadId: row.thread_id,
      initiativeId: row.initiative_id,
      initiativeName: row.initiative_name,
      workstreamId: row.workstream_id,
      workstreamName: row.workstream_name,
      authorName: row.author_name,
      body: row.body,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date().toISOString(),
      parentId: row.parent_id,
      stageKey: row.stage_key,
      targetLabel: row.target_label,
      targetPath: row.target_path,
      resolvedAt: row.resolved_at instanceof Date ? row.resolved_at.toISOString() : null
    }));

    return {
      timeframe: this.mapTimeframePayload(timeframe),
      filters: {
        workstreamIds,
        initiativeIds
      },
      entries
    };
  }

  async getPreferenceBundle(accountId: string) {
    const [preferences, timeframes] = await Promise.all([this.getPreferences(accountId), this.getTimeframeOptions(accountId)]);
    return {
      preferences,
      timeframes,
      metricCatalog: this.metricCatalog,
      moduleCatalog: this.moduleCatalog
    };
  }
}
