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

const Sparkline = ({ values }: { values: number[] }) => {
  if (!values.length) {
    return <div className={styles.sparklineEmpty}>No data</div>;
  }
  const max = Math.max(...values.map((v) => Math.abs(v)), 1);
  const points = values.map((v, idx) => {
    const x = (idx / Math.max(values.length - 1, 1)) * 100;
    const y = 100 - (v / max) * 50 - 25;
    return `${x},${y}`;
  });
  return (
    <svg className={styles.sparkline} viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points={points.join(' ')} fill="none" stroke="#2563eb" strokeWidth="2" />
    </svg>
  );
};

export const StageKpiEditor = ({ stage, disabled, kpiOptions, onChange }: StageKpiEditorProps) => {
  const months = useMemo(() => buildMonthRange(stage), [stage]);
  const monthKeys = months.map((m) => m.key);

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
          <div className={`${styles.row} ${styles.headerRow}`}>
            <div className={styles.colName}>KPI</div>
            <div className={styles.colUnit}>Unit</div>
            <div className={styles.colSource}>Source</div>
            <div className={styles.colBaseline}>Baseline</div>
            <div className={styles.colSpark}>Trend</div>
            {months.map((month) => (
              <div key={`head-${month.key}`} className={styles.colMonth}>
                {month.label} {month.year}
              </div>
            ))}
            <div className={styles.colActions}>Actions</div>
          </div>
          {(stage.kpis ?? []).map((kpi) => {
            const distribution = ensureDistributionKeys(kpi);
            const values = monthKeys.map((m) => distribution[m] ?? 0);
            return (
              <div key={kpi.id} className={styles.row}>
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
                <div className={styles.colSpark}>
                  <Sparkline values={values} />
                </div>
                {months.map((month) => (
                  <div key={`${kpi.id}-${month.key}`} className={styles.colMonth}>
                    <input
                      type="number"
                      value={formatNumber(distribution[month.key])}
                      disabled={disabled}
                      onChange={(event) => handleDistributionChange(kpi.id, month.key, event.target.value)}
                    />
                  </div>
                ))}
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
