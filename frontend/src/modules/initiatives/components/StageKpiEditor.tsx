import { useMemo } from 'react';
import styles from '../../../styles/StageKpiEditor.module.css';
import {
  InitiativeStageData,
  InitiativeStageKPI,
  InitiativeStageKey
} from '../../../shared/types/initiative';
import { buildMonthRange } from './financials.helpers';
import { generateId } from '../../../shared/ui/generateId';

interface StageKpiEditorProps {
  stage: InitiativeStageData;
  disabled: boolean;
  kpiOptions: string[];
  onChange: (next: InitiativeStageData) => void;
  commentScope?: InitiativeStageKey;
}

const formatNumber = (value: number | null | undefined) =>
  Number.isFinite(value) ? String(value) : '';

const clampNumber = (value: string) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const StageKpiEditor = ({ stage, disabled, kpiOptions, onChange }: StageKpiEditorProps) => {
  const months = useMemo(() => buildMonthRange(stage), [stage]);
  const monthKeys = months.map((m) => m.key);
  const monthColumnWidth = 96;
  const columnTemplate = useMemo(() => {
    const metaTemplate = `minmax(200px, 1.1fr) minmax(110px, 0.7fr) minmax(130px, 0.8fr) minmax(110px, 0.7fr)`;
    const monthTemplate = `repeat(${Math.max(months.length, 1)}, ${monthColumnWidth}px)`;
    const actionsWidth = `90px`;
    return `${metaTemplate} ${monthTemplate} ${actionsWidth}`;
  }, [months.length]);

  const ensureDistributionKeys = (kpi: InitiativeStageKPI) => {
    const distribution = { ...kpi.distribution };
    monthKeys.forEach((key) => {
      if (distribution[key] === undefined) {
        distribution[key] = 0;
      }
    });
    return distribution;
  };

  const updateKpis = (updater: (list: InitiativeStageKPI[]) => InitiativeStageKPI[]) => {
    onChange({ ...stage, kpis: updater(stage.kpis ?? []) });
  };

  const handleUpdate = (id: string, patch: Partial<InitiativeStageKPI>) => {
    updateKpis((list) =>
      list.map((kpi) => (kpi.id === id ? { ...kpi, ...patch, distribution: ensureDistributionKeys({ ...kpi, ...patch } as InitiativeStageKPI) } : kpi))
    );
  };

  const handleDistributionChange = (id: string, key: string, value: string) => {
    updateKpis((list) =>
      list.map((kpi) => {
        if (kpi.id !== id) {
          return kpi;
        }
        const distribution = { ...ensureDistributionKeys(kpi), [key]: clampNumber(value) };
        return { ...kpi, distribution };
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
        const distribution = ensureDistributionKeys(kpi);
        const value = distribution[key];
        if (value === undefined) {
          return kpi;
        }
        const nextDistribution = { ...distribution };
        for (let index = startIndex + 1; index < monthKeys.length; index += 1) {
          nextDistribution[monthKeys[index]] = value;
        }
        return { ...kpi, distribution: nextDistribution };
      })
    );
  };

  const handleAddFromOption = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    updateKpis((list) => [
      ...list,
      {
        id: generateId(),
        name: trimmed,
        unit: '',
        source: 'System',
        isCustom: false,
        baseline: null,
        distribution: {}
      }
    ]);
  };

  const handleAddCustom = () => {
    updateKpis((list) => [
      ...list,
      {
        id: generateId(),
        name: '',
        unit: '',
        source: '',
        isCustom: true,
        baseline: null,
        distribution: {}
      }
    ]);
  };

  const handleRemove = (id: string) => {
    updateKpis((list) => list.filter((kpi) => kpi.id !== id));
  };

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h3>KPIs</h3>
          <p>Track per-stage KPIs with monthly values and baselines.</p>
        </div>
        <div className={styles.headerActions}>
          <select
            className={styles.optionSelect}
            disabled={disabled || kpiOptions.length === 0}
            onChange={(event) => {
              const value = event.target.value;
              event.target.value = '';
              if (value) {
                handleAddFromOption(value);
              }
            }}
            defaultValue=""
          >
            <option value="" disabled>
              Add KPI from list
            </option>
            {kpiOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button className={styles.primaryButton} type="button" onClick={handleAddCustom} disabled={disabled}>
            Create custom KPI
          </button>
        </div>
      </header>

      {(stage.kpis ?? []).length === 0 ? (
        <p className={styles.placeholder}>No KPIs yet. Select one from the list or create a custom KPI.</p>
      ) : (
        <div className={styles.table}>
          <div className={styles.headerRow} style={{ gridTemplateColumns: columnTemplate }}>
            <div className={styles.headerCell}>KPI</div>
            <div className={styles.headerCell}>Unit</div>
            <div className={styles.headerCell}>Source</div>
            <div className={styles.headerCell}>Baseline</div>
            {months.map((month) => (
              <div key={`head-${month.key}`} className={`${styles.headerCell} ${styles.monthHeader}`}>
                {month.label} {month.year}
              </div>
            ))}
            <div className={styles.headerCell}>Actions</div>
          </div>
          {(stage.kpis ?? []).map((kpi) => {
            const distribution = ensureDistributionKeys(kpi);
            const values = monthKeys.map((m) => distribution[m] ?? 0);
            const maxAbs = Math.max(...values.map((v) => Math.abs(v)), 1);
            return (
              <div key={kpi.id} className={styles.row} style={{ gridTemplateColumns: columnTemplate }}>
                <div className={styles.colName}>
                  {kpi.isCustom ? (
                    <input
                      type="text"
                      value={kpi.name}
                      disabled={disabled}
                      onChange={(event) => handleUpdate(kpi.id, { name: event.target.value, isCustom: true })}
                      placeholder="KPI name"
                    />
                  ) : (
                    <select
                      value={kpi.name}
                      disabled={disabled}
                      onChange={(event) =>
                        handleUpdate(kpi.id, { name: event.target.value, isCustom: false, source: 'System' })
                      }
                    >
                      {kpiOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className={styles.colUnit}>
                  <input
                    type="text"
                    value={kpi.unit}
                    disabled={disabled || !kpi.isCustom}
                    onChange={(event) => handleUpdate(kpi.id, { unit: event.target.value })}
                    placeholder="Unit"
                  />
                </div>
                <div className={styles.colSource}>
                  <input
                    type="text"
                    value={kpi.source}
                    disabled={disabled || !kpi.isCustom}
                    onChange={(event) => handleUpdate(kpi.id, { source: event.target.value })}
                    placeholder="Source"
                  />
                </div>
                <div className={styles.colBaseline}>
                  <input
                    type="number"
                    value={formatNumber(kpi.baseline)}
                    disabled={disabled}
                    onChange={(event) =>
                      handleUpdate(kpi.id, { baseline: event.target.value ? clampNumber(event.target.value) : null })
                    }
                  />
                </div>
                {months.map((month) => {
                  const monthValue = distribution[month.key] ?? 0;
                  const barHeight = Math.min(1, Math.abs(monthValue) / maxAbs) * 36;
                  return (
                    <div key={`${kpi.id}-${month.key}`} className={styles.colMonth}>
                      <div className={styles.barCell}>
                        <div
                          className={`${styles.bar} ${monthValue < 0 ? styles.barNegative : ''}`}
                          style={{ height: `${barHeight}px` }}
                          aria-hidden
                        />
                      </div>
                      <div className={styles.monthInputs}>
                        <input
                          type="number"
                          value={formatNumber(distribution[month.key])}
                          disabled={disabled}
                          onChange={(event) => handleDistributionChange(kpi.id, month.key, event.target.value)}
                        />
                        <button
                          type="button"
                          className={styles.fillButton}
                          onClick={() => handleFillRight(kpi.id, month.key)}
                          disabled={disabled || distribution[month.key] === undefined}
                          title="Fill to the right"
                        >
                          {'>>'}
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className={styles.colActions}>
                  <button className={styles.removeButton} type="button" onClick={() => handleRemove(kpi.id)} disabled={disabled}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
