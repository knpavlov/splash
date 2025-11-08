import { useEffect, useMemo, useRef, useState } from 'react';
import styles from '../../../styles/FinancialEditor.module.css';
import {
  InitiativeFinancialEntry,
  InitiativeStageData,
  pnlCategories,
  InitiativeFinancialKind,
  initiativeFinancialKinds
} from '../../../shared/types/initiative';
import { generateId } from '../../../shared/ui/generateId';

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

const SECTION_HELP: Record<InitiativeFinancialKind, string> = {
  'recurring-benefits': 'Monthly uplift that repeats over the initiative period.',
  'recurring-costs': 'Monthly cost to keep the initiative running.',
  'oneoff-benefits': 'Single-time positive impact (e.g. sale of assets).',
  'oneoff-costs': 'Single-time expenses (e.g. implementation fees).'
};

const parseMonthKey = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }
  return new Date(year, month - 1, 1);
};

const buildMonthRange = (stage: InitiativeStageData) => {
  const now = new Date();
  now.setDate(1);

  const defaultEnd = new Date(now);
  defaultEnd.setMonth(defaultEnd.getMonth() + 11);

  const endYear = stage.periodYear ?? defaultEnd.getFullYear();
  const endMonth = stage.periodMonth ?? defaultEnd.getMonth() + 1;
  const endCandidate = new Date(endYear, endMonth - 1, 1);
  const end = endCandidate.getTime() < now.getTime() ? defaultEnd : endCandidate;

  let earliest: Date | null = null;
  for (const kind of initiativeFinancialKinds) {
    stage.financials[kind].forEach((entry) => {
      Object.keys(entry.distribution).forEach((key) => {
        const parsed = parseMonthKey(key);
        if (!parsed) {
          return;
        }
        if (!earliest || parsed.getTime() < earliest.getTime()) {
          earliest = parsed;
        }
      });
    });
  }

  const earliestDate = earliest as Date | null;
  let start = now;
  if (earliestDate && earliestDate.getTime() < now.getTime()) {
    start = earliestDate;
  }
  const months: { key: string; label: string; year: number }[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime() && months.length < 360) {
    months.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      label: cursor.toLocaleString('en-US', { month: 'short' }),
      year: cursor.getFullYear()
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
};

interface EntryRowProps {
  entry: InitiativeFinancialEntry;
  disabled: boolean;
  months: { key: string; label: string; year: number }[];
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
          title="More actions"
        >
          …
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
                <select value={duration} onChange={(event) => setDuration(Number(event.target.value))} disabled={disabled}>
                  {Array.from({ length: months.length }).map((_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1} m
                    </option>
                  ))}
                </select>
                <button type="button" onClick={distributeTotal} disabled={disabled}>
                  Spread
                </button>
              </div>
            </div>
            <button className={styles.menuRemoveButton} onClick={onRemove} disabled={disabled} type="button">
              Remove line
            </button>
          </div>
        )}
      </div>
      {months.map((month) => (
        <label key={month.key} className={styles.sheetCell}>
          <span className={styles.monthLabel}>
            {month.label} {month.year}
          </span>
          <div className={styles.monthInputWrapper}>
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
              ↦
            </button>
          </div>
        </label>
      ))}
    </div>
  );
};

export const FinancialEditor = ({ stage, disabled, onChange }: FinancialEditorProps) => {
  const months = useMemo(() => buildMonthRange(stage), [stage]);
  const gridTemplateColumns = useMemo(
    () => `220px repeat(${Math.max(months.length, 1)}, minmax(120px, 1fr))`,
    [months.length]
  );

  useEffect(() => {
    const monthSet = new Set(months.map((month) => month.key));
    let changed = false;
    const nextStage: InitiativeStageData = {
      ...stage,
      financials: { ...stage.financials }
    };
    initiativeFinancialKinds.forEach((kind) => {
      nextStage.financials[kind] = stage.financials[kind].map((entry) => {
        const filtered = Object.fromEntries(
          Object.entries(entry.distribution).filter(([key]) => monthSet.has(key))
        );
        if (Object.keys(filtered).length !== Object.keys(entry.distribution).length) {
          changed = true;
          return { ...entry, distribution: filtered };
        }
        return entry;
      });
    });
    if (changed) {
      onChange(nextStage);
    }
  }, [months, onChange, stage]);

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
    <div className={styles.editorWrapper}>
      {initiativeFinancialKinds.map((kind) => (
        <section key={kind} className={styles.section}>
          <header className={styles.sectionHeader}>
            <div>
              <h4>{SECTION_LABELS[kind]}</h4>
              <p>{SECTION_HELP[kind]}</p>
            </div>
            <button className={styles.secondaryButton} onClick={() => addEntry(kind)} type="button" disabled={disabled}>
              Add line
            </button>
          </header>
          {stage.financials[kind].length === 0 ? (
            <p className={styles.placeholder}>No data yet. Use “Add line” to start capturing this metric.</p>
          ) : (
            <div className={styles.sheetWrapper}>
              <div className={styles.sheetScroller}>
                <div className={`${styles.sheetRow} ${styles.sheetHeader}`} style={{ gridTemplateColumns }}>
                  <div className={styles.categoryHeader}>P&L category</div>
                  {months.map((month) => (
                    <div key={month.key} className={styles.monthHeader}>
                      {month.label} {month.year}
                    </div>
                  ))}
                </div>
                {stage.financials[kind].map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    disabled={disabled}
                    months={months}
                    gridTemplateColumns={gridTemplateColumns}
                    onChange={(nextEntry) => handleEntryChange(kind, nextEntry)}
                    onRemove={() => removeEntry(kind, entry.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
};
