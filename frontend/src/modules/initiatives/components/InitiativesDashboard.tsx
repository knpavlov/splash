import { Fragment, useMemo, useState } from 'react';
import {
  Initiative,
  InitiativeFinancialKind,
  InitiativeStageKey,
  initiativeFinancialKinds,
  initiativeStageKeys
} from '../../../shared/types/initiative';
import { Workstream } from '../../../shared/types/workstream';
import dashboardStyles from '../../../styles/InitiativesDashboard.module.css';
import stageStyles from '../../../styles/StageGateDashboardScreen.module.css';
import financialStyles from '../../../styles/FinancialEditor.module.css';
import { ChevronIcon } from '../../../components/icons/ChevronIcon';
import {
  buildStageGateDataset,
  bucketForInitiative,
  DEFAULT_MEASUREMENTS,
  measurementDefinitions,
  measurementKeyList,
  MeasurementKey,
  stageColumns,
  StageColumnKey,
  StageGateEntity,
  WorkstreamRow
} from '../../dashboards/StageGateDashboardScreen';
import { CombinedChart, PlanVsActualChart, ChartMonthStack, ChartSegment } from './FinancialEditor';
import { calculateRunRate, calculateYearSummaries, parseMonthKey } from './financials.helpers';
import { useFinancialsState, usePlanSettingsState } from '../../../app/state/AppStateContext';
import { DEFAULT_FISCAL_YEAR_START_MONTH } from '../../../shared/config/finance';

interface InitiativesDashboardProps {
  initiatives: Initiative[];
  workstreams: Workstream[];
  selectedWorkstreamId: string | null;
}

type MonthDescriptor = { key: string; label: string; year: number; index: number };

const CATEGORY_COLUMN_WIDTH = 200;

const KIND_LABELS: Record<InitiativeFinancialKind, string> = {
  'recurring-benefits': 'Recurring benefits',
  'recurring-costs': 'Recurring costs',
  'oneoff-benefits': 'One-off benefits',
  'oneoff-costs': 'One-off costs'
};

const KIND_COLORS: Record<InitiativeFinancialKind, string> = {
  'recurring-benefits': '#1d4ed8',
  'oneoff-benefits': '#3b82f6',
  'recurring-costs': '#ef4444',
  'oneoff-costs': '#f97316'
};

const benefitKindsAll: InitiativeFinancialKind[] = ['recurring-benefits', 'oneoff-benefits'];
const costKindsAll: InitiativeFinancialKind[] = ['recurring-costs', 'oneoff-costs'];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});
const countFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

const formatCurrency = (value: number) => currencyFormatter.format(Math.round(value || 0));
const formatPercent = (value: number | null) => (Number.isFinite(value) && value !== null ? percentFormatter.format(value) : '—');

const shadeColor = (hex: string, amount: number) => {
  const clamped = Math.max(-1, Math.min(1, amount));
  const value = parseInt(hex.replace('#', ''), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  const mixTarget = clamped >= 0 ? 255 : 0;
  const factor = Math.abs(clamped);
  const mix = (channel: number) => Math.round(channel + (mixTarget - channel) * factor);
  const toHex = (channel: number) => channel.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
};

const buildActualColorMap = () =>
  (Object.keys(KIND_COLORS) as InitiativeFinancialKind[]).reduce((acc, kind) => {
    acc[kind] = shadeColor(KIND_COLORS[kind], 0.25);
    return acc;
  }, {} as Record<InitiativeFinancialKind, string>);

const createEmptyKindTotals = () =>
  initiativeFinancialKinds.reduce((acc, kind) => {
    acc[kind] = {};
    return acc;
  }, {} as Record<InitiativeFinancialKind, Record<string, number>>);

const mergeValue = (target: Record<string, number>, monthKey: string, delta: number) => {
  target[monthKey] = (target[monthKey] ?? 0) + delta;
};

const aggregateKindTotals = (
  initiatives: Initiative[],
  stageFilter: Set<InitiativeStageKey>,
  kinds: InitiativeFinancialKind[],
  selector: (entry: { distribution: Record<string, number>; actuals?: Record<string, number> }) => Record<string, number>
) => {
  const totals = createEmptyKindTotals();
  const monthKeys = new Set<string>();
  initiatives.forEach((initiative) => {
    if (!stageFilter.has(initiative.activeStage)) {
      return;
    }
    const stage = initiative.stages?.[initiative.activeStage];
    if (!stage) {
      return;
    }
    kinds.forEach((kind) => {
      stage.financials[kind].forEach((entry) => {
        const source = selector(entry) ?? {};
        Object.entries(source).forEach(([key, rawValue]) => {
          const numeric = Number(rawValue);
          if (!Number.isFinite(numeric)) {
            return;
          }
          mergeValue(totals[kind], key, numeric);
          monthKeys.add(key);
        });
      });
    });
  });
  return { totals, monthKeys };
};

const buildMonthDescriptors = (monthKeySets: Set<string>[], periodEnd: { month: number; year: number }) => {
  const now = new Date();
  now.setDate(1);
  const defaultEnd = new Date(now);
  defaultEnd.setMonth(defaultEnd.getMonth() + 11);
  const endCandidate = new Date(periodEnd.year, (periodEnd.month || 1) - 1, 1);
  const baselineEnd: Date =
    Number.isFinite(endCandidate.getTime()) && endCandidate.getTime() >= now.getTime() ? endCandidate : defaultEnd;
  let earliestTime: number | null = null;
  let latestTime: number | null = null;
  monthKeySets.forEach((set) => {
    set.forEach((key) => {
      const parsed = parseMonthKey(key);
      if (!parsed) {
        return;
      }
      const timestamp = parsed.date.getTime();
      if (earliestTime === null || timestamp < earliestTime) {
        earliestTime = timestamp;
      }
      if (latestTime === null || timestamp > latestTime) {
        latestTime = timestamp;
      }
    });
  });
  const startTime = earliestTime ?? now.getTime();
  const baselineEndTime = baselineEnd.getTime();
  const endTime = latestTime !== null && latestTime > baselineEndTime ? latestTime : baselineEndTime;
  const safeStartTime = startTime > endTime ? endTime : startTime;
  const months: MonthDescriptor[] = [];
  const cursor = new Date(safeStartTime);
  cursor.setDate(1);
  let index = 0;
  while (cursor.getTime() <= endTime && months.length < 360) {
    months.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      label: cursor.toLocaleString('en-US', { month: 'short' }),
      year: cursor.getFullYear(),
      index
    });
    index += 1;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
};

const buildChartStacksFromTotals = (
  months: MonthDescriptor[],
  benefitKinds: InitiativeFinancialKind[],
  costKinds: InitiativeFinancialKind[],
  totalsByKind: Record<InitiativeFinancialKind, Record<string, number>>,
  palette: Record<InitiativeFinancialKind, string>
): ChartMonthStack[] =>
  months.map((month) => {
    const positiveSegments: ChartSegment[] = [];
    const negativeSegments: ChartSegment[] = [];
    benefitKinds.forEach((kind) => {
      const value = totalsByKind[kind][month.key] ?? 0;
      if (!value) {
        return;
      }
      positiveSegments.push({
        value: Math.abs(value),
        rawValue: value,
        color: palette[kind],
        label: KIND_LABELS[kind]
      });
    });
    costKinds.forEach((kind) => {
      const value = totalsByKind[kind][month.key] ?? 0;
      if (!value) {
        return;
      }
      negativeSegments.push({
        value: Math.abs(value),
        rawValue: -Math.abs(value),
        color: palette[kind],
        label: KIND_LABELS[kind]
      });
    });
    const positiveTotal = positiveSegments.reduce((sum, segment) => sum + segment.value, 0);
    const negativeTotal = negativeSegments.reduce((sum, segment) => sum + segment.value, 0);
    return {
      key: month.key,
      positiveSegments,
      negativeSegments,
      positiveTotal,
      negativeTotal
    };
  });

const buildImpactTotals = (
  months: MonthDescriptor[],
  benefitKinds: InitiativeFinancialKind[],
  costKinds: InitiativeFinancialKind[],
  totalsByKind: Record<InitiativeFinancialKind, Record<string, number>>
) =>
  months.reduce((acc, month) => {
    const benefits = benefitKinds.reduce((sum, kind) => sum + (totalsByKind[kind][month.key] ?? 0), 0);
    const costs = costKinds.reduce((sum, kind) => sum + (totalsByKind[kind][month.key] ?? 0), 0);
    acc[month.key] = benefits - costs;
    return acc;
  }, {} as Record<string, number>);

const aggregateTotals = (
  source: Record<InitiativeFinancialKind, Record<string, number>>,
  benefitKinds: InitiativeFinancialKind[],
  costKinds: InitiativeFinancialKind[]
): Initiative['totals'] => {
  const sumKind = (kind: InitiativeFinancialKind) =>
    Object.values(source[kind] ?? {}).reduce((sum, value) => sum + value, 0);
  const recurringBenefits = benefitKinds.includes('recurring-benefits') ? sumKind('recurring-benefits') : 0;
  const oneoffBenefits = benefitKinds.includes('oneoff-benefits') ? sumKind('oneoff-benefits') : 0;
  const recurringCosts = costKinds.includes('recurring-costs') ? sumKind('recurring-costs') : 0;
  const oneoffCosts = costKinds.includes('oneoff-costs') ? sumKind('oneoff-costs') : 0;
  return {
    recurringBenefits,
    recurringCosts,
    oneoffBenefits,
    oneoffCosts,
    recurringImpact: recurringBenefits - recurringCosts
  };
};

const calculateRoi = (totals: Initiative['totals']): number | null => {
  const denominator = totals.oneoffCosts;
  if (!Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  const roi =
    (totals.recurringBenefits + totals.oneoffBenefits - totals.recurringCosts - totals.oneoffCosts) / denominator;
  return Number.isFinite(roi) ? roi : null;
};

export const InitiativesDashboard = ({ initiatives, workstreams, selectedWorkstreamId }: InitiativesDashboardProps) => {
  const [collapsed, setCollapsed] = useState(true);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'outlook' | 'actuals'>('pipeline');
  const [stageFilter, setStageFilter] = useState<Set<InitiativeStageKey>>(new Set(initiativeStageKeys));
  const [includeOneOffOutlook, setIncludeOneOffOutlook] = useState(true);
  const [includeOneOffActuals, setIncludeOneOffActuals] = useState(true);
  const [showPlanAsLine, setShowPlanAsLine] = useState(false);
  const [planLineMode, setPlanLineMode] = useState<'impact' | 'split'>('impact');
  const [selectedMeasurements, setSelectedMeasurements] = useState<MeasurementKey[]>(DEFAULT_MEASUREMENTS);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { periodSettings } = usePlanSettingsState();
  const { blueprint: financialBlueprint } = useFinancialsState();
  const fiscalStartMonth = financialBlueprint?.fiscalYear?.startMonth ?? DEFAULT_FISCAL_YEAR_START_MONTH;

  const scopedInitiatives = useMemo(
    () => (selectedWorkstreamId ? initiatives.filter((item) => item.workstreamId === selectedWorkstreamId) : initiatives),
    [initiatives, selectedWorkstreamId]
  );
  const scopedWorkstreams = useMemo(
    () => (selectedWorkstreamId ? workstreams.filter((ws) => ws.id === selectedWorkstreamId) : workstreams),
    [selectedWorkstreamId, workstreams]
  );

  const stageGateDataset = useMemo(
    () => buildStageGateDataset(scopedInitiatives as StageGateEntity[], scopedWorkstreams),
    [scopedInitiatives, scopedWorkstreams]
  );

  const stageFilteredInitiatives = useMemo(
    () => scopedInitiatives.filter((item) => stageFilter.has(item.activeStage)),
    [scopedInitiatives, stageFilter]
  );

  const benefitKindsOutlook = includeOneOffOutlook ? benefitKindsAll : (['recurring-benefits'] as InitiativeFinancialKind[]);
  const costKindsOutlook = includeOneOffOutlook ? costKindsAll : (['recurring-costs'] as InitiativeFinancialKind[]);
  const benefitKindsActuals = includeOneOffActuals ? benefitKindsAll : (['recurring-benefits'] as InitiativeFinancialKind[]);
  const costKindsActuals = includeOneOffActuals ? costKindsAll : (['recurring-costs'] as InitiativeFinancialKind[]);

  const outlookPlanTotals = useMemo(
    () =>
      aggregateKindTotals(stageFilteredInitiatives, stageFilter, [...benefitKindsOutlook, ...costKindsOutlook], (entry) => entry.distribution),
    [stageFilteredInitiatives, stageFilter, benefitKindsOutlook, costKindsOutlook]
  );
  const outlookMonths = useMemo(
    () =>
      buildMonthDescriptors([outlookPlanTotals.monthKeys], {
        month: periodSettings.periodMonth,
        year: periodSettings.periodYear
      }),
    [outlookPlanTotals.monthKeys, periodSettings.periodMonth, periodSettings.periodYear]
  );
  const outlookChartData = useMemo(
    () => buildChartStacksFromTotals(outlookMonths, benefitKindsOutlook, costKindsOutlook, outlookPlanTotals.totals, KIND_COLORS),
    [outlookMonths, benefitKindsOutlook, costKindsOutlook, outlookPlanTotals.totals]
  );
  const outlookImpactTotals = useMemo(
    () => buildImpactTotals(outlookMonths, benefitKindsOutlook, costKindsOutlook, outlookPlanTotals.totals),
    [outlookMonths, benefitKindsOutlook, costKindsOutlook, outlookPlanTotals.totals]
  );
  const outlookRunRate = useMemo(
    () => calculateRunRate(outlookMonths.map((m) => m.key), outlookImpactTotals),
    [outlookMonths, outlookImpactTotals]
  );
  const outlookSummaries = useMemo(
    () => calculateYearSummaries(outlookImpactTotals, fiscalStartMonth),
    [outlookImpactTotals, fiscalStartMonth]
  );

  const outlookPlanAggregate = useMemo(
    () => aggregateTotals(outlookPlanTotals.totals, benefitKindsOutlook, costKindsOutlook),
    [outlookPlanTotals.totals, benefitKindsOutlook, costKindsOutlook]
  );
  const outlookPlanRoi = useMemo(() => calculateRoi(outlookPlanAggregate), [outlookPlanAggregate]);

  const actualPlanTotals = useMemo(
    () =>
      aggregateKindTotals(stageFilteredInitiatives, stageFilter, [...benefitKindsActuals, ...costKindsActuals], (entry) => entry.distribution),
    [stageFilteredInitiatives, stageFilter, benefitKindsActuals, costKindsActuals]
  );
  const actualTotals = useMemo(
    () =>
      aggregateKindTotals(stageFilteredInitiatives, stageFilter, [...benefitKindsActuals, ...costKindsActuals], (entry) => entry.actuals ?? {}),
    [stageFilteredInitiatives, stageFilter, benefitKindsActuals, costKindsActuals]
  );
  const actualMonths = useMemo(
    () =>
      buildMonthDescriptors(
        [actualPlanTotals.monthKeys, actualTotals.monthKeys],
        { month: periodSettings.periodMonth, year: periodSettings.periodYear }
      ),
    [actualPlanTotals.monthKeys, actualTotals.monthKeys, periodSettings.periodMonth, periodSettings.periodYear]
  );
  const actualPalette = useMemo(() => buildActualColorMap(), []);
  const actualPlanChartData = useMemo(
    () => buildChartStacksFromTotals(actualMonths, benefitKindsActuals, costKindsActuals, actualPlanTotals.totals, KIND_COLORS),
    [actualMonths, benefitKindsActuals, costKindsActuals, actualPlanTotals.totals]
  );
  const actualChartData = useMemo(
    () => buildChartStacksFromTotals(actualMonths, benefitKindsActuals, costKindsActuals, actualTotals.totals, actualPalette),
    [actualMonths, benefitKindsActuals, costKindsActuals, actualTotals.totals, actualPalette]
  );
  const actualPlanImpactTotals = useMemo(
    () => buildImpactTotals(actualMonths, benefitKindsActuals, costKindsActuals, actualPlanTotals.totals),
    [actualMonths, benefitKindsActuals, costKindsActuals, actualPlanTotals.totals]
  );
  const actualImpactTotals = useMemo(
    () => buildImpactTotals(actualMonths, benefitKindsActuals, costKindsActuals, actualTotals.totals),
    [actualMonths, benefitKindsActuals, costKindsActuals, actualTotals.totals]
  );
  const actualPlanRunRate = useMemo(
    () => calculateRunRate(actualMonths.map((m) => m.key), actualPlanImpactTotals),
    [actualMonths, actualPlanImpactTotals]
  );
  const actualRunRate = useMemo(
    () => calculateRunRate(actualMonths.map((m) => m.key), actualImpactTotals),
    [actualMonths, actualImpactTotals]
  );
  const actualSummaries = useMemo(
    () => ({
      plan: calculateYearSummaries(actualPlanImpactTotals, fiscalStartMonth),
      actual: calculateYearSummaries(actualImpactTotals, fiscalStartMonth)
    }),
    [actualPlanImpactTotals, actualImpactTotals, fiscalStartMonth]
  );

  const actualPlanAggregate = useMemo(
    () => aggregateTotals(actualPlanTotals.totals, benefitKindsActuals, costKindsActuals),
    [actualPlanTotals.totals, benefitKindsActuals, costKindsActuals]
  );
  const actualAggregate = useMemo(
    () => aggregateTotals(actualTotals.totals, benefitKindsActuals, costKindsActuals),
    [actualTotals.totals, benefitKindsActuals, costKindsActuals]
  );
  const actualPlanRoi = useMemo(() => calculateRoi(actualPlanAggregate), [actualPlanAggregate]);
  const actualRoi = useMemo(() => calculateRoi(actualAggregate), [actualAggregate]);
  const roiDelta = Number.isFinite(actualRoi ?? NaN) && Number.isFinite(actualPlanRoi ?? NaN)
    ? (actualRoi ?? 0) - (actualPlanRoi ?? 0)
    : null;

  const activeMeasurements = selectedMeasurements.length ? selectedMeasurements : DEFAULT_MEASUREMENTS;

  const toggleRow = (rowId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const handleToggleMeasurement = (measurement: MeasurementKey) => {
    setSelectedMeasurements((current) => {
      if (current.includes(measurement)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((key) => key !== measurement);
      }
      return [...current, measurement];
    });
  };

  const toggleStage = (key: InitiativeStageKey) => {
    setStageFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const renderStageFilters = () => (
    <div className={dashboardStyles.stageFilters}>
      <div className={dashboardStyles.stageFiltersRow}>
        <span className={dashboardStyles.stageFiltersLabel}>Stages</span>
        <div className={dashboardStyles.stagePresetButtons}>
          <button type="button" onClick={() => setStageFilter(new Set(initiativeStageKeys))} className={dashboardStyles.presetButton}>
            All
          </button>
          <button type="button" onClick={() => setStageFilter(new Set())} className={dashboardStyles.presetButton}>
            None
          </button>
        </div>
        <div className={dashboardStyles.stageOptions}>
          {initiativeStageKeys.map((stage) => {
            const active = stageFilter.has(stage);
            return (
              <label key={stage} className={active ? dashboardStyles.stageChipActive : dashboardStyles.stageChip}>
                <input type="checkbox" checked={active} onChange={() => toggleStage(stage)} />
                <span>{stage.toUpperCase()}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderStageCells = (row: WorkstreamRow, columnKey: string, measurement: MeasurementKey) => {
    const meta = measurementDefinitions[measurement];
    const value = row.metrics[columnKey as StageColumnKey][measurement] ?? 0;
    const normalized = meta.type === 'currency' ? Math.abs(value) : value;
    const max = row.maxValues[measurement] || 1;
    const width = max > 0 ? Math.min(100, Math.round((normalized / max) * 100)) : 0;
    const barClasses = [stageStyles.barFill, stageStyles[meta.barClassName]];
    if (width === 0) {
      barClasses.push(stageStyles.barFillEmpty);
    }
    const formatted = meta.formatter(value);
    return (
      <Fragment key={`${row.id}-${columnKey}-${measurement}`}>
        <td className={stageStyles.valueCell}>
          <div className={stageStyles.barTrack} aria-hidden="true">
            <div className={barClasses.join(' ')} style={{ width: `${width}%` }} />
            <span className={[stageStyles.barValue, value < 0 ? stageStyles.negativeValue : ''].join(' ')}>{formatted}</span>
          </div>
        </td>
        <td className={stageStyles.deltaCell}>
          <span className={[stageStyles.deltaBadge, stageStyles.deltaNeutral, stageStyles.deltaPlaceholder].join(' ')}>--</span>
        </td>
      </Fragment>
    );
  };

  const renderTotalCells = (row: WorkstreamRow, measurement: MeasurementKey) => {
    const meta = measurementDefinitions[measurement];
    const value = row.totals[measurement] ?? 0;
    const normalized = meta.type === 'currency' ? Math.abs(value) : value;
    const max = Math.max(row.maxValues[measurement] || 1, Math.abs(value));
    const width = max > 0 ? Math.min(100, Math.round((normalized / max) * 100)) : 0;
    const barClasses = [stageStyles.barFill, stageStyles[meta.barClassName], stageStyles.totalBarFill]
      .filter(Boolean)
      .join(' ');
    const formatted = meta.formatter(value);
    return (
      <Fragment key={`${row.id}-total-${measurement}`}>
        <td className={[stageStyles.valueCell, stageStyles.totalValueCell].join(' ')}>
          <div className={stageStyles.barTrack} aria-hidden="true">
            <div className={barClasses} style={{ width: `${width}%` }} />
            <span className={[stageStyles.barValue, value < 0 ? stageStyles.negativeValue : ''].join(' ')}>{formatted}</span>
          </div>
        </td>
        <td className={[stageStyles.deltaCell, stageStyles.totalDeltaCell].join(' ')}>
          <span className={[stageStyles.deltaBadge, stageStyles.totalDeltaBadge, stageStyles.deltaNeutral, stageStyles.deltaPlaceholder].join(' ')}>
            --
          </span>
        </td>
      </Fragment>
    );
  };

  const renderInitiativeRow = (initiative: StageGateEntity, measurement: MeasurementKey) => {
    const meta = measurementDefinitions[measurement];
    const bucket = bucketForInitiative(initiative);
    return (
      <tr key={initiative.id} className={stageStyles.initiativeRow}>
        <td className={stageStyles.initiativeNameCell}>
          <span className={stageStyles.initiativeName}>{initiative.name}</span>
        </td>
        {stageColumns.flatMap((column) => {
          const isMatch = column.key === bucket;
          if (!isMatch) {
            return (
              <Fragment key={`${initiative.id}-${column.key}`}>
                <td className={stageStyles.valueCell}></td>
                <td className={stageStyles.deltaCell}></td>
              </Fragment>
            );
          }
          const value = meta.valueExtractor(initiative);
          const formatted = meta.formatter(value);
          return (
            <Fragment key={`${initiative.id}-${column.key}`}>
              <td className={stageStyles.valueCell}>
                <span className={stageStyles.initiativeValue}>{formatted}</span>
              </td>
              <td className={stageStyles.deltaCell}>
                <span className={[stageStyles.deltaBadge, stageStyles.deltaNeutral, stageStyles.deltaPlaceholder].join(' ')}>--</span>
              </td>
            </Fragment>
          );
        })}
        <td className={[stageStyles.valueCell, stageStyles.totalValueCell].join(' ')}>
          <span className={stageStyles.initiativeValue}>{meta.formatter(meta.valueExtractor(initiative))}</span>
        </td>
        <td className={[stageStyles.deltaCell, stageStyles.totalDeltaCell].join(' ')}>
          <span className={[stageStyles.deltaBadge, stageStyles.totalDeltaBadge, stageStyles.deltaNeutral, stageStyles.deltaPlaceholder].join(' ')}>
            --
          </span>
        </td>
      </tr>
    );
  };

  const renderPipelineRows = () => (
    <>
      {stageGateDataset.rows.map((row) => {
        const isExpanded = expandedRows.has(row.id);
        return (
          <Fragment key={row.id}>
            {activeMeasurements.map((measurement, index) => (
              <Fragment key={`${row.id}-${measurement}`}>
                <tr className={row.tone === 'unassigned' ? stageStyles.unassignedRow : undefined}>
                  {index === 0 && (
                    <th scope="rowgroup" rowSpan={activeMeasurements.length + (isExpanded ? row.initiatives.length * activeMeasurements.length : 0)} className={stageStyles.workstreamCell}>
                      <div className={stageStyles.workstreamHeader}>
                        <button
                          className={stageStyles.expandButton}
                          onClick={() => toggleRow(row.id)}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? 'Collapse workstream' : 'Expand workstream'}
                        >
                          {isExpanded ? '−' : '+'}
                        </button>
                        <div>
                          <p className={stageStyles.workstreamName}>{row.name}</p>
                          <p className={stageStyles.workstreamMeta}>
                            {countFormatter.format(row.totals.initiatives)} active initiatives
                          </p>
                        </div>
                      </div>
                    </th>
                  )}
                  <td className={stageStyles.metricLabel}>
                    <span>{measurementDefinitions[measurement].label}</span>
                    <strong>{measurementDefinitions[measurement].formatter(row.totals[measurement])}</strong>
                  </td>
                  {stageColumns.flatMap((column) => renderStageCells(row, column.key, measurement))}
                  {renderTotalCells(row, measurement)}
                </tr>
                {isExpanded && row.initiatives.map((initiative) => renderInitiativeRow(initiative, measurement))}
              </Fragment>
            ))}
          </Fragment>
        );
      })}
      {activeMeasurements.map((measurement, index) => (
        <tr key={`total-${measurement}`} className={stageStyles.totalRow}>
          {index === 0 && (
            <th scope="rowgroup" rowSpan={activeMeasurements.length} className={stageStyles.workstreamCell}>
              <p className={stageStyles.workstreamName}>Portfolio total</p>
              <p className={stageStyles.workstreamMeta}>
                {countFormatter.format(stageGateDataset.totalRow.totals.initiatives)} active initiatives
              </p>
            </th>
          )}
          <td className={stageStyles.metricLabel}>
            <span>{measurementDefinitions[measurement].label}</span>
            <strong>{measurementDefinitions[measurement].formatter(stageGateDataset.totalRow.totals[measurement])}</strong>
          </td>
          {stageColumns.flatMap((column) => renderStageCells(stageGateDataset.totalRow, column.key, measurement))}
          {renderTotalCells(stageGateDataset.totalRow, measurement)}
        </tr>
      ))}
    </>
  );

  const renderPipeline = () => {
    const hasInitiatives = stageGateDataset.totalRow.totals.initiatives > 0;
    return (
      <div className={dashboardStyles.card}>
        <div className={dashboardStyles.metricSelector}>
          {measurementKeyList.map((measurement) => {
            const active = activeMeasurements.includes(measurement);
            return (
              <button
                key={measurement}
                type="button"
                className={[stageStyles.metricChip, active ? stageStyles.metricChipActive : ''].join(' ')}
                onClick={() => handleToggleMeasurement(measurement)}
                aria-pressed={active}
                title={measurementDefinitions[measurement].description}
              >
                {measurementDefinitions[measurement].label}
              </button>
            );
          })}
          <span className={dashboardStyles.helperText}>Tap to hide or show metrics to keep the grid compact.</span>
        </div>
        <div className={stageStyles.tableWrapper}>
          <table className={stageStyles.table}>
            <thead>
              <tr>
                <th className={stageStyles.workstreamColumn} rowSpan={2}>
                  Workstream
                </th>
                <th className={stageStyles.metricColumn} rowSpan={2}>
                  Metric
                </th>
                {stageColumns.map((column) => (
                  <th key={column.key} colSpan={2} className={stageStyles.stageHeader}>
                    {column.label}
                  </th>
                ))}
                <th colSpan={2} className={[stageStyles.stageHeader, stageStyles.totalStageHeader].join(' ')}>
                  Total
                </th>
              </tr>
              <tr>
                {stageColumns.map((column) => (
                  <Fragment key={`${column.key}-sub`}>
                    <th className={stageStyles.stageSubHeader}>Now</th>
                    <th className={stageStyles.stageSubHeaderCompact}>Δ</th>
                  </Fragment>
                ))}
                <Fragment key="total-sub">
                  <th className={stageStyles.stageSubHeader}>Now</th>
                  <th className={stageStyles.stageSubHeaderCompact}>Δ</th>
                </Fragment>
              </tr>
            </thead>
            <tbody>{renderPipelineRows()}</tbody>
          </table>
          {!hasInitiatives && (
            <p className={stageStyles.emptyState}>No initiatives yet. Create the first initiative to populate the pipeline.</p>
          )}
        </div>
      </div>
    );
  };

  const renderOutlook = () => {
    const gridTemplateColumns = `${CATEGORY_COLUMN_WIDTH}px repeat(${Math.max(outlookMonths.length, 1)}, minmax(36px, 1fr))`;
    const hasData = outlookChartData.some((month) => month.positiveTotal > 0 || month.negativeTotal > 0);
    return (
      <div className={dashboardStyles.card}>
        <header className={dashboardStyles.cardHeader}>
          <label className={financialStyles.oneOffToggle}>
            <input type="checkbox" checked={includeOneOffOutlook} onChange={(event) => setIncludeOneOffOutlook(event.target.checked)} />
            <span>Include one-off items</span>
          </label>
        </header>
        {renderStageFilters()}
        <div className={financialStyles.metricsRow}>
          <div className={financialStyles.summaryList}>
            <span className={financialStyles.summaryListTitle}>Fiscal years</span>
            <ul>
              {outlookSummaries.fiscal.map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <strong>{formatCurrency(item.value)}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div className={financialStyles.summaryList}>
            <span className={financialStyles.summaryListTitle}>Calendar years</span>
            <ul>
              {outlookSummaries.calendar.map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <strong>{formatCurrency(item.value)}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div className={financialStyles.metricCard}>
            <span>Run rate (last 12 months)</span>
            <strong>{formatCurrency(outlookRunRate)}</strong>
          </div>
          <div className={financialStyles.metricCard}>
            <span>ROI (plan)</span>
            <strong>{formatPercent(outlookPlanRoi)}</strong>
            <p className={financialStyles.metricNote}>Same calculation as initiative ROI.</p>
          </div>
        </div>
        <div className={financialStyles.sheetWrapper}>
          <div className={financialStyles.sheetScroller}>
            <CombinedChart
              months={outlookMonths}
              gridTemplateColumns={gridTemplateColumns}
              data={outlookChartData}
              showPeriodLabels
              periodLabelFormatter={(month) => `${month.label} ${String(month.year).slice(-2)}`}
            />
            {!hasData && <p className={financialStyles.placeholder}>No timeline data for the selected stages yet.</p>}
          </div>
        </div>
      </div>
    );
  };

  const renderActuals = () => {
    const gridTemplateColumns = `${CATEGORY_COLUMN_WIDTH}px repeat(${Math.max(actualMonths.length, 1)}, minmax(36px, 1fr))`;
    const hasPlanData = actualPlanChartData.some((month) => month.positiveTotal > 0 || month.negativeTotal > 0);
    const hasActualData = actualChartData.some((month) => month.positiveTotal > 0 || month.negativeTotal > 0);
    return (
      <div className={dashboardStyles.card}>
        <header className={dashboardStyles.cardHeader}>
          <div className={financialStyles.actualsToggles}>
            <label className={financialStyles.oneOffToggle}>
              <input
                type="checkbox"
                checked={includeOneOffActuals}
                onChange={(event) => setIncludeOneOffActuals(event.target.checked)}
              />
              <span>Include one-off items</span>
            </label>
            <label className={financialStyles.oneOffToggle}>
              <input type="checkbox" checked={showPlanAsLine} onChange={(event) => setShowPlanAsLine(event.target.checked)} />
              <span>Show plan as line</span>
            </label>
            {showPlanAsLine && (
              <label className={`${financialStyles.oneOffToggle} ${financialStyles.lineModeToggle}`}>
                <span>Line mode</span>
                <select value={planLineMode} onChange={(event) => setPlanLineMode(event.target.value as 'impact' | 'split')}>
                  <option value="impact">Single line (impact)</option>
                  <option value="split">Two lines (benefits vs costs)</option>
                </select>
              </label>
            )}
          </div>
        </header>
        {renderStageFilters()}
        <div className={financialStyles.metricsRow}>
          <div className={financialStyles.summaryList}>
            <span className={financialStyles.summaryListTitle}>Plan (FY)</span>
            <ul>
              {actualSummaries.plan.fiscal.map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <strong>{formatCurrency(item.value)}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div className={financialStyles.summaryList}>
            <span className={financialStyles.summaryListTitle}>Actuals (FY)</span>
            <ul>
              {actualSummaries.actual.fiscal.map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <strong>{formatCurrency(item.value)}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div className={financialStyles.metricCard}>
            <span>Run rate (last 12 months)</span>
            <strong>{formatCurrency(actualPlanRunRate)}</strong>
            <p className={financialStyles.metricNote}>
              Actual: {formatCurrency(actualRunRate)} · Delta: {formatCurrency(actualRunRate - actualPlanRunRate)}
            </p>
          </div>
          <div className={financialStyles.metricCard}>
            <span>ROI (actual vs plan)</span>
            <strong>{formatPercent(actualRoi)}</strong>
            <p className={financialStyles.metricNote}>
              Plan: {formatPercent(actualPlanRoi)} · Delta: {formatPercent(roiDelta)}
            </p>
          </div>
        </div>
        <div className={financialStyles.sheetWrapper}>
          <div className={financialStyles.sheetScroller}>
            <PlanVsActualChart
              months={actualMonths}
              gridTemplateColumns={gridTemplateColumns}
              planData={actualPlanChartData}
              actualData={actualChartData}
              showPlanAsLine={showPlanAsLine}
              planLineMode={planLineMode}
              anchorScope="initiatives.dashboard.actuals.chart"
              showPeriodLabels
              showValueLabels
              periodLabelFormatter={(month) => `${month.label} ${String(month.year).slice(-2)}`}
            />
            {!hasPlanData && !hasActualData && (
              <p className={financialStyles.placeholder}>No plan or actual rows yet for the chosen stages.</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className={dashboardStyles.wrapper}>
      <div className={dashboardStyles.toolbar}>
        <button
          type="button"
          className={dashboardStyles.collapseButton}
          onClick={() => setCollapsed((prev) => !prev)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand dashboards' : 'Collapse dashboards'}
        >
          <ChevronIcon direction={collapsed ? 'right' : 'down'} size={14} />
        </button>
        <span className={dashboardStyles.toolbarLabel}>Dashboards</span>
        {!collapsed && (
          <div className={dashboardStyles.tabs}>
            <button
              type="button"
              className={activeTab === 'pipeline' ? dashboardStyles.activeTab : dashboardStyles.tab}
              onClick={() => setActiveTab('pipeline')}
            >
              Stage-gate pipeline
            </button>
            <button
              type="button"
              className={activeTab === 'outlook' ? dashboardStyles.activeTab : dashboardStyles.tab}
              onClick={() => setActiveTab('outlook')}
            >
              Financial outlook
            </button>
            <button
              type="button"
              className={activeTab === 'actuals' ? dashboardStyles.activeTab : dashboardStyles.tab}
              onClick={() => setActiveTab('actuals')}
            >
              Outlook actuals
            </button>
          </div>
        )}
      </div>
      {!collapsed && (
        <>
          {activeTab === 'pipeline' && renderPipeline()}
          {activeTab === 'outlook' && renderOutlook()}
          {activeTab === 'actuals' && renderActuals()}
        </>
      )}
    </section>
  );
};



