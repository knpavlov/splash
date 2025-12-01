import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../../styles/FinancialDynamicsScreen.module.css';
import { useFinancialsState, useInitiativesState, useWorkstreamsState } from '../../app/state/AppStateContext';
import { FinancialLineItem } from '../../shared/types/financials';
import {
  initiativeFinancialKinds,
  initiativeStageKeys,
  initiativeStageLabels,
  Initiative,
  InitiativeFinancialEntry
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

type ViewMode = 'months' | 'quarters' | 'calendar' | 'fiscal';
type BaseMode = 'zero' | 'baseline';
type SortMode = 'impact-desc' | 'impact-asc' | 'delta' | 'name';

interface PersistedSettings {
  viewMode: ViewMode;
  baseMode: BaseMode;
  stageKeys: string[];
  workstreamIds: string[];
  sortMode: SortMode;
  query: string;
  hideZeros: boolean;
}

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
  lastActual: number;
  lastPlan: number;
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

const SETTINGS_STORAGE_KEY = 'pl-dynamics-settings';
const planColor = '#1d4ed8';
const actualColor = '#0ea5e9';
const baseColor = '#cbd5e1';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const formatCurrency = (value: number) => currencyFormatter.format(Math.round(value || 0));

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

const loadSettings = (): PersistedSettings => {
  const fallback = defaultSettings();
  if (typeof window === 'undefined') {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    const stageKeys = Array.isArray(parsed.stageKeys)
      ? parsed.stageKeys.filter((key): key is typeof initiativeStageKeys[number] =>
          initiativeStageKeys.includes(key as typeof initiativeStageKeys[number])
        )
      : fallback.stageKeys;
    const workstreamIds = Array.isArray(parsed.workstreamIds)
      ? parsed.workstreamIds.filter((id) => typeof id === 'string')
      : fallback.workstreamIds;
    return {
      ...fallback,
      ...parsed,
      viewMode: clampViewMode(parsed.viewMode),
      baseMode: clampBaseMode(parsed.baseMode),
      stageKeys: stageKeys.length ? stageKeys : fallback.stageKeys,
      workstreamIds,
      sortMode: clampSortMode(parsed.sortMode),
      query: typeof parsed.query === 'string' ? parsed.query : '',
      hideZeros: Boolean(parsed.hideZeros)
    };
  } catch (error) {
    console.warn('Failed to restore P&L dashboard settings', error);
    return fallback;
  }
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

export const FinancialDynamicsScreen = () => {
  const { blueprint, loading: blueprintLoading, error: blueprintError, refresh: refreshBlueprint } = useFinancialsState();
  const { list: initiatives } = useInitiativesState();
  const { list: workstreams } = useWorkstreamsState();
  const [settings, setSettings] = useState<PersistedSettings>(() => loadSettings());
  const [workstreamMenuOpen, setWorkstreamMenuOpen] = useState(false);
  const [breakdown, setBreakdown] = useState<BreakdownState | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn('Failed to persist P&L dashboard settings', error);
    }
  }, [settings]);

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
    });
    return Array.from(keys)
      .map((key) => parseMonthKey(key))
      .filter((value): value is NonNullable<ReturnType<typeof parseMonthKey>> => Boolean(value))
      .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year))
      .map((month, index) => ({
        ...month,
        label: new Date(month.year, month.month - 1, 1).toLocaleString('en-US', { month: 'short' }),
        index
      }));
  }, [blueprint, filteredInitiatives]);

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
        if (settings.baseMode === 'baseline' && baseValue) {
          segments.push({
            value: Math.abs(baseValue),
            color: baseColor,
            label: 'Base P&L',
            rawValue: baseValue,
            kind: 'base'
          });
        }
        if (initiativeValue) {
          segments.push({
            value: Math.abs(initiativeValue),
            color,
            label,
            rawValue: initiativeValue,
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

      const lastPlan = planStacks.length ? stackNet(planStacks[planStacks.length - 1]) : 0;
      const lastActual = actualStacks.length ? stackNet(actualStacks[actualStacks.length - 1]) : 0;
      const delta = lastActual - lastPlan;
      const maxAbs = Math.max(netAbsMax(planStacks), netAbsMax(actualStacks));

      return { line, plan: planStacks, actual: actualStacks, lastActual, lastPlan, delta, maxAbs };
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
        return Math.abs(a.lastActual) - Math.abs(b.lastActual);
      }
      return Math.abs(b.lastActual) - Math.abs(a.lastActual);
    });
  }, [series, settings.query, settings.hideZeros, settings.sortMode]);

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
        setBreakdown({
          bucketLabel: `${bucket.label} ${bucket.year}`,
          mode: payload.dataset,
          lineName: line.name,
          total: breakdownResult.total,
          rows: breakdownResult.rows
        });
      },
    [buckets, buildBucketBreakdown]
  );

  const columnMinWidth = useMemo(() => (settings.viewMode === 'months' ? 82 : 96), [settings.viewMode]);
  const gridTemplateColumns = useMemo(
    () => `repeat(${Math.max(buckets.length, 1)}, minmax(${columnMinWidth}px, 1fr))`,
    [buckets.length, columnMinWidth]
  );

  const latestBucket = buckets[buckets.length - 1];

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

  const resetFilters = useCallback(() => setSettings(defaultSettings()), []);

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
            <span className={styles.metaBadge}>{filteredInitiatives.length} initiatives in scope</span>
            {latestBucket && (
              <span className={styles.metaBadge}>
                Latest period: {latestBucket.label} {latestBucket.year}
              </span>
            )}
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={() => void refreshBlueprint()} disabled={blueprintLoading}>
            {blueprintLoading ? 'Refreshing…' : 'Reload blueprint'}
          </button>
          <button type="button" className={styles.resetButton} onClick={resetFilters}>
            Reset view
          </button>
        </div>
      </header>

      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Timeline</span>
          <div className={styles.segmented}>
            {(['months', 'quarters', 'calendar', 'fiscal'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={settings.viewMode === mode ? styles.segmentActive : ''}
                onClick={() => setSettings((prev) => ({ ...prev, viewMode: mode }))}
              >
                {mode === 'months'
                  ? 'Months'
                  : mode === 'quarters'
                  ? 'Quarters'
                  : mode === 'calendar'
                  ? 'Calendar years'
                  : 'Fiscal years'}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Base</span>
          <div className={styles.segmented}>
            <button
              type="button"
              className={settings.baseMode === 'zero' ? styles.segmentActive : ''}
              onClick={() => setSettings((prev) => ({ ...prev, baseMode: 'zero' }))}
            >
              Zero base
            </button>
            <button
              type="button"
              className={settings.baseMode === 'baseline' ? styles.segmentActive : ''}
              onClick={() => setSettings((prev) => ({ ...prev, baseMode: 'baseline' }))}
            >
              Add base P&amp;L
            </button>
          </div>
        </div>

        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Sort</span>
          <select
            value={settings.sortMode}
            onChange={(event) => setSettings((prev) => ({ ...prev, sortMode: event.target.value as SortMode }))}
          >
            <option value="impact-desc">Impact ↓</option>
            <option value="impact-asc">Impact ↑</option>
            <option value="delta">Delta vs plan</option>
            <option value="name">Name</option>
          </select>
        </div>

        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Search</span>
          <input
            type="search"
            placeholder="Line name or code"
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

      <div className={styles.controls}>
        <div className={styles.controlGroup}>
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
        <div className={styles.linesGrid}>
          {filteredSeries.length === 0 && (
            <div className={styles.placeholder}>
              <p>No lines match the current filters.</p>
            </div>
          )}

          {filteredSeries.map((entry) => (
            <article key={entry.line.id} className={styles.lineCard}>
              <div className={styles.lineInfo}>
                <p className={styles.lineCode}>{entry.line.code}</p>
                <h3>{entry.line.name}</h3>
                <p className={styles.lineMeta}>
                  {entry.line.nature === 'summary'
                    ? 'Summary'
                    : entry.line.nature === 'revenue'
                    ? 'Revenue'
                    : 'Cost'}{' '}
                  ·{' '}
                  {entry.line.computation === 'manual'
                    ? 'Manual'
                    : entry.line.computation === 'children'
                    ? 'Roll-up'
                    : 'Cumulative'}
                </p>

                <div className={styles.lineStatsGrid}>
                  <div>
                    <span className={styles.statLabel}>Actual ({latestBucket?.label} {latestBucket?.year})</span>
                    <strong>{formatCurrency(entry.lastActual)}</strong>
                  </div>
                  <div>
                    <span className={styles.statLabel}>Plan</span>
                    <strong>{formatCurrency(entry.lastPlan)}</strong>
                  </div>
                  <div>
                    <span className={styles.statLabel}>Δ vs plan</span>
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
                    months={buckets.map((bucket) => ({
                      key: bucket.key,
                      label: bucket.label,
                      year: bucket.year,
                      index: bucket.index
                    }))}
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
                  />
                )}
              </div>
            </article>
          ))}
        </div>
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
