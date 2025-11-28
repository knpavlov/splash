import { useCallback, useMemo, useState } from 'react';
import styles from '../../styles/PortfolioPlanScreen.module.css';
import {
  Initiative,
  InitiativePlanModel,
  InitiativePlanTask
} from '../../shared/types/initiative';
import { useInitiativesState, useWorkstreamsState } from '../../app/state/AppStateContext';
import { InitiativePlanModule } from '../initiatives/components/plan/InitiativePlanModule';
import { Workstream } from '../../shared/types/workstream';

type GroupMode = 'initiative' | 'workstream' | 'responsible';

type PlanStatus = { type: 'success' | 'error'; text: string };

const normalizeResponsible = (value: string | null | undefined) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed.toLowerCase() : 'unassigned';
};

const responsibleLabel = (value: string | null | undefined) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || 'Unassigned';
};

export const PortfolioPlanScreen = () => {
  const { list: initiatives, saveInitiative, loaded } = useInitiativesState();
  const { list: workstreams } = useWorkstreamsState();
  const [workstreamFilter, setWorkstreamFilter] = useState<string>('all');
  const [initiativeFilter, setInitiativeFilter] = useState<string>('all');
  const [responsibleFilter, setResponsibleFilter] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<GroupMode>('initiative');
  const [drafts, setDrafts] = useState<Record<string, Initiative>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, PlanStatus | null>>({});

  const mergedInitiatives = useMemo(
    () => initiatives.map((item) => drafts[item.id] ?? item),
    [drafts, initiatives]
  );

  const workstreamLookup = useMemo(() => {
    const map = new Map<string, Workstream>();
    workstreams.forEach((ws) => map.set(ws.id, ws));
    return map;
  }, [workstreams]);

  const filteredInitiatives = useMemo(
    () =>
      mergedInitiatives.filter((initiative) => {
        if (workstreamFilter !== 'all' && initiative.workstreamId !== workstreamFilter) {
          return false;
        }
        if (initiativeFilter !== 'all' && initiative.id !== initiativeFilter) {
          return false;
        }
        return true;
      }),
    [initiativeFilter, mergedInitiatives, workstreamFilter]
  );

  const responsibleOptions = useMemo(() => {
    const map = new Map<string, string>();
    filteredInitiatives.forEach((initiative) => {
      initiative.plan.tasks.forEach((task) => {
        const key = normalizeResponsible(task.responsible);
        if (!map.has(key)) {
          map.set(key, responsibleLabel(task.responsible));
        }
      });
    });
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredInitiatives]);

  const responsibleLabelMap = useMemo(
    () => new Map(responsibleOptions.map((option) => [option.key, option.label])),
    [responsibleOptions]
  );

  const selectedResponsibleKey = responsibleFilter === 'all' ? null : responsibleFilter;
  const baseTaskFilter = useMemo(
    () =>
      selectedResponsibleKey && groupBy !== 'responsible'
        ? (task: InitiativePlanTask) => normalizeResponsible(task.responsible) === selectedResponsibleKey
        : undefined,
    [groupBy, selectedResponsibleKey]
  );

  const markDirtyStatus = useCallback(
    (initiativeId: string, next: Initiative) => {
      setDrafts((prev) => ({ ...prev, [initiativeId]: next }));
      setStatus((prev) => ({ ...prev, [initiativeId]: null }));
    },
    []
  );

  const handlePlanChange = useCallback(
    (initiativeId: string, nextPlan: InitiativePlanModel) => {
      const source = drafts[initiativeId] ?? initiatives.find((item) => item.id === initiativeId);
      if (!source) {
        return;
      }
      const updated: Initiative = { ...source, plan: nextPlan };
      markDirtyStatus(initiativeId, updated);
    },
    [drafts, initiatives, markDirtyStatus]
  );

  const handleResetPlan = useCallback((initiativeId: string) => {
    setDrafts((prev) => {
      if (!(initiativeId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[initiativeId];
      return next;
    });
    setStatus((prev) => ({ ...prev, [initiativeId]: null }));
  }, []);

  const handleSavePlan = useCallback(
    async (initiativeId: string) => {
      const draft = drafts[initiativeId] ?? initiatives.find((item) => item.id === initiativeId);
      if (!draft) {
        return;
      }
      setSaving((prev) => ({ ...prev, [initiativeId]: true }));
      setStatus((prev) => ({ ...prev, [initiativeId]: null }));
      const expectedVersion = Number.isFinite(draft.version) ? draft.version : null;
      const result = await saveInitiative(draft, expectedVersion);
      setSaving((prev) => ({ ...prev, [initiativeId]: false }));
      if (result.ok) {
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[initiativeId];
          return next;
        });
        setStatus((prev) => ({ ...prev, [initiativeId]: { type: 'success', text: 'Plan saved' } }));
      } else {
        const message =
          result.error === 'version-conflict'
            ? 'Someone else updated this initiative. Refresh and try again.'
            : result.error === 'invalid-input'
              ? 'Plan has invalid data.'
              : result.error === 'not-found'
                ? 'Initiative was not found.'
                : 'Failed to save changes.';
        setStatus((prev) => ({ ...prev, [initiativeId]: { type: 'error', text: message } }));
      }
    },
    [drafts, initiatives, saveInitiative]
  );

  const buildResponsibleFilter = useCallback(
    (key: string) => (task: InitiativePlanTask) => normalizeResponsible(task.responsible) === key,
    []
  );

  const workstreamGroups = useMemo(() => {
    const map = new Map<string, Initiative[]>();
    filteredInitiatives.forEach((initiative) => {
      const key = initiative.workstreamId || 'unassigned';
      const list = map.get(key) ?? [];
      list.push(initiative);
      map.set(key, list);
    });
    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        name: workstreamLookup.get(key)?.name ?? 'Unassigned workstream',
        initiatives: items
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredInitiatives, workstreamLookup]);

  const responsibleGroups = useMemo(() => {
    const map = new Map<string, Initiative[]>();
    filteredInitiatives.forEach((initiative) => {
      const seen = new Set<string>();
      initiative.plan.tasks.forEach((task) => {
        const key = normalizeResponsible(task.responsible);
        if (selectedResponsibleKey && key !== selectedResponsibleKey) {
          return;
        }
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        const list = map.get(key) ?? [];
        if (!list.includes(initiative)) {
          list.push(initiative);
        }
        map.set(key, list);
      });
    });
    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        label: responsibleLabelMap.get(key) ?? 'Unassigned',
        initiatives: items
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredInitiatives, responsibleLabelMap, selectedResponsibleKey]);

  const renderPlanCard = (initiative: Initiative, taskFilter?: (task: InitiativePlanTask) => boolean, suffix?: string) => {
    const statusEntry = status[initiative.id];
    const isDirty = Boolean(drafts[initiative.id]);
    const isSaving = Boolean(saving[initiative.id]);
    const workstreamName = workstreamLookup.get(initiative.workstreamId)?.name ?? 'Unassigned workstream';
    const cardKey = suffix ? `${initiative.id}:${suffix}` : initiative.id;

    return (
      <div className={styles.planCard} key={cardKey}>
        <div className={styles.planCardHeader}>
          <div>
            <div className={styles.cardEyebrow}>{workstreamName}</div>
            <h3 className={styles.planTitle}>{initiative.name}</h3>
            <p className={styles.planMeta}>
              Live data shared with the initiative page
              {taskFilter ? ' · filtered view' : ''}
              {initiative.ownerName ? ` · Owner: ${initiative.ownerName}` : ''}
            </p>
          </div>
          <div className={styles.planActions}>
            {isDirty && <span className={styles.statusPill}>Unsaved</span>}
            {statusEntry && (
              <span
                className={`${styles.statusPill} ${
                  statusEntry.type === 'success' ? styles.statusSuccess : styles.statusError
                }`}
              >
                {statusEntry.text}
              </span>
            )}
            <button
              className={styles.ghostButton}
              onClick={() => handleResetPlan(initiative.id)}
              disabled={!isDirty || isSaving}
              type="button"
            >
              Reset
            </button>
            <button
              className={styles.primaryButton}
              onClick={() => handleSavePlan(initiative.id)}
              disabled={!isDirty || isSaving}
              type="button"
            >
              {isSaving ? 'Saving...' : 'Save plan'}
            </button>
          </div>
        </div>
        <InitiativePlanModule
          plan={initiative.plan}
          initiativeId={initiative.id}
          allInitiatives={mergedInitiatives}
          onChange={(next) => handlePlanChange(initiative.id, next as InitiativePlanModel)}
          taskFilter={taskFilter ?? baseTaskFilter}
        />
      </div>
    );
  };

  const renderInitiativeSections = () => filteredInitiatives.map((initiative) => renderPlanCard(initiative));

  const renderWorkstreamSections = () =>
    workstreamGroups.map((group) => (
      <section key={group.key} className={styles.groupSection}>
        <div className={styles.groupHeader}>
          <div>
            <div className={styles.cardEyebrow}>Workstream</div>
            <h3 className={styles.groupTitle}>{group.name}</h3>
            <p className={styles.groupMeta}>{group.initiatives.length} initiative(s)</p>
          </div>
        </div>
        <div className={styles.groupBody}>
          {group.initiatives.map((initiative) => renderPlanCard(initiative))}
        </div>
      </section>
    ));

  const renderResponsibleSections = () => {
    if (!responsibleGroups.length) {
      return (
        <div className={styles.empty}>
          No tasks with selected responsible owners. Try switching the responsible filter.
        </div>
      );
    }
    return responsibleGroups.map((group) => (
      <section key={group.key} className={styles.groupSection}>
        <div className={styles.groupHeader}>
          <div>
            <div className={styles.cardEyebrow}>Responsible</div>
            <h3 className={styles.groupTitle}>{group.label}</h3>
            <p className={styles.groupMeta}>{group.initiatives.length} initiative(s)</p>
          </div>
        </div>
        <div className={styles.groupBody}>
          {group.initiatives.map((initiative) => renderPlanCard(initiative, buildResponsibleFilter(group.key), group.key))}
        </div>
      </section>
    ));
  };

  if (!loaded) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.loading}>Loading initiatives and plans...</p>
      </div>
    );
  }

  if (!mergedInitiatives.length) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.empty}>No initiatives available yet. Create one to start planning.</div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <p className={styles.eyebrow}>Dashboards / Delivery</p>
          <h1 className={styles.title}>Portfolio plan</h1>
          <p className={styles.subtitle}>
            One place to orchestrate every initiative plan. Edits here are saved to the same records used on the
            initiative pages.
          </p>
        </div>
        <div className={styles.pillBox}>
          <span className={styles.pill}>{mergedInitiatives.length} initiatives</span>
          <span className={styles.pill}>{workstreams.length} workstreams</span>
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
            {mergedInitiatives.map((initiative) => (
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
          <label>Grouping</label>
          <div className={styles.segmented}>
            <button
              type="button"
              className={groupBy === 'initiative' ? styles.activeSegment : undefined}
              onClick={() => setGroupBy('initiative')}
            >
              Initiatives
            </button>
            <button
              type="button"
              className={groupBy === 'workstream' ? styles.activeSegment : undefined}
              onClick={() => setGroupBy('workstream')}
            >
              Workstreams
            </button>
            <button
              type="button"
              className={groupBy === 'responsible' ? styles.activeSegment : undefined}
              onClick={() => setGroupBy('responsible')}
            >
              Responsibles
            </button>
          </div>
          <p className={styles.filterHint}>
            Rearrange the same plan data by initiative, by workstream, or by owner.
          </p>
        </div>
      </div>

      {!filteredInitiatives.length ? (
        <div className={styles.empty}>
          No initiatives match the current filters. Try switching the workstream or initiative selector.
        </div>
      ) : groupBy === 'initiative' ? (
        renderInitiativeSections()
      ) : groupBy === 'workstream' ? (
        renderWorkstreamSections()
      ) : (
        renderResponsibleSections()
      )}
    </div>
  );
};
