import React, { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import styles from '../../../styles/FinancialEditor.module.css';
import {
  InitiativeBusinessCaseFile,
  InitiativeFinancialEntry,
  InitiativeStageData,
  InitiativeFinancialKind,
  initiativeFinancialKinds
} from '../../../shared/types/initiative';
import { generateId } from '../../../shared/ui/generateId';
import {
  buildKindActualMonthlyTotals,
  buildKindMonthlyTotals,
  buildMonthRange,
  calculateRunRate,
  calculateYearSummaries,
  YearSummaryEntry
} from './financials.helpers';
import { createCommentAnchor, CommentAnchorAttributes } from '../comments/commentAnchors';
import { useFinancialsState, usePlanSettingsState } from '../../../app/state/AppStateContext';
import { DEFAULT_FISCAL_YEAR_START_MONTH } from '../../../shared/config/finance';
import { convertFilesToRecords } from '../../cases/services/fileAdapter';

interface FinancialEditorProps {
  stage: InitiativeStageData;
  disabled: boolean;
  onChange: (nextStage: InitiativeStageData) => void;
  commentScope?: string;
}

const SECTION_LABELS: Record<InitiativeFinancialKind, string> = {
  'recurring-benefits': 'Recurring benefits',
  'recurring-costs': 'Recurring costs',
  'oneoff-benefits': 'One-off benefits',
  'oneoff-costs': 'One-off costs'
};

const benefitKinds: InitiativeFinancialKind[] = ['recurring-benefits', 'oneoff-benefits'];
const costKinds: InitiativeFinancialKind[] = ['recurring-costs', 'oneoff-costs'];

const logicOrder: InitiativeFinancialKind[] = [
  'recurring-costs',
  'recurring-benefits',
  'oneoff-costs',
  'oneoff-benefits'
];

const logicLabels: Record<InitiativeFinancialKind, string> = {
  'recurring-benefits': 'Recurring benefits logic',
  'recurring-costs': 'Recurring costs logic',
  'oneoff-benefits': 'One-off benefits logic',
  'oneoff-costs': 'One-off costs logic'
};

const SECTION_COLORS: Record<InitiativeFinancialKind, string> = {
  'recurring-benefits': '#1d4ed8',
  'oneoff-benefits': '#3b82f6',
  'recurring-costs': '#ef4444',
  'oneoff-costs': '#f97316'
};

const CATEGORY_COLUMN_WIDTH = 200;

const buildEntryColorMap = (stage: InitiativeStageData) => {
  const map: Record<string, string> = {};
  const buildPalette = (groups: InitiativeFinancialKind[], lighten: boolean) => {
    groups.forEach((kind) => {
      const entries = stage.financials[kind];
      if (!entries.length) {
        return;
      }
      const range = 0.85;
      entries.forEach((entry, index) => {
        const ratio = entries.length === 1 ? 0.5 : index / (entries.length - 1);
        const offset = lighten ? 0.2 + ratio * range : -(0.2 + ratio * range);
        map[entry.id] = shadeColor(SECTION_COLORS[kind], offset);
      });
    });
  };
  buildPalette(benefitKinds, true);
  buildPalette(costKinds, false);
  return map;
};

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

const fiscalMonthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const clampMonth = (value: number) => Math.min(12, Math.max(1, Math.floor(value || 1)));

const formatFiscalWindow = (startMonth: number) => {
  const safeStart = clampMonth(startMonth);
  const endMonth = ((safeStart + 10) % 12) + 1;
  return `${fiscalMonthLabels[safeStart - 1]} - ${fiscalMonthLabels[endMonth - 1]}`;
};

type MonthDescriptor = { key: string; label: string; year: number; index: number };

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const formatCurrency = (value: number) => currencyFormatter.format(Math.round(value || 0));

const SummaryList = ({
  title,
  items,
  anchorAttributes
}: {
  title: string;
  items: YearSummaryEntry[];
  anchorAttributes?: CommentAnchorAttributes;
}) => {
  if (!items.length) {
    return null;
  }
  return (
    <div className={styles.summaryList} {...anchorAttributes}>
      <span className={styles.summaryListTitle}>{title}</span>
      <ul>
        {items.map((item) => (
          <li key={item.label}>
            <span>{item.label}</span>
            <strong>{formatCurrency(item.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
};

export interface ChartSegment {
  value: number;
  color: string;
  label: string;
  rawValue: number;
  kind?: 'base' | 'initiatives' | 'other';
}

export interface ChartMonthStack {
  key: string;
  positiveSegments: ChartSegment[];
  negativeSegments: ChartSegment[];
  positiveTotal: number;
  negativeTotal: number;
}

const buildChartStacks = (
  months: MonthDescriptor[],
  stage: InitiativeStageData,
  activeKindSet: Set<InitiativeFinancialKind>,
  entryColorLookup: Record<string, string>,
  valueSelector: (entry: InitiativeFinancialEntry) => Record<string, number>
): ChartMonthStack[] =>
  months.map((month) => {
    const positiveSegments: ChartSegment[] = [];
    const negativeSegments: ChartSegment[] = [];
    for (const kind of initiativeFinancialKinds) {
      if (!activeKindSet.has(kind)) {
        continue;
      }
      const isCost = costKinds.includes(kind);
      for (const entry of stage.financials[kind]) {
        const distribution = valueSelector(entry) ?? {};
        const raw = distribution[month.key] ?? 0;
        if (!raw) {
          continue;
        }
        const oriented = raw * (isCost ? -1 : 1);
        const target = oriented >= 0 ? positiveSegments : negativeSegments;
        target.push({
          value: Math.abs(oriented),
          color: entryColorLookup[entry.id] ?? SECTION_COLORS[kind],
          label: entry.label || 'Line item',
          rawValue: oriented
        });
      }
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

export const CombinedChart = ({
  months,
  gridTemplateColumns,
  data,
  anchorScope,
  showPeriodLabels,
  periodLabelFormatter
}: {
  months: MonthDescriptor[];
  gridTemplateColumns: string;
  data: ChartMonthStack[];
  anchorScope?: string;
  showPeriodLabels?: boolean;
  periodLabelFormatter?: (month: MonthDescriptor) => string;
}) => {
  const maxPositive = Math.max(0, ...data.map((stat) => stat.positiveTotal));
  const maxNegative = Math.max(0, ...data.map((stat) => stat.negativeTotal));
  const totalSpan = maxPositive + maxNegative || 1;
  const hasData = maxPositive > 0 || maxNegative > 0;
  const positiveShare = hasData ? maxPositive / totalSpan : 0.5;
  const negativeShare = hasData ? maxNegative / totalSpan : 0.5;
  const positiveScale = maxPositive || 1;
  const negativeScale = maxNegative || 1;
  const stackTopOffset = (positiveShare: number, ratio: number) => positiveShare * (1 - ratio);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [tooltip, setTooltip] = useState<{
    label: string;
    value: number;
    left: number;
    top: number;
  } | null>(null);

  const handleSegmentHover = (
    event: React.MouseEvent<HTMLDivElement>,
    segment: ChartSegment,
    position: 'positive' | 'negative'
  ) => {
    const container = chartRef.current;
    if (!container) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const segmentRect = event.currentTarget.getBoundingClientRect();
    const left = segmentRect.left + segmentRect.width / 2 - containerRect.left;
    const top =
      position === 'positive'
        ? segmentRect.top - containerRect.top - 8
        : segmentRect.bottom - containerRect.top + 8;
    setTooltip({ label: segment.label, value: segment.rawValue, left, top });
  };

  const clearTooltip = () => setTooltip(null);

  return (
    <div className={styles.chartRow} style={{ gridTemplateColumns }} ref={chartRef}>
      <div className={styles.chartLegend}>Trend</div>
      {months.map((month, index) => {
        const stat = data[index] ?? {
          key: month.key,
          positiveSegments: [],
          negativeSegments: [],
          positiveTotal: 0,
          negativeTotal: 0
        };
        const positiveRatio = positiveScale ? Math.min(1, stat.positiveTotal / positiveScale) : 0;
        const negativeRatio = negativeScale ? Math.min(1, stat.negativeTotal / negativeScale) : 0;
        const positiveLabelTop = stackTopOffset(positiveShare, positiveRatio) * 100;
        const negativeLabelTop =
          positiveShare * 100 + negativeRatio * negativeShare * 100;
        const chartAnchor = createCommentAnchor(
          `${anchorScope ?? 'financial-chart'}.${month.key}`,
          `${month.label} ${month.year} totals`
        );
        const periodLabel = periodLabelFormatter ? periodLabelFormatter(month) : `${month.label} ${month.year}`;
        return (
          <div key={month.key} className={styles.chartCell} {...chartAnchor}>
            <div className={styles.chartBarGroup}>
              {stat.positiveTotal > 0 && (
                <span
                  className={`${styles.chartValue} ${styles.chartValuePositive}`}
                  style={{ top: `calc(${positiveLabelTop}% - 26px)` }}
                >
                  {formatCurrency(stat.positiveTotal)}
                </span>
              )}
              {stat.negativeTotal > 0 && (
                <span
                  className={`${styles.chartValue} ${styles.chartValueNegative}`}
                  style={{ top: `calc(${negativeLabelTop}% + 18px)` }}
                >
                  {formatCurrency(stat.negativeTotal)}
                </span>
              )}
              <div className={styles.stackWrapper}>
                <div className={styles.stackPositive} style={{ height: `${positiveShare * 100}%` }}>
                  <div className={`${styles.stackFill} ${styles.stackFillPositive}`}>
                    {stat.positiveSegments.map((segment, segmentIndex) => {
                      const height = (segment.value / positiveScale) * 100;
                      return (
                        <div
                          key={`${month.key}-pos-${segmentIndex}`}
                          className={styles.chartSegment}
                          style={{ height: `${height}%`, background: segment.color }}
                          onMouseEnter={(event) => handleSegmentHover(event, segment, 'positive')}
                          onMouseMove={(event) => handleSegmentHover(event, segment, 'positive')}
                          onMouseLeave={clearTooltip}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className={styles.stackNegative} style={{ height: `${negativeShare * 100}%` }}>
                  <div className={`${styles.stackFill} ${styles.stackFillNegative}`}>
                    {stat.negativeSegments.map((segment, segmentIndex) => {
                      const height = (segment.value / negativeScale) * 100;
                      return (
                        <div
                          key={`${month.key}-neg-${segmentIndex}`}
                          className={styles.chartSegment}
                          style={{ height: `${height}%`, background: segment.color }}
                          onMouseEnter={(event) => handleSegmentHover(event, segment, 'negative')}
                          onMouseMove={(event) => handleSegmentHover(event, segment, 'negative')}
                          onMouseLeave={clearTooltip}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className={styles.chartZeroLine} style={{ top: `${positiveShare * 100}%` }} />
            </div>
            {showPeriodLabels && <div className={styles.chartPeriodLabel}>{periodLabel}</div>}
          </div>
        );
      })}
      {tooltip && (
        <div
          className={styles.chartTooltip}
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          <strong>{tooltip.label || 'Line item'}</strong>
          <span>{formatCurrency(Math.abs(tooltip.value))}</span>
          <span className={styles.tooltipTag}>{tooltip.value >= 0 ? 'Benefit' : 'Cost'}</span>
        </div>
      )}
    </div>
  );
};

interface BlueprintLineOption {
  code: string;
  name: string;
}

interface EntryRowProps {
  entry: InitiativeFinancialEntry;
  disabled: boolean;
  months: MonthDescriptor[];
  gridTemplateColumns: string;
  onChange: (entry: InitiativeFinancialEntry) => void;
  onRemove: () => void;
  onLineLinkChange: (lineCode: string) => void;
  lineOptions: BlueprintLineOption[];
  blueprintLoading: boolean;
  anchorAttributes?: CommentAnchorAttributes;
}

const EntryRow = ({
  entry,
  disabled,
  months,
  gridTemplateColumns,
  onChange,
  onRemove,
  onLineLinkChange,
  lineOptions,
  blueprintLoading,
  anchorAttributes
}: EntryRowProps) => {
  const [monthlyValue, setMonthlyValue] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [duration, setDuration] = useState(months.length || 1);
  const [startMonth, setStartMonth] = useState(months[0]?.key ?? '');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setStartMonth((current) => (months.find((month) => month.key === current) ? current : months[0]?.key ?? ''));
    setDuration((current) => Math.min(current, months.length || 1));
  }, [months]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && event.target instanceof Node && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fillAllMonths = () => {
    const amount = Number(monthlyValue);
    if (!Number.isFinite(amount)) {
      return;
    }
    const distribution = months.reduce<Record<string, number>>((acc, month) => {
      acc[month.key] = amount;
      return acc;
    }, {});
    onChange({ ...entry, distribution });
  };

  const distributeTotal = () => {
    const amount = Number(totalValue);
    const startIndex = months.findIndex((month) => month.key === startMonth);
    if (!Number.isFinite(amount) || startIndex === -1 || duration <= 0) {
      return;
    }
    const window = months.slice(startIndex, startIndex + duration);
    if (!window.length) {
      return;
    }
    const perMonth = amount / window.length;
    const distribution = { ...entry.distribution };
    window.forEach((month) => {
      distribution[month.key] = perMonth;
    });
    onChange({ ...entry, distribution });
  };

  const updateMonthValue = (key: string, value: string) => {
    const numeric = Number(value);
    const distribution = { ...entry.distribution };
    if (value === '') {
      delete distribution[key];
    } else if (Number.isFinite(numeric)) {
      distribution[key] = numeric;
    }
    onChange({ ...entry, distribution });
  };

  const fillRight = (key: string) => {
    const value = entry.distribution[key];
    if (value === undefined) {
      return;
    }
    const startIndex = months.findIndex((month) => month.key === key);
    if (startIndex === -1) {
      return;
    }
    const distribution = { ...entry.distribution };
    for (let index = startIndex + 1; index < months.length; index += 1) {
      distribution[months[index].key] = value;
    }
    onChange({ ...entry, distribution });
  };

  return (
    <div className={styles.sheetRow} style={{ gridTemplateColumns }} {...anchorAttributes}>
      <div className={styles.categoryCell}>
        <div className={styles.lineLinkRow}>
          {lineOptions.length > 0 ? (
            <select
              value={entry.lineCode ?? ''}
              onChange={(event) => onLineLinkChange(event.target.value)}
              disabled={disabled}
            >
              <option value="">Link to blueprint line</option>
              {lineOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          ) : (
            <span className={styles.lineLinkPlaceholder}>
              {blueprintLoading ? 'Loading blueprint...' : 'No blueprint lines available'}
            </span>
          )}
          <button
            type="button"
            className={styles.rowMenuButton}
            onClick={() => setMenuOpen((prev) => !prev)}
            disabled={disabled}
            title="Bulk actions"
          >
            ...
          </button>
        </div>
        <input
          className={styles.lineLabelInput}
          type="text"
          value={entry.label}
          onChange={(event) => onChange({ ...entry, label: event.target.value })}
          disabled={disabled}
          placeholder="Custom label"
        />
        {menuOpen && (
          <div className={styles.rowMenu} ref={menuRef}>
            <div className={styles.menuSection}>
              <span>Fill all months</span>
              <div className={styles.menuInputs}>
                <input
                  type="number"
                  value={monthlyValue}
                  onChange={(event) => setMonthlyValue(event.target.value)}
                  disabled={disabled}
                />
                <button type="button" onClick={fillAllMonths} disabled={disabled}>
                  Apply
                </button>
              </div>
            </div>
            <div className={styles.menuSection}>
              <span>Distribute total</span>
              <div className={styles.menuInputs}>
                <input
                  type="number"
                  value={totalValue}
                  onChange={(event) => setTotalValue(event.target.value)}
                  disabled={disabled}
                />
                <select value={startMonth} onChange={(event) => setStartMonth(event.target.value)} disabled={disabled}>
                  {months.map((month) => (
                    <option key={month.key} value={month.key}>
                      {month.label} {month.year}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(event) => setDuration(Math.max(1, Number(event.target.value)))}
                  disabled={disabled}
                />
                <button type="button" onClick={distributeTotal} disabled={disabled}>
                  Spread
                </button>
              </div>
            </div>
            <button type="button" className={styles.menuRemoveButton} onClick={onRemove} disabled={disabled}>
              Remove line
            </button>
          </div>
        )}
      </div>
      {months.map((month) => (
        <label key={month.key} className={styles.sheetCell}>
          <input
            type="number"
            value={entry.distribution[month.key] ?? ''}
            onChange={(event) => updateMonthValue(month.key, event.target.value)}
            disabled={disabled}
          />
          <button
            type="button"
            className={styles.fillRightButton}
            onClick={() => fillRight(month.key)}
            disabled={disabled || entry.distribution[month.key] === undefined}
            title="Fill to the right"
          >
            {'>>'}
          </button>
        </label>
      ))}
    </div>
  );
};

const ReadOnlyPlanRow = ({
  entry,
  months,
  gridTemplateColumns,
  anchorAttributes
}: {
  entry: InitiativeFinancialEntry;
  months: MonthDescriptor[];
  gridTemplateColumns: string;
  anchorAttributes?: CommentAnchorAttributes;
}) => {
  return (
    <div className={`${styles.sheetRow} ${styles.readOnlyRow}`} style={{ gridTemplateColumns }} {...anchorAttributes}>
      <div className={`${styles.categoryCell} ${styles.readOnlyCategory}`}>
        <div className={styles.readOnlyHeader}>
          <span className={styles.readOnlyLabel}>{entry.label || 'Line item'}</span>
          <span className={styles.rowTag}>Plan</span>
        </div>
        {entry.lineCode && <span className={styles.readOnlyMeta}>{entry.lineCode}</span>}
      </div>
      {months.map((month) => (
        <div key={month.key} className={`${styles.sheetCell} ${styles.readOnlyCell}`}>
          <input type="number" value={entry.distribution[month.key] ?? ''} disabled />
        </div>
      ))}
    </div>
  );
};

const ActualsRow = ({
  entry,
  months,
  disabled,
  gridTemplateColumns,
  onChange,
  anchorAttributes
}: {
  entry: InitiativeFinancialEntry;
  months: MonthDescriptor[];
  disabled: boolean;
  gridTemplateColumns: string;
  onChange: (entry: InitiativeFinancialEntry) => void;
  anchorAttributes?: CommentAnchorAttributes;
}) => {
  const updateActualMonth = (key: string, value: string) => {
    const numeric = Number(value);
    const actuals = { ...(entry.actuals ?? {}) };
    if (value === '') {
      delete actuals[key];
    } else if (Number.isFinite(numeric)) {
      actuals[key] = numeric;
    }
    onChange({ ...entry, actuals });
  };

  return (
    <div className={`${styles.sheetRow} ${styles.actualsRow}`} style={{ gridTemplateColumns }} {...anchorAttributes}>
      <div className={`${styles.categoryCell} ${styles.actualsCategory}`}>
        <div className={styles.readOnlyHeader}>
          <span className={styles.readOnlyLabel}>Actuals</span>
          <span className={`${styles.rowTag} ${styles.actualTag}`}>Input</span>
        </div>
        <p className={styles.actualsHint}>{entry.label || 'Line item'}</p>
      </div>
      {months.map((month) => (
        <label key={month.key} className={`${styles.sheetCell} ${styles.actualsCell}`}>
          <input
            type="number"
            value={(entry.actuals ?? {})[month.key] ?? ''}
            onChange={(event) => updateActualMonth(month.key, event.target.value)}
            disabled={disabled}
          />
        </label>
      ))}
    </div>
  );
};

interface PlanVsActualChartProps {
  months: MonthDescriptor[];
  gridTemplateColumns: string;
  planData: ChartMonthStack[];
  actualData: ChartMonthStack[];
  showPlanAsLine: boolean;
  planLineMode: 'impact' | 'split';
  lineSource?: 'plan' | 'actual';
  lineData?: ChartMonthStack[];
  hidePlanBars?: boolean;
  hideActualBars?: boolean;
  planTagLabel?: string;
  actualTagLabel?: string;
  lineTagLabel?: string;
  showValueLabels?: boolean;
  showPeriodLabels?: boolean;
  periodLabelFormatter?: (month: MonthDescriptor) => string;
  anchorScope?: string;
  legendLabel?: string | null;
  formatValue?: (value: number) => string;
  monthStartColumn?: number;
  legendSpanColumns?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  onSegmentClick?: (payload: { month: MonthDescriptor; dataset: 'plan' | 'actual'; segment: ChartSegment }) => void;
}

export const PlanVsActualChart = ({
  months,
  gridTemplateColumns,
  planData,
  actualData,
  showPlanAsLine,
  planLineMode,
  lineSource = 'plan',
  lineData,
  hidePlanBars,
  hideActualBars = false,
  planTagLabel = 'Plan',
  actualTagLabel = 'Actual',
  lineTagLabel,
  showValueLabels = false,
  showPeriodLabels = false,
  periodLabelFormatter,
  anchorScope,
  legendLabel,
  formatValue,
  monthStartColumn,
  legendSpanColumns,
  height,
  className,
  style,
  onSegmentClick
}: PlanVsActualChartProps) => {
  const effectiveLegend = legendLabel === undefined ? 'Plan vs actuals' : legendLabel;
  const hasLegend = Boolean(effectiveLegend);
  const monthStart = monthStartColumn ?? (hasLegend ? 2 : 1);
  const legendColumns = legendSpanColumns ?? (hasLegend ? 1 : 0);
  const shouldHidePlanBars = hidePlanBars ?? showPlanAsLine;
  const lineSeries = lineData ?? (lineSource === 'plan' ? planData : actualData);
  const lineLabel = lineTagLabel ?? (lineSource === 'plan' ? 'Plan impact' : 'Actual impact');
  const maxPositive = Math.max(
    0,
    ...planData.map((stat) => stat.positiveTotal),
    ...actualData.map((stat) => stat.positiveTotal),
    ...lineSeries.map((stat) => stat.positiveTotal)
  );
  const maxNegative = Math.max(
    0,
    ...planData.map((stat) => stat.negativeTotal),
    ...actualData.map((stat) => stat.negativeTotal),
    ...lineSeries.map((stat) => stat.negativeTotal)
  );
  const totalSpan = maxPositive + maxNegative || 1;
  const positiveShare = maxPositive ? maxPositive / totalSpan : 0;
  const negativeShare = maxNegative ? maxNegative / totalSpan : 0;
  const noData = !positiveShare && !negativeShare;
  const positiveBase = noData ? 0.5 : positiveShare;
  const negativeBase = noData ? 0.5 : negativeShare;
  const baseTotal = positiveBase + negativeBase || 1;
  const positivePortion = positiveBase / baseTotal;
  const negativePortion = negativeBase / baseTotal;
  const positiveScale = maxPositive || 1;
  const negativeScale = maxNegative || 1;
  const zeroLine = positivePortion * 100;
  const positiveArea = zeroLine;
  const negativeArea = (1 - positivePortion) * 100;
  const chartHeightPx = height ?? 210;
  const [chartWidth, setChartWidth] = useState(0);
  const [lineLayout, setLineLayout] = useState<{ left: number; width: number; xs: number[] }>({
    left: CATEGORY_COLUMN_WIDTH,
    width: 0,
    xs: []
  });
  useLayoutEffect(() => {
    const node = chartRef.current;
    if (!node) {
      return;
    }
    const measure = () => setChartWidth(node.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const container = chartRef.current;
    if (!container) {
      return;
    }
    const cells = Array.from(container.querySelectorAll('[data-month-index]')) as HTMLElement[];
    if (!cells.length || cells.length !== months.length) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const firstRect = cells[0].getBoundingClientRect();
    const lastRect = cells[cells.length - 1].getBoundingClientRect();
    const xs = cells.map((cell) => {
      const rect = cell.getBoundingClientRect();
      return rect.left - containerRect.left + rect.width / 2;
    });
    setLineLayout({
      left: firstRect.left - containerRect.left,
      width: lastRect.right - firstRect.left,
      xs
    });
  }, [months, chartWidth]);

  const lineViewportWidth = Math.max(1, lineLayout.width || chartWidth - lineLayout.left);
  const fallbackColumnWidth = lineViewportWidth / Math.max(months.length, 1);
  const zeroLinePx = positivePortion * chartHeightPx;
  const positiveAreaPx = zeroLinePx;
  const negativeAreaPx = chartHeightPx - zeroLinePx;
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [tooltip, setTooltip] = useState<{
    label: string;
    value: number;
    left: number;
    top: number;
    tag: string;
    signed?: boolean;
  } | null>(null);
  const renderValue = formatValue ?? formatCurrency;
  const emptyStack: ChartMonthStack = {
    key: 'empty',
    positiveSegments: [],
    negativeSegments: [],
    positiveTotal: 0,
    negativeTotal: 0
  };

  const handleSegmentHover = (
    event: React.MouseEvent<HTMLDivElement>,
    segment: ChartSegment,
    position: 'positive' | 'negative',
    tag: string
  ) => {
    const container = chartRef.current;
    if (!container) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const segmentRect = event.currentTarget.getBoundingClientRect();
    const left = segmentRect.left + segmentRect.width / 2 - containerRect.left;
    const top =
      position === 'positive'
        ? segmentRect.top - containerRect.top - 8
        : segmentRect.bottom - containerRect.top + 8;
    setTooltip({ label: segment.label, value: segment.rawValue, left, top, tag, signed: false });
  };

  const handlePlanPointHover = (
    event: React.MouseEvent<SVGCircleElement>,
    point: { value: number; label: string; tag: string }
  ) => {
    const container = chartRef.current;
    if (!container) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const targetRect = event.currentTarget.getBoundingClientRect();
    const left = targetRect.left + targetRect.width / 2 - containerRect.left;
    const top = targetRect.top - containerRect.top - 10;
    setTooltip({ label: point.label, value: point.value, left, top, tag: point.tag, signed: true });
  };

  const clearTooltip = () => setTooltip(null);
  const handleSegmentClick = (dataset: 'plan' | 'actual', segment: ChartSegment, month: MonthDescriptor) => {
    if (!onSegmentClick) {
      return;
    }
    onSegmentClick({ month, dataset, segment });
  };

  const impactLinePoints = useMemo(
    () =>
      showPlanAsLine && months.length > 0
        ? lineSeries.map((month, index) => {
          const net = month.positiveTotal - month.negativeTotal;
          const isPositive = net >= 0;
          const scale = isPositive ? positiveScale : negativeScale;
          const area = isPositive ? positiveAreaPx : negativeAreaPx;
          const ratio = scale ? Math.min(1, Math.abs(net) / scale) : 0;
          const y = isPositive ? zeroLinePx - ratio * area : zeroLinePx + ratio * area;
          return {
            x: (lineLayout.xs[index] ?? index * fallbackColumnWidth + fallbackColumnWidth / 2) - lineLayout.left,
            y: Number.isFinite(y) ? y : zeroLinePx,
            value: net,
            label: `${months[index].label} ${months[index].year}`,
            tag: lineLabel
          };
        })
        : [],
    [
      showPlanAsLine,
      months,
      lineSeries,
      positiveScale,
      negativeScale,
      positiveAreaPx,
      negativeAreaPx,
      zeroLinePx,
      lineLayout.xs,
      fallbackColumnWidth,
      lineLabel
    ]
  );

  const splitLinePoints = useMemo(() => {
    if (!showPlanAsLine || months.length === 0) {
      return { benefits: [] as typeof impactLinePoints, costs: [] as typeof impactLinePoints };
    }
    const benefits = lineSeries.map((month, index) => {
      const ratio = positiveScale ? Math.min(1, month.positiveTotal / positiveScale) : 0;
      const y = zeroLinePx - ratio * positiveAreaPx;
      return {
        x: (lineLayout.xs[index] ?? index * fallbackColumnWidth + fallbackColumnWidth / 2) - lineLayout.left,
        y: Number.isFinite(y) ? y : zeroLinePx,
        value: month.positiveTotal,
        label: `${months[index].label} ${months[index].year}`,
        tag: `${lineLabel} benefits`
      };
    });
    const costs = lineSeries.map((month, index) => {
      const ratio = negativeScale ? Math.min(1, month.negativeTotal / negativeScale) : 0;
      const y = zeroLinePx + ratio * negativeAreaPx;
      return {
        x: (lineLayout.xs[index] ?? index * fallbackColumnWidth + fallbackColumnWidth / 2) - lineLayout.left,
        y: Number.isFinite(y) ? y : zeroLinePx,
        value: -month.negativeTotal,
        label: `${months[index].label} ${months[index].year}`,
        tag: `${lineLabel} costs`
      };
    });
    return { benefits, costs };
  }, [
    showPlanAsLine,
    months,
    lineSeries,
    positiveScale,
    negativeScale,
    positiveAreaPx,
    negativeAreaPx,
    zeroLinePx,
    lineLayout.xs,
    fallbackColumnWidth,
    lineLabel
  ]);

  return (
    <div
      className={`${styles.chartRow} ${styles.comparisonChart} ${className ?? ''}`}
      style={{ gridTemplateColumns, minHeight: chartHeightPx, ...style }}
      ref={chartRef}
    >
      {hasLegend && (
        <div className={styles.chartLegend} style={{ gridColumn: `1 / span ${legendColumns}` }}>
          {effectiveLegend}
        </div>
      )}
      {months.map((month, index) => {
        const plan = planData[index] ?? emptyStack;
        const actual = actualData[index] ?? emptyStack;
        const barLabelSource =
          !hideActualBars && actual ? actual : !shouldHidePlanBars ? plan : emptyStack;
        const positiveRatioPlan = positiveScale ? Math.min(1, plan.positiveTotal / positiveScale) : 0;
        const negativeRatioPlan = negativeScale ? Math.min(1, plan.negativeTotal / negativeScale) : 0;
        const positiveRatioActual = positiveScale ? Math.min(1, actual.positiveTotal / positiveScale) : 0;
        const negativeRatioActual = negativeScale ? Math.min(1, actual.negativeTotal / negativeScale) : 0;
        const positivePlanScale = plan.positiveTotal || 1;
        const negativePlanScale = plan.negativeTotal || 1;
        const positiveActualScale = actual.positiveTotal || 1;
        const negativeActualScale = actual.negativeTotal || 1;
        const planNet = plan.positiveTotal - plan.negativeTotal;
        const planPoint = impactLinePoints[index];
        const lineMarker =
          !showPlanAsLine && planPoint
            ? planNet >= 0 && positiveArea > 0
              ? {
                area: 'positive' as const,
                offset: Math.min(100, Math.max(0, ((zeroLine - planPoint.y) / (positiveArea || 1)) * 100))
              }
              : planNet < 0 && negativeArea > 0
                ? {
                  area: 'negative' as const,
                  offset: Math.min(100, Math.max(0, ((planPoint.y - zeroLine) / (negativeArea || 1)) * 100))
                }
                : null
            : null;
        const chartAnchor = createCommentAnchor(
          `${anchorScope ?? 'financial-chart'}.${month.key}`,
          `${month.label} ${month.year} plan vs actual`
        );
        const barLabelValue = barLabelSource.positiveTotal - barLabelSource.negativeTotal;
        const isPlanLabel = barLabelSource === plan;
        const barPositiveRatio = isPlanLabel ? positiveRatioPlan : positiveRatioActual;
        const barNegativeRatio = isPlanLabel ? negativeRatioPlan : negativeRatioActual;
        const barValueOffset = Number.isFinite(barLabelValue)
          ? barLabelValue >= 0
            ? zeroLine - barPositiveRatio * positiveArea
            : zeroLine + barNegativeRatio * negativeArea
          : zeroLine;
        const shouldShowBarValue = showValueLabels && (!hideActualBars || !shouldHidePlanBars);
        const periodLabel = periodLabelFormatter ? periodLabelFormatter(month) : `${month.label} ${month.year}`;
        return (
          <div
            key={month.key}
            className={styles.chartCell}
            style={{ gridRow: 1, gridColumn: index + monthStart }}
            data-month-index={index}
            {...chartAnchor}
          >
            <div className={styles.chartBarGroup} style={{ height: chartHeightPx }}>
              <div className={styles.dualStackWrapper}>
                <div className={styles.dualPositive} style={{ height: `${positivePortion * 100}%` }}>
                  <div className={styles.dualBarRow}>
                    {!shouldHidePlanBars && (
                      <div className={`${styles.dualBar} ${styles.planBar}`} style={{ height: `${positiveRatioPlan * 100}%` }}>
                        <div className={`${styles.stackFill} ${styles.stackFillPositive}`}>
                          {plan.positiveSegments.map((segment, segmentIndex) => {
                            const height = (segment.value / positivePlanScale) * 100;
                            return (
                              <div
                                key={`${month.key}-plan-pos-${segmentIndex}`}
                                className={styles.chartSegment}
                                style={{ height: `${height}%`, background: segment.color }}
                                onMouseEnter={(event) => handleSegmentHover(event, segment, 'positive', planTagLabel)}
                                onMouseMove={(event) => handleSegmentHover(event, segment, 'positive', planTagLabel)}
                                onMouseLeave={clearTooltip}
                                onClick={() => handleSegmentClick('plan', segment, month)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {!hideActualBars && (
                      <div
                        className={`${styles.dualBar} ${styles.actualBar}`}
                        style={{
                          height: `${positiveRatioActual * 100}%`,
                          width: showPlanAsLine ? '46%' : undefined
                        }}
                      >
                        <div className={`${styles.stackFill} ${styles.stackFillPositive}`}>
                          {actual.positiveSegments.map((segment, segmentIndex) => {
                            const height = (segment.value / positiveActualScale) * 100;
                            return (
                              <div
                                key={`${month.key}-actual-pos-${segmentIndex}`}
                                className={styles.chartSegment}
                                style={{ height: `${height}%`, background: segment.color }}
                                onMouseEnter={(event) => handleSegmentHover(event, segment, 'positive', actualTagLabel)}
                                onMouseMove={(event) => handleSegmentHover(event, segment, 'positive', actualTagLabel)}
                                onMouseLeave={clearTooltip}
                                onClick={() => handleSegmentClick('actual', segment, month)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  {lineMarker && lineMarker.area === 'positive' && (
                    <div className={styles.planLineDot} style={{ bottom: `${lineMarker.offset}%` }} />
                  )}
                </div>
                <div className={styles.dualNegative} style={{ height: `${negativePortion * 100}%` }}>
                  <div className={`${styles.dualBarRow} ${styles.dualBarRowNegative}`}>
                    {!shouldHidePlanBars && (
                      <div
                        className={`${styles.dualBar} ${styles.planBar}`}
                        style={{ height: `${negativeRatioPlan * 100}%` }}
                      >
                        <div className={`${styles.stackFill} ${styles.stackFillNegative}`}>
                          {plan.negativeSegments.map((segment, segmentIndex) => {
                            const height = (segment.value / negativePlanScale) * 100;
                            return (
                              <div
                              key={`${month.key}-plan-neg-${segmentIndex}`}
                              className={styles.chartSegment}
                              style={{ height: `${height}%`, background: segment.color }}
                              onMouseEnter={(event) => handleSegmentHover(event, segment, 'negative', planTagLabel)}
                              onMouseMove={(event) => handleSegmentHover(event, segment, 'negative', planTagLabel)}
                              onMouseLeave={clearTooltip}
                              onClick={() => handleSegmentClick('plan', segment, month)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {!hideActualBars && (
                    <div
                      className={`${styles.dualBar} ${styles.actualBar}`}
                      style={{
                        height: `${negativeRatioActual * 100}%`,
                        width: showPlanAsLine ? '46%' : undefined
                      }}
                    >
                      <div className={`${styles.stackFill} ${styles.stackFillNegative}`}>
                        {actual.negativeSegments.map((segment, segmentIndex) => {
                          const height = (segment.value / negativeActualScale) * 100;
                          return (
                            <div
                              key={`${month.key}-actual-neg-${segmentIndex}`}
                              className={styles.chartSegment}
                              style={{ height: `${height}%`, background: segment.color }}
                              onMouseEnter={(event) => handleSegmentHover(event, segment, 'negative', actualTagLabel)}
                              onMouseMove={(event) => handleSegmentHover(event, segment, 'negative', actualTagLabel)}
                              onMouseLeave={clearTooltip}
                              onClick={() => handleSegmentClick('actual', segment, month)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                  </div>
                  {lineMarker && lineMarker.area === 'negative' && (
                    <div className={styles.planLineDotNegative} style={{ top: `${lineMarker.offset}%` }} />
                  )}
                </div>
              </div>
              <div className={styles.chartZeroLine} style={{ top: `${positivePortion * 100}%` }} />
              {shouldShowBarValue && (
                <div
                  className={styles.barValueLabel}
                  style={{ top: `${Math.max(2, Math.min(98, barValueOffset))}%` }}
                >
                  {renderValue(barLabelValue)}
                </div>
              )}
            </div>
            {showPeriodLabels && <div className={styles.chartPeriodLabel}>{periodLabel}</div>}
          </div>
        );
      })}
      {showPlanAsLine && planLineMode === 'impact' && impactLinePoints.length > 0 && (
        <div
          className={styles.planLineLayer}
          style={{
            left: `${lineLayout.left}px`,
            width: `${lineViewportWidth}px`,
            height: `${chartHeightPx}px`
          }}
        >
          <svg
            className={styles.planLine}
            viewBox={`0 0 ${lineViewportWidth} ${chartHeightPx}`}
            preserveAspectRatio="none"
          >
            <polyline
              points={impactLinePoints.map((point) => `${point.x},${point.y}`).join(' ')}
              strokeWidth={1.8}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
            {impactLinePoints.map((point, index) => (
              <circle
                key={`${point.x}-${index}`}
                cx={point.x}
                cy={point.y}
                r={3}
                vectorEffect="non-scaling-stroke"
                onMouseEnter={(event) => handlePlanPointHover(event, point)}
                onMouseMove={(event) => handlePlanPointHover(event, point)}
                onMouseLeave={clearTooltip}
              />
            ))}
          </svg>
          {showValueLabels &&
            impactLinePoints.map((point, index) => (
              <div
                key={`line-value-${index}`}
                className={styles.lineValueLabel}
                style={{ left: point.x, top: Math.max(0, point.y - 18) }}
              >
                {renderValue(point.value)}
              </div>
            ))}
        </div>
      )}
      {showPlanAsLine &&
        planLineMode === 'split' &&
        (splitLinePoints.benefits.length > 0 || splitLinePoints.costs.length > 0) && (
          <div
            className={styles.planLineLayer}
            style={{
              left: `${lineLayout.left}px`,
              width: `${lineViewportWidth}px`,
              height: `${chartHeightPx}px`
            }}
          >
            <svg
              className={`${styles.planLine} ${styles.planLineBenefit}`}
              viewBox={`0 0 ${lineViewportWidth} ${chartHeightPx}`}
              preserveAspectRatio="none"
            >
              <polyline
                points={splitLinePoints.benefits.map((point) => `${point.x},${point.y}`).join(' ')}
                strokeWidth={1.8}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
              {splitLinePoints.benefits.map((point, index) => (
                <circle
                  key={`benefit-${point.x}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={3}
                  vectorEffect="non-scaling-stroke"
                  onMouseEnter={(event) => handlePlanPointHover(event, point)}
                  onMouseMove={(event) => handlePlanPointHover(event, point)}
                  onMouseLeave={clearTooltip}
                />
              ))}
            </svg>
            <svg
              className={`${styles.planLine} ${styles.planLineCost}`}
              viewBox={`0 0 ${lineViewportWidth} ${chartHeightPx}`}
              preserveAspectRatio="none"
            >
              <polyline
                points={splitLinePoints.costs.map((point) => `${point.x},${point.y}`).join(' ')}
                strokeWidth={1.8}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
              {splitLinePoints.costs.map((point, index) => (
                <circle
                  key={`cost-${point.x}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={3}
                  vectorEffect="non-scaling-stroke"
                  onMouseEnter={(event) => handlePlanPointHover(event, point)}
                onMouseMove={(event) => handlePlanPointHover(event, point)}
                onMouseLeave={clearTooltip}
              />
            ))}
            </svg>
            {showValueLabels && (
              <>
                {splitLinePoints.benefits.map((point, index) => (
                  <div
                    key={`benefit-value-${index}`}
                    className={`${styles.lineValueLabel} ${styles.lineValueBenefit}`}
                    style={{ left: point.x, top: Math.max(0, point.y - 18) }}
                  >
                    {renderValue(point.value)}
                  </div>
                ))}
                {splitLinePoints.costs.map((point, index) => (
                  <div
                    key={`cost-value-${index}`}
                    className={`${styles.lineValueLabel} ${styles.lineValueCost}`}
                    style={{ left: point.x, top: Math.max(0, point.y - 18) }}
                  >
                    {renderValue(point.value)}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      {tooltip && (
        <div className={styles.chartTooltip} style={{ left: tooltip.left, top: tooltip.top }}>
          <strong>{tooltip.label || 'Line item'}</strong>
          <span>{tooltip.signed ? renderValue(tooltip.value) : renderValue(Math.abs(tooltip.value))}</span>
          <span className={styles.tooltipTag}>{tooltip.tag}</span>
        </div>
      )}
    </div>
  );
};

export const FinancialEditor = ({ stage, disabled, onChange, commentScope }: FinancialEditorProps) => {
  const { periodSettings } = usePlanSettingsState();
  const months = useMemo<MonthDescriptor[]>(
    () => buildMonthRange(stage, { endYear: periodSettings.periodYear, endMonth: periodSettings.periodMonth }),
    [stage, periodSettings.periodMonth, periodSettings.periodYear]
  );
  const scopeKey = commentScope ?? stage.key ?? 'stage';
  const gridTemplateColumns = useMemo(
    () => `${CATEGORY_COLUMN_WIDTH}px repeat(${Math.max(months.length, 1)}, minmax(110px, 1fr))`,
    [months.length]
  );
  const { blueprint: financialBlueprint, loading: blueprintLoading } = useFinancialsState();
  const fiscalStartMonth = financialBlueprint?.fiscalYear?.startMonth ?? DEFAULT_FISCAL_YEAR_START_MONTH;
  const fiscalWindowLabel = formatFiscalWindow(fiscalStartMonth);
  const manualBlueprintLines = useMemo(
    () => (financialBlueprint?.lines ?? []).filter((line) => line.computation === 'manual'),
    [financialBlueprint]
  );
  const blueprintLineMap = useMemo(
    () => new Map(manualBlueprintLines.map((line) => [line.code, line])),
    [manualBlueprintLines]
  );
  const revenueLineOptions = useMemo<BlueprintLineOption[]>(
    () =>
      manualBlueprintLines
        .filter((line) => line.nature === 'revenue')
        .map((line) => ({ code: line.code, name: line.name })),
    [manualBlueprintLines]
  );
  const costLineOptions = useMemo<BlueprintLineOption[]>(
    () =>
      manualBlueprintLines
        .filter((line) => line.nature === 'cost')
        .map((line) => ({ code: line.code, name: line.name })),
    [manualBlueprintLines]
  );
  const [includeOneOff, setIncludeOneOff] = useState(true);
  const activeBenefitKinds = useMemo<InitiativeFinancialKind[]>(
    () => (includeOneOff ? benefitKinds : ['recurring-benefits']),
    [includeOneOff]
  );
  const activeCostKinds = useMemo<InitiativeFinancialKind[]>(
    () => (includeOneOff ? costKinds : ['recurring-costs']),
    [includeOneOff]
  );
  const activeKindSet = useMemo(
    () => new Set<InitiativeFinancialKind>([...activeBenefitKinds, ...activeCostKinds]),
    [activeBenefitKinds, activeCostKinds]
  );

  const monthKeys = useMemo(() => months.map((month) => month.key), [months]);

  const kindMonthlyTotals = useMemo(
    () =>
      initiativeFinancialKinds.reduce(
        (acc, kind) => {
          acc[kind] = buildKindMonthlyTotals(stage, kind);
          return acc;
        },
        {} as Record<InitiativeFinancialKind, Record<string, number>>
      ),
    [stage]
  );

  const calculationLogic = useMemo(
    () =>
      initiativeFinancialKinds.reduce((acc, kind) => {
        const raw = stage.calculationLogic?.[kind];
        acc[kind] = typeof raw === 'string' ? raw : '';
        return acc;
      }, {} as Record<InitiativeFinancialKind, string>),
    [stage.calculationLogic]
  );

  const businessCaseFiles: InitiativeBusinessCaseFile[] = stage.businessCaseFiles ?? [];
  const [businessUploadState, setBusinessUploadState] = useState<{
    status: 'idle' | 'processing' | 'done' | 'error';
    progress: number;
    error: string | null;
  }>({ status: 'idle', progress: 0, error: null });
  const businessDragCounter = useRef(0);
  const businessUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [isBusinessDragActive, setIsBusinessDragActive] = useState(false);
  const hideUploadStatusTimeout = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (hideUploadStatusTimeout.current) {
        window.clearTimeout(hideUploadStatusTimeout.current);
        hideUploadStatusTimeout.current = null;
      }
    };
  }, []);

  const entryColorMap = useMemo(() => buildEntryColorMap(stage), [stage.financials]);

  const handleCalculationLogicChange = (kind: InitiativeFinancialKind, value: string) => {
    onChange({ ...stage, calculationLogic: { ...calculationLogic, [kind]: value } });
  };

  const handleBusinessFiles = async (files: File[]) => {
    if (!files.length || disabled) {
      return;
    }
    if (hideUploadStatusTimeout.current) {
      window.clearTimeout(hideUploadStatusTimeout.current);
      hideUploadStatusTimeout.current = null;
    }
    setBusinessUploadState({ status: 'processing', progress: 0, error: null });
    try {
      const records = await convertFilesToRecords(files, (percentage) => {
        setBusinessUploadState((previous) => ({
          status: 'processing',
          progress: Math.max(previous.progress, percentage * 0.9),
          error: null
        }));
      });
      const uploadedAt = new Date().toISOString();
      const mapped: InitiativeBusinessCaseFile[] = records.map((record) => ({
        id: generateId(),
        fileName: record.fileName,
        mimeType: record.mimeType || null,
        size: record.size ?? 0,
        dataUrl: record.dataUrl,
        uploadedAt
      }));
      onChange({ ...stage, businessCaseFiles: [...businessCaseFiles, ...mapped] });
      setBusinessUploadState({ status: 'done', progress: 1, error: null });
      hideUploadStatusTimeout.current = window.setTimeout(() => {
        setBusinessUploadState({ status: 'idle', progress: 0, error: null });
      }, 900);
    } catch (error) {
      setBusinessUploadState({
        status: 'error',
        progress: 0,
        error: (error as Error).message
      });
    } finally {
      setIsBusinessDragActive(false);
      businessDragCounter.current = 0;
    }
  };

  const handleBusinessInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    await handleBusinessFiles(files);
    event.target.value = '';
  };

  const handleBusinessDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    const files = Array.from(event.dataTransfer.files || []);
    businessDragCounter.current = 0;
    setIsBusinessDragActive(false);
    await handleBusinessFiles(files);
  };

  const handleBusinessDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    if (!event.dataTransfer.types?.includes('Files')) {
      return;
    }
    businessDragCounter.current += 1;
    setIsBusinessDragActive(true);
  };

  const handleBusinessDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    businessDragCounter.current = Math.max(0, businessDragCounter.current - 1);
    if (businessDragCounter.current === 0) {
      setIsBusinessDragActive(false);
    }
  };

  const handleRemoveBusinessFile = (fileId: string) => {
    if (disabled) {
      return;
    }
    const filtered = businessCaseFiles.filter((file) => file.id !== fileId);
    onChange({ ...stage, businessCaseFiles: filtered });
  };

  const chartData = useMemo<ChartMonthStack[]>(
    () => buildChartStacks(months, stage, activeKindSet, entryColorMap, (entry) => entry.distribution),
    [activeKindSet, months, stage, entryColorMap]
  );

  const impactTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    months.forEach((month) => {
      const benefits = activeBenefitKinds.reduce(
        (sum, kind) => sum + (kindMonthlyTotals[kind][month.key] ?? 0),
        0
      );
      const costs = activeCostKinds.reduce(
        (sum, kind) => sum + (kindMonthlyTotals[kind][month.key] ?? 0),
        0
      );
      totals[month.key] = benefits - costs;
    });
    return totals;
  }, [months, kindMonthlyTotals, activeBenefitKinds, activeCostKinds]);

  const runRate = calculateRunRate(monthKeys, impactTotals);
  const summaryTotals = useMemo(() => calculateYearSummaries(impactTotals, fiscalStartMonth), [impactTotals, fiscalStartMonth]);

  const updateEntries = (
    kind: InitiativeFinancialKind,
    updater: (entries: InitiativeFinancialEntry[]) => InitiativeFinancialEntry[]
  ) => {
    const nextEntries = updater(stage.financials[kind]);
    onChange({ ...stage, financials: { ...stage.financials, [kind]: nextEntries } });
  };

  const handleLineLinkChange = (
    kind: InitiativeFinancialKind,
    entryId: string,
    nextCode: string
  ) => {
    const trimmed = nextCode.trim();
    updateEntries(kind, (entries) =>
      entries.map((entry) => {
        if (entry.id !== entryId) {
          return entry;
        }
        if (!trimmed) {
          return { ...entry, lineCode: null, category: '', label: entry.label };
        }
        const blueprintLine = blueprintLineMap.get(trimmed);
        const previousLine = entry.lineCode ? blueprintLineMap.get(entry.lineCode) : null;
        const shouldReplaceLabel = !entry.label || (previousLine && entry.label === previousLine.name);
        return {
          ...entry,
          lineCode: trimmed,
          category: trimmed,
          label: blueprintLine && shouldReplaceLabel ? blueprintLine.name : entry.label
        };
      })
    );
  };

  const addEntry = (kind: InitiativeFinancialKind) => {
    updateEntries(kind, (entries) => [
      ...entries,
      {
        id: generateId(),
        label: '',
        category: '',
        lineCode: null,
        distribution: {},
        actuals: {}
      }
    ]);
  };

  const removeEntry = (kind: InitiativeFinancialKind, id: string) => {
    updateEntries(kind, (entries) => entries.filter((entry) => entry.id !== id));
  };

  const handleEntryChange = (kind: InitiativeFinancialKind, nextEntry: InitiativeFinancialEntry) => {
    updateEntries(kind, (entries) => entries.map((entry) => (entry.id === nextEntry.id ? nextEntry : entry)));
  };

  return (
    <section
      className={styles.financialBoard}
      {...createCommentAnchor(`financial.${scopeKey}.board`, 'Financial outlook')}
    >
      <header className={styles.financialHeading}>
        <div>
          <h3>Financial outlook</h3>
          <p>All recurring and one-off flows in a single, minimal view.</p>
        </div>
        <label
          className={styles.oneOffToggle}
          {...createCommentAnchor(`financial.${scopeKey}.toggle.oneoff`, 'Include one-off items toggle')}
        >
          <input
            type="checkbox"
            checked={includeOneOff}
            onChange={(event) => setIncludeOneOff(event.target.checked)}
          />
          <span>Include one-off items</span>
        </label>
      </header>

      <div className={styles.metricsRow}>
        <SummaryList
          title="Fiscal years"
          items={summaryTotals.fiscal}
          anchorAttributes={createCommentAnchor(`financial.${scopeKey}.summary.fiscal`, 'Fiscal year totals')}
        />
        <SummaryList
          title="Calendar years"
          items={summaryTotals.calendar}
          anchorAttributes={createCommentAnchor(`financial.${scopeKey}.summary.calendar`, 'Calendar year totals')}
        />
        <div
          className={styles.metricCard}
          {...createCommentAnchor(`financial.${scopeKey}.metric.run-rate`, 'Net run rate')}
        >
          <span>Net run rate (last 12 months)</span>
          <strong>{formatCurrency(runRate)}</strong>
        </div>
        <div className={styles.metricCard}>
          <span>Fiscal calendar</span>
          <strong>{fiscalWindowLabel}</strong>
          <p className={styles.metricNote}>
            Managed in <a href="#/financials">Financials</a>
          </p>
        </div>
      </div>

      <div className={styles.sheetWrapper}>
        <div className={styles.sheetScroller}>
          <CombinedChart
            months={months}
            gridTemplateColumns={gridTemplateColumns}
            data={chartData}
            anchorScope={`financial.${scopeKey}.chart`}
          />
          <div className={`${styles.sheetRow} ${styles.sheetHeader}`} style={{ gridTemplateColumns }}>
            <div className={styles.categoryHeader}>Line item</div>
            {months.map((month) => (
              <div key={month.key} className={styles.monthHeader}>
                {month.label} {month.year}
              </div>
            ))}
          </div>
          {initiativeFinancialKinds.map((kind) => (
            <Fragment key={kind}>
              <div
                className={styles.kindDivider}
                {...createCommentAnchor(`financial.${scopeKey}.section.${kind}`, SECTION_LABELS[kind])}
              >
                <span>{SECTION_LABELS[kind]}</span>
                <button
                  className={styles.sectionAddButton}
                  onClick={() => addEntry(kind)}
                  type="button"
                  disabled={disabled}
                  {...createCommentAnchor(
                    `financial.${scopeKey}.section.${kind}.add`,
                    `Add ${SECTION_LABELS[kind]} line`
                  )}
                >
                  Add line
                </button>
              </div>
              {stage.financials[kind].length === 0 ? (
                <p className={styles.placeholder}>No data yet. Use "Add line" to start capturing this metric.</p>
              ) : (
                stage.financials[kind].map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    disabled={disabled}
                    months={months}
                    gridTemplateColumns={gridTemplateColumns}
                    onChange={(nextEntry) => handleEntryChange(kind, nextEntry)}
                    onRemove={() => removeEntry(kind, entry.id)}
                    onLineLinkChange={(lineCode) => handleLineLinkChange(kind, entry.id, lineCode)}
                    lineOptions={benefitKinds.includes(kind) ? revenueLineOptions : costLineOptions}
                    blueprintLoading={blueprintLoading}
                    anchorAttributes={createCommentAnchor(
                      `financial.${scopeKey}.entry.${entry.id}`,
                      entry.label || SECTION_LABELS[kind]
                    )}
                  />
                ))
              )}
            </Fragment>
          ))}
        </div>
      </div>

      <div className={styles.logicSection}>
        <div className={styles.logicHeader}>
          <h4>Calculation logic</h4>
          <p>Leave a quick note on how each bucket is calculated.</p>
        </div>
        <div className={styles.logicGrid}>
          {logicOrder.map((kind) => (
            <label
              key={kind}
              className={styles.logicCard}
              {...createCommentAnchor(`financial.${scopeKey}.logic.${kind}`, logicLabels[kind])}
            >
              <span>{logicLabels[kind]}</span>
              <textarea
                value={calculationLogic[kind]}
                onChange={(event) => handleCalculationLogicChange(kind, event.target.value)}
                disabled={disabled}
                rows={3}
                placeholder="Key assumptions, formulas, owners"
              />
            </label>
          ))}
        </div>
      </div>

      <div className={styles.businessUpload}>
        <div className={styles.uploadHeader}>
          <div>
            <h4>Business case upload</h4>
            <p>Drag & drop files or attach manually.</p>
          </div>
          <div className={styles.uploadActions}>
            <button
              type="button"
              className={styles.uploadButton}
              onClick={() => businessUploadInputRef.current?.click()}
              disabled={disabled}
            >
              Select files
            </button>
            <input
              ref={businessUploadInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(event) => void handleBusinessInputChange(event)}
              disabled={disabled}
            />
            {businessUploadState.status !== 'idle' && (
              <span className={styles.uploadStatus}>
                {businessUploadState.status === 'error'
                  ? businessUploadState.error ?? 'Upload failed'
                  : `${Math.round(businessUploadState.progress * 100)}%`}
              </span>
            )}
          </div>
        </div>

        <div
          className={`${styles.dropZone} ${isBusinessDragActive ? styles.dropZoneActive : ''}`}
          onDragEnter={handleBusinessDragEnter}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={handleBusinessDragLeave}
          onDrop={(event) => void handleBusinessDrop(event)}
        >
          <p>Drop files here to attach your business case.</p>
          <p className={styles.dropZoneHint}>We will keep them tied to this stage only.</p>
        </div>

        {businessUploadState.status === 'error' && businessUploadState.error && (
          <p className={styles.errorText}>{businessUploadState.error}</p>
        )}

        {businessCaseFiles.length === 0 ? (
          <p className={styles.placeholder}>No business case files yet.</p>
        ) : (
          <ul className={styles.uploadList}>
            {businessCaseFiles.map((file) => (
              <li key={file.id} className={styles.uploadItem}>
                <div>
                  <p className={styles.fileName}>{file.fileName}</p>
                  <p className={styles.fileMeta}>
                    {Math.max(1, Math.round((file.size ?? 0) / 1024))} KB ·{' '}
                    {new Date(file.uploadedAt).toLocaleString()}
                  </p>
                </div>
                <div className={styles.uploadActionsInline}>
                  <a className={styles.uploadButtonGhost} href={file.dataUrl} download={file.fileName}>
                    Download
                  </a>
                  {!disabled && (
                    <button
                      className={styles.uploadDangerButton}
                      type="button"
                      onClick={() => handleRemoveBusinessFile(file.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export const FinancialActuals = ({ stage, disabled, onChange, commentScope }: FinancialEditorProps) => {
  const months = useMemo<MonthDescriptor[]>(() => buildMonthRange(stage), [stage]);
  const scopeKey = commentScope ?? stage.key ?? 'stage';
  const gridTemplateColumns = useMemo(
    () => `${CATEGORY_COLUMN_WIDTH}px repeat(${Math.max(months.length, 1)}, minmax(110px, 1fr))`,
    [months.length]
  );
  const { blueprint: financialBlueprint } = useFinancialsState();
  const fiscalStartMonth = financialBlueprint?.fiscalYear?.startMonth ?? DEFAULT_FISCAL_YEAR_START_MONTH;
  const [includeOneOff, setIncludeOneOff] = useState(true);
  const [planLineMode, setPlanLineMode] = useState<'impact' | 'split'>('impact');
  const [showPlanAsLine, setShowPlanAsLine] = useState(false);
  const activeBenefitKinds = useMemo<InitiativeFinancialKind[]>(
    () => (includeOneOff ? benefitKinds : ['recurring-benefits']),
    [includeOneOff]
  );
  const activeCostKinds = useMemo<InitiativeFinancialKind[]>(
    () => (includeOneOff ? costKinds : ['recurring-costs']),
    [includeOneOff]
  );
  const activeKindSet = useMemo(
    () => new Set<InitiativeFinancialKind>([...activeBenefitKinds, ...activeCostKinds]),
    [activeBenefitKinds, activeCostKinds]
  );
  const monthKeys = useMemo(() => months.map((month) => month.key), [months]);

  const kindMonthlyTotals = useMemo(
    () =>
      initiativeFinancialKinds.reduce(
        (acc, kind) => {
          acc[kind] = buildKindMonthlyTotals(stage, kind);
          return acc;
        },
        {} as Record<InitiativeFinancialKind, Record<string, number>>
      ),
    [stage]
  );

  const actualKindMonthlyTotals = useMemo(
    () =>
      initiativeFinancialKinds.reduce(
        (acc, kind) => {
          acc[kind] = buildKindActualMonthlyTotals(stage, kind);
          return acc;
        },
        {} as Record<InitiativeFinancialKind, Record<string, number>>
      ),
    [stage]
  );

  const planImpactTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    months.forEach((month) => {
      const benefits = activeBenefitKinds.reduce(
        (sum, kind) => sum + (kindMonthlyTotals[kind][month.key] ?? 0),
        0
      );
      const costs = activeCostKinds.reduce((sum, kind) => sum + (kindMonthlyTotals[kind][month.key] ?? 0), 0);
      totals[month.key] = benefits - costs;
    });
    return totals;
  }, [months, kindMonthlyTotals, activeBenefitKinds, activeCostKinds]);

  const actualImpactTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    months.forEach((month) => {
      const benefits = activeBenefitKinds.reduce(
        (sum, kind) => sum + (actualKindMonthlyTotals[kind][month.key] ?? 0),
        0
      );
      const costs = activeCostKinds.reduce(
        (sum, kind) => sum + (actualKindMonthlyTotals[kind][month.key] ?? 0),
        0
      );
      totals[month.key] = benefits - costs;
    });
    return totals;
  }, [months, actualKindMonthlyTotals, activeBenefitKinds, activeCostKinds]);

  const entryColorMap = useMemo(() => buildEntryColorMap(stage), [stage.financials]);
  const actualEntryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    Object.entries(entryColorMap).forEach(([id, color]) => {
      map[id] = shadeColor(color, 0.25);
    });
    return map;
  }, [entryColorMap]);

  const planChartData = useMemo<ChartMonthStack[]>(
    () => buildChartStacks(months, stage, activeKindSet, entryColorMap, (entry) => entry.distribution),
    [months, stage, activeKindSet, entryColorMap]
  );

  const actualChartData = useMemo<ChartMonthStack[]>(
    () => buildChartStacks(months, stage, activeKindSet, actualEntryColorMap, (entry) => entry.actuals ?? {}),
    [months, stage, activeKindSet, actualEntryColorMap]
  );

  const planRunRate = calculateRunRate(monthKeys, planImpactTotals);
  const actualRunRate = calculateRunRate(monthKeys, actualImpactTotals);
  const planSummaries = useMemo(
    () => calculateYearSummaries(planImpactTotals, fiscalStartMonth),
    [planImpactTotals, fiscalStartMonth]
  );
  const actualSummaries = useMemo(
    () => calculateYearSummaries(actualImpactTotals, fiscalStartMonth),
    [actualImpactTotals, fiscalStartMonth]
  );

  const updateEntries = (
    kind: InitiativeFinancialKind,
    updater: (entries: InitiativeFinancialEntry[]) => InitiativeFinancialEntry[]
  ) => {
    const nextEntries = updater(stage.financials[kind]);
    onChange({ ...stage, financials: { ...stage.financials, [kind]: nextEntries } });
  };

  const handleActualChange = (kind: InitiativeFinancialKind, nextEntry: InitiativeFinancialEntry) => {
    updateEntries(kind, (entries) => entries.map((entry) => (entry.id === nextEntry.id ? nextEntry : entry)));
  };

  const showEmptyState = Array.from(activeKindSet).every((kind) => stage.financials[kind].length === 0);

  return (
    <section
      className={styles.financialBoard}
      {...createCommentAnchor(`financial.${scopeKey}.actuals`, 'P&L actuals board')}
    >
      <header className={styles.financialHeading}>
        <div>
          <h3>P&amp;L actuals</h3>
          <p>Track realised impact against your outlook month by month.</p>
        </div>
        <div className={styles.actualsToggles}>
          <label
            className={styles.oneOffToggle}
            {...createCommentAnchor(`financial.${scopeKey}.actuals.toggle.oneoff`, 'Include one-off actuals toggle')}
          >
            <input
              type="checkbox"
              checked={includeOneOff}
              onChange={(event) => setIncludeOneOff(event.target.checked)}
            />
            <span>Include one-off items</span>
          </label>
          <label
            className={styles.oneOffToggle}
            {...createCommentAnchor(`financial.${scopeKey}.actuals.toggle.line`, 'Toggle plan line view')}
          >
            <input
              type="checkbox"
              checked={showPlanAsLine}
              onChange={(event) => setShowPlanAsLine(event.target.checked)}
            />
            <span>Show plan as line</span>
          </label>
          {showPlanAsLine && (
            <label className={`${styles.oneOffToggle} ${styles.lineModeToggle}`}>
              <span>Line mode</span>
              <select value={planLineMode} onChange={(event) => setPlanLineMode(event.target.value as 'impact' | 'split')}>
                <option value="impact">Single line (impact)</option>
                <option value="split">Two lines (benefits vs costs)</option>
              </select>
            </label>
          )}
        </div>
      </header>

      <p className={styles.actualsLead}>
        Plan values are mirrored from Financial outlook and stay locked here. Use the rows beneath to record actuals.
      </p>

      <div className={styles.metricsRow}>
        <SummaryList
          title="Plan (FY)"
          items={planSummaries.fiscal}
          anchorAttributes={createCommentAnchor(
            `financial.${scopeKey}.actuals.summary.plan`,
            'Plan fiscal totals snapshot'
          )}
        />
        <SummaryList
          title="Actuals (FY)"
          items={actualSummaries.fiscal}
          anchorAttributes={createCommentAnchor(
            `financial.${scopeKey}.actuals.summary.actual`,
            'Actual fiscal totals snapshot'
          )}
        />
        <div className={styles.metricCard}>
          <span>Plan run rate (last 12 months)</span>
          <strong>{formatCurrency(planRunRate)}</strong>
        </div>
        <div className={styles.metricCard}>
          <span>Actual run rate (last 12 months)</span>
          <strong>{formatCurrency(actualRunRate)}</strong>
          <p className={styles.metricNote}>
            Delta vs plan: {formatCurrency(actualRunRate - planRunRate)}
          </p>
        </div>
      </div>

      <div className={styles.sheetWrapper}>
        <div className={styles.sheetScroller}>
          <PlanVsActualChart
            months={months}
            gridTemplateColumns={gridTemplateColumns}
            planData={planChartData}
            actualData={actualChartData}
            showPlanAsLine={showPlanAsLine}
            planLineMode={planLineMode}
            anchorScope={`financial.${scopeKey}.actuals.chart`}
          />
          <div className={`${styles.sheetRow} ${styles.sheetHeader}`} style={{ gridTemplateColumns }}>
            <div className={styles.categoryHeader}>Line item</div>
            {months.map((month) => (
              <div key={month.key} className={styles.monthHeader}>
                {month.label} {month.year}
              </div>
            ))}
          </div>

          {showEmptyState && (
            <p className={styles.placeholder}>
              No plan lines yet. Add entries in Financial outlook to start capturing actuals.
            </p>
          )}

          {!showEmptyState &&
            initiativeFinancialKinds.map((kind) => {
              if (!activeKindSet.has(kind)) {
                return null;
              }
              return (
                <Fragment key={kind}>
                  <div
                    className={styles.kindDivider}
                    {...createCommentAnchor(`financial.${scopeKey}.actuals.section.${kind}`, SECTION_LABELS[kind])}
                  >
                    <span>{SECTION_LABELS[kind]}</span>
                    <span className={styles.kindMeta}>Synced from outlook</span>
                  </div>
                  {stage.financials[kind].length === 0 ? (
                    <p className={styles.placeholder}>No plan lines for this bucket.</p>
                  ) : (
                    stage.financials[kind].map((entry) => (
                      <Fragment key={entry.id}>
                        <ReadOnlyPlanRow
                          entry={entry}
                          months={months}
                          gridTemplateColumns={gridTemplateColumns}
                          anchorAttributes={createCommentAnchor(
                            `financial.${scopeKey}.actuals.plan.${entry.id}`,
                            entry.label || SECTION_LABELS[kind]
                          )}
                        />
                        <ActualsRow
                          entry={entry}
                          months={months}
                          gridTemplateColumns={gridTemplateColumns}
                          disabled={disabled}
                          onChange={(nextEntry) => handleActualChange(kind, nextEntry)}
                          anchorAttributes={createCommentAnchor(
                            `financial.${scopeKey}.actuals.entry.${entry.id}`,
                            `${entry.label || SECTION_LABELS[kind]} actuals`
                          )}
                        />
                      </Fragment>
                    ))
                  )}
                </Fragment>
              );
            })}
        </div>
      </div>
    </section>
  );
};


