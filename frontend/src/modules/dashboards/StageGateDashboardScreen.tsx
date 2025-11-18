import { Fragment, useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import styles from '../../styles/StageGateDashboardScreen.module.css';
import { useInitiativesState, useWorkstreamsState } from '../../app/state/AppStateContext';
import { Initiative, InitiativeStageKey, initiativeStageKeys } from '../../shared/types/initiative';
import { Workstream } from '../../shared/types/workstream';
import { ProgramSnapshotSummary } from '../../shared/types/snapshot';
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

type MeasurementKey = 'initiatives' | 'impact';

interface StageMetric {
  initiatives: number;
  impact: number;
}

type StageMetricMap = Record<StageColumnKey, StageMetric>;

interface WorkstreamRow {
  id: string;
  name: string;
  metrics: StageMetricMap;
  totals: StageMetric;
  maxInitiatives: number;
  maxImpact: number;
  tone?: 'unassigned';
}

interface StageGatePortfolio {
  metrics: StageMetricMap;
  totals: StageMetric;
}

type ComparisonMode = 'none' | '7d' | '30d' | 'custom';
const SNAPSHOT_FETCH_LIMIT = 90;

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

const createEmptyMetricMap = (): StageMetricMap =>
  stageColumns.reduce((acc, column) => {
    acc[column.key as StageColumnKey] = { initiatives: 0, impact: 0 };
    return acc;
  }, {} as StageMetricMap);

const cloneMetricMap = (source: StageMetricMap): StageMetricMap =>
  stageColumns.reduce((acc, column) => {
    const metrics = source[column.key];
    acc[column.key] = {
      initiatives: metrics?.initiatives ?? 0,
      impact: metrics?.impact ?? 0
    };
    return acc;
  }, {} as StageMetricMap);

const sanitizeImpact = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return value;
};

const bucketForInitiative = (initiative: Initiative): StageColumnKey => {
  const stage = initiative.activeStage;
  if (stage === 'l0') {
    return 'l0';
  }
  const stageState = initiative.stageState[stage];
  const status = stageState?.status ?? 'draft';
  if (status === 'approved') {
    return stage as StageColumnKey;
  }
  const gateKey = `${stage}-gate`;
  return (stageColumns.find((column) => column.key === gateKey)?.key ?? (stage as StageColumnKey));
};

const buildRows = (initiatives: Initiative[], workstreams: Workstream[]): { rows: WorkstreamRow[]; totalRow: WorkstreamRow } => {
  const buildRow = (id: string, name: string, tone?: WorkstreamRow['tone']): WorkstreamRow => ({
    id,
    name,
    metrics: createEmptyMetricMap(),
    totals: { initiatives: 0, impact: 0 },
    maxInitiatives: 1,
    maxImpact: 1,
    tone
  });

  const rowsById = new Map<string, WorkstreamRow>();
  workstreams.forEach((workstream) => {
    rowsById.set(workstream.id, buildRow(workstream.id, workstream.name));
  });
  const unassignedRow = buildRow('__unassigned__', 'Unassigned initiatives', 'unassigned');
  const totalRow = buildRow('__total__', 'Portfolio total');

  initiatives.forEach((initiative) => {
    const impact = sanitizeImpact(initiative.totals.recurringImpact);
    const bucket = bucketForInitiative(initiative);
    const workstreamRow = rowsById.get(initiative.workstreamId) ?? unassignedRow;
    [workstreamRow, totalRow].forEach((row) => {
      const entry = row.metrics[bucket];
      entry.initiatives += 1;
      entry.impact += impact;
      row.totals.initiatives += 1;
      row.totals.impact += impact;
    });
  });

  const finalizeRow = (row: WorkstreamRow): WorkstreamRow => {
    const initiativesMax = Math.max(
      1,
      ...stageColumns.map((column) => row.metrics[column.key].initiatives)
    );
    const impactMax = Math.max(
      1,
      ...stageColumns.map((column) => Math.abs(row.metrics[column.key].impact))
    );
    row.maxInitiatives = initiativesMax;
    row.maxImpact = impactMax;
    return row;
  };

  const orderedRows = workstreams.map((workstream) => finalizeRow(rowsById.get(workstream.id)!));
  const includeUnassigned = unassignedRow.totals.initiatives > 0 || initiatives.length === 0;
  if (includeUnassigned) {
    orderedRows.push(finalizeRow(unassignedRow));
  }

  return {
    rows: orderedRows,
    totalRow: finalizeRow(totalRow)
  };
};
const findSnapshotByDaysAgo = (snapshots: ProgramSnapshotSummary[], days: number): ProgramSnapshotSummary | null => {
  if (!snapshots.length) {
    return null;
  }
  const target = Date.now() - days * 86400000;
  const olderOrEqual = snapshots.filter((snapshot) => new Date(snapshot.capturedAt).getTime() <= target);
  if (olderOrEqual.length) {
    return olderOrEqual[olderOrEqual.length - 1];
  }
  return snapshots[0];
};

const formatImpact = (value: number) => impactFormatter.format(value || 0);
const formatImpactDelta = (value: number) => {
  const formatted = formatImpact(value);
  if (value > 0) {
    return `+${formatted}`;
  }
  if (value === 0) {
    return 'No change';
  }
  return formatted;
};

const formatCountDelta = (value: number) => {
  if (value > 0) {
    return `+${countFormatter.format(value)}`;
  }
  if (value < 0) {
    return `-${countFormatter.format(Math.abs(value))}`;
  }
  return 'No change';
};

const renderBar = (
  row: WorkstreamRow,
  column: StageColumnKey,
  measurement: MeasurementKey,
  comparisonValue?: number
) => {
  const value = row.metrics[column][measurement];
  const max = measurement === 'initiatives' ? row.maxInitiatives : row.maxImpact;
  const normalized = measurement === 'impact' ? Math.abs(value) : value;
  const width = max > 0 ? Math.min(100, Math.round((normalized / max) * 100)) : 0;
  const isZero = normalized === 0;
  const isNegative = measurement === 'impact' && value < 0;
  const formattedValue = measurement === 'initiatives' ? countFormatter.format(value) : formatImpact(value);
  const tooltipParts = [
    `${row.name} / ${measurement === 'initiatives' ? 'initiatives' : 'recurring impact'}`,
    `${formattedValue}`
  ];
  if (typeof comparisonValue === 'number') {
    tooltipParts.push(
      `vs snapshot: ${
        measurement === 'initiatives' ? countFormatter.format(comparisonValue) : formatImpact(comparisonValue)
      }`
    );
  }
  return (
    <td key={`${row.id}-${column}-${measurement}`} className={styles.barCell} title={tooltipParts.join(' • ')}>
      <div className={styles.barTrack} aria-hidden="true">
        <div
          className={[
            styles.barFill,
            measurement === 'initiatives' ? styles.countBar : styles.impactBar,
            isZero ? styles.barFillEmpty : '',
            isNegative ? styles.barFillNegative : ''
          ].join(' ')}
          style={{ width: `${width}%` }}
        />
        <span className={[styles.barValue, isNegative ? styles.negativeValue : ''].join(' ')}>{formattedValue}</span>
      </div>
    </td>
  );
};

export const StageGateDashboardScreen = () => {
  const { list: initiatives } = useInitiativesState();
  const { list: workstreams } = useWorkstreamsState();
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('7d');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  const { rows, totalRow } = useMemo(() => buildRows(initiatives, workstreams), [initiatives, workstreams]);
  const portfolio = useMemo<StageGatePortfolio>(
    () => ({
      metrics: cloneMetricMap(totalRow.metrics),
      totals: { ...totalRow.totals }
    }),
    [totalRow]
  );
  const [snapshots, setSnapshots] = useState<ProgramSnapshotSummary[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);

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

  const comparisonLabel = useMemo(() => {
    if (!comparisonSnapshot) {
      return comparisonMode === 'none' ? 'No comparison' : 'Snapshot not available yet';
    }
    const target =
      comparisonMode === '7d'
        ? '7 days ago'
        : comparisonMode === '30d'
        ? '30 days ago'
        : 'Selected snapshot';
    return `${target} • ${dateFormatter.format(new Date(comparisonSnapshot.capturedAt))}`;
  }, [comparisonSnapshot, comparisonMode]);

  const comparisonDeltas = useMemo(() => {
    if (!comparisonSnapshot) {
      return null;
    }
    return stageColumns.map((column) => {
      const current = totalRow.metrics[column.key];
      const previous = comparisonSnapshot.stageGate.metrics[column.key];
      return {
        key: column.key,
        label: column.label,
        currentInitiatives: current.initiatives,
        currentImpact: current.impact,
        deltaInitiatives: current.initiatives - previous.initiatives,
        deltaImpact: current.impact - previous.impact
      };
    });
  }, [comparisonSnapshot, totalRow]);

  const hasInitiatives = totalRow.totals.initiatives > 0;
  const lastSnapshot = snapshots[snapshots.length - 1];

  const handleComparisonModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setComparisonMode(event.target.value as ComparisonMode);
  };

  const handleSnapshotSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedSnapshotId(event.target.value || null);
  };

  const handleCaptureSnapshot = useCallback(async () => {
    setCaptureBusy(true);
    try {
      await snapshotsApi.captureProgramSnapshot('full');
      await loadSnapshots();
    } catch (error) {
      console.error('Failed to capture snapshot:', error);
      setSnapshotError('Unable to capture snapshot right now.');
    } finally {
      setCaptureBusy(false);
    }
  }, [loadSnapshots]);

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Stage-gate pipeline</h1>
          <p className={styles.subtitle}>
            Track how initiatives move from L0 through L5 and monitor the recurring impact tied to each gate.
          </p>
          {snapshotError && <p className={styles.errorBanner}>{snapshotError}</p>}
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.snapshotButton}
            onClick={handleCaptureSnapshot}
            disabled={captureBusy || snapshotsLoading}
          >
            {captureBusy ? 'Capturing...' : 'Capture snapshot now'}
          </button>
          <p className={styles.snapshotInfo}>
            Snapshots are stored on the server and refreshed automatically according to the Snapshot settings.
            {snapshotsLoading && !snapshotsLoaded && (
              <>
                <br />
                Loading history...
              </>
            )}
            {lastSnapshot && (
              <>
                <br />
                Last snapshot: {dayFormatter.format(new Date(lastSnapshot.capturedAt))}
              </>
            )}
          </p>
        </div>
      </header>

      <section className={styles.comparisonPanel}>
        <div className={styles.field}>
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
          <div className={styles.field}>
            <label htmlFor="comparison-snapshot">Snapshot</label>
            <select
              id="comparison-snapshot"
              value={selectedSnapshotId ?? ''}
              onChange={handleSnapshotSelect}
            >
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {dateFormatter.format(new Date(snapshot.capturedAt))}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={styles.comparisonSummary}>{comparisonLabel}</div>
      </section>

      {comparisonDeltas && (
        <section className={styles.comparisonChips} aria-live="polite">
          {comparisonDeltas.map((delta) => (
            <article key={delta.key} className={styles.comparisonChip}>
              <header>
                <p className={styles.chipLabel}>{delta.label}</p>
                <p className={styles.chipCount}>
                  {countFormatter.format(delta.currentInitiatives)} initiatives
                  <span
                    className={[
                      styles.deltaBadge,
                      delta.deltaInitiatives > 0 ? styles.deltaPositive : '',
                      delta.deltaInitiatives < 0 ? styles.deltaNegative : ''
                    ].join(' ')}
                  >
                    {formatCountDelta(delta.deltaInitiatives)}
                  </span>
                </p>
              </header>
              <p className={styles.chipImpact}>
                {fullImpactFormatter.format(delta.currentImpact)}
                <span
                  className={[
                    styles.deltaBadge,
                    delta.deltaImpact > 0 ? styles.deltaPositive : '',
                    delta.deltaImpact < 0 ? styles.deltaNegative : ''
                  ].join(' ')}
                >
                  {formatImpactDelta(delta.deltaImpact)}
                </span>
              </p>
            </article>
          ))}
        </section>
      )}

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.workstreamColumn}>Workstream</th>
              <th className={styles.metricColumn}>Metric</th>
              {stageColumns.map((column) => (
                <th key={column.key} className={styles.stageColumn}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr className={row.tone === 'unassigned' ? styles.unassignedRow : undefined}>
                  <th scope="rowgroup" rowSpan={2} className={styles.workstreamCell}>
                    <div>
                      <p className={styles.workstreamName}>{row.name}</p>
                      <p className={styles.workstreamMeta}>{countFormatter.format(row.totals.initiatives)} active</p>
                    </div>
                  </th>
                  <td className={styles.metricLabel}>Initiatives</td>
                  {stageColumns.map((column) => renderBar(row, column.key, 'initiatives'))}
                </tr>
                <tr className={row.tone === 'unassigned' ? styles.unassignedRow : undefined}>
                  <td className={styles.metricLabel}>Recurring impact</td>
                  {stageColumns.map((column) => renderBar(row, column.key, 'impact'))}
                </tr>
              </Fragment>
            ))}
            <tr className={styles.totalFooter}>
              <th scope="row" className={styles.workstreamCell}>
                Portfolio total
              </th>
              <td className={styles.metricLabel}>Initiatives</td>
              {stageColumns.map((column) =>
                renderBar(
                  totalRow,
                  column.key,
                  'initiatives',
                  comparisonSnapshot?.stageGate.metrics[column.key].initiatives
                )
              )}
            </tr>
            <tr className={styles.totalFooter}>
              <th scope="row" className={styles.workstreamCell} />
              <td className={styles.metricLabel}>Recurring impact</td>
              {stageColumns.map((column) =>
                renderBar(
                  totalRow,
                  column.key,
                  'impact',
                  comparisonSnapshot?.stageGate.metrics[column.key].impact
                )
              )}
            </tr>
          </tbody>
        </table>
        {!hasInitiatives && <p className={styles.emptyState}>No initiatives yet. Create the first initiative to populate the pipeline.</p>}
      </div>
    </section>
  );
};
