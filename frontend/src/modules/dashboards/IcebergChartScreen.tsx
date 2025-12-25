import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../../styles/IcebergChartScreen.module.css';
import { useInitiativesState, useWorkstreamsState } from '../../app/state/AppStateContext';
import {
  initiativeStageKeys,
  initiativeStageLabels,
  Initiative,
  InitiativeStageKey
} from '../../shared/types/initiative';

type BucketMode = 'week' | 'month';
type ImpactMode = 'recurring' | 'full';

interface IcebergSettings {
  bucketMode: BucketMode;
  impactMode: ImpactMode;
  workstreamIds: string[];
  periodStart: string;
  periodEnd: string;
}

interface BucketData {
  key: string;
  label: string;
  year: number;
  startDate: Date;
  endDate: Date;
}

interface StageImpact {
  stage: InitiativeStageKey;
  impact: number;
  initiatives: { id: string; name: string; impact: number }[];
}

interface IcebergBucket {
  bucket: BucketData;
  planImpact: number;
  stageImpacts: StageImpact[];
  aboveZeroTotal: number;
  belowZeroTotal: number;
}

const STAGE_COLORS: Record<InitiativeStageKey, string> = {
  l0: '#1e293b',
  l1: '#334155',
  l2: '#475569',
  l3: '#64748b',
  l4: '#f472b6',
  l5: '#ec4899'
};

const PLAN_LINE_COLOR = '#dc2626';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const formatCurrency = (value: number) => currencyFormatter.format(Math.round(value || 0));

const getWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

const getMonthKey = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const getWeekKey = (date: Date): string => {
  const weekStart = getWeekStart(date);
  return `${weekStart.getFullYear()}-W${String(getWeekNumber(weekStart)).padStart(2, '0')}`;
};

const generateBuckets = (
  startDate: Date,
  endDate: Date,
  mode: BucketMode
): BucketData[] => {
  const buckets: BucketData[] = [];
  const current = new Date(startDate);

  if (mode === 'month') {
    current.setDate(1);
    while (current <= endDate) {
      const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      buckets.push({
        key: getMonthKey(current),
        label: current.toLocaleString('en-US', { month: 'short' }),
        year: current.getFullYear(),
        startDate: monthStart,
        endDate: monthEnd
      });
      current.setMonth(current.getMonth() + 1);
    }
  } else {
    const weekStart = getWeekStart(current);
    const cursor = new Date(weekStart);
    while (cursor <= endDate) {
      const weekEnd = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 6);
      buckets.push({
        key: getWeekKey(cursor),
        label: `W${getWeekNumber(cursor)}`,
        year: cursor.getFullYear(),
        startDate: new Date(cursor),
        endDate: weekEnd
      });
      cursor.setDate(cursor.getDate() + 7);
    }
  }

  return buckets;
};

const getInitiativeImpact = (initiative: Initiative, mode: ImpactMode): number => {
  const totals = initiative.totals;
  if (mode === 'recurring') {
    return totals.recurringImpact;
  }
  return (
    totals.recurringBenefits -
    totals.recurringCosts +
    totals.oneoffBenefits -
    totals.oneoffCosts
  );
};

const defaultSettings = (): IcebergSettings => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), 0, 1);
  const endDate = new Date(now.getFullYear(), 11, 31);

  return {
    bucketMode: 'month',
    impactMode: 'recurring',
    workstreamIds: [],
    periodStart: startDate.toISOString().split('T')[0],
    periodEnd: endDate.toISOString().split('T')[0]
  };
};

export const IcebergChartScreen = () => {
  const { list: initiatives, loaded: initiativesLoaded } = useInitiativesState();
  const { list: workstreams } = useWorkstreamsState();
  const [settings, setSettings] = useState<IcebergSettings>(defaultSettings);
  const [workstreamMenuOpen, setWorkstreamMenuOpen] = useState(false);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    rows: { label: string; value: string }[];
  } | null>(null);

  const workstreamFilter = useMemo(() => new Set(settings.workstreamIds), [settings.workstreamIds]);

  const filteredInitiatives = useMemo(
    () =>
      initiatives.filter(
        (item) => workstreamFilter.size === 0 || workstreamFilter.has(item.workstreamId)
      ),
    [initiatives, workstreamFilter]
  );

  const buckets = useMemo(() => {
    const start = new Date(settings.periodStart);
    const end = new Date(settings.periodEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return [];
    }
    return generateBuckets(start, end, settings.bucketMode);
  }, [settings.periodStart, settings.periodEnd, settings.bucketMode]);

  const icebergData = useMemo<IcebergBucket[]>(() => {
    if (!buckets.length) return [];

    const cumulativeByStage: Record<InitiativeStageKey, number> = {
      l0: 0, l1: 0, l2: 0, l3: 0, l4: 0, l5: 0
    };

    const initiativesByStage: Record<InitiativeStageKey, Initiative[]> = {
      l0: [], l1: [], l2: [], l3: [], l4: [], l5: []
    };

    filteredInitiatives.forEach((initiative) => {
      const stage = initiative.activeStage;
      const impact = getInitiativeImpact(initiative, settings.impactMode);
      cumulativeByStage[stage] += impact;
      initiativesByStage[stage].push(initiative);
    });

    let runningPlan = 0;

    return buckets.map((bucket) => {
      const stageImpacts: StageImpact[] = initiativeStageKeys.map((stage) => {
        const stageInitiatives = initiativesByStage[stage];
        const initiatives = stageInitiatives.map((init) => ({
          id: init.id,
          name: init.name,
          impact: getInitiativeImpact(init, settings.impactMode)
        }));
        const totalImpact = initiatives.reduce((sum, i) => sum + i.impact, 0);
        return {
          stage,
          impact: totalImpact,
          initiatives
        };
      });

      const aboveZeroTotal = stageImpacts
        .filter((s) => s.stage === 'l4' || s.stage === 'l5')
        .reduce((sum, s) => sum + s.impact, 0);

      const belowZeroTotal = stageImpacts
        .filter((s) => s.stage !== 'l4' && s.stage !== 'l5')
        .reduce((sum, s) => sum + s.impact, 0);

      const totalPlanImpact = stageImpacts.reduce((sum, s) => sum + s.impact, 0);
      runningPlan = totalPlanImpact;

      return {
        bucket,
        planImpact: runningPlan,
        stageImpacts,
        aboveZeroTotal,
        belowZeroTotal
      };
    });
  }, [buckets, filteredInitiatives, settings.impactMode]);

  const chartDimensions = useMemo(() => {
    const paddingLeft = 80;
    const paddingRight = 40;
    const paddingTop = 40;
    const paddingBottom = 60;
    const barWidth = settings.bucketMode === 'month' ? 40 : 24;
    const barGap = settings.bucketMode === 'month' ? 12 : 8;
    const chartWidth = paddingLeft + paddingRight + buckets.length * (barWidth + barGap);
    const chartHeight = 400;
    const plotWidth = chartWidth - paddingLeft - paddingRight;
    const plotHeight = chartHeight - paddingTop - paddingBottom;

    return {
      width: chartWidth,
      height: chartHeight,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      plotWidth,
      plotHeight,
      barWidth,
      barGap
    };
  }, [buckets.length, settings.bucketMode]);

  const scales = useMemo(() => {
    if (!icebergData.length) {
      return {
        maxAbove: 100000,
        maxBelow: 100000,
        totalRange: 200000,
        aboveShare: 0.5,
        belowShare: 0.5,
        yScale: 1
      };
    }

    const maxAbove = Math.max(
      1,
      ...icebergData.map((d) => d.aboveZeroTotal),
      ...icebergData.map((d) => d.planImpact > 0 ? d.planImpact : 0)
    );
    const maxBelow = Math.max(
      1,
      ...icebergData.map((d) => d.belowZeroTotal)
    );

    const totalRange = maxAbove + maxBelow;
    const aboveShare = maxAbove / totalRange;
    const belowShare = maxBelow / totalRange;

    return {
      maxAbove,
      maxBelow,
      totalRange,
      aboveShare,
      belowShare,
      yScale: chartDimensions.plotHeight / totalRange
    };
  }, [icebergData, chartDimensions.plotHeight]);

  const zeroLineY = useMemo(() => {
    return chartDimensions.paddingTop + (scales.aboveShare || 0.5) * chartDimensions.plotHeight;
  }, [chartDimensions, scales.aboveShare]);

  const getBarX = useCallback((index: number) => {
    return (
      chartDimensions.paddingLeft +
      index * (chartDimensions.barWidth + chartDimensions.barGap) +
      chartDimensions.barGap / 2
    );
  }, [chartDimensions]);

  const handleBarHover = useCallback(
    (event: React.MouseEvent, bucketData: IcebergBucket, stage: InitiativeStageKey) => {
      const stageImpact = bucketData.stageImpacts.find((s) => s.stage === stage);
      if (!stageImpact) return;

      const rows = [
        { label: 'Stage', value: initiativeStageLabels[stage] },
        { label: 'Impact', value: formatCurrency(stageImpact.impact) },
        { label: 'Initiatives', value: String(stageImpact.initiatives.length) }
      ];

      setTooltip({
        x: event.clientX + 10,
        y: event.clientY - 10,
        title: bucketData.bucket.label + ' ' + bucketData.bucket.year,
        rows
      });
    },
    []
  );

  const handleLineHover = useCallback(
    (event: React.MouseEvent, bucketData: IcebergBucket) => {
      const rows = [
        { label: 'Plan impact', value: formatCurrency(bucketData.planImpact) },
        { label: 'Above zero (L4-L5)', value: formatCurrency(bucketData.aboveZeroTotal) },
        { label: 'Below zero (L0-L3)', value: formatCurrency(bucketData.belowZeroTotal) }
      ];

      setTooltip({
        x: event.clientX + 10,
        y: event.clientY - 10,
        title: bucketData.bucket.label + ' ' + bucketData.bucket.year,
        rows
      });
    },
    []
  );

  const clearTooltip = useCallback(() => setTooltip(null), []);

  const toggleWorkstream = (id: string) => {
    setSettings((prev) => {
      const next = prev.workstreamIds.includes(id)
        ? prev.workstreamIds.filter((entry) => entry !== id)
        : [...prev.workstreamIds, id];
      return { ...prev, workstreamIds: next };
    });
  };

  const renderBars = () => {
    return icebergData.map((data, index) => {
      const barX = getBarX(index);
      const elements: JSX.Element[] = [];

      const aboveStages: InitiativeStageKey[] = ['l4', 'l5'];
      const belowStages: InitiativeStageKey[] = ['l0', 'l1', 'l2', 'l3'];

      let aboveOffset = 0;
      aboveStages.forEach((stage) => {
        const stageImpact = data.stageImpacts.find((s) => s.stage === stage);
        if (!stageImpact || stageImpact.impact <= 0) return;

        const barHeight = (stageImpact.impact / scales.totalRange) * chartDimensions.plotHeight;
        const y = zeroLineY - aboveOffset - barHeight;

        elements.push(
          <rect
            key={`${data.bucket.key}-${stage}`}
            x={barX}
            y={y}
            width={chartDimensions.barWidth}
            height={barHeight}
            fill={STAGE_COLORS[stage]}
            className={styles.barSegment}
            onMouseEnter={(e) => handleBarHover(e, data, stage)}
            onMouseMove={(e) => handleBarHover(e, data, stage)}
            onMouseLeave={clearTooltip}
            rx={2}
          />
        );

        aboveOffset += barHeight;
      });

      let belowOffset = 0;
      belowStages.forEach((stage) => {
        const stageImpact = data.stageImpacts.find((s) => s.stage === stage);
        if (!stageImpact || stageImpact.impact <= 0) return;

        const barHeight = (stageImpact.impact / scales.totalRange) * chartDimensions.plotHeight;
        const y = zeroLineY + belowOffset;

        elements.push(
          <rect
            key={`${data.bucket.key}-${stage}`}
            x={barX}
            y={y}
            width={chartDimensions.barWidth}
            height={barHeight}
            fill={STAGE_COLORS[stage]}
            className={styles.barSegment}
            onMouseEnter={(e) => handleBarHover(e, data, stage)}
            onMouseMove={(e) => handleBarHover(e, data, stage)}
            onMouseLeave={clearTooltip}
            rx={2}
          />
        );

        belowOffset += barHeight;
      });

      return elements;
    });
  };

  const renderPlanLine = () => {
    if (!icebergData.length) return null;

    const points = icebergData.map((data, index) => {
      const x = getBarX(index) + chartDimensions.barWidth / 2;
      const planY = data.planImpact >= 0
        ? zeroLineY - (data.planImpact / scales.totalRange) * chartDimensions.plotHeight
        : zeroLineY + (Math.abs(data.planImpact) / scales.totalRange) * chartDimensions.plotHeight;
      return { x, y: planY, data };
    });

    const pathD = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');

    return (
      <g>
        <path
          d={pathD}
          stroke={PLAN_LINE_COLOR}
          className={styles.planLine}
          fill="none"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={5}
            fill="#fff"
            stroke={PLAN_LINE_COLOR}
            strokeWidth={2}
            className={styles.planLineDot}
            onMouseEnter={(e) => handleLineHover(e, p.data)}
            onMouseMove={(e) => handleLineHover(e, p.data)}
            onMouseLeave={clearTooltip}
            style={{ cursor: 'pointer' }}
          />
        ))}
      </g>
    );
  };

  const renderYAxis = () => {
    const ticks: number[] = [];
    const step = Math.pow(10, Math.floor(Math.log10(scales.totalRange / 4)));
    const adjustedStep = step * Math.ceil((scales.totalRange / 4) / step);

    for (let v = 0; v <= scales.maxAbove; v += adjustedStep) {
      ticks.push(v);
    }
    for (let v = -adjustedStep; v >= -scales.maxBelow; v -= adjustedStep) {
      ticks.push(v);
    }

    return ticks.map((value) => {
      const y = value >= 0
        ? zeroLineY - (value / scales.totalRange) * chartDimensions.plotHeight
        : zeroLineY + (Math.abs(value) / scales.totalRange) * chartDimensions.plotHeight;

      if (y < chartDimensions.paddingTop - 10 || y > chartDimensions.height - chartDimensions.paddingBottom + 10) {
        return null;
      }

      return (
        <g key={value}>
          <line
            x1={chartDimensions.paddingLeft - 5}
            y1={y}
            x2={chartDimensions.paddingLeft}
            y2={y}
            stroke="#94a3b8"
            strokeWidth={1}
          />
          <text
            x={chartDimensions.paddingLeft - 10}
            y={y + 4}
            textAnchor="end"
            className={styles.axisLabel}
          >
            {formatCurrency(value)}
          </text>
        </g>
      );
    });
  };

  const renderXAxis = () => {
    let lastYear: number | null = null;

    return icebergData.map((data, index) => {
      const x = getBarX(index) + chartDimensions.barWidth / 2;
      const y = chartDimensions.height - chartDimensions.paddingBottom + 20;
      const showYear = lastYear !== data.bucket.year;
      lastYear = data.bucket.year;

      return (
        <g key={data.bucket.key}>
          <text
            x={x}
            y={y}
            textAnchor="middle"
            className={styles.axisLabel}
          >
            {data.bucket.label}
          </text>
          {showYear && (
            <text
              x={x}
              y={y + 14}
              textAnchor="middle"
              className={styles.axisLabelYear}
            >
              {data.bucket.year}
            </text>
          )}
        </g>
      );
    });
  };

  if (!initiativesLoaded) {
    return (
      <section className={styles.screen}>
        <div className={styles.placeholder}>Loading initiatives...</div>
      </section>
    );
  }

  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <div>
          <h1>Iceberg Chart</h1>
          <p>
            Track how initiative impact &quot;surfaces&quot; as projects progress through stage gates.
            L0-L3 stages appear below the waterline, L4-L5 stages appear above.
          </p>
          <div className={styles.metaRow}>
            <span className={styles.metaBadge}>{filteredInitiatives.length} initiatives</span>
            <span className={styles.metaBadge}>{buckets.length} periods</span>
          </div>
        </div>
      </header>

      <div className={`${styles.controls} ${styles.filtersRow}`}>
        <div className={styles.segmentedControl}>
          <span className={styles.segmentedLabel}>Period</span>
          <div className={styles.segmentedGroup}>
            <button
              type="button"
              className={`${styles.segmentedButton} ${
                settings.bucketMode === 'week' ? styles.segmentedButtonActive : ''
              }`}
              onClick={() => setSettings((prev) => ({ ...prev, bucketMode: 'week' }))}
            >
              Weeks
            </button>
            <button
              type="button"
              className={`${styles.segmentedButton} ${
                settings.bucketMode === 'month' ? styles.segmentedButtonActive : ''
              }`}
              onClick={() => setSettings((prev) => ({ ...prev, bucketMode: 'month' }))}
            >
              Months
            </button>
          </div>
        </div>

        <div className={styles.segmentedControl}>
          <span className={styles.segmentedLabel}>Impact</span>
          <div className={styles.segmentedGroup}>
            <button
              type="button"
              className={`${styles.segmentedButton} ${
                settings.impactMode === 'recurring' ? styles.segmentedButtonActive : ''
              }`}
              onClick={() => setSettings((prev) => ({ ...prev, impactMode: 'recurring' }))}
            >
              Recurring
            </button>
            <button
              type="button"
              className={`${styles.segmentedButton} ${
                settings.impactMode === 'full' ? styles.segmentedButtonActive : ''
              }`}
              onClick={() => setSettings((prev) => ({ ...prev, impactMode: 'full' }))}
            >
              Full
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
          <span className={styles.controlLabel}>Start date</span>
          <input
            type="date"
            value={settings.periodStart}
            onChange={(e) => setSettings((prev) => ({ ...prev, periodStart: e.target.value }))}
          />
        </div>

        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>End date</span>
          <input
            type="date"
            value={settings.periodEnd}
            onChange={(e) => setSettings((prev) => ({ ...prev, periodEnd: e.target.value }))}
          />
        </div>
      </div>

      {!buckets.length && (
        <div className={styles.placeholder}>
          <p>Select a valid date range to display the chart.</p>
        </div>
      )}

      {buckets.length > 0 && (
        <div className={styles.chartContainer}>
          <h3 className={styles.chartTitle}>
            Cumulative Impact by Stage Gate
          </h3>
          <div className={styles.chartWrapper} style={{ minWidth: chartDimensions.width }}>
            <svg
              className={styles.chartSvg}
              viewBox={`0 0 ${chartDimensions.width} ${chartDimensions.height}`}
              preserveAspectRatio="xMinYMid meet"
              style={{ width: chartDimensions.width, height: chartDimensions.height }}
            >
              <line
                x1={chartDimensions.paddingLeft}
                y1={zeroLineY}
                x2={chartDimensions.width - chartDimensions.paddingRight}
                y2={zeroLineY}
                className={styles.zeroLine}
              />

              <text
                x={chartDimensions.paddingLeft - 10}
                y={zeroLineY - 10}
                textAnchor="end"
                className={styles.stageLabel}
                fill="#ec4899"
              >
                L4-L5
              </text>
              <text
                x={chartDimensions.paddingLeft - 10}
                y={zeroLineY + 20}
                textAnchor="end"
                className={styles.stageLabel}
                fill="#475569"
              >
                L1-L3
              </text>

              {renderYAxis()}
              {renderXAxis()}
              {renderBars()}
              {renderPlanLine()}
            </svg>
          </div>

          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <div className={styles.legendLine} style={{ background: PLAN_LINE_COLOR }} />
              <span>Planned impact ({settings.impactMode === 'recurring' ? 'recurring' : 'full'})</span>
            </div>
            {initiativeStageKeys.map((stage) => (
              <div key={stage} className={styles.legendItem}>
                <div className={styles.legendDot} style={{ background: STAGE_COLORS[stage] }} />
                <span>{initiativeStageLabels[stage]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tooltip && (
        <div
          className={styles.tooltip}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className={styles.tooltipTitle}>{tooltip.title}</div>
          {tooltip.rows.map((row, i) => (
            <div key={i} className={styles.tooltipRow}>
              <span className={styles.tooltipLabel}>{row.label}:</span>
              <span className={styles.tooltipValue}>{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
