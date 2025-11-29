import { Fragment, useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import styles from '../../styles/StageGateDashboardScreen.module.css';
import { useInitiativesState, useWorkstreamsState } from '../../app/state/AppStateContext';
import {
  Initiative,
  InitiativeStageKey,
  initiativeStageKeys,
  InitiativeStageStateMap,
  InitiativeTotals
} from '../../shared/types/initiative';
import { Workstream } from '../../shared/types/workstream';
import { ProgramSnapshotDetail, ProgramSnapshotSummary } from '../../shared/types/snapshot';
import { snapshotsApi } from '../snapshots/services/snapshotsApi';

type GateStageKey = Exclude<InitiativeStageKey, 'l0'>;
type StageColumnKey = 'l0' | GateStageKey | `${GateStageKey}-gate`;

const gateStageKeys = initiativeStageKeys.filter((key): key is GateStageKey => key !== 'l0');

const stageColumns: { key: StageColumnKey; label: string }[] = [
  { key: 'l0', label: 'L0' },
  ...gateStageKeys.flatMap((key) => [
    { key: `${key}-gate` as `${GateStageKey}-gate`, label: `${key.toUpperCase()} Gate` },
    { key, label: key.toUpperCase() }
  ])
];

const stageColumnLabelMap = new Map<StageColumnKey, string>(stageColumns.map((column) => [column.key, column.label]));

const measurementKeys = [
  'initiatives',
  'recurringImpact',
  'recurringBenefits',
  'recurringCosts',
  'oneoffBenefits',
  'oneoffCosts'
] as const;
type MeasurementKey = (typeof measurementKeys)[number];
const measurementKeyList: MeasurementKey[] = [...measurementKeys];

type StageGateEntity = Pick<Initiative, 'id' | 'workstreamId' | 'name' | 'activeStage' | 'stageState' | 'totals'>;

interface MeasurementDefinition {
  key: MeasurementKey;
  label: string;
  description: string;
  type: 'count' | 'currency';
  desiredTrend: 'up' | 'down' | 'neutral';
  formatter: (value: number) => string;
  tooltipFormatter?: (value: number) => string;
  deltaFormatter: (value: number) => string;
  barClassName: keyof typeof styles;
  valueExtractor: (entity: StageGateEntity) => number;
}

type StageMetric = Record<MeasurementKey, number>;
type StageMetricMap = Record<StageColumnKey, StageMetric>;

interface WorkstreamRow {
  id: string;
  name: string;
  metrics: StageMetricMap;
  totals: StageMetric;
  maxValues: Record<MeasurementKey, number>;
  tone?: 'unassigned';
  initiatives: StageGateEntity[];
}

interface StageGateDataset {
  rows: WorkstreamRow[];
  totalRow: WorkstreamRow;
  lookup: Map<string, WorkstreamRow>;
}

type ComparisonMode = 'none' | '7d' | '30d' | 'custom';
type DashboardLayout = 'workstream-first' | 'metric-first';

const SNAPSHOT_FETCH_LIMIT = 90;
const DEFAULT_MEASUREMENTS: MeasurementKey[] = ['initiatives', 'recurringImpact'];
const SETTINGS_STORAGE_KEY = 'stage-gate-dashboard-settings';

type SnapshotDetailCacheEntry =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; detail: ProgramSnapshotDetail };

const countFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const impactFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1
});
const fullImpactFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short'
});
const dayFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

const sanitizeNumber = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return value;
};

const formatCurrencyDelta = (value: number) => {
  if (value > 0) {
    return `+${impactFormatter.format(value)}`;
  }
  if (value === 0) {
    return '--';
  }
  return impactFormatter.format(value);
};

const formatCountDelta = (value: number) => {
  if (value > 0) {
    return `+${countFormatter.format(value)}`;
  }
  if (value < 0) {
    return `-${countFormatter.format(Math.abs(value))}`;
  }
  return '--';
};

const measurementDefinitions: Record<MeasurementKey, MeasurementDefinition> = {
  initiatives: {
    key: 'initiatives',
    label: 'Initiatives',
    description: 'Active initiatives per bucket',
    type: 'count',
    desiredTrend: 'up',
    formatter: (value) => countFormatter.format(value || 0),
    tooltipFormatter: (value) => countFormatter.format(value || 0),
    deltaFormatter: formatCountDelta,
    barClassName: 'countBar',
    valueExtractor: () => 1
  },
  recurringImpact: {
    key: 'recurringImpact',
    label: 'Recurring impact',
    description: 'Net recurring impact for the bucket',
    type: 'currency',
    desiredTrend: 'up',
    formatter: (value) => impactFormatter.format(value || 0),
    tooltipFormatter: (value) => fullImpactFormatter.format(value || 0),
    deltaFormatter: formatCurrencyDelta,
    barClassName: 'impactBar',
    valueExtractor: (entity) => sanitizeNumber(entity.totals.recurringImpact)
  },
  recurringBenefits: {
    key: 'recurringBenefits',
    label: 'Recurring benefits',
    description: 'Gross recurring benefits in the pipeline',
    type: 'currency',
    desiredTrend: 'up',
    formatter: (value) => impactFormatter.format(value || 0),
    tooltipFormatter: (value) => fullImpactFormatter.format(value || 0),
    deltaFormatter: formatCurrencyDelta,
    barClassName: 'benefitBar',
    valueExtractor: (entity) => sanitizeNumber(entity.totals.recurringBenefits)
  },
  recurringCosts: {
    key: 'recurringCosts',
    label: 'Recurring costs',
    description: 'Recurring cost commitments',
    type: 'currency',
    desiredTrend: 'down',
    formatter: (value) => impactFormatter.format(value || 0),
    tooltipFormatter: (value) => fullImpactFormatter.format(value || 0),
    deltaFormatter: formatCurrencyDelta,
    barClassName: 'costBar',
    valueExtractor: (entity) => sanitizeNumber(entity.totals.recurringCosts)
  },
  oneoffBenefits: {
    key: 'oneoffBenefits',
    label: 'One-off benefits',
    description: 'One-time benefits attributed to the pipeline',
    type: 'currency',
    desiredTrend: 'up',
    formatter: (value) => impactFormatter.format(value || 0),
    tooltipFormatter: (value) => fullImpactFormatter.format(value || 0),
    deltaFormatter: formatCurrencyDelta,
    barClassName: 'benefitBar',
    valueExtractor: (entity) => sanitizeNumber(entity.totals.oneoffBenefits)
  },
  oneoffCosts: {
    key: 'oneoffCosts',
    label: 'One-off costs',
    description: 'Implementation costs',
    type: 'currency',
    desiredTrend: 'down',
    formatter: (value) => impactFormatter.format(value || 0),
    tooltipFormatter: (value) => fullImpactFormatter.format(value || 0),
    deltaFormatter: formatCurrencyDelta,
    barClassName: 'costBar',
    valueExtractor: (entity) => sanitizeNumber(entity.totals.oneoffCosts)
  }
};

const isMeasurementKey = (value: unknown): value is MeasurementKey =>
  typeof value === 'string' && measurementKeyList.includes(value as MeasurementKey);

const createEmptyMeasurementValues = (): StageMetric =>
  measurementKeyList.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as StageMetric);

const createMaxValues = () =>
  measurementKeyList.reduce((acc, key) => {
    acc[key] = 1;
    return acc;
  }, {} as Record<MeasurementKey, number>);

const createEmptyMetricMap = (): StageMetricMap =>
  stageColumns.reduce((acc, column) => {
    acc[column.key] = createEmptyMeasurementValues();
    return acc;
  }, {} as StageMetricMap);

const bucketForInitiative = (initiative: StageGateEntity): StageColumnKey => {
  const stage = initiative.activeStage;
  if (stage === 'l0') {
    return 'l0';
  }
  const stageState = initiative.stageState[stage];
  const status = stageState?.status ?? 'draft';
  if (status === 'approved') {
    return stage as StageColumnKey;
  }
  const gateKey = `${stage}-gate` as StageColumnKey;
  return stageColumnLabelMap.has(gateKey) ? gateKey : (stage as StageColumnKey);
};

const buildDataset = (initiatives: StageGateEntity[], workstreams: Workstream[]): StageGateDataset => {
  const buildRow = (id: string, name: string, tone?: WorkstreamRow['tone']): WorkstreamRow => ({
    id,
    name,
    metrics: createEmptyMetricMap(),
    totals: createEmptyMeasurementValues(),
    maxValues: createMaxValues(),
    tone,
    initiatives: []
  });

  const rowsById = new Map<string, WorkstreamRow>();
  workstreams.forEach((workstream) => {
    rowsById.set(workstream.id, buildRow(workstream.id, workstream.name));
  });
  const unassignedRow = buildRow('__unassigned__', 'Unassigned initiatives', 'unassigned');
  const totalRow = buildRow('__total__', 'Portfolio total');

  initiatives.forEach((initiative) => {
    const bucket = bucketForInitiative(initiative);
    const workstreamRow = rowsById.get(initiative.workstreamId) ?? unassignedRow;
    workstreamRow.initiatives.push(initiative);
    [workstreamRow, totalRow].forEach((row) => {
      const entry = row.metrics[bucket];
      measurementKeyList.forEach((measurement) => {
        const delta = measurementDefinitions[measurement].valueExtractor(initiative);
        entry[measurement] += delta;
        row.totals[measurement] += delta;
      });
    });
  });

  const finalizeRow = (row: WorkstreamRow) => {
    measurementKeyList.forEach((measurement) => {
      const max = Math.max(
        1,
        ...stageColumns.map((column) => Math.abs(row.metrics[column.key][measurement]))
      );
      row.maxValues[measurement] = max;
    });
    return row;
  };

  const orderedRows = workstreams.map((workstream) => finalizeRow(rowsById.get(workstream.id)!));
  const shouldIncludeUnassigned = unassignedRow.totals.initiatives > 0 || initiatives.length === 0;
  if (shouldIncludeUnassigned) {
    orderedRows.push(finalizeRow(unassignedRow));
  } else {
    finalizeRow(unassignedRow);
  }

  const finalizedTotal = finalizeRow(totalRow);
  const lookup = new Map<string, WorkstreamRow>();
  orderedRows.forEach((row) => lookup.set(row.id, row));
  lookup.set(finalizedTotal.id, finalizedTotal);
  lookup.set(unassignedRow.id, unassignedRow);

  return {
    rows: orderedRows,
    totalRow: finalizedTotal,
    lookup
  };
};

const selectSnapshotWithinDate = (group: ProgramSnapshotSummary[]): ProgramSnapshotSummary =>
  [...group].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()).pop() ??
  group[group.length - 1];

const groupSnapshotsByDate = (snapshots: ProgramSnapshotSummary[]) => {
  const map = new Map<string, ProgramSnapshotSummary[]>();
  snapshots.forEach((snapshot) => {
    const key = snapshot.dateKey ?? snapshot.capturedAt.slice(0, 10);
    const bucket = map.get(key) ?? [];
    bucket.push(snapshot);
    map.set(key, bucket);
  });
  return map;
};

const findSnapshotByDaysAgo = (snapshots: ProgramSnapshotSummary[], days: number): ProgramSnapshotSummary | null => {
  if (!snapshots.length) {
    return null;
  }
  const grouped = groupSnapshotsByDate(snapshots);
  const orderedDates = Array.from(grouped.keys()).sort();
  const targetDateKey = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const candidateDate =
    orderedDates.filter((date) => date <= targetDateKey).pop() ??
    orderedDates.find((date) => date > targetDateKey) ??
    orderedDates[orderedDates.length - 1];
  if (!candidateDate) {
    return null;
  }
  const group = grouped.get(candidateDate);
  if (!group || !group.length) {
    return null;
  }
  return selectSnapshotWithinDate(group);
};

const getDeltaTone = (
  delta: number | null,
  trend: MeasurementDefinition['desiredTrend']
): 'positive' | 'negative' | 'neutral' => {
  if (delta === null || delta === 0) {
    return 'neutral';
  }
  const positive = delta > 0;
  if (trend === 'neutral') {
    return positive ? 'positive' : 'negative';
  }
  return trend === 'up' ? (positive ? 'positive' : 'negative') : positive ? 'negative' : 'positive';
};

export const StageGateDashboardScreen = () => {
  const { list: initiatives } = useInitiativesState();
  const { list: workstreams } = useWorkstreamsState();
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('7d');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [selectedMeasurements, setSelectedMeasurements] = useState<MeasurementKey[]>(DEFAULT_MEASUREMENTS);
  const [layoutMode, setLayoutMode] = useState<DashboardLayout>('workstream-first');
  const [snapshots, setSnapshots] = useState<ProgramSnapshotSummary[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotDetails, setSnapshotDetails] = useState<Record<string, SnapshotDetailCacheEntry>>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as { measurements?: MeasurementKey[]; layout?: DashboardLayout };
      if (Array.isArray(parsed.measurements)) {
        const filtered = parsed.measurements.filter((key): key is MeasurementKey => isMeasurementKey(key));
        if (filtered.length) {
          setSelectedMeasurements(filtered);
        }
      }
      if (parsed.layout === 'metric-first' || parsed.layout === 'workstream-first') {
        setLayoutMode(parsed.layout);
      }
    } catch (error) {
      console.warn('Failed to restore dashboard settings', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ measurements: selectedMeasurements, layout: layoutMode })
      );
    } catch (error) {
      console.warn('Failed to persist dashboard settings', error);
    }
  }, [selectedMeasurements, layoutMode]);

  const dataset = useMemo(
    () => buildDataset(initiatives as StageGateEntity[], workstreams),
    [initiatives, workstreams]
  );
  const { rows, totalRow } = dataset;

  const loadSnapshots = useCallback(async () => {
    setSnapshotsLoading(true);
    try {
      const remote = await snapshotsApi.listProgramSnapshots({ limit: SNAPSHOT_FETCH_LIMIT });
      setSnapshots(remote);
      setSnapshotError(null);
    } catch (error) {
      console.error('Failed to load pipeline snapshots:', error);
      setSnapshotError('Unable to load snapshots right now. Try again later.');
    } finally {
      setSnapshotsLoading(false);
      setSnapshotsLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  useEffect(() => {
    if (!snapshots.length && comparisonMode !== 'none') {
      setComparisonMode('none');
    }
    if (comparisonMode === 'custom') {
      const existingIds = new Set(snapshots.map((entry) => entry.id));
      if (!selectedSnapshotId || !existingIds.has(selectedSnapshotId)) {
        setSelectedSnapshotId(snapshots[snapshots.length - 1]?.id ?? null);
      }
    }
  }, [snapshots, comparisonMode, selectedSnapshotId]);

  const comparisonSnapshot = useMemo(() => {
    if (!snapshots.length || comparisonMode === 'none') {
      return null;
    }
    if (comparisonMode === 'custom') {
      return snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null;
    }
    return findSnapshotByDaysAgo(snapshots, comparisonMode === '7d' ? 7 : 30);
  }, [snapshots, comparisonMode, selectedSnapshotId]);

  const activeComparisonDetail = comparisonSnapshot ? snapshotDetails[comparisonSnapshot.id] : undefined;
  const activeComparisonStatus = comparisonMode === 'none' ? undefined : activeComparisonDetail?.status;

  useEffect(() => {
    if (!comparisonSnapshot || comparisonMode === 'none') {
      return;
    }
    const snapshotId = comparisonSnapshot.id;
    const existing = snapshotDetails[snapshotId];
    if (existing && existing.status !== 'error') {
      return;
    }
    let cancelled = false;
    setSnapshotDetails((prev) => ({
      ...prev,
      [snapshotId]: { status: 'loading' }
    }));
    void snapshotsApi
      .getProgramSnapshot(snapshotId)
      .then((detail) => {
        if (cancelled) {
          return;
        }
        setSnapshotDetails((prev) => ({
          ...prev,
          [snapshotId]: { status: 'ready', detail }
        }));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setSnapshotDetails((prev) => ({
          ...prev,
          [snapshotId]: { status: 'error' }
        }));
      });
    return () => {
      cancelled = true;
    };
    // We intentionally exclude snapshotDetails from dependencies to avoid cancelling
    // the fetch when the local cache flips between loading/ready states.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonSnapshot?.id, comparisonMode]);

  const comparisonDataset = useMemo(() => {
    if (!comparisonSnapshot || !activeComparisonDetail || activeComparisonDetail.status !== 'ready') {
      return null;
    }
    return buildDataset(activeComparisonDetail.detail.payload.initiatives as StageGateEntity[], workstreams);
  }, [comparisonSnapshot?.id, activeComparisonDetail, workstreams]);

  const comparisonLookup = comparisonDataset?.lookup ?? null;
  const comparisonLoading = Boolean(
    comparisonSnapshot && comparisonMode !== 'none' && activeComparisonStatus === 'loading'
  );
  const comparisonError = Boolean(
    comparisonSnapshot && comparisonMode !== 'none' && activeComparisonStatus === 'error'
  );

  const comparisonLabel = useMemo(() => {
    if (comparisonMode === 'none') {
      return 'Comparison disabled';
    }
    if (!comparisonSnapshot) {
      return snapshotsLoading ? 'Loading snapshot history...' : 'Snapshot not available yet';
    }
    const targetLabel =
      comparisonMode === '7d'
        ? '7 days ago'
        : comparisonMode === '30d'
          ? '30 days ago'
          : 'Selected snapshot';
    const base = `${targetLabel}  -  ${dateFormatter.format(new Date(comparisonSnapshot.capturedAt))}`;
    if (comparisonLoading) {
      return `${base}  -  loading metrics...`;
    }
    if (comparisonError) {
      return `${base}  -  unable to load metrics`;
    }
    if (!comparisonLookup) {
      return `${base}  -  queued for download`;
    }
    return `${base}  -  ready`;
  }, [comparisonMode, comparisonSnapshot, comparisonLoading, comparisonError, comparisonLookup, snapshotsLoading]);

  const lastSnapshot = snapshots[snapshots.length - 1];
  const hasInitiatives = totalRow.totals.initiatives > 0;
  const activeMeasurements = selectedMeasurements.length ? selectedMeasurements : DEFAULT_MEASUREMENTS;

  const handleComparisonModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setComparisonMode(event.target.value as ComparisonMode);
  };

  const handleSnapshotSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedSnapshotId(event.target.value || null);
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

  const handleLayoutChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setLayoutMode(event.target.value as DashboardLayout);
  };

  const renderStageCells = (
    row: WorkstreamRow,
    column: StageColumnKey,
    measurement: MeasurementKey,
    comparisonRow?: WorkstreamRow
  ) => {
    const meta = measurementDefinitions[measurement];
    const columnLabel = stageColumnLabelMap.get(column) ?? column.toUpperCase();
    const value = row.metrics[column][measurement] ?? 0;
    const normalized = meta.type === 'currency' ? Math.abs(value) : value;
    const max = row.maxValues[measurement] || 1;
    const width = max > 0 ? Math.min(100, Math.round((normalized / max) * 100)) : 0;
    const barClasses = [styles.barFill, styles[meta.barClassName]];
    if (width === 0) {
      barClasses.push(styles.barFillEmpty);
    }
    const formatted = meta.formatter(value);
    const tooltipParts = [
      `${row.name}  -  ${meta.label}  -  ${columnLabel}`,
      `Current: ${meta.tooltipFormatter ? meta.tooltipFormatter(value) : formatted}`
    ];
    const comparisonValue = comparisonRow?.metrics[column]?.[measurement];
    let delta: number | null = null;
    if (typeof comparisonValue === 'number') {
      delta = value - comparisonValue;
      tooltipParts.push(
        `Snapshot: ${meta.tooltipFormatter ? meta.tooltipFormatter(comparisonValue) : meta.formatter(comparisonValue)}`
      );
    }
    const tone = getDeltaTone(delta, meta.desiredTrend);
    const deltaClasses = [styles.deltaBadge];
    if (tone === 'positive') {
      deltaClasses.push(styles.deltaPositive);
    } else if (tone === 'negative') {
      deltaClasses.push(styles.deltaNegative);
    } else {
      deltaClasses.push(styles.deltaNeutral);
    }
    return (
      <Fragment key={`${row.id}-${column}-${measurement}`}>
        <td className={styles.valueCell} title={tooltipParts.join('  -  ')}>
          <div className={styles.barTrack} aria-hidden="true">
            <div className={barClasses.join(' ')} style={{ width: `${width}%` }} />
            <span className={[styles.barValue, value < 0 ? styles.negativeValue : ''].join(' ')}>{formatted}</span>
          </div>
        </td>
        <td className={styles.deltaCell}>
          {delta === null ? (
            <span className={[styles.deltaBadge, styles.deltaNeutral, styles.deltaPlaceholder].join(' ')}>--</span>
          ) : (
            <span className={deltaClasses.join(' ')}>{meta.deltaFormatter(delta)}</span>
          )}
        </td>
      </Fragment>
    );
  };

  const renderTotalCells = (row: WorkstreamRow, measurement: MeasurementKey, comparisonRow?: WorkstreamRow) => {
    const meta = measurementDefinitions[measurement];
    const value = row.totals[measurement] ?? 0;
    const normalized = meta.type === 'currency' ? Math.abs(value) : value;
    const max = Math.max(row.maxValues[measurement] || 1, Math.abs(value));
    const width = max > 0 ? Math.min(100, Math.round((normalized / max) * 100)) : 0;
    const barClasses = [styles.barFill, styles[meta.barClassName], styles.totalBarFill]
      .filter(Boolean)
      .join(' ');
    const formatted = meta.formatter(value);
    const tooltipParts = [
      `${row.name} - ${meta.label} - Total`,
      `Current: ${meta.tooltipFormatter ? meta.tooltipFormatter(value) : formatted}`
    ];
    const comparisonValue = comparisonRow?.totals[measurement];
    let delta: number | null = null;
    if (typeof comparisonValue === 'number') {
      delta = value - comparisonValue;
      tooltipParts.push(
        `Snapshot: ${meta.tooltipFormatter ? meta.tooltipFormatter(comparisonValue) : meta.formatter(comparisonValue)
        }`
      );
    }
    const tone = getDeltaTone(delta, meta.desiredTrend);
    const deltaClasses = [styles.deltaBadge, styles.totalDeltaBadge];
    if (tone === 'positive') {
      deltaClasses.push(styles.deltaPositive);
    } else if (tone === 'negative') {
      deltaClasses.push(styles.deltaNegative);
    } else {
      deltaClasses.push(styles.deltaNeutral);
    }
    return (
      <Fragment key={`${row.id}-total-${measurement}`}>
        <td className={[styles.valueCell, styles.totalValueCell].join(' ')} title={tooltipParts.join(' - ')}>
          <div className={styles.barTrack} aria-hidden="true">
            <div className={barClasses} style={{ width: `${width}%` }} />
            <span className={[styles.barValue, value < 0 ? styles.negativeValue : ''].join(' ')}>{formatted}</span>
          </div>
        </td>
        <td className={[styles.deltaCell, styles.totalDeltaCell].join(' ')}>
          {delta === null ? (
            <span
              className={[
                styles.deltaBadge,
                styles.totalDeltaBadge,
                styles.deltaNeutral,
                styles.deltaPlaceholder
              ].join(' ')}
            >
              --
            </span>
          ) : (
            <span className={deltaClasses.join(' ')}>{meta.deltaFormatter(delta)}</span>
          )}
        </td>
      </Fragment>
    );
  };

  const renderInitiativeRow = (
    initiative: StageGateEntity,
    measurement: MeasurementKey,
    comparisonRow?: WorkstreamRow
  ) => {
    const bucket = bucketForInitiative(initiative);
    const meta = measurementDefinitions[measurement];
    // For initiative rows, we only show the value if it falls in the specific bucket
    // But since the table structure is fixed columns, we render cells for all columns,
    // but only the matching bucket will have a value.

    return (
      <tr key={initiative.id} className={styles.initiativeRow}>
        <td className={styles.initiativeNameCell}>
          <span className={styles.initiativeName}>{initiative.name}</span>
        </td>
        {/* Metric label cell removed to align columns correctly */}
        {stageColumns.flatMap((column) => {
          const isMatch = column.key === bucket;
          if (!isMatch) {
            return (
              <Fragment key={`${initiative.id}-${column.key}`}>
                <td className={styles.valueCell}></td>
                <td className={styles.deltaCell}></td>
              </Fragment>
            );
          }

          const value = meta.valueExtractor(initiative);
          const formatted = meta.formatter(value);

          return (
            <Fragment key={`${initiative.id}-${column.key}`}>
              <td className={styles.valueCell}>
                <span className={styles.initiativeValue}>{formatted}</span>
              </td>
              <td className={styles.deltaCell}>
                {/* No delta for individual initiatives for now as we don't have easy access to historical initiative data here without more complex lookup */}
                <span className={[styles.deltaBadge, styles.deltaNeutral, styles.deltaPlaceholder].join(' ')}>--</span>
              </td>
            </Fragment>
          );
        })}
        {/* Total column for initiative */}
        {(() => {
          const value = meta.valueExtractor(initiative);
          const formatted = meta.formatter(value);
          return (
            <Fragment key={`${initiative.id}-total`}>
              <td className={[styles.valueCell, styles.totalValueCell].join(' ')}>
                <span className={styles.initiativeValue}>{formatted}</span>
              </td>
              <td className={[styles.deltaCell, styles.totalDeltaCell].join(' ')}>
                <span className={[styles.deltaBadge, styles.totalDeltaBadge, styles.deltaNeutral, styles.deltaPlaceholder].join(' ')}>--</span>
              </td>
            </Fragment>
          );
        })()}
      </tr>
    );
  };

  const renderWorkstreamFirstRows = () => (
    <>
      {rows.map((row) => {
        const isExpanded = expandedRows.has(row.id);
        return (
          <Fragment key={row.id}>
            {activeMeasurements.map((measurement, index) => (
              <Fragment key={`${row.id}-${measurement}`}>
                <tr className={row.tone === 'unassigned' ? styles.unassignedRow : undefined}>
                  {index === 0 && (
                    <th scope="rowgroup" rowSpan={activeMeasurements.length + (isExpanded ? row.initiatives.length * activeMeasurements.length : 0)} className={styles.workstreamCell}>
                      <div className={styles.workstreamHeader}>
                        <button
                          className={styles.expandButton}
                          onClick={() => toggleRow(row.id)}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? "Collapse workstream" : "Expand workstream"}
                        >
                          {isExpanded ? '−' : '+'}
                        </button>
                        <div>
                          <p className={styles.workstreamName}>{row.name}</p>
                          <p className={styles.workstreamMeta}>
                            {countFormatter.format(row.totals.initiatives)} active initiatives
                          </p>
                        </div>
                      </div>
                    </th>
                  )}
                  <td className={styles.metricLabel}>
                    <span>{measurementDefinitions[measurement].label}</span>
                    <strong>{measurementDefinitions[measurement].formatter(row.totals[measurement])}</strong>
                  </td>
                  {stageColumns.flatMap((column) =>
                    renderStageCells(row, column.key, measurement, comparisonLookup?.get(row.id))
                  )}
                  {renderTotalCells(row, measurement, comparisonLookup?.get(row.id))}
                </tr>
                {isExpanded && row.initiatives.map(initiative => (
                  renderInitiativeRow(initiative, measurement)
                ))}
              </Fragment>
            ))}
          </Fragment>
        );
      })}
      {activeMeasurements.map((measurement, index) => (
        <tr key={`total-${measurement}`} className={styles.totalRow}>
          {index === 0 && (
            <th scope="rowgroup" rowSpan={activeMeasurements.length} className={styles.workstreamCell}>
              <p className={styles.workstreamName}>Portfolio total</p>
              <p className={styles.workstreamMeta}>
                {countFormatter.format(totalRow.totals.initiatives)} active initiatives
              </p>
            </th>
          )}
          <td className={styles.metricLabel}>
            <span>{measurementDefinitions[measurement].label}</span>
            <strong>{measurementDefinitions[measurement].formatter(totalRow.totals[measurement])}</strong>
          </td>
          {stageColumns.flatMap((column) =>
            renderStageCells(totalRow, column.key, measurement, comparisonLookup?.get(totalRow.id))
          )}
          {renderTotalCells(totalRow, measurement, comparisonLookup?.get(totalRow.id))}
        </tr>
      ))}
    </>
  );

  const renderMetricFirstRows = () => (
    <>
      {activeMeasurements.map((measurement) => {
        const blockRowSpan = rows.length + 1;
        return (
          <Fragment key={`metric-block-${measurement}`}>
            {rows.map((row, index) => {
              const isExpanded = expandedRows.has(row.id);
              return (
                <Fragment key={`${measurement}-${row.id}`}>
                  <tr className={row.tone === 'unassigned' ? styles.unassignedRow : undefined}>
                    {index === 0 && (
                      <th scope="rowgroup" rowSpan={blockRowSpan + (expandedRows.size > 0 ? Array.from(expandedRows).reduce((acc, id) => acc + (dataset.lookup.get(id)?.initiatives.length || 0), 0) : 0)} className={styles.metricGroupCell}>
                        <p className={styles.workstreamName}>{measurementDefinitions[measurement].label}</p>
                        <p className={styles.workstreamMeta}>{measurementDefinitions[measurement].description}</p>
                        <p className={styles.workstreamMeta}>
                          Total {measurementDefinitions[measurement].formatter(totalRow.totals[measurement])}
                        </p>
                      </th>
                    )}
                    <td className={styles.metricLabel}>
                      <div className={styles.metricLabelContent}>
                        <button
                          className={styles.expandButtonSmall}
                          onClick={() => toggleRow(row.id)}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? '−' : '+'}
                        </button>
                        <div>
                          <span>{row.name}</span>
                          <strong>{measurementDefinitions[measurement].formatter(row.totals[measurement])}</strong>
                        </div>
                      </div>
                    </td>
                    {stageColumns.flatMap((column) =>
                      renderStageCells(row, column.key, measurement, comparisonLookup?.get(row.id))
                    )}
                    {renderTotalCells(row, measurement, comparisonLookup?.get(row.id))}
                  </tr>
                  {isExpanded && row.initiatives.map(initiative => (
                    renderInitiativeRow(initiative, measurement)
                  ))}
                </Fragment>
              );
            })}
            <tr key={`${measurement}-portfolio`} className={styles.totalRow}>
              <td className={styles.metricLabel}>
                <span>Portfolio total</span>
                <strong>{measurementDefinitions[measurement].formatter(totalRow.totals[measurement])}</strong>
              </td>
              {stageColumns.flatMap((column) =>
                renderStageCells(totalRow, column.key, measurement, comparisonLookup?.get(totalRow.id))
              )}
              {renderTotalCells(totalRow, measurement, comparisonLookup?.get(totalRow.id))}
            </tr>
          </Fragment>
        );
      })}
    </>
  );

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Stage-gate pipeline</h1>
          <p className={styles.subtitle}>
            Visualize how initiatives progress across the stage-gate funnel and compare metrics with historical snapshots.
          </p>
          {lastSnapshot && <p className={styles.metaLine}>Last snapshot: {dayFormatter.format(new Date(lastSnapshot.capturedAt))}</p>}
          {snapshotsLoading && !snapshotsLoaded && <p className={styles.metaLine}>Loading history...</p>}
          {snapshotError && <p className={styles.errorBanner}>{snapshotError}</p>}
        </div>
      </header>

      <section className={styles.controls}>
        <div className={styles.fieldGroup}>
          <label htmlFor="comparison-mode">Comparison</label>
          <select id="comparison-mode" value={comparisonMode} onChange={handleComparisonModeChange}>
            <option value="none">No comparison</option>
            <option value="7d" disabled={!snapshots.length}>
              vs 7 days ago
            </option>
            <option value="30d" disabled={snapshots.length < 2}>
              vs 30 days ago
            </option>
            <option value="custom" disabled={!snapshots.length}>
              Pick snapshot...
            </option>
          </select>
        </div>
        {comparisonMode === 'custom' && snapshots.length > 0 && (
          <div className={styles.fieldGroup}>
            <label htmlFor="comparison-snapshot">Snapshot</label>
            <select id="comparison-snapshot" value={selectedSnapshotId ?? ''} onChange={handleSnapshotSelect}>
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {dateFormatter.format(new Date(snapshot.capturedAt))}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={styles.statusText}>{comparisonLabel}</div>
      </section>

      <section className={styles.controls}>
        <div className={styles.fieldGroup}>
          <label>Metrics</label>
          <div className={styles.metricSelector}>
            {measurementKeyList.map((measurement) => {
              const active = selectedMeasurements.includes(measurement);
              return (
                <button
                  key={measurement}
                  type="button"
                  className={[styles.metricChip, active ? styles.metricChipActive : ''].join(' ')}
                  onClick={() => handleToggleMeasurement(measurement)}
                  aria-pressed={active}
                  title={measurementDefinitions[measurement].description}
                >
                  {measurementDefinitions[measurement].label}
                </button>
              );
            })}
          </div>
          <p className={styles.helper}>Select at least one metric to display.</p>
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="layout-mode">Table layout</label>
          <select id="layout-mode" value={layoutMode} onChange={handleLayoutChange}>
            <option value="workstream-first">Workstreams -&gt; metrics</option>
            <option value="metric-first">Metrics -&gt; workstreams</option>
          </select>
          <p className={styles.helper}>Choose which dimension should group the rows first.</p>
        </div>
      </section>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.workstreamColumn} rowSpan={2}>
                {layoutMode === 'workstream-first' ? 'Workstream' : 'Metric'}
              </th>
              <th className={styles.metricColumn} rowSpan={2}>
                {layoutMode === 'workstream-first' ? 'Metric' : 'Workstream'}
              </th>
              {stageColumns.map((column) => (
                <th key={column.key} colSpan={2} className={styles.stageHeader}>
                  {column.label}
                </th>
              ))}
              <th colSpan={2} className={[styles.stageHeader, styles.totalStageHeader].join(' ')}>
                Total
              </th>
            </tr>
            <tr>
              {stageColumns.map((column) => (
                <Fragment key={`${column.key}-sub`}>
                  <th className={styles.stageSubHeader}>Now</th>
                  <th className={styles.stageSubHeader}>Delta</th>
                </Fragment>
              ))}
              <Fragment key="total-sub">
                <th className={styles.stageSubHeader}>Now</th>
                <th className={styles.stageSubHeader}>Delta</th>
              </Fragment>
            </tr>
          </thead>
          <tbody>{layoutMode === 'workstream-first' ? renderWorkstreamFirstRows() : renderMetricFirstRows()}</tbody>
        </table>
        {!hasInitiatives && (
          <p className={styles.emptyState}>No initiatives yet. Create the first initiative to populate the pipeline.</p>
        )}
      </div>
    </section>
  );
};
