import { useCallback, useMemo, useState } from 'react';
import styles from '../../styles/PortfolioPlanScreen.module.css';
import { StickyTopPanel } from '../../components/layout/StickyTopPanel';
import { Initiative, InitiativePlanModel, InitiativePlanTask } from '../../shared/types/initiative';
import { useInitiativesState, useWorkstreamsState } from '../../app/state/AppStateContext';
import { InitiativePlanModule } from '../initiatives/components/plan/InitiativePlanModule';

type GroupMode = 'initiative' | 'workstream' | 'responsible';

type SaveStatus = { type: 'success' | 'error' | 'info'; text: string } | null;

const normalizeResponsible = (value: string | null | undefined) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed.toLowerCase() : 'unassigned';
};

const responsibleLabel = (value: string | null | undefined) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || 'Unassigned';
};

const taskResponsibleNames = (task: InitiativePlanTask) => {
  const sources = task.assignees && task.assignees.length ? task.assignees : [{ name: task.responsible }];
  return sources
    .map((assignee) => assignee.name)
    .filter((name): name is string => Boolean(name && name.trim()));
};

const primaryResponsibleName = (task: InitiativePlanTask) => task.assignees?.[0]?.name ?? task.responsible;

const defaultSettings: InitiativePlanModel['settings'] = { zoomLevel: 2, splitRatio: 0.45 };

export const PortfolioPlanScreen = () => {
  const { list: initiatives, saveInitiative, loaded } = useInitiativesState();
  const { list: workstreams } = useWorkstreamsState();
  const [workstreamFilter, setWorkstreamFilter] = useState<string>('all');
  const [initiativeFilter, setInitiativeFilter] = useState<string>('all');
  const [responsibleFilter, setResponsibleFilter] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<GroupMode>('initiative');
  const [drafts, setDrafts] = useState<Record<string, Initiative>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);

  const effectiveInitiatives = useMemo(
    () => initiatives.map((item) => drafts[item.id] ?? item),
    [drafts, initiatives]
  );

  const initiativeMap = useMemo(() => new Map(effectiveInitiatives.map((item) => [item.id, item])), [effectiveInitiatives]);
  const workstreamMap = useMemo(() => new Map(workstreams.map((ws) => [ws.id, ws])), [workstreams]);

  const filteredInitiatives = useMemo(
    () =>
      effectiveInitiatives.filter((initiative) => {
        if (workstreamFilter !== 'all' && initiative.workstreamId !== workstreamFilter) {
          return false;
        }
        if (initiativeFilter !== 'all' && initiative.id !== initiativeFilter) {
          return false;
        }
        return true;
      }),
    [effectiveInitiatives, initiativeFilter, workstreamFilter]
  );

  const selectedResponsibleKey = responsibleFilter === 'all' ? null : responsibleFilter;

  const taskOwnerMap = useMemo(() => {
    const map = new Map<string, string>();
    filteredInitiatives.forEach((initiative) => {
      initiative.plan.tasks.forEach((task) => map.set(task.id, initiative.id));
    });
    return map;
  }, [filteredInitiatives]);

  const responsibleOptions = useMemo(() => {
    const map = new Map<string, string>();
    filteredInitiatives.forEach((initiative) => {
      initiative.plan.tasks.forEach((task) => {
        taskResponsibleNames(task).forEach((name) => {
          const key = normalizeResponsible(name);
          if (!map.has(key)) {
            map.set(key, responsibleLabel(name));
          }
        });
      });
    });
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredInitiatives]);

  const combinedPlan = useMemo<InitiativePlanModel>(() => {
    const settings = filteredInitiatives[0]?.plan.settings ?? defaultSettings;
    const tasks: InitiativePlanTask[] = [];
    filteredInitiatives.forEach((initiative) => {
      initiative.plan.tasks.forEach((task) => {
        if (
          selectedResponsibleKey &&
          !taskResponsibleNames(task).some((name) => normalizeResponsible(name) === selectedResponsibleKey)
        ) {
          return;
        }
        tasks.push(task);
      });
    });
    return { tasks, settings };
  }, [filteredInitiatives, selectedResponsibleKey]);

  const fallbackInitiativeId = useMemo(() => {
    if (initiativeFilter !== 'all') {
      return initiativeFilter;
    }
    return filteredInitiatives[0]?.id ?? effectiveInitiatives[0]?.id ?? null;
  }, [effectiveInitiatives, filteredInitiatives, initiativeFilter]);

  const resolveGroupValue = useCallback(
    (task: InitiativePlanTask) => {
      const ownerId = taskOwnerMap.get(task.id);
      const initiative = ownerId ? initiativeMap.get(ownerId) ?? null : null;
      const workstream = initiative ? workstreamMap.get(initiative.workstreamId) ?? null : null;
      if (groupBy === 'initiative') {
        return initiative?.name ?? 'Unknown initiative';
      }
      if (groupBy === 'workstream') {
        return workstream?.name ?? 'Unassigned workstream';
      }
      const owner = primaryResponsibleName(task);
      const extraCount = Math.max(taskResponsibleNames(task).length - 1, 0);
      if (extraCount > 0) {
        return `${responsibleLabel(owner)} (+${extraCount})`;
      }
      return responsibleLabel(owner);
    },
    [groupBy, initiativeMap, taskOwnerMap, workstreamMap]
  );

  const handlePlanChange = useCallback(
    (nextPlan: InitiativePlanModel) => {
      const ownerMap = new Map(taskOwnerMap);
      if (fallbackInitiativeId) {
        nextPlan.tasks.forEach((task) => {
          if (!ownerMap.has(task.id)) {
            ownerMap.set(task.id, fallbackInitiativeId);
          }
        });
      }
      const tasksByInitiative: Record<string, InitiativePlanTask[]> = {};
      nextPlan.tasks.forEach((task) => {
        const owner = ownerMap.get(task.id);
        if (!owner) {
          return;
        }
        (tasksByInitiative[owner] ??= []).push(task);
      });

      setDrafts((prev) => {
        const nextDrafts = { ...prev };
        for (const [initiativeId, tasks] of Object.entries(tasksByInitiative)) {
          const base = prev[initiativeId] ?? initiativeMap.get(initiativeId);
          if (!base) {
            continue;
          }
          nextDrafts[initiativeId] = {
            ...base,
            plan: {
              ...base.plan,
              tasks,
              settings: nextPlan.settings
            }
          };
        }
        return nextDrafts;
      });
      setStatus(null);
    },
    [fallbackInitiativeId, initiativeMap, taskOwnerMap]
  );

  const handleResetChanges = useCallback(() => {
    setDrafts({});
    setStatus(null);
  }, []);

  const handleSaveAll = useCallback(async () => {
    const dirtyInitiatives = Object.values(drafts);
    if (!dirtyInitiatives.length) {
      setStatus({ type: 'info', text: 'No changes to save.' } as SaveStatus);
      return;
    }
    setSaving(true);
    setStatus(null);
    let failed = 0;
    const nextDrafts: Record<string, Initiative> = {};
    for (const draft of dirtyInitiatives) {
      const expectedVersion = Number.isFinite(draft.version) ? draft.version : null;
      const result = await saveInitiative(draft, expectedVersion);
      if (!result.ok) {
        failed += 1;
        nextDrafts[draft.id] = draft;
      }
    }
    setDrafts(nextDrafts);
    setSaving(false);
    if (failed) {
      setStatus({ type: 'error', text: `Saved with ${failed} error(s). Please retry.` });
    } else {
      setStatus({ type: 'success', text: 'All plan changes saved to initiatives.' });
    }
  }, [drafts, saveInitiative]);

  const contextLabel =
    groupBy === 'initiative' ? 'Initiative' : groupBy === 'workstream' ? 'Workstream' : 'Responsible';

  if (!loaded) {
    return (
      <div className={styles.page}>
        <div className={styles.wrapper}>
          <p className={styles.loading}>Loading initiatives and plans...</p>
        </div>
      </div>
    );
  }

  if (!effectiveInitiatives.length) {
    return (
      <div className={styles.page}>
        <div className={styles.wrapper}>
          <div className={styles.empty}>No initiatives available yet. Create one to start planning.</div>
        </div>
      </div>
    );
  }

  const dirtyCount = Object.keys(drafts).length;

  return (
    <div className={styles.page}>
      <StickyTopPanel
        right={
          <div className={styles.actions}>
            {dirtyCount > 0 && <span className={styles.statusPill}>{dirtyCount} initiative(s) changed</span>}
            {status && (
              <span
                className={`${styles.statusPill} ${
                  status.type === 'success' ? styles.statusSuccess : status.type === 'error' ? styles.statusError : ''
                }`}
              >
                {status.text}
              </span>
            )}
            <button
              className={styles.ghostButton}
              type="button"
              onClick={handleResetChanges}
              disabled={!dirtyCount || saving}
            >
              Reset changes
            </button>
            <button className={styles.primaryButton} type="button" onClick={handleSaveAll} disabled={saving || !dirtyCount}>
              {saving ? 'Saving...' : 'Save all changes'}
            </button>
          </div>
        }
      />
      <div className={styles.wrapper}>
        <div className={styles.header}>
        <div className={styles.titleBlock}>
          <p className={styles.eyebrow}>Dashboards · Delivery</p>
          <h1 className={styles.title}>Portfolio plan</h1>
          <p className={styles.subtitle}>
            One continuous plan view across every initiative. Edits here write back to the same plans used on initiative
            pages.
          </p>
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label htmlFor="workstream-filter">Workstream</label>
          <select
            id="workstream-filter"
            value={workstreamFilter}
            onChange={(event) => setWorkstreamFilter(event.target.value)}
          >
            <option value="all">All workstreams</option>
            {workstreams.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="initiative-filter">Initiative</label>
          <select
            id="initiative-filter"
            value={initiativeFilter}
            onChange={(event) => setInitiativeFilter(event.target.value)}
          >
            <option value="all">All initiatives</option>
            {effectiveInitiatives.map((initiative) => (
              <option key={initiative.id} value={initiative.id}>
                {initiative.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="responsible-filter">Responsible focus</label>
          <select
            id="responsible-filter"
            value={responsibleFilter}
            onChange={(event) => setResponsibleFilter(event.target.value)}
          >
            <option value="all">Everyone</option>
            {responsibleOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>Grouping column</label>
          <div className={styles.segmented}>
            <button
              type="button"
              className={groupBy === 'initiative' ? styles.activeSegment : undefined}
              onClick={() => setGroupBy('initiative')}
            >
              Initiative
            </button>
            <button
              type="button"
              className={groupBy === 'workstream' ? styles.activeSegment : undefined}
              onClick={() => setGroupBy('workstream')}
            >
              Workstream
            </button>
            <button
              type="button"
              className={groupBy === 'responsible' ? styles.activeSegment : undefined}
              onClick={() => setGroupBy('responsible')}
            >
              Responsible
            </button>
          </div>
          <p className={styles.filterHint}>Tasks stay in one continuous list—use the column to spot clusters.</p>
        </div>
      </div>

      {!filteredInitiatives.length ? (
        <div className={styles.empty}>No initiatives match the current filters.</div>
      ) : (
        <div className={styles.planSurface}>
          <InitiativePlanModule
            plan={combinedPlan}
            initiativeId="portfolio"
            allInitiatives={effectiveInitiatives}
            onChange={(next) => handlePlanChange(next as InitiativePlanModel)}
            contextColumn={{
              label: contextLabel,
              value: resolveGroupValue
            }}
          />
        </div>
      )}
      </div>
    </div>
  );
};
