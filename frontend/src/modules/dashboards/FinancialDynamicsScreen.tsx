import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../../styles/FinancialDynamicsScreen.module.css';
import { useFinancialsState, useInitiativesState, usePlanSettingsState, useWorkstreamsState } from '../../app/state/AppStateContext';
import { FinancialLineItem } from '../../shared/types/financials';
import {
  initiativeFinancialKinds,
  initiativeStageKeys,
  initiativeStageLabels,
  Initiative,
  InitiativeFinancialEntry,
  InitiativeStageKPI
} from '../../shared/types/initiative';
import { DEFAULT_FISCAL_YEAR_START_MONTH } from '../../shared/config/finance';
import {
  buildCumulativeLookup,
  buildEmptyRecord,
  buildManualValueMap,
  buildValueMap,
  lineEffect,
  parseMonthKey
} from '../../shared/utils/financialMath';
import { ChartMonthStack, ChartSegment, PlanVsActualChart } from '../initiatives/components/FinancialEditor';
import { calculateRunRate } from '../initiatives/components/financials.helpers';
import { financialDynamicsApi } from './services/financialDynamicsApi';
import { useAuth } from '../auth/AuthContext';
import { ChevronIcon } from '../../components/icons/ChevronIcon';
import { Star } from 'lucide-react';
import {
  FinancialDynamicsBaseMode,
  FinancialDynamicsSettings,
  FinancialDynamicsSortMode,
  FinancialDynamicsViewMode
} from '../../shared/types/financialDynamics';

type ViewMode = FinancialDynamicsViewMode;
type BaseMode = FinancialDynamicsBaseMode;
type SortMode = FinancialDynamicsSortMode;
type PersistedSettings = FinancialDynamicsSettings;

interface ChartBucket {
  key: string;
  label: string;
  year: number;
  index: number;
  monthKeys: string[];
}

interface LineSeries {
  line: FinancialLineItem;
  plan: ChartMonthStack[];
  actual: ChartMonthStack[];
  actualRunRate: number;
  planRunRate: number;
  delta: number;
  maxAbs: number;
}

interface KpiSeries {
  key: string;
  name: string;
  unit: string;
  baseline: number;
  plan: ChartMonthStack[];
  actual: ChartMonthStack[];
  actualRunRate: number;
  planRunRate: number;
  delta: number;
  maxAbs: number;
}

interface InitiativeBreakdownRow {
  initiativeId: string | null;
  name: string;
  value: number;
  share: number;
}

interface BreakdownState {
  bucketLabel: string;
  mode: 'plan' | 'actual';
  lineName: string;
  total: number;
  rows: InitiativeBreakdownRow[];
}

const planColor = '#1d4ed8';
const actualColor = '#0ea5e9';
const baseColor = '#cbd5e1';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const formatCurrency = (value: number) => currencyFormatter.format(Math.round(value || 0));

const buildMonthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

const extendMonthsToPeriod = (
  months: { year: number; month: number }[],
  period: { periodMonth: number; periodYear: number }
) => {
  if (!months.length) {
    return months;
  }
  const start = new Date(months[0].year, months[0].month - 1, 1);
  const targetMonth = Math.min(12, Math.max(1, Math.trunc(period.periodMonth ?? 0)));
  const targetYear = Math.max(2000, Math.trunc(period.periodYear ?? 0));
  const hasTarget = Number.isFinite(period.periodMonth) && Number.isFinite(period.periodYear);
  const last = new Date(months[months.length - 1].year, months[months.length - 1].month - 1, 1);
  const target = hasTarget ? new Date(targetYear, targetMonth - 1, 1) : null;
  const end = target && target.getTime() > last.getTime() ? target : last;
  const result: { year: number; month: number }[] = [];
  const cursor = new Date(start);
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 480) {
    result.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
    cursor.setMonth(cursor.getMonth() + 1);
    guard += 1;
  }
  return result;
};

const applyDisplayEffect = (line: FinancialLineItem, value: number) =>
  line.nature === 'cost' ? -value : value;

const buildChildMap = (lines: FinancialLineItem[]) => {
  const map = new Map<string, string[]>();
  lines.forEach((line) => map.set(line.id, []));
  const stack: FinancialLineItem[] = [];
  lines.forEach((line) => {
    while (stack.length && stack[stack.length - 1].indent >= line.indent) {
      stack.pop();
    }
    if (stack.length) {
      const parent = stack[stack.length - 1];
      map.get(parent.id)?.push(line.id);
    }
    stack.push(line);
  });
  return map;
};

const sumForPeriod = (record: Record<string, number> | undefined, keys: string[]) =>
  keys.reduce((sum, key) => sum + (record?.[key] ?? 0), 0);

const stackNet = (stack: ChartMonthStack) => stack.positiveTotal - stack.negativeTotal;

const normalizeString = (value: string | undefined | null) => value?.trim() || '';
const buildKpiKey = (kpi: InitiativeStageKPI) => {
  const name = normalizeString(kpi.name).toLowerCase();
  const unit = normalizeString(kpi.unit).toLowerCase();
  return `${name || 'kpi'}|${unit || 'unitless'}`;
};

const buildSingleValueStack = (bucketKey: string, rawValue: number, label: string, color: string): ChartMonthStack => {
  const value = Math.abs(rawValue);
  const segment: ChartSegment | null = value
    ? { value, color, label, rawValue }
    : null;
  const positiveSegments = segment && rawValue >= 0 ? [segment] : [];
  const negativeSegments = segment && rawValue < 0 ? [segment] : [];
  return {
    key: bucketKey,
    positiveSegments,
    negativeSegments,
    positiveTotal: rawValue >= 0 ? value : 0,
    negativeTotal: rawValue < 0 ? value : 0
  };
};

const netAbsMax = (stacks: ChartMonthStack[]) =>
  stacks.reduce((max, stack) => Math.max(max, Math.abs(stackNet(stack))), 0);

const clampViewMode = (value: string | undefined): ViewMode =>
  value === 'calendar' || value === 'fiscal' || value === 'quarters' ? value : 'months';

const clampBaseMode = (value: string | undefined): BaseMode =>
  value === 'zero' || value === 'baseline' ? value : 'baseline';

const clampSortMode = (value: string | undefined): SortMode =>
  value === 'impact-asc' || value === 'delta' || value === 'name' ? value : 'impact-desc';

const defaultSettings = (): PersistedSettings => ({
  viewMode: 'months',
  baseMode: 'baseline',
  stageKeys: [...initiativeStageKeys],
  workstreamIds: [],
  sortMode: 'impact-desc',
  query: '',
  hideZeros: false
});

const sanitizeSettings = (value: Partial<PersistedSettings> | null | undefined): PersistedSettings => {
  const fallback = defaultSettings();
  const stageKeys = Array.isArray(value?.stageKeys)
    ? value.stageKeys.filter((key): key is typeof initiativeStageKeys[number] =>
        initiativeStageKeys.includes(key as typeof initiativeStageKeys[number])
      )
    : fallback.stageKeys;
  const workstreamIds = Array.isArray(value?.workstreamIds)
    ? value.workstreamIds
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter((id): id is string => Boolean(id))
    : fallback.workstreamIds;
  return {
    ...fallback,
    ...value,
    viewMode: clampViewMode(value?.viewMode),
    baseMode: clampBaseMode(value?.baseMode),
    stageKeys: stageKeys.length ? stageKeys : fallback.stageKeys,
    workstreamIds,
    sortMode: clampSortMode(value?.sortMode),
    query: typeof value?.query === 'string' ? value.query : '',
    hideZeros: Boolean(value?.hideZeros)
  };
};

const sanitizeFavorites = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const items: string[] = [];
  value.forEach((entry) => {
    if (typeof entry !== 'string') {
      return;
    }
    const normalized = entry.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    items.push(normalized);
  });
  return items;
};

const buildInitiativeManualMap = (
  initiatives: Initiative[],
  lineByCode: Map<string, FinancialLineItem>,
  monthKeys: string[],
  selector: (entry: InitiativeFinancialEntry) => Record<string, number>
) => {
  const map = new Map<string, Record<string, number>>();
  if (!monthKeys.length) {
    return map;
  }
  const monthSet = new Set(monthKeys);
  for (const initiative of initiatives) {
    const stage = initiative.stages[initiative.activeStage];
    if (!stage) {
      continue;
    }
    for (const kind of initiativeFinancialKinds) {
      stage.financials[kind].forEach((entry) => {
        const code = entry.lineCode?.trim().toUpperCase();
        if (!code) {
          return;
        }
        const line = lineByCode.get(code);
        if (!line) {
          return;
        }
        if (!map.has(line.id)) {
          map.set(line.id, buildEmptyRecord(monthKeys));
        }
        const record = map.get(line.id)!;
        Object.entries(selector(entry) ?? {}).forEach(([monthKey, raw]) => {
          if (!monthSet.has(monthKey)) {
            return;
          }
          const numeric = Number(raw);
          if (!Number.isFinite(numeric)) {
            return;
          }
          record[monthKey] += numeric * lineEffect(line);
        });
      });
    }
  }
  return map;
};

type InitiativeContributionMap = Map<string, Record<string, Record<string, number>>>;

const buildInitiativeBreakdownMap = (
  initiatives: Initiative[],
  lineByCode: Map<string, FinancialLineItem>,
  monthKeys: string[],
  selector: (entry: InitiativeFinancialEntry) => Record<string, number>
): InitiativeContributionMap => {
  const map: InitiativeContributionMap = new Map();
  if (!monthKeys.length) {
    return map;
  }
  const monthSet = new Set(monthKeys);
  for (const initiative of initiatives) {
    const stage = initiative.stages[initiative.activeStage];
    if (!stage) {
      continue;
    }
    for (const kind of initiativeFinancialKinds) {
      stage.financials[kind].forEach((entry) => {
        const code = entry.lineCode?.trim().toUpperCase();
        if (!code) {
          return;
        }
        const line = lineByCode.get(code);
        if (!line) {
          return;
        }
        const distribution = selector(entry) ?? {};
        Object.entries(distribution).forEach(([monthKey, raw]) => {
          if (!monthSet.has(monthKey)) {
            return;
          }
          const numeric = Number(raw);
          if (!Number.isFinite(numeric) || !numeric) {
            return;
          }
          if (!map.has(line.id)) {
            map.set(line.id, {});
          }
          const lineMap = map.get(line.id)!;
          if (!lineMap[monthKey]) {
            lineMap[monthKey] = {};
          }
          lineMap[monthKey][initiative.id] = (lineMap[monthKey][initiative.id] ?? 0) + numeric * lineEffect(line);
        });
      });
    }
  }
  return map;
};

interface KpiAggregate {
  key: string;
  name: string;
  unit: string;
  baseline: number;
  plan: Record<string, number>;
  actual: Record<string, number>;
}

const buildKpiAggregates = (initiatives: Initiative[], monthKeys: string[]) => {
  const monthSet = new Set(monthKeys);
  const emptyRecord = () => buildEmptyRecord(monthKeys);
  const map = new Map<string, KpiAggregate>();

  initiatives.forEach((initiative) => {
    const stage = initiative.stages[initiative.activeStage];
    if (!stage) {
      return;
    }
    (stage.kpis ?? []).forEach((kpi) => {
      const key = buildKpiKey(kpi);
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: normalizeString(kpi.name) || 'KPI',
          unit: normalizeString(kpi.unit) || 'Unitless',
          baseline: 0,
          plan: emptyRecord(),
          actual: emptyRecord()
        });
      }
      const record = map.get(key)!;
      const baseline = Number(kpi.baseline);
      if (Number.isFinite(baseline)) {
        record.baseline += baseline;
      }
      Object.entries(kpi.distribution ?? {}).forEach(([monthKey, raw]) => {
        if (!monthSet.has(monthKey)) {
          return;
        }
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) {
          return;
        }
        record.plan[monthKey] += numeric;
      });
      Object.entries(kpi.actuals ?? {}).forEach(([monthKey, raw]) => {
        if (!monthSet.has(monthKey)) {
          return;
        }
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) {
          return;
        }
        record.actual[monthKey] += numeric;
      });
    });
  });

  return Array.from(map.values());
};

export const FinancialDynamicsScreen = () => {
  const { session } = useAuth();
  const { blueprint, loading: blueprintLoading, error: blueprintError, refresh: refreshBlueprint } = useFinancialsState();
  const { list: initiatives } = useInitiativesState();
  const { list: workstreams } = useWorkstreamsState();
  const { periodSettings } = usePlanSettingsState();
  const accountId = session?.accountId ?? null;
  const [settings, setSettings] = useState<PersistedSettings>(() => defaultSettings());
  const [workstreamMenuOpen, setWorkstreamMenuOpen] = useState(false);
  const [breakdown, setBreakdown] = useState<BreakdownState | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreferencesLoaded(false);
    setSettings(defaultSettings());
    setFavorites([]);
    if (!accountId) {
      setPreferencesLoaded(true);
      return;
    }
    (async () => {
      try {
        const response = await financialDynamicsApi.getPreferences(accountId);
        if (cancelled) {
          return;
        }
        setSettings(sanitizeSettings(response.settings));
        setFavorites(sanitizeFavorites(response.favorites));
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to restore P&L dashboard settings', error);
        }
      } finally {
        if (!cancelled) {
          setPreferencesLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  useEffect(() => {
    if (!accountId || !preferencesLoaded) {
      return;
    }
    const handle = window.setTimeout(() => {
      void financialDynamicsApi
        .savePreferences(accountId, { settings, favorites })
        .catch((error) => console.warn('Failed to persist P&L dashboard preferences', error));
    }, 400);
    return () => window.clearTimeout(handle);
  }, [accountId, favorites, preferencesLoaded, settings]);

  useEffect(() => {
    if (!blueprint && !blueprintLoading) {
      void refreshBlueprint();
    }
  }, [blueprint, blueprintLoading, refreshBlueprint]);

  const fiscalStartMonth = blueprint?.fiscalYear?.startMonth ?? DEFAULT_FISCAL_YEAR_START_MONTH;
  const lineByCode = useMemo(() => {
    const map = new Map<string, FinancialLineItem>();
    blueprint?.lines.forEach((line) => map.set(line.code.trim().toUpperCase(), line));
    return map;
  }, [blueprint]);

  const stageFilter = useMemo(() => new Set(settings.stageKeys), [settings.stageKeys]);
  const workstreamFilter = useMemo(() => new Set(settings.workstreamIds), [settings.workstreamIds]);

  const filteredInitiatives = useMemo(
    () =>
      initiatives.filter(
        (item) =>
          (stageFilter.size === 0 ? false : stageFilter.has(item.activeStage)) &&
          (workstreamFilter.size === 0 || workstreamFilter.has(item.workstreamId))
      ),
    [initiatives, stageFilter, workstreamFilter]
  );

  const monthDescriptors = useMemo(() => {
    const keys = new Set<string>();
    blueprint?.lines.forEach((line) => {
      Object.keys(line.months ?? {}).forEach((key) => keys.add(key));
    });
    filteredInitiatives.forEach((initiative) => {
      const stage = initiative.stages[initiative.activeStage];
      if (!stage) {
        return;
      }
      initiativeFinancialKinds.forEach((kind) => {
        stage.financials[kind].forEach((entry) => {
          Object.keys(entry.distribution ?? {}).forEach((key) => keys.add(key));
          Object.keys(entry.actuals ?? {}).forEach((key) => keys.add(key));
        });
      });
      (stage.kpis ?? []).forEach((kpi) => {
        Object.keys(kpi.distribution ?? {}).forEach((key) => keys.add(key));
        Object.keys(kpi.actuals ?? {}).forEach((key) => keys.add(key));
      });
    });
    const parsed = Array.from(keys)
      .map((key) => parseMonthKey(key))
      .filter((value): value is NonNullable<ReturnType<typeof parseMonthKey>> => Boolean(value))
      .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year))
      .map((month) => ({ year: month.year, month: month.month }));
    if (!parsed.length) {
      return [];
    }
    const expanded = extendMonthsToPeriod(parsed, periodSettings);
    return expanded.map((month, index) => ({
      key: buildMonthKey(month.year, month.month),
      label: new Date(month.year, month.month - 1, 1).toLocaleString('en-US', { month: 'short' }),
      year: month.year,
      month: month.month,
      index
    }));
  }, [blueprint, filteredInitiatives, periodSettings]);

  const monthKeys = useMemo(() => monthDescriptors.map((month) => month.key), [monthDescriptors]);

  const buckets = useMemo<ChartBucket[]>(() => {
    if (!monthDescriptors.length) {
      return [];
    }
    if (settings.viewMode === 'months') {
      return monthDescriptors.map((month) => ({
        key: month.key,
        label: month.label,
        year: month.year,
        index: month.index,
        monthKeys: [month.key]
      }));
    }
    if (settings.viewMode === 'quarters') {
      const groups = new Map<
        string,
        {
          year: number;
          index: number;
          monthKeys: string[];
          label: string;
        }
      >();
      monthDescriptors.forEach((month) => {
        const quarter = Math.floor((month.month - 1) / 3) + 1;
        const key = `${month.year}-Q${quarter}`;
        if (!groups.has(key)) {
          groups.set(key, { year: month.year, index: groups.size, monthKeys: [], label: `Q${quarter}` });
        }
        groups.get(key)!.monthKeys.push(month.key);
      });
      return Array.from(groups.entries()).map(([key, value]) => ({
        key,
        label: value.label,
        year: value.year,
        index: value.index,
        monthKeys: value.monthKeys
      }));
    }
    const groups = new Map<number, string[]>();
    monthDescriptors.forEach((month) => {
      const fiscalYear = month.month >= fiscalStartMonth ? month.year + 1 : month.year;
      const yearKey = settings.viewMode === 'calendar' ? month.year : fiscalYear;
      if (!groups.has(yearKey)) {
        groups.set(yearKey, []);
      }
      groups.get(yearKey)!.push(month.key);
    });
    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, keys], index) => ({
        key: `${settings.viewMode}-${year}`,
        label: settings.viewMode === 'calendar' ? 'CY' : 'FY',
        year,
        index,
        monthKeys: keys
      }));
  }, [monthDescriptors, settings.viewMode, fiscalStartMonth]);

  const childMap = useMemo(
    () => (blueprint ? buildChildMap(blueprint.lines) : new Map<string, string[]>()),
    [blueprint]
  );

  const baseManualMap = useMemo(
    () => (blueprint && monthKeys.length ? buildManualValueMap(blueprint.lines, monthKeys) : new Map()),
    [blueprint, monthKeys]
  );
  const baseCumulative = useMemo(
    () => (blueprint && monthKeys.length ? buildCumulativeLookup(blueprint.lines, monthKeys, baseManualMap) : new Map()),
    [blueprint, monthKeys, baseManualMap]
  );
  const baseValueMap = useMemo(
    () =>
      blueprint && monthKeys.length
        ? buildValueMap(blueprint.lines, monthKeys, childMap, baseManualMap, baseCumulative)
        : new Map(),
    [blueprint, monthKeys, childMap, baseManualMap, baseCumulative]
  );

  const planManualMap = useMemo(
    () =>
      blueprint && monthKeys.length
        ? buildInitiativeManualMap(filteredInitiatives, lineByCode, monthKeys, (entry) => entry.distribution)
        : new Map(),
    [blueprint, monthKeys, filteredInitiatives, lineByCode]
  );
  const planCumulative = useMemo(
    () => (blueprint && monthKeys.length ? buildCumulativeLookup(blueprint.lines, monthKeys, planManualMap) : new Map()),
    [blueprint, monthKeys, planManualMap]
  );
  const planValueMap = useMemo(
    () =>
      blueprint && monthKeys.length
        ? buildValueMap(blueprint.lines, monthKeys, childMap, planManualMap, planCumulative)
        : new Map(),
    [blueprint, monthKeys, childMap, planManualMap, planCumulative]
  );

  const actualManualMap = useMemo(
    () =>
      blueprint && monthKeys.length
        ? buildInitiativeManualMap(filteredInitiatives, lineByCode, monthKeys, (entry) => entry.actuals ?? {})
        : new Map(),
    [blueprint, monthKeys, filteredInitiatives, lineByCode]
  );
  const actualCumulative = useMemo(
    () =>
      blueprint && monthKeys.length ? buildCumulativeLookup(blueprint.lines, monthKeys, actualManualMap) : new Map(),
    [blueprint, monthKeys, actualManualMap]
  );
  const actualValueMap = useMemo(
    () =>
      blueprint && monthKeys.length
        ? buildValueMap(blueprint.lines, monthKeys, childMap, actualManualMap, actualCumulative)
        : new Map(),
    [blueprint, monthKeys, childMap, actualManualMap, actualCumulative]
  );

  const planInitiativeBreakdown = useMemo(
    () =>
      blueprint && monthKeys.length
        ? buildInitiativeBreakdownMap(filteredInitiatives, lineByCode, monthKeys, (entry) => entry.distribution)
        : new Map(),
    [blueprint, monthKeys, filteredInitiatives, lineByCode]
  );
  const actualInitiativeBreakdown = useMemo(
    () =>
      blueprint && monthKeys.length
        ? buildInitiativeBreakdownMap(filteredInitiatives, lineByCode, monthKeys, (entry) => entry.actuals ?? {})
        : new Map(),
    [blueprint, monthKeys, filteredInitiatives, lineByCode]
  );

  const initiativeNameLookup = useMemo(() => {
    const map = new Map<string, string>();
    initiatives.forEach((initiative) => map.set(initiative.id, initiative.name || 'Untitled initiative'));
    return map;
  }, [initiatives]);

  const kpiAggregates = useMemo(
    () => (monthKeys.length ? buildKpiAggregates(filteredInitiatives, monthKeys) : []),
    [filteredInitiatives, monthKeys]
  );

  const series = useMemo<LineSeries[]>(() => {
    if (!blueprint || !buckets.length) {
      return [];
    }
    const empty = monthKeys.length ? buildEmptyRecord(monthKeys) : {};
    return blueprint.lines.map((line) => {
      const baseRecord = baseValueMap.get(line.id) ?? empty;
      const planRecord = planValueMap.get(line.id) ?? empty;
      const actualRecord = actualValueMap.get(line.id) ?? empty;

      const buildStack = (bucket: ChartBucket, initiativeValue: number, label: string, color: string): ChartMonthStack => {
        const baseValue = settings.baseMode === 'baseline' ? sumForPeriod(baseRecord, bucket.monthKeys) : 0;
        const segments: ChartSegment[] = [];
        const baseDisplay = applyDisplayEffect(line, baseValue);
        const initiativeDisplay = applyDisplayEffect(line, initiativeValue);
        if (settings.baseMode === 'baseline' && baseDisplay) {
          segments.push({
            value: Math.abs(baseDisplay),
            color: baseColor,
            label: 'Base P&L',
            rawValue: baseDisplay,
            kind: 'base'
          });
        }
        if (initiativeDisplay) {
          segments.push({
            value: Math.abs(initiativeDisplay),
            color,
            label,
            rawValue: initiativeDisplay,
            kind: 'initiatives'
          });
        }
        const positiveSegments = segments.filter((segment) => segment.rawValue >= 0);
        const negativeSegments = segments.filter((segment) => segment.rawValue < 0);
        return {
          key: bucket.key,
          positiveSegments,
          negativeSegments,
          positiveTotal: positiveSegments.reduce((sum, segment) => sum + segment.value, 0),
          negativeTotal: negativeSegments.reduce((sum, segment) => sum + segment.value, 0)
        };
      };

      const planStacks = buckets.map((bucket) =>
        buildStack(bucket, sumForPeriod(planRecord, bucket.monthKeys), 'Plan initiatives', planColor)
      );

      const actualStacks = buckets.map((bucket) =>
        buildStack(bucket, sumForPeriod(actualRecord, bucket.monthKeys), 'Actual initiatives', actualColor)
      );

      const withBaseTotals = (record: Record<string, number>) =>
        monthKeys.reduce((acc, key) => {
          const baseValue = settings.baseMode === 'baseline' ? baseRecord[key] ?? 0 : 0;
          acc[key] = (record[key] ?? 0) + baseValue;
          return acc;
        }, {} as Record<string, number>);

      const planWithBase = withBaseTotals(planRecord);
      const actualWithBase = withBaseTotals(actualRecord);

      const planRunRate = calculateRunRate(monthKeys, planWithBase);
      const actualRunRate = calculateRunRate(monthKeys, actualWithBase);
      const delta = actualRunRate - planRunRate;
      const planRunRateDisplay = applyDisplayEffect(line, planRunRate);
      const actualRunRateDisplay = applyDisplayEffect(line, actualRunRate);
      const maxAbs = Math.max(netAbsMax(planStacks), netAbsMax(actualStacks));

      return {
        line,
        plan: planStacks,
        actual: actualStacks,
        actualRunRate: actualRunRateDisplay,
        planRunRate: planRunRateDisplay,
        delta,
        maxAbs
      };
    });
  }, [blueprint, buckets, monthKeys, baseValueMap, planValueMap, actualValueMap, settings.baseMode]);

  const filteredSeries = useMemo(() => {
    const query = settings.query.trim().toLowerCase();
    const matchesQuery = (line: FinancialLineItem) =>
      !query || line.name.toLowerCase().includes(query) || line.code.toLowerCase().includes(query);

    const visible = series.filter((entry) => {
      if (!matchesQuery(entry.line)) {
        return false;
      }
      if (settings.hideZeros && entry.maxAbs === 0) {
        return false;
      }
      return true;
    });

    return visible.sort((a, b) => {
      if (settings.sortMode === 'name') {
        return a.line.name.localeCompare(b.line.name);
      }
      if (settings.sortMode === 'delta') {
        return Math.abs(b.delta) - Math.abs(a.delta);
      }
      if (settings.sortMode === 'impact-asc') {
        return Math.abs(a.actualRunRate) - Math.abs(b.actualRunRate);
      }
      return Math.abs(b.actualRunRate) - Math.abs(a.actualRunRate);
    });
  }, [series, settings.query, settings.hideZeros, settings.sortMode]);

  const kpiSeries = useMemo<KpiSeries[]>(() => {
    if (!buckets.length || !kpiAggregates.length) {
      return [];
    }
    return kpiAggregates.map((kpi) => {
      const baselineValue = settings.baseMode === 'baseline' ? kpi.baseline : 0;
      const buildStack = (bucket: ChartBucket, value: number, label: string, color: string): ChartMonthStack => {
        const segments: ChartSegment[] = [];
        if (settings.baseMode === 'baseline' && baselineValue) {
          segments.push({
            value: Math.abs(baselineValue),
            color: baseColor,
            label: 'Baseline',
            rawValue: baselineValue,
            kind: 'base'
          });
        }
        if (value) {
          segments.push({
            value: Math.abs(value),
            color,
            label,
            rawValue: value,
            kind: 'other'
          });
        }
        const positiveSegments = segments.filter((segment) => segment.rawValue >= 0);
        const negativeSegments = segments.filter((segment) => segment.rawValue < 0);
        return {
          key: bucket.key,
          positiveSegments,
          negativeSegments,
          positiveTotal: positiveSegments.reduce((sum, segment) => sum + segment.value, 0),
          negativeTotal: negativeSegments.reduce((sum, segment) => sum + segment.value, 0)
        };
      };

      const planStacks = buckets.map((bucket) =>
        buildStack(bucket, sumForPeriod(kpi.plan, bucket.monthKeys), 'Plan KPI', planColor)
      );
      const actualStacks = buckets.map((bucket) =>
        buildStack(bucket, sumForPeriod(kpi.actual, bucket.monthKeys), 'Actual KPI', actualColor)
      );
      const withBaselineTotals = (record: Record<string, number>) =>
        monthKeys.reduce((acc, key) => {
          acc[key] = (record[key] ?? 0) + baselineValue;
          return acc;
        }, {} as Record<string, number>);
      const planRunRate = calculateRunRate(monthKeys, withBaselineTotals(kpi.plan));
      const actualRunRate = calculateRunRate(monthKeys, withBaselineTotals(kpi.actual));
      const delta = actualRunRate - planRunRate;
      const maxAbs = Math.max(netAbsMax(planStacks), netAbsMax(actualStacks));
      return {
        key: kpi.key,
        name: kpi.name,
        unit: kpi.unit,
        baseline: kpi.baseline,
        plan: planStacks,
        actual: actualStacks,
        actualRunRate,
        planRunRate,
        delta,
        maxAbs
      };
    });
  }, [buckets, kpiAggregates, settings.baseMode, monthKeys]);

  const filteredKpiSeries = useMemo(() => {
    const query = settings.query.trim().toLowerCase();
    const matchesQuery = (entry: KpiSeries) =>
      !query || entry.name.toLowerCase().includes(query) || entry.unit.toLowerCase().includes(query);

    const visible = kpiSeries.filter((entry) => {
      if (!matchesQuery(entry)) {
        return false;
      }
      if (settings.hideZeros && entry.maxAbs === 0) {
        return false;
      }
      return true;
    });

    return visible.sort((a, b) => {
      if (settings.sortMode === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (settings.sortMode === 'delta') {
        return Math.abs(b.delta) - Math.abs(a.delta);
      }
      if (settings.sortMode === 'impact-asc') {
        return Math.abs(a.actualRunRate) - Math.abs(b.actualRunRate);
      }
      return Math.abs(b.actualRunRate) - Math.abs(a.actualRunRate);
    });
  }, [kpiSeries, settings.query, settings.hideZeros, settings.sortMode]);

  const buildBucketBreakdown = useCallback(
    (lineId: string, bucket: ChartBucket, mode: 'plan' | 'actual') => {
      const source = mode === 'plan' ? planInitiativeBreakdown : actualInitiativeBreakdown;
      const lineMap = source.get(lineId);
      if (!lineMap) {
        return { total: 0, rows: [] as InitiativeBreakdownRow[] };
      }
      const totals: Record<string, number> = {};
      bucket.monthKeys.forEach((key) => {
        const monthTotals = lineMap[key];
        if (!monthTotals) {
          return;
        }
        Object.entries(monthTotals).forEach(([initiativeId, raw]) => {
          const numeric = Number(raw);
          if (!Number.isFinite(numeric)) {
            return;
          }
          totals[initiativeId] = (totals[initiativeId] ?? 0) + numeric;
        });
      });
      const entries = Object.entries(totals)
        .filter(([, value]) => value !== 0)
        .map(([initiativeId, value]) => ({
          initiativeId,
          name: initiativeNameLookup.get(initiativeId) ?? 'Initiative',
          value
        }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
      const totalAbs = entries.reduce((sum, entry) => sum + Math.abs(entry.value), 0);
      if (totalAbs === 0) {
        return { total: 0, rows: [] as InitiativeBreakdownRow[] };
      }
      const total = entries.reduce((sum, entry) => sum + entry.value, 0);
      const rows: InitiativeBreakdownRow[] = entries.slice(0, 10).map((entry) => ({
        ...entry,
        share: Math.round(((Math.abs(entry.value) / totalAbs) * 1000)) / 10
      }));
      const others = entries.slice(10);
      if (others.length) {
        const usedShare = rows.reduce((sum, entry) => sum + entry.share, 0);
        const othersShare = Math.max(0, Math.round((100 - usedShare) * 10) / 10);
        const othersValue = others.reduce((sum, entry) => sum + entry.value, 0);
        rows.push({ initiativeId: null, name: 'Others', value: othersValue, share: othersShare });
      }
      return { total, rows };
    },
    [planInitiativeBreakdown, actualInitiativeBreakdown, initiativeNameLookup]
  );

  const handleSegmentClick = useCallback(
    (line: FinancialLineItem) =>
      (payload: { month: { key: string; label: string; year: number }; dataset: 'plan' | 'actual'; segment: ChartSegment }) => {
        if (payload.segment.kind !== 'initiatives') {
          return;
        }
        const bucket = buckets.find((entry) => entry.key === payload.month.key);
        if (!bucket) {
          return;
        }
        const breakdownResult = buildBucketBreakdown(line.id, bucket, payload.dataset);
        if (!breakdownResult.rows.length) {
          return;
        }
        const normalizeValue = (value: number) => (line.nature === 'cost' ? Math.abs(value) : value);
        setBreakdown({
          bucketLabel: `${bucket.label} ${bucket.year}`,
          mode: payload.dataset,
          lineName: line.name,
          total: normalizeValue(breakdownResult.total),
          rows: breakdownResult.rows.map((row) => ({ ...row, value: normalizeValue(row.value) }))
        });
      },
    [buckets, buildBucketBreakdown]
  );

  const toFavoriteKey = (kind: 'pl' | 'kpi', id: string) => `${kind}:${id}`;
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const toggleFavorite = (key: string) => {
    setFavorites((prev) => (prev.includes(key) ? prev.filter((entry) => entry !== key) : [key, ...prev]));
  };

  const columnMinWidth = useMemo(() => (settings.viewMode === 'months' ? 60 : 80), [settings.viewMode]);
  const gridTemplateColumns = useMemo(
    () => `repeat(${Math.max(buckets.length, 1)}, minmax(${columnMinWidth}px, 1fr))`,
    [buckets.length, columnMinWidth]
  );

  const latestBucket = buckets[buckets.length - 1];
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [plCollapsed, setPlCollapsed] = useState(false);
  const [kpiCollapsed, setKpiCollapsed] = useState(false);

  const toggleStage = (key: typeof initiativeStageKeys[number]) => {
    setSettings((prev) => {
      const next = prev.stageKeys.includes(key)
        ? prev.stageKeys.filter((entry) => entry !== key)
        : [...prev.stageKeys, key];
      return { ...prev, stageKeys: next };
    });
  };

  const toggleWorkstream = (id: string) => {
    setSettings((prev) => {
      const next = prev.workstreamIds.includes(id)
        ? prev.workstreamIds.filter((entry) => entry !== id)
        : [...prev.workstreamIds, id];
      return { ...prev, workstreamIds: next };
    });
  };

  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <div>
          <h1>P&amp;L dynamics</h1>
          <p>
            Compare initiative plans (line overlay) against realised actuals (bars) for every line of your P&amp;L
            blueprint.
          </p>
          <div className={styles.metaRow}>
            <span className={styles.metaBadge}>{filteredSeries.length} lines visible</span>
            <span className={styles.metaBadge}>{filteredKpiSeries.length} KPIs visible</span>
            <span className={styles.metaBadge}>{filteredInitiatives.length} initiatives in scope</span>
            {latestBucket && (
              <span className={styles.metaBadge}>
                Latest period: {latestBucket.label} {latestBucket.year}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className={`${styles.controls} ${styles.filtersRow}`}>
        <div className={styles.segmentedControl}>
          <span className={styles.segmentedLabel}>Timeline</span>
          <div className={styles.segmentedGroup}>
            {(['months', 'quarters', 'calendar', 'fiscal'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`${styles.segmentedButton} ${
                  settings.viewMode === mode ? styles.segmentedButtonActive : ''
                }`}
                onClick={() => setSettings((prev) => ({ ...prev, viewMode: mode }))}
              >
                {mode === 'months' ? 'Months' : mode === 'quarters' ? 'Quarters' : mode === 'calendar' ? 'CY' : 'FY'}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.segmentedControl}>
          <span className={styles.segmentedLabel}>Base</span>
          <div className={styles.segmentedGroup}>
            <button
              type="button"
              className={`${styles.segmentedButton} ${
                settings.baseMode === 'zero' ? styles.segmentedButtonActive : ''
              }`}
              onClick={() => setSettings((prev) => ({ ...prev, baseMode: 'zero' }))}
            >
              Zero base
            </button>
            <button
              type="button"
              className={`${styles.segmentedButton} ${
                settings.baseMode === 'baseline' ? styles.segmentedButtonActive : ''
              }`}
              onClick={() => setSettings((prev) => ({ ...prev, baseMode: 'baseline' }))}
            >
              Add base P&amp;L
            </button>
          </div>
        </div>

        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Workstreams</span>
          <div className={styles.dropdown} onMouseLeave={() => setWorkstreamMenuOpen(false)}>
            <button
              type="button"
              className={styles.dropdownTrigger}
              onClick={() => setWorkstreamMenuOpen((prev) => !prev)}
            >
              {settings.workstreamIds.length ? `${settings.workstreamIds.length} selected` : 'All workstreams'}
            </button>
            {workstreamMenuOpen && (
              <div className={styles.dropdownPanel}>
                <label className={styles.dropdownItem}>
                  <input
                    type="checkbox"
                    checked={settings.workstreamIds.length === 0}
                    onChange={(event) =>
                      event.target.checked
                        ? setSettings((prev) => ({ ...prev, workstreamIds: [] }))
                        : setSettings((prev) => ({ ...prev, workstreamIds: [...workstreams.map((ws) => ws.id)] }))
                    }
                  />
                  <span>All</span>
                </label>
                {workstreams.map((ws) => (
                  <label key={ws.id} className={styles.dropdownItem}>
                    <input
                      type="checkbox"
                      checked={settings.workstreamIds.includes(ws.id)}
                      onChange={() => toggleWorkstream(ws.id)}
                    />
                    <span>{ws.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Sort</span>
          <select
            value={settings.sortMode}
            onChange={(event) => setSettings((prev) => ({ ...prev, sortMode: event.target.value as SortMode }))}
          >
            <option value="impact-desc">Impact (desc)</option>
            <option value="impact-asc">Impact (asc)</option>
            <option value="delta">Delta vs plan</option>
            <option value="name">Name</option>
          </select>
        </div>

        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Search</span>
          <input
            type="search"
            placeholder="Line name"
            value={settings.query}
            onChange={(event) => setSettings((prev) => ({ ...prev, query: event.target.value }))}
          />
        </div>

        <label className={`${styles.controlGroup} ${styles.checkboxControl}`}>
          <input
            type="checkbox"
            checked={settings.hideZeros}
            onChange={(event) => setSettings((prev) => ({ ...prev, hideZeros: event.target.checked }))}
          />
          <span>Hide flat lines</span>
        </label>
      </div>

      <div className={`${styles.controls} ${styles.stageControls}`}>
        <div className={`${styles.controlGroup} ${styles.wideControl}`}>
          <span className={styles.controlLabel}>Stage gates</span>
          <div className={styles.pillRow}>
            {initiativeStageKeys.map((key) => (
              <button
                key={key}
                type="button"
                className={`${styles.pill} ${settings.stageKeys.includes(key) ? styles.pillActive : ''}`}
                onClick={() => toggleStage(key)}
              >
                {initiativeStageLabels[key]}
              </button>
            ))}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => setSettings((prev) => ({ ...prev, stageKeys: [...initiativeStageKeys] }))}
            >
              Select all
            </button>
          </div>
        </div>
      </div>

      {blueprintError && (
        <div className={styles.errorBanner}>Unable to refresh Financials automatically. Data may be stale.</div>
      )}

      {!blueprint && (
        <div className={styles.placeholder}>
          <p>The Financials blueprint is missing. Configure it to unlock this dashboard.</p>
        </div>
      )}

      {blueprint && !buckets.length && (
        <div className={styles.placeholder}>
          <p>No timeline data found across Financials and initiatives. Add plan or actual months to see charts.</p>
        </div>
      )}

      {blueprint && buckets.length > 0 && (
        <>
          {(() => {
            const months = buckets.map((bucket) => ({
              key: bucket.key,
              label: bucket.label,
              year: bucket.year,
              index: bucket.index
            }));
            const chartMinWidth = Math.max(months.length * (columnMinWidth + 20), 520);
            const lineSeriesByKey = new Map(filteredSeries.map((entry) => [toFavoriteKey('pl', entry.line.id), entry]));
            const kpiSeriesByKey = new Map(filteredKpiSeries.map((entry) => [toFavoriteKey('kpi', entry.key), entry]));
            const pinnedCards = favorites.flatMap<
              { kind: 'pl'; entry: LineSeries; key: string } | { kind: 'kpi'; entry: KpiSeries; key: string }
            >((key) => {
              const lineEntry = lineSeriesByKey.get(key);
              if (lineEntry) {
                return [{ kind: 'pl' as const, entry: lineEntry, key }];
              }
              const kpiEntry = kpiSeriesByKey.get(key);
              if (kpiEntry) {
                return [{ kind: 'kpi' as const, entry: kpiEntry, key }];
              }
              return [];
            });
            const remainingLineCards = filteredSeries.filter((entry) => !favoriteSet.has(toFavoriteKey('pl', entry.line.id)));
            const remainingKpiCards = filteredKpiSeries.filter((entry) => !favoriteSet.has(toFavoriteKey('kpi', entry.key)));

            const renderPinButton = (key: string, isPinned: boolean) => (
              <button
                type="button"
                className={`${styles.pinButton} ${isPinned ? styles.pinActive : ''}`}
                onClick={() => toggleFavorite(key)}
                aria-pressed={isPinned}
                aria-label={isPinned ? 'Unpin from favourites' : 'Pin to favourites'}
              >
                <Star size={16} strokeWidth={2.25} fill={isPinned ? 'currentColor' : 'none'} />
              </button>
            );

            const renderLineCard = (entry: LineSeries, favoriteKey: string) => (
              <article key={entry.line.id} className={styles.lineCard}>
                <div className={styles.lineInfo}>
                  <div className={styles.lineHeaderRow}>
                    <div>
                      <h3>{entry.line.name}</h3>
                      <p className={styles.lineMeta}>
                        {entry.line.nature === 'summary'
                          ? 'Summary'
                          : entry.line.nature === 'revenue'
                          ? 'Revenue'
                          : 'Cost'}{' '}
                        |{' '}
                        {entry.line.computation === 'manual'
                          ? 'Manual'
                          : entry.line.computation === 'children'
                          ? 'Roll-up'
                          : 'Cumulative'}
                      </p>
                    </div>
                    {renderPinButton(favoriteKey, favoriteSet.has(favoriteKey))}
                  </div>

                  <div className={styles.lineStatsGrid}>
                    <div>
                      <span className={styles.statLabel}>Actual (12m run rate)</span>
                      <strong>{formatCurrency(entry.actualRunRate)}</strong>
                    </div>
                    <div>
                      <span className={styles.statLabel}>Plan (12m run rate)</span>
                      <strong>{formatCurrency(entry.planRunRate)}</strong>
                    </div>
                    <div>
                      <span className={styles.statLabel}>Delta vs plan</span>
                      <strong className={entry.delta > 0 ? styles.deltaPositive : entry.delta < 0 ? styles.deltaNegative : ''}>
                        {formatCurrency(entry.delta)}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className={styles.chartShell}>
                  {entry.maxAbs === 0 ? (
                    <div className={styles.chartPlaceholder}>No plan or actuals yet for this line.</div>
                  ) : (
                    <PlanVsActualChart
                      months={months}
                      gridTemplateColumns={gridTemplateColumns}
                      planData={entry.plan}
                      actualData={entry.actual}
                      showPlanAsLine
                      planLineMode="impact"
                      lineSource="actual"
                      lineTagLabel="Actual impact"
                      hidePlanBars={false}
                      hideActualBars
                      legendLabel={null}
                      monthStartColumn={1}
                      showValueLabels
                      showPeriodLabels
                      periodLabelFormatter={(month) => `${month.label} ${month.year}`}
                      height={settings.viewMode === 'months' ? 200 : 170}
                      className={styles.chartCompact}
                      formatValue={formatCurrency}
                      onSegmentClick={handleSegmentClick(entry.line)}
                      style={{ minWidth: chartMinWidth }}
                    />
                  )}
                </div>
              </article>
            );

            const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
            const formatKpiValue = (value: number) => numberFormatter.format(Math.round((value ?? 0) * 100) / 100);

            const renderKpiCard = (entry: KpiSeries, favoriteKey: string) => (
              <article key={entry.key} className={styles.lineCard}>
                <div className={styles.lineInfo}>
                  <div className={styles.lineHeaderRow}>
                    <div>
                      <p className={styles.lineCode}>KPI</p>
                      <h3>{entry.name}</h3>
                      <p className={styles.lineMeta}>Unit: {entry.unit || 'Unitless'}</p>
                    </div>
                    {renderPinButton(favoriteKey, favoriteSet.has(favoriteKey))}
                  </div>

                  <div className={styles.lineStatsGrid}>
                    <div>
                      <span className={styles.statLabel}>Actual (12m run rate)</span>
                      <strong>{formatKpiValue(entry.actualRunRate)}</strong>
                    </div>
                    <div>
                      <span className={styles.statLabel}>Plan (12m run rate)</span>
                      <strong>{formatKpiValue(entry.planRunRate)}</strong>
                    </div>
                    <div>
                      <span className={styles.statLabel}>Delta vs plan</span>
                      <strong className={entry.delta > 0 ? styles.deltaPositive : entry.delta < 0 ? styles.deltaNegative : ''}>
                        {formatKpiValue(entry.delta)}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className={styles.chartShell}>
                  {entry.maxAbs === 0 ? (
                    <div className={styles.chartPlaceholder}>No plan or actuals yet for this KPI.</div>
                  ) : (
                    <PlanVsActualChart
                      months={months}
                      gridTemplateColumns={gridTemplateColumns}
                      planData={entry.plan}
                      actualData={entry.actual}
                      showPlanAsLine
                      planLineMode="impact"
                      lineSource="actual"
                      lineTagLabel="Actual KPI"
                      hidePlanBars={false}
                      hideActualBars
                      legendLabel={null}
                      monthStartColumn={1}
                      showValueLabels
                      showPeriodLabels
                      periodLabelFormatter={(month) => `${month.label} ${month.year}`}
                      height={settings.viewMode === 'months' ? 200 : 170}
                      className={styles.chartCompact}
                      formatValue={(value) => `${formatKpiValue(value)} ${entry.unit ? entry.unit : ''}`.trim()}
                      style={{ minWidth: chartMinWidth }}
                    />
                  )}
                </div>
              </article>
            );

            return (
              <div className={styles.linesGridWrapper}>
                {pinnedCards.length > 0 && (
                  <div className={styles.groupBlock}>
                    <div className={styles.groupHeader}>
                      <div className={styles.groupTitle}>
                        <button
                          type="button"
                          className={styles.collapseButton}
                          aria-label={pinnedCollapsed ? 'Expand pinned favourites' : 'Collapse pinned favourites'}
                          onClick={() => setPinnedCollapsed((prev) => !prev)}
                        >
                          <ChevronIcon direction={pinnedCollapsed ? 'right' : 'down'} size={16} />
                        </button>
                        <h3>Pinned favourites</h3>
                        <span className={styles.groupMeta}>{pinnedCards.length}</span>
                      </div>
                    </div>
                    {!pinnedCollapsed && (
                      <div className={styles.linesGrid}>
                        {pinnedCards.map((card) =>
                          card.kind === 'pl'
                            ? renderLineCard(card.entry, card.key)
                            : renderKpiCard(card.entry, card.key)
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className={styles.groupBlock}>
                  <div className={styles.groupHeader}>
                    <div className={styles.groupTitle}>
                      <button
                        type="button"
                        className={styles.collapseButton}
                        aria-label={plCollapsed ? 'Expand P&L lines' : 'Collapse P&L lines'}
                        onClick={() => setPlCollapsed((prev) => !prev)}
                      >
                        <ChevronIcon direction={plCollapsed ? 'right' : 'down'} size={16} />
                      </button>
                      <h3>P&L lines</h3>
                      <span className={styles.groupMeta}>{remainingLineCards.length}</span>
                    </div>
                  </div>
                  {!plCollapsed && (remainingLineCards.length === 0 ? (
                    <div className={styles.placeholder}>
                      <p>No P&L lines match the current filters.</p>
                    </div>
                  ) : (
                    <div className={styles.linesGrid}>
                      {remainingLineCards.map((entry) => renderLineCard(entry, toFavoriteKey('pl', entry.line.id)))}
                    </div>
                  ))}
                </div>

                <div className={styles.groupBlock}>
                  <div className={styles.groupHeader}>
                    <div className={styles.groupTitle}>
                      <button
                        type="button"
                        className={styles.collapseButton}
                        aria-label={kpiCollapsed ? 'Expand KPIs' : 'Collapse KPIs'}
                        onClick={() => setKpiCollapsed((prev) => !prev)}
                      >
                        <ChevronIcon direction={kpiCollapsed ? 'right' : 'down'} size={16} />
                      </button>
                      <h3>KPIs</h3>
                      <span className={styles.groupMeta}>{remainingKpiCards.length}</span>
                    </div>
                  </div>
                  {!kpiCollapsed && (remainingKpiCards.length === 0 ? (
                    <div className={styles.placeholder}>
                      <p>No KPIs match the current filters.</p>
                    </div>
                  ) : (
                    <div className={styles.linesGrid}>
                      {remainingKpiCards.map((entry) => renderKpiCard(entry, toFavoriteKey('kpi', entry.key)))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </>
      )}
      {breakdown && (
        <div className={styles.breakdownOverlay} onClick={() => setBreakdown(null)}>
          <div className={styles.breakdownCard} onClick={(event) => event.stopPropagation()}>
            <header className={styles.breakdownHeader}>
              <div>
                <p className={styles.breakdownOverline}>
                  {breakdown.bucketLabel} ·{' '}
                  {breakdown.mode === 'plan' ? 'Plan initiatives' : 'Actual initiatives'}
                </p>
                <h4>{breakdown.lineName}</h4>
                <p className={styles.breakdownTotal}>
                  Total contribution: <strong>{formatCurrency(breakdown.total)}</strong>
                </p>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setBreakdown(null)}>
                Close
              </button>
            </header>

            {breakdown.rows.length === 0 ? (
              <p className={styles.placeholder}>No initiatives recorded for this period.</p>
            ) : (
              <table className={styles.breakdownTable}>
                <thead>
                  <tr>
                    <th>Initiative</th>
                    <th>Value</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.rows.map((row) => (
                    <tr key={row.initiativeId ?? 'others'}>
                      <td>
                        {row.initiativeId ? (
                          <a href={`#/initiatives/view/${row.initiativeId}`} className={styles.initiativeLink}>
                            {row.name}
                          </a>
                        ) : (
                          row.name
                        )}
                      </td>
                      <td>{formatCurrency(row.value)}</td>
                      <td>{row.share.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  );
};













