import { useMemo, useState } from 'react';
import styles from '../../styles/CapacityHeatmapScreen.module.css';
import { useParticipantsState, useInitiativesState, useWorkstreamsState } from '../../app/state/AppStateContext';
import { Participant } from '../../shared/types/participant';
import { sanitizePlanModel } from '../initiatives/plan/planModel';
import { Initiative, InitiativePlanModel, InitiativePlanTask } from '../../shared/types/initiative';
import { collectCapacitySlices, CapacitySlice } from '../initiatives/plan/capacityUtils';
import { parseDate } from '../initiatives/plan/planTimeline';
import { InitiativePlanModule } from '../initiatives/components/plan/InitiativePlanModule';

type ViewMode = 'weekly' | 'monthly';

interface PeriodBucket {
  id: string;
  label: string;
  start: Date;
  end: Date;
  days: number;
}

interface ParticipantLoadRow {
  type: 'participant';
  participant: Participant;
  loads: number[];
  indent: number;
  hasAssignments: boolean;
}

interface GroupNode {
  type: 'group';
  id: string;
  label: string;
  depth: number;
  participantCount: number;
  children: NodeEntry[];
}

interface ParticipantTaskInfo {
  id: string;
  name: string;
  start: Date;
  end: Date;
  initiativeId: string;
  initiativeName: string;
  workstreamName: string | null;
  planTaskId: string;
  slices: CapacitySlice[];
}

type NodeEntry = GroupNode | ParticipantLoadRow;

interface PlanOverlayState {
  initiative: Initiative;
  plan: InitiativePlanModel;
  focusTaskId: string | null;
}

const DAY_WIDTH = 12;
const WEEK_DAYS = 7;

const startOfWeek = (value: Date) => {
  const date = new Date(value);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfWeek = (value: Date) => {
  const start = startOfWeek(value);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

const startOfMonth = (value: Date) => {
  const date = new Date(value.getFullYear(), value.getMonth(), 1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfMonth = (value: Date) => {
  const date = new Date(value.getFullYear(), value.getMonth() + 1, 0);
  date.setHours(23, 59, 59, 999);
  return date;
};

const diffInDays = (start: Date, end: Date) => Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));

const clampDate = (value: Date, min: Date, max: Date) => {
  if (value.getTime() < min.getTime()) {
    return new Date(min);
  }
  if (value.getTime() > max.getTime()) {
    return new Date(max);
  }
  return new Date(value);
};

const clonePlanModel = (plan: InitiativePlanModel): InitiativePlanModel =>
  JSON.parse(JSON.stringify(plan));

const calculateTaskLoadForPeriod = (task: ParticipantTaskInfo, period: PeriodBucket) => {
  if (!task.slices.length) {
    return 0;
  }
  let total = 0;
  task.slices.forEach((slice) => {
    const overlapStart = slice.start.getTime() > period.start.getTime() ? slice.start : period.start;
    const overlapEnd = slice.end.getTime() < period.end.getTime() ? slice.end : period.end;
    if (overlapEnd.getTime() < overlapStart.getTime()) {
      return;
    }
    const overlapDays = diffInDays(overlapStart, overlapEnd) + 1;
    if (overlapDays <= 0) {
      return;
    }
    total += (slice.capacity * overlapDays) / WEEK_DAYS;
  });
  return total;
};

const buildTimelineBuckets = (start: Date, end: Date, mode: ViewMode): PeriodBucket[] => {
  if (mode === 'monthly') {
    const buckets: PeriodBucket[] = [];
    let cursor = startOfMonth(start);
    const last = endOfMonth(end);
    while (cursor.getTime() <= last.getTime()) {
      const bucketEnd = endOfMonth(cursor);
      buckets.push({
        id: `m-${cursor.getFullYear()}-${cursor.getMonth()}`,
        label: cursor.toLocaleString('default', { month: 'short', year: 'numeric' }),
        start: new Date(cursor),
        end: new Date(bucketEnd),
        days: diffInDays(cursor, bucketEnd) + 1
      });
      cursor = startOfMonth(new Date(bucketEnd.getFullYear(), bucketEnd.getMonth() + 1, 1));
    }
    return buckets;
  }
  const buckets: PeriodBucket[] = [];
  let cursor = startOfWeek(start);
  const last = endOfWeek(end);
  let index = 0;
  while (cursor.getTime() <= last.getTime()) {
    const bucketEnd = endOfWeek(cursor);
    const label = `${cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${bucketEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    buckets.push({
      id: `w-${index}-${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`,
      label,
      start: new Date(cursor),
      end: new Date(bucketEnd),
      days: diffInDays(cursor, bucketEnd) + 1
    });
    cursor = new Date(bucketEnd);
    cursor.setDate(cursor.getDate() + 1);
    index += 1;
  }
  return buckets;
};

const defaultRange = () => {
  const now = new Date();
  const start = startOfWeek(now);
  const end = endOfWeek(new Date(start));
  end.setDate(end.getDate() + 42);
  return { start, end };
};

const buildParticipantNode = (participant: Participant, loads: number[], indent: number): ParticipantLoadRow => ({
  type: 'participant',
  participant,
  loads,
  indent,
  hasAssignments: loads.some((value) => value > 0.01)
});

const ensureGroup = (
  parent: GroupNode | null,
  label: string,
  depth: number,
  tree: Map<string, GroupNode>,
  roots: GroupNode[]
) => {
  const normalizedLabel = label || `Level ${depth} not set`;
  const parentId = parent ? parent.id : 'root';
  const id = `${parentId}|${normalizedLabel}|${depth}`;
  if (tree.has(id)) {
    return tree.get(id)!;
  }
  const node: GroupNode = {
    type: 'group',
    id,
    label: normalizedLabel,
    depth,
    participantCount: 0,
    children: []
  };
  tree.set(id, node);
  if (parent) {
    parent.children.push(node);
  } else {
    roots.push(node);
  }
  return node;
};

const flattenTree = (nodes: NodeEntry[], collapsed: Set<string>, output: NodeEntry[]) => {
  nodes.forEach((node) => {
    output.push(node);
    if (node.type === 'group' && !collapsed.has(node.id)) {
      flattenTree(node.children, collapsed, output);
    }
  });
};

const getHeatColor = (value: number) => {
  const clamped = Math.max(0, Math.min(value, 160));
  const ratio = clamped / 160;
  const hue = 120 - ratio * 120;
  const lightness = 88 - ratio * 38;
  return `hsl(${hue}, 70%, ${lightness}%)`;
};

export const CapacityHeatmapScreen = () => {
  const { list: participants } = useParticipantsState();
  const { list: initiatives, saveInitiative } = useInitiativesState();
  const { list: workstreamsList } = useWorkstreamsState();
  const [viewMode, setViewMode] = useState<ViewMode>('weekly');
  const [showAllParticipants, setShowAllParticipants] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expandedParticipants, setExpandedParticipants] = useState<Set<string>>(new Set());
  const [taskViewMode, setTaskViewMode] = useState<'bars' | 'columns'>('bars');
  const [planOverlay, setPlanOverlay] = useState<PlanOverlayState | null>(null);
  const [planSaving, setPlanSaving] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const handleOpenPlanOverlay = (task: ParticipantTaskInfo) => {
    const initiative = initiatives.find((item) => item.id === task.initiativeId);
    if (!initiative) {
      return;
    }
    setPlanOverlay({
      initiative,
      plan: clonePlanModel(initiative.plan),
      focusTaskId: task.planTaskId
    });
    setPlanError(null);
  };

  const handlePlanChange = (next: InitiativePlanModel) => {
    setPlanOverlay((current) => (current ? { ...current, plan: next } : current));
  };

  const handlePlanFocusClear = () => {
    setPlanOverlay((current) => (current ? { ...current, focusTaskId: null } : current));
  };

  const handleClosePlanOverlay = () => {
    if (planSaving) {
      return;
    }
    setPlanOverlay(null);
    setPlanError(null);
  };

  const handlePlanSave = async () => {
    if (!planOverlay) {
      return;
    }
    setPlanSaving(true);
    setPlanError(null);
    const payload: Initiative = {
      ...planOverlay.initiative,
      plan: planOverlay.plan
    };
    const expectedVersion = planOverlay.initiative.version ?? null;
    const result = await saveInitiative(payload, expectedVersion);
    setPlanSaving(false);
    if (result.ok) {
      setPlanOverlay({
        initiative: result.data,
        plan: clonePlanModel(result.data.plan),
        focusTaskId: null
      });
    } else {
      setPlanError('Unable to save plan changes. Please try again.');
    }
  };

  const normalizedInitiatives = useMemo(
    () =>
      initiatives.map((initiative) => ({
        ...initiative,
        plan: sanitizePlanModel(initiative.plan)
      })),
    [initiatives]
  );

  const participantNameMap = useMemo(() => {
    const map = new Map<string, Participant>();
    participants.forEach((participant) => {
      const key = participant.displayName?.trim().toLowerCase();
      if (key) {
        map.set(key, participant);
      }
    });
    return map;
  }, [participants]);

  const workstreamMap = useMemo(() => {
    const map = new Map<string, string>();
    workstreamsList.forEach((workstream) => map.set(workstream.id, workstream.name));
    return map;
  }, [workstreamsList]);

  const { periods, rangeStart, rangeEnd } = useMemo(() => {
    const datedTasks: { start: Date; end: Date }[] = [];
    normalizedInitiatives.forEach((initiative) => {
      initiative.plan.tasks.forEach((task) => {
        if (task.startDate && task.endDate) {
          const start = new Date(task.startDate);
          const end = new Date(task.endDate);
          if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
            datedTasks.push({ start, end });
          }
        }
      });
    });
    if (!datedTasks.length) {
      const fallback = defaultRange();
      return {
        periods: buildTimelineBuckets(fallback.start, fallback.end, viewMode),
        rangeStart: fallback.start,
        rangeEnd: fallback.end
      };
    }
    const start = datedTasks.reduce((min, current) => (current.start < min ? current.start : min), datedTasks[0].start);
    const end = datedTasks.reduce((max, current) => (current.end > max ? current.end : max), datedTasks[0].end);
    const extendedStart = startOfWeek(start);
    const extendedEnd = viewMode === 'monthly' ? endOfMonth(end) : endOfWeek(end);
    return {
      periods: buildTimelineBuckets(extendedStart, extendedEnd, viewMode),
      rangeStart: extendedStart,
      rangeEnd: extendedEnd
    };
  }, [normalizedInitiatives, viewMode]);

  const totalDays = Math.max(1, diffInDays(rangeStart, rangeEnd) + 1);
  const timelinePixelWidth = totalDays * DAY_WIDTH;

  const participantLoads = useMemo(() => {
    const map = new Map<string, number[]>();
    const template = () => new Array(periods.length).fill(0);
    participants.forEach((participant) => {
      map.set(participant.id, template());
    });
    if (!periods.length) {
      return map;
    }
    const distribute = (tasks: InitiativePlanTask[]) => {
      tasks.forEach((task) => {
        if (!task.startDate || !task.endDate || !task.responsible) {
          return;
        }
        const owner = participantNameMap.get(task.responsible.trim().toLowerCase());
        if (!owner || !map.has(owner.id)) {
          return;
        }
        const entry = map.get(owner.id)!;
        const slices = collectCapacitySlices(task);
        slices.forEach((slice) => {
          const clampedStart = clampDate(slice.start, rangeStart, rangeEnd);
          const clampedEnd = clampDate(slice.end, rangeStart, rangeEnd);
          if (clampedEnd.getTime() < clampedStart.getTime()) {
            return;
          }
          periods.forEach((period, index) => {
            if (clampedEnd.getTime() < period.start.getTime() || clampedStart.getTime() > period.end.getTime()) {
              return;
            }
            const overlapStart = clampedStart.getTime() > period.start.getTime() ? clampedStart : period.start;
            const overlapEnd = clampedEnd.getTime() < period.end.getTime() ? clampedEnd : period.end;
            if (overlapEnd.getTime() < overlapStart.getTime()) {
              return;
            }
            const overlapDays = diffInDays(overlapStart, overlapEnd) + 1;
            const addition = period.days > 0 ? (slice.capacity * overlapDays) / period.days : 0;
            entry[index] += addition;
          });
        });
      });
    };

    normalizedInitiatives.forEach((initiative) => distribute(initiative.plan.tasks));
    return map;
  }, [normalizedInitiatives, participantNameMap, participants, periods, rangeEnd, rangeStart]);

  const participantTaskMap = useMemo(() => {
    const map = new Map<string, ParticipantTaskInfo[]>();
    normalizedInitiatives.forEach((initiative) => {
      const initiativeName = initiative.name || 'Untitled initiative';
      const workstreamName = initiative.workstreamId ? workstreamMap.get(initiative.workstreamId) || null : null;
      initiative.plan.tasks.forEach((task) => {
        if (!task.responsible || !task.startDate || !task.endDate) {
          return;
        }
        const owner = participantNameMap.get(task.responsible.trim().toLowerCase());
        if (!owner) {
          return;
        }
        const start = parseDate(task.startDate);
        const end = parseDate(task.endDate);
        if (!start || !end) {
          return;
        }
        const existing = map.get(owner.id) ?? [];
        existing.push({
          id: `${initiative.id}-${task.id}`,
          name: task.name || 'Untitled task',
          start,
          end,
          initiativeId: initiative.id,
          initiativeName,
          workstreamName,
          planTaskId: task.id,
          slices: collectCapacitySlices(task)
        });
        map.set(owner.id, existing);
      });
    });
    return map;
  }, [normalizedInitiatives, participantNameMap, workstreamMap]);

  const rows = useMemo(() => {
    const tree = new Map<string, GroupNode>();
    const roots: GroupNode[] = [];
    const flatten: NodeEntry[] = [];

    const consideredParticipants = participants.filter((participant) => {
      if (showAllParticipants) {
        return true;
      }
      const loads = participantLoads.get(participant.id);
      if (!loads) {
        return false;
      }
      return loads.some((value) => value > 0.01);
    });

    consideredParticipants.forEach((participant) => {
      const loads = participantLoads.get(participant.id) ?? periods.map(() => 0);
      const hasAssignments = loads.some((value) => value > 0.01);
      if (!showAllParticipants && !hasAssignments) {
        return;
      }
      const level1 = participant.hierarchyLevel1?.trim() || 'Ungrouped';
      const level2 = participant.hierarchyLevel2?.trim();
      const level3 = participant.hierarchyLevel3?.trim();
      const level1Group = ensureGroup(null, level1, 1, tree, roots);
      level1Group.participantCount += 1;
      let currentParent = level1Group;
      if (level2) {
        currentParent = ensureGroup(level1Group, level2, 2, tree, roots);
        currentParent.participantCount += 1;
      }
      if (level3) {
        currentParent = ensureGroup(currentParent, level3, 3, tree, roots);
        currentParent.participantCount += 1;
      }
      const indent = currentParent.depth;
      const node = buildParticipantNode(participant, loads, indent);
      currentParent.children.push(node);
    });

    flattenTree(roots, collapsedGroups, flatten);
    return flatten;
  }, [collapsedGroups, participantLoads, participants, periods, showAllParticipants]);

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleParticipant = (id: string) => {
    setExpandedParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderTaskStrip = (task: ParticipantTaskInfo) => {
    const hasDates = task.start && task.end;
    const contentWidth = `${timelinePixelWidth}px`;
    if (!hasDates) {
      return <p className={styles.emptyTimeline}>No schedule defined for this task.</p>;
    }
    const clampedStart = clampDate(task.start, rangeStart, rangeEnd);
    const clampedEnd = clampDate(task.end, rangeStart, rangeEnd);
    const offsetDays = Math.max(0, diffInDays(rangeStart, clampedStart));
    const durationDays = Math.max(1, diffInDays(clampedStart, clampedEnd) + 1);
    const leftPx = offsetDays * DAY_WIDTH;
    const widthPx = durationDays * DAY_WIDTH;
    const background = `repeating-linear-gradient(to right, rgba(148, 163, 184, 0.25) 0, rgba(148, 163, 184, 0.25) 1px, transparent 1px, transparent ${DAY_WIDTH}px)`;
    return (
      <div className={styles.taskTimelineScroller}>
        <div
          className={styles.taskStripCanvas}
          style={{ width: contentWidth, backgroundSize: `${DAY_WIDTH}px 100%`, backgroundImage: background }}
        >
          <span className={styles.taskStripBar} style={{ left: `${leftPx}px`, width: `${widthPx}px` }} />
        </div>
      </div>
    );
  };

  const renderTaskColumns = (task: ParticipantTaskInfo) => {
    if (!task.slices.length) {
      return <p className={styles.emptyTimeline}>No capacity data available for this task.</p>;
    }
    return (
      <div className={styles.taskTimelineScroller}>
        <div className={styles.taskColumnsCanvas} style={{ width: `${timelinePixelWidth}px` }}>
          <div className={styles.taskColumnsHundred} />
          <div className={styles.taskColumnsSeries}>
            {periods.map((period) => {
              const load = Math.max(0, Math.round(calculateTaskLoadForPeriod(task, period)));
              const initiativeHeight = Math.min(load, 100);
              const overloadHeight = Math.max(load - 100, 0);
              const bucketWidth = period.days * DAY_WIDTH;
              const tooltip = `${period.label} · ${load}%`;
              return (
                <div
                  key={`${task.id}-${period.id}`}
                  className={styles.taskColumnsBucket}
                  style={{ width: `${bucketWidth}px` }}
                  title={tooltip}
                  aria-label={tooltip}
                >
                  <div className={styles.taskColumnsBar}>
                    <span
                      className={styles.taskColumnsInitiative}
                      style={{ height: `${initiativeHeight}%`, opacity: initiativeHeight > 0 ? 1 : 0 }}
                    />
                    {overloadHeight > 0 && (
                      <span
                        className={styles.taskColumnsOverload}
                        style={{ height: `${Math.min(overloadHeight, 100)}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <section className={styles.heatmapScreen}>
      <header className={styles.header}>
        <div>
          <h1>Capacity heatmap</h1>
          <p>Review planned workload across participants and hierarchy levels.</p>
        </div>
        <div className={styles.filters}>
          <label>
            Granularity
            <select value={viewMode} onChange={(event) => setViewMode(event.target.value as ViewMode)}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={showAllParticipants}
              onChange={(event) => setShowAllParticipants(event.target.checked)}
            />
            Show all participants
          </label>
          <div className={styles.modeSwitch}>
            <span>Task view</span>
            <div className={styles.modeButtons}>
              <button
                type="button"
                className={`${styles.modeButton} ${taskViewMode === 'bars' ? styles.modeActive : ''}`}
                onClick={() => setTaskViewMode('bars')}
              >
                Strips
              </button>
              <button
                type="button"
                className={`${styles.modeButton} ${taskViewMode === 'columns' ? styles.modeActive : ''}`}
                onClick={() => setTaskViewMode('columns')}
              >
                Columns
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className={styles.tableWrapper}>
        <table className={styles.heatmapTable}>
          <thead>
            <tr>
              <th>Hierarchy</th>
              {periods.map((period) => (
                <th key={period.id}>{period.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={periods.length + 1} className={styles.emptyState}>
                  No participants available for the current filter.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                if (row.type === 'group') {
                  const isCollapsed = collapsedGroups.has(row.id);
                  return (
                    <tr key={row.id} className={styles.groupRow}>
                      <td colSpan={periods.length + 1}>
                        <button
                          type="button"
                          className={styles.groupToggle}
                          onClick={() => toggleGroup(row.id)}
                          aria-expanded={!isCollapsed}
                        >
                          <span className={isCollapsed ? styles.chevronRight : styles.chevronDown} />
                          {row.label}
                          <span className={styles.groupMeta}>{row.participantCount} participants</span>
                        </button>
                      </td>
                    </tr>
                  );
                }
                const isExpanded = expandedParticipants.has(row.participant.id);
                const tasks = participantTaskMap.get(row.participant.id) ?? [];
                return (
                  <>
                    <tr key={row.participant.id} className={styles.participantRow}>
                      <td
                        className={`${styles.nameCell} ${styles.nameCellButton}`}
                        style={{ paddingLeft: `${Math.max(0, row.indent - 1) * 16}px` }}
                      >
                        <button type="button" onClick={() => toggleParticipant(row.participant.id)}>
                          <span className={isExpanded ? styles.chevronDownSmall : styles.chevronRightSmall} />
                          {row.participant.displayName}
                        </button>
                      </td>
                      {row.loads.map((value, index) => {
                        const isEmpty = value < 0.01;
                        return (
                          <td key={`${row.participant.id}-${periods[index].id}`}>
                            <div
                              className={`${styles.heatCell} ${isEmpty ? styles.heatCellEmpty : ''}`}
                              style={{ background: isEmpty ? undefined : getHeatColor(value) }}
                            >
                              {value > 1 ? `${Math.round(value)}%` : ''}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                    {isExpanded &&
                      (tasks.length ? (
                        tasks.map((task) => (
                          <tr key={`${row.participant.id}-${task.id}`} className={styles.taskDetailRow}>
                            <td className={styles.taskInfoCell}>
                              <div className={styles.taskTitle}>{task.name}</div>
                              <div className={styles.taskMeta}>
                                {task.workstreamName && <span>{task.workstreamName}</span>}
                                <span>{task.initiativeName}</span>
                              </div>
                              <div className={styles.taskActions}>
                                <a
                                  className={styles.taskActionButton}
                                  href={`#/initiatives/view/${task.initiativeId}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Open initiative
                                </a>
                                <button
                                  type="button"
                                  className={styles.taskActionButton}
                                  onClick={() => handleOpenPlanOverlay(task)}
                                >
                                  Open plan
                                </button>
                              </div>
                            </td>
                            <td className={styles.taskTimelineCell} colSpan={periods.length}>
                              {taskViewMode === 'columns' ? renderTaskColumns(task) : renderTaskStrip(task)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr key={`${row.participant.id}-details`} className={styles.taskDetailRow}>
                          <td className={styles.taskInfoCell} colSpan={periods.length + 1}>
                            <p className={styles.emptyTimeline}>No tasks planned for this participant.</p>
                          </td>
                        </tr>
                      ))}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      </section>
      {planOverlay && (
        <div className={styles.planOverlay}>
          <div className={styles.planOverlayCard}>
            <header className={styles.planOverlayHeader}>
              <div>
                <h2>{planOverlay.initiative.name}</h2>
                <p>Adjust implementation plan without leaving the heatmap.</p>
              </div>
              <button type="button" className={styles.planOverlayClose} onClick={handleClosePlanOverlay}>
                Close
              </button>
            </header>
            <div className={styles.planOverlayContent}>
              <InitiativePlanModule
                plan={planOverlay.plan}
                initiativeId={planOverlay.initiative.id}
                allInitiatives={initiatives}
                onChange={handlePlanChange}
                focusTaskId={planOverlay.focusTaskId}
                onFocusHandled={handlePlanFocusClear}
              />
            </div>
            <footer className={styles.planOverlayFooter}>
              {planError && <span className={styles.planOverlayError}>{planError}</span>}
              <div className={styles.planOverlayActions}>
                <button type="button" className={styles.taskActionButton} onClick={handleClosePlanOverlay} disabled={planSaving}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.planOverlayPrimary}
                  onClick={handlePlanSave}
                  disabled={planSaving}
                >
                  {planSaving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
};
