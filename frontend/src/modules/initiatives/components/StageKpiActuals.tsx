import React, { Fragment, useMemo, useState } from 'react';
import kpiStyles from '../../../styles/StageKpiEditor.module.css';
import chartStyles from '../../../styles/FinancialEditor.module.css';
import { InitiativeStageData, InitiativeStageKPI } from '../../../shared/types/initiative';
import { buildMonthRange } from './financials.helpers';
import { PlanVsActualChart, ChartMonthStack, ChartSegment } from './FinancialEditor';
import { createCommentAnchor } from '../comments/commentAnchors';

interface StageKpiActualsProps {
  stage: InitiativeStageData;
  disabled: boolean;
  onChange: (next: InitiativeStageData) => void;
  commentScope?: string;
}

const monthColumnWidth = 96;
const kpiNumberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const formatNumber = (value: number | null | undefined) =>
  Number.isFinite(value) ? String(value) : '';

const clampNumber = (value: string) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const ensureMonthKeys = (kpi: InitiativeStageKPI, monthKeys: string[]): InitiativeStageKPI => {
  const distribution = { ...(kpi.distribution ?? {}) };
  monthKeys.forEach((key) => {
    if (distribution[key] === undefined) {
      distribution[key] = 0;
    }
  });
  return {
    ...kpi,
    distribution,
    actuals: { ...(kpi.actuals ?? {}) }
  };
};

const KPI_COLORS = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#a855f7', '#f97316', '#e11d48', '#22c55e'];

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

const buildKpiColorMap = (kpis: InitiativeStageKPI[]) => {
  const map: Record<string, string> = {};
  kpis.forEach((kpi, index) => {
    map[kpi.id] = KPI_COLORS[index % KPI_COLORS.length];
  });
  return map;
};

const buildActualColorMap = (planMap: Record<string, string>) =>
  Object.entries(planMap).reduce((acc, [key, color]) => {
    acc[key] = shadeColor(color, 0.2);
    return acc;
  }, {} as Record<string, string>);

const buildKpiChartStacks = (
  months: { key: string; label: string; year: number }[],
  kpi: InitiativeStageKPI,
  planColor: string,
  selector: (kpi: InitiativeStageKPI) => Record<string, number>
): ChartMonthStack[] =>
  months.map((month) => {
    const positiveSegments: ChartSegment[] = [];
    const negativeSegments: ChartSegment[] = [];
    const source = selector(kpi) ?? {};
    const raw = source[month.key] ?? 0;
    if (raw) {
      const target = raw >= 0 ? positiveSegments : negativeSegments;
      target.push({
        value: Math.abs(raw),
        rawValue: raw,
        color: planColor,
        label: `${kpi.name || 'KPI'} (${month.label} ${month.year})`
      });
    }
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

export const StageKpiActuals = ({ stage, disabled, onChange, commentScope }: StageKpiActualsProps) => {
  const months = useMemo(() => buildMonthRange(stage), [stage]);
  const monthKeys = useMemo(() => months.map((m) => m.key), [months]);
  const scopedKpis = useMemo(
    () => (stage.kpis ?? []).map((kpi) => ensureMonthKeys(kpi, monthKeys)),
    [stage.kpis, monthKeys]
  );
  const scopeKey = commentScope ?? stage.key ?? 'stage';
  const showEmptyState = scopedKpis.length === 0;
  const columnTemplate = useMemo(() => {
    const metaTemplate = `minmax(200px, 1.1fr) minmax(110px, 0.7fr) minmax(130px, 0.8fr) minmax(110px, 0.7fr)`;
    const monthTemplate = `repeat(${Math.max(months.length, 1)}, ${monthColumnWidth}px)`;
    const actionsWidth = `120px`;
    return `${metaTemplate} ${monthTemplate} ${actionsWidth}`;
  }, [months.length]);
  const chartTemplate = useMemo(
    () => `550px repeat(${Math.max(months.length, 1)}, ${monthColumnWidth}px)`,
    [months.length]
  );
  const [showPlanAsLine, setShowPlanAsLine] = useState(false);

  const kpiColorMap = useMemo(() => buildKpiColorMap(scopedKpis), [scopedKpis]);
  const actualColorMap = useMemo(() => buildActualColorMap(kpiColorMap), [kpiColorMap]);

  const updateKpis = (updater: (list: InitiativeStageKPI[]) => InitiativeStageKPI[]) => {
    onChange({ ...stage, kpis: updater(stage.kpis ?? []) });
  };

  const handleActualChange = (id: string, key: string, value: string) => {
    const numeric = Number(value);
    updateKpis((list) =>
      list.map((kpi) => {
        if (kpi.id !== id) {
          return kpi;
        }
        const actuals = { ...(kpi.actuals ?? {}) };
        if (value === '') {
          delete actuals[key];
        } else if (Number.isFinite(numeric)) {
          actuals[key] = numeric;
        }
        return { ...kpi, actuals };
      })
    );
  };

  const handleFillRight = (id: string, key: string) => {
    const startIndex = monthKeys.indexOf(key);
    if (startIndex === -1) {
      return;
    }
    updateKpis((list) =>
      list.map((kpi) => {
        if (kpi.id !== id) {
          return kpi;
        }
        const actuals = { ...(kpi.actuals ?? {}) };
        const value = actuals[key];
        if (value === undefined) {
          return kpi;
        }
        const nextActuals = { ...actuals };
        for (let index = startIndex + 1; index < monthKeys.length; index += 1) {
          nextActuals[monthKeys[index]] = value;
        }
        return { ...kpi, actuals: nextActuals };
      })
    );
  };

  return (
    <section
      className={chartStyles.financialBoard}
      {...createCommentAnchor(`kpi.${scopeKey}.actuals`, 'KPI actuals block')}
    >
      <header className={chartStyles.financialHeading}>
        <div>
          <h3>KPI actuals</h3>
          <p>Mirror KPI plans and record realised values side-by-side.</p>
        </div>
        <div className={chartStyles.actualsToggles}>
          <label className={chartStyles.oneOffToggle} {...createCommentAnchor(`kpi.${scopeKey}.actuals.toggle`, 'Toggle KPI plan line view')}>
            <input
              type="checkbox"
              checked={showPlanAsLine}
              onChange={(event) => setShowPlanAsLine(event.target.checked)}
            />
            <span>Show plan as line</span>
          </label>
        </div>
      </header>

      <p className={chartStyles.actualsLead}>
        Plan values are pulled from the KPI table and locked. Enter actuals on the rows beneath each KPI to compare month
        by month.
      </p>

      <div className={chartStyles.sheetWrapper}>
        <div className={chartStyles.sheetScroller}>
          <div className={kpiStyles.headerRow} style={{ gridTemplateColumns: columnTemplate }}>
            <div className={kpiStyles.headerCell}>KPI</div>
            <div className={kpiStyles.headerCell}>Unit</div>
            <div className={kpiStyles.headerCell}>Source</div>
            <div className={kpiStyles.headerCell}>Baseline</div>
            {months.map((month) => (
              <div key={`head-${month.key}`} className={`${kpiStyles.headerCell} ${kpiStyles.monthHeader}`}>
                {month.label} {month.year}
              </div>
            ))}
            <div className={kpiStyles.headerCell}>Actuals</div>
          </div>

          {showEmptyState ? (
            <p className={chartStyles.placeholder}>
              No KPIs yet. Add plan KPIs above to start capturing actuals.
            </p>
          ) : (
            scopedKpis.map((kpi) => {
              const actuals = { ...(kpi.actuals ?? {}) };
              const planChartData = buildKpiChartStacks(
                months,
                kpi,
                kpiColorMap[kpi.id],
                (target) => target.distribution ?? {}
              );
              const actualChartData = buildKpiChartStacks(
                months,
                kpi,
                actualColorMap[kpi.id],
                (target) => target.actuals ?? {}
              );
              return (
                <Fragment key={kpi.id}>
                  <PlanVsActualChart
                    months={months}
                    gridTemplateColumns={chartTemplate}
                    planData={planChartData}
                    actualData={actualChartData}
                    showPlanAsLine={showPlanAsLine}
                    planLineMode="impact"
                    anchorScope={`kpi.${scopeKey}.actuals.chart.${kpi.id}`}
                    legendLabel={`Plan vs actuals · ${kpi.name || 'KPI'}`}
                    formatValue={(value) => kpiNumberFormatter.format(value)}
                  />

                  <div
                    className={`${kpiStyles.row} ${kpiStyles.planRow}`}
                    style={{ gridTemplateColumns: columnTemplate }}
                    {...createCommentAnchor(`kpi.${scopeKey}.actuals.plan.${kpi.id}`, kpi.name || 'KPI plan')}
                  >
                    <div className={kpiStyles.colName}>
                      <div className={kpiStyles.rowTitle}>
                        <span>{kpi.name || 'KPI'}</span>
                        <span className={chartStyles.rowTag}>Plan</span>
                      </div>
                      <p className={kpiStyles.rowMeta}>Manage plan values in the KPI block above.</p>
                    </div>
                    <div className={kpiStyles.colUnit}>
                      <input type="text" value={kpi.unit} disabled readOnly />
                    </div>
                    <div className={kpiStyles.colSource}>
                      <input type="text" value={kpi.source} disabled readOnly />
                    </div>
                    <div className={kpiStyles.colBaseline}>
                      <input type="number" value={formatNumber(kpi.baseline)} disabled readOnly />
                    </div>
                    {months.map((month) => (
                      <div key={`${kpi.id}-${month.key}-plan`} className={kpiStyles.colMonth}>
                        <div className={kpiStyles.monthInputs} style={{ gridTemplateColumns: '1fr' }}>
                          <input type="number" value={formatNumber(kpi.distribution[month.key])} disabled readOnly />
                        </div>
                      </div>
                    ))}
                    <div className={kpiStyles.colActions}>
                      <span className={kpiStyles.lockTag}>Locked</span>
                    </div>
                  </div>

                  <div
                    className={`${kpiStyles.row} ${kpiStyles.actualRow}`}
                    style={{ gridTemplateColumns: columnTemplate }}
                    {...createCommentAnchor(`kpi.${scopeKey}.actuals.entry.${kpi.id}`, `${kpi.name || 'KPI'} actuals`)}
                  >
                    <div className={kpiStyles.colName}>
                      <div className={kpiStyles.rowTitle}>
                        <span>Actuals</span>
                        <span className={`${chartStyles.rowTag} ${chartStyles.actualTag}`}>Input</span>
                      </div>
                      <p className={kpiStyles.rowMeta}>{kpi.name || 'KPI'} - {kpi.unit || 'Unitless'}</p>
                    </div>
                    <div className={kpiStyles.colUnit}>
                      <input type="text" value={kpi.unit} disabled readOnly />
                    </div>
                    <div className={kpiStyles.colSource}>
                      <input type="text" value={kpi.source} disabled readOnly />
                    </div>
                    <div className={kpiStyles.colBaseline}>
                      <input type="number" value={formatNumber(kpi.baseline)} disabled readOnly />
                    </div>
                    {months.map((month) => (
                      <div key={`${kpi.id}-${month.key}-actual`} className={kpiStyles.colMonth}>
                        <div className={kpiStyles.monthInputs}>
                          <input
                            type="number"
                            value={formatNumber(actuals[month.key])}
                            disabled={disabled}
                            onChange={(event) => handleActualChange(kpi.id, month.key, event.target.value)}
                          />
                          <button
                            type="button"
                            className={kpiStyles.fillRightButton}
                            onClick={() => handleFillRight(kpi.id, month.key)}
                            disabled={disabled || actuals[month.key] === undefined}
                            title="Fill to the right"
                          >
                            {'>>'}
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className={kpiStyles.colActions}>
                      <span className={kpiStyles.lockTag}>Record</span>
                    </div>
                  </div>
                </Fragment>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
};
