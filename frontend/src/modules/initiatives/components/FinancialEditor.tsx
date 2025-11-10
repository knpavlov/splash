import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import styles from '../../../styles/FinancialEditor.module.css';
import {
  InitiativeFinancialEntry,
  InitiativeStageData,
  InitiativeFinancialKind,
  initiativeFinancialKinds,
  pnlCategories
} from '../../../shared/types/initiative';
import { generateId } from '../../../shared/ui/generateId';
import {
  buildKindMonthlyTotals,
  buildMonthRange,
  calculateRunRate,
  calculateYearSummaries,
  YearSummaryEntry
} from './financials.helpers';

interface FinancialEditorProps {
  stage: InitiativeStageData;
  disabled: boolean;
  onChange: (nextStage: InitiativeStageData) => void;
}

const SECTION_LABELS: Record<InitiativeFinancialKind, string> = {
  'recurring-benefits': 'Recurring benefits',
  'recurring-costs': 'Recurring costs',
  'oneoff-benefits': 'One-off benefits',
  'oneoff-costs': 'One-off costs'
};

const benefitKinds: InitiativeFinancialKind[] = ['recurring-benefits', 'oneoff-benefits'];
const costKinds: InitiativeFinancialKind[] = ['recurring-costs', 'oneoff-costs'];

const SECTION_COLORS: Record<InitiativeFinancialKind, string> = {
  'recurring-benefits': '#1d4ed8',
  'oneoff-benefits': '#3b82f6',
  'recurring-costs': '#ef4444',
  'oneoff-costs': '#f97316'
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

type MonthDescriptor = { key: string; label: string; year: number; index: number };

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const formatCurrency = (value: number) => currencyFormatter.format(Math.round(value || 0));

const SummaryList = ({ title, items }: { title: string; items: YearSummaryEntry[] }) => {
  if (!items.length) {
    return null;
  }
  return (
    <div className={styles.summaryList}>
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

interface ChartSegment {
  value: number;
  color: string;
}

interface ChartMonthStack {
  key: string;
  positiveSegments: ChartSegment[];
  negativeSegments: ChartSegment[];
  positiveTotal: number;
  negativeTotal: number;
}

const CombinedChart = ({
  months,
  gridTemplateColumns,
  data
}: {
  months: MonthDescriptor[];
  gridTemplateColumns: string;
  data: ChartMonthStack[];
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

  return (
    <div className={styles.chartRow} style={{ gridTemplateColumns }}>
      <div className={styles.chartLegend}>Trend</div>
      {months.map((month, index) => {
        const stat = data[index];
        const positiveRatio = positiveScale ? Math.min(1, stat.positiveTotal / positiveScale) : 0;
        const negativeRatio = negativeScale ? Math.min(1, stat.negativeTotal / negativeScale) : 0;
        const positiveLabelTop = stackTopOffset(positiveShare, positiveRatio) * 100;
        const negativeLabelTop =
          positiveShare * 100 + negativeRatio * negativeShare * 100;
        return (
          <div key={month.key} className={styles.chartCell}>
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
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className={styles.chartZeroLine} style={{ top: `${positiveShare * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface EntryRowProps {
  entry: InitiativeFinancialEntry;
  disabled: boolean;
  months: MonthDescriptor[];
  gridTemplateColumns: string;
  onChange: (entry: InitiativeFinancialEntry) => void;
  onRemove: () => void;
}

const EntryRow = ({ entry, disabled, months, gridTemplateColumns, onChange, onRemove }: EntryRowProps) => {
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
    <div className={styles.sheetRow} style={{ gridTemplateColumns }}>
      <div className={styles.categoryCell}>
        <select
          value={entry.category}
          onChange={(event) => {
            const nextCategory = event.target.value;
            onChange({ ...entry, category: nextCategory, label: nextCategory || entry.label });
          }}
          disabled={disabled}
        >
          <option value="">Select P&L category</option>
          {pnlCategories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.rowMenuButton}
          onClick={() => setMenuOpen((prev) => !prev)}
          disabled={disabled}
          title="Actions"
        >
          ⋯
        </button>
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
            →
          </button>
        </label>
      ))}
    </div>
  );
};

export const FinancialEditor = ({ stage, disabled, onChange }: FinancialEditorProps) => {
  const months = useMemo<MonthDescriptor[]>(() => buildMonthRange(stage), [stage]);
  const gridTemplateColumns = useMemo(
    () => `200px repeat(${Math.max(months.length, 1)}, minmax(110px, 1fr))`,
    [months.length]
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

  const entryColorMap = useMemo(() => {
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
  }, [stage.financials]);

  const chartData = useMemo<ChartMonthStack[]>(
    () =>
      months.map((month) => {
        const positiveSegments: ChartSegment[] = [];
        const negativeSegments: ChartSegment[] = [];
        for (const kind of initiativeFinancialKinds) {
          if (!activeKindSet.has(kind)) {
            continue;
          }
          const isCost = costKinds.includes(kind);
          for (const entry of stage.financials[kind]) {
            const raw = entry.distribution[month.key] ?? 0;
            if (!raw) {
              continue;
            }
            const oriented = raw * (isCost ? -1 : 1);
            const target = oriented >= 0 ? positiveSegments : negativeSegments;
            target.push({
              value: Math.abs(oriented),
              color: entryColorMap[entry.id] ?? SECTION_COLORS[kind]
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
      }),
    [activeKindSet, months, stage.financials, entryColorMap]
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
  const summaryTotals = calculateYearSummaries(impactTotals);

  const updateEntries = (
    kind: InitiativeFinancialKind,
    updater: (entries: InitiativeFinancialEntry[]) => InitiativeFinancialEntry[]
  ) => {
    const nextEntries = updater(stage.financials[kind]);
    onChange({ ...stage, financials: { ...stage.financials, [kind]: nextEntries } });
  };

  const addEntry = (kind: InitiativeFinancialKind) => {
    updateEntries(kind, (entries) => [
      ...entries,
      {
        id: generateId(),
        label: '',
        category: '',
        distribution: {}
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
    <section className={styles.financialBoard}>
      <header className={styles.financialHeading}>
        <div>
          <h3>Financial outlook</h3>
          <p>All recurring and one-off flows in a single, minimal view.</p>
        </div>
        <label className={styles.oneOffToggle}>
          <input
            type="checkbox"
            checked={includeOneOff}
            onChange={(event) => setIncludeOneOff(event.target.checked)}
          />
          <span>Include one-off items</span>
        </label>
      </header>

      <div className={styles.metricsRow}>
        <SummaryList title="Fiscal years" items={summaryTotals.fiscal} />
        <SummaryList title="Calendar years" items={summaryTotals.calendar} />
        <div className={styles.metricCard}>
          <span>Net run rate (last 12 months)</span>
          <strong>{formatCurrency(runRate)}</strong>
        </div>
      </div>

      <div className={styles.sheetWrapper}>
        <div className={styles.sheetScroller}>
          <CombinedChart months={months} gridTemplateColumns={gridTemplateColumns} data={chartData} />
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
              <div className={styles.kindDivider}>
                <span>{SECTION_LABELS[kind]}</span>
                <button
                  className={styles.sectionAddButton}
                  onClick={() => addEntry(kind)}
                  type="button"
                  disabled={disabled}
                >
                  Add line
                </button>
              </div>
              {stage.financials[kind].length === 0 ? (
                <p className={styles.placeholder}>No data yet. Use “Add line” to start capturing this metric.</p>
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
                  />
                ))
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
};
