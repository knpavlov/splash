import { useEffect, useMemo, useState } from 'react';
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

const getMonths = (year: number | null, endMonth: number | null) => {
  const baseYear = year && Number.isFinite(year) ? year : new Date().getFullYear();
  const limit = endMonth && endMonth >= 1 && endMonth <= 12 ? endMonth : 12;
  return Array.from({ length: limit }).map((_, index) => {
    const date = new Date(baseYear, index, 1);
    const key = `${baseYear}-${String(index + 1).padStart(2, '0')}`;
    return { key, label: date.toLocaleString('en-US', { month: 'short' }) };
  });
};

interface EntryCardProps {
  entry: InitiativeFinancialEntry;
  disabled: boolean;
  months: { key: string; label: string }[];
  onChange: (entry: InitiativeFinancialEntry) => void;
  onRemove: () => void;
}

const FinancialEntryCard = ({ entry, disabled, months, onChange, onRemove }: EntryCardProps) => {
  const [monthlyValue, setMonthlyValue] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [duration, setDuration] = useState(months.length || 1);
  const [startMonth, setStartMonth] = useState(months[0]?.key ?? '');

  useEffect(() => {
    setStartMonth((current) => (months.find((month) => month.key === current) ? current : months[0]?.key ?? ''));
    setDuration((current) => Math.min(current, months.length || 1));
  }, [months]);

  const handleMonthlyFill = () => {
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

  const handleDistributeTotal = () => {
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

  const handleMonthValueChange = (key: string, value: string) => {
    const numeric = Number(value);
    const distribution = { ...entry.distribution };
    if (value === '') {
      delete distribution[key];
    } else if (Number.isFinite(numeric)) {
      distribution[key] = numeric;
    }
    onChange({ ...entry, distribution });
  };

  const handleFillRight = (key: string) => {
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
    <div className={styles.entryCard}>
      <div className={styles.entryHeader}>
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
        <button className={styles.removeButton} onClick={onRemove} disabled={disabled} type="button">
          Remove
        </button>
      </div>

      <div className={styles.quickFillRow}>
        <div>
          <label>Fill all months</label>
          <div className={styles.quickInputs}>
            <input
              type="number"
              value={monthlyValue}
              onChange={(event) => setMonthlyValue(event.target.value)}
              disabled={disabled}
            />
            <button type="button" onClick={handleMonthlyFill} disabled={disabled}>
              Apply
            </button>
          </div>
        </div>
        <div>
          <label>Distribute total</label>
          <div className={styles.quickInputs}>
            <input
              type="number"
              value={totalValue}
              onChange={(event) => setTotalValue(event.target.value)}
              disabled={disabled}
            />
            <select
              value={startMonth}
              onChange={(event) => setStartMonth(event.target.value)}
              disabled={disabled}
            >
              {months.map((month) => (
                <option key={month.key} value={month.key}>
                  {month.label}
                </option>
              ))}
            </select>
            <select
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              disabled={disabled}
            >
              {Array.from({ length: months.length }).map((_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1} m
                </option>
              ))}
            </select>
            <button type="button" onClick={handleDistributeTotal} disabled={disabled}>
              Distribute
            </button>
          </div>
        </div>
      </div>

      <div className={styles.monthGrid}>
        {months.map((month) => (
          <label key={month.key}>
            <span>{month.label}</span>
            <div className={styles.monthInputWrapper}>
              <input
                type="number"
                value={entry.distribution[month.key] ?? ''}
                onChange={(event) => handleMonthValueChange(month.key, event.target.value)}
                disabled={disabled}
              />
              <button
                type="button"
                className={styles.fillRightButton}
                onClick={() => handleFillRight(month.key)}
                disabled={disabled || entry.distribution[month.key] === undefined}
              >
                ↦
              </button>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};

export const FinancialEditor = ({ stage, disabled, onChange }: FinancialEditorProps) => {
  const months = useMemo(() => getMonths(stage.periodYear, stage.periodMonth), [stage.periodMonth, stage.periodYear]);

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
            <button
              className={styles.secondaryButton}
              onClick={() => addEntry(kind)}
              type="button"
              disabled={disabled}
            >
              Add line
            </button>
          </header>

          {stage.financials[kind].length === 0 ? (
            <p className={styles.placeholder}>No data yet. Use “Add line” to start capturing this metric.</p>
          ) : (
            stage.financials[kind].map((entry) => (
              <FinancialEntryCard
                key={entry.id}
                entry={entry}
                disabled={disabled}
                months={months}
                onChange={(nextEntry) => handleEntryChange(kind, nextEntry)}
                onRemove={() => removeEntry(kind, entry.id)}
              />
            ))
          )}
        </section>
      ))}
    </div>
  );
};
