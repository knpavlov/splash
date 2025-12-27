import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import styles from './InteractivePlanDemo.module.css';

// Demo data types
interface DemoTask {
  id: string;
  name: string;
  responsible: string;
  startDate: Date;
  endDate: Date;
  progress: number;
  color: string;
  indent: number;
  parentId?: string;
  isParent?: boolean;
  isMilestone?: boolean;
  milestoneType?: string;
  capacity: number; // % capacity required
}

// Demo data - realistic enterprise transformation tasks
const INITIAL_TASKS: DemoTask[] = [
  {
    id: '1',
    name: 'Discovery & Requirements',
    responsible: 'Sarah Chen',
    startDate: new Date('2026-01-06'),
    endDate: new Date('2026-01-24'),
    progress: 100,
    color: '#5b21b6',
    indent: 0,
    capacity: 75
  },
  {
    id: '2',
    name: 'Technical Architecture',
    responsible: 'Mike Johnson',
    startDate: new Date('2026-01-20'),
    endDate: new Date('2026-02-07'),
    progress: 85,
    color: '#2563eb',
    indent: 0,
    capacity: 65
  },
  {
    id: '3',
    name: 'Core Platform Dev',
    responsible: 'Alex Rivera',
    startDate: new Date('2026-02-03'),
    endDate: new Date('2026-03-07'),
    progress: 45,
    color: '#0ea5e9',
    indent: 0,
    isParent: true,
    capacity: 0
  },
  {
    id: '4',
    name: 'API Integration',
    responsible: 'Emily Watson',
    startDate: new Date('2026-02-03'),
    endDate: new Date('2026-02-21'),
    progress: 60,
    color: '#10b981',
    indent: 1,
    parentId: '3',
    capacity: 85
  },
  {
    id: '5',
    name: 'Data Migration',
    responsible: 'James Liu',
    startDate: new Date('2026-02-10'),
    endDate: new Date('2026-02-28'),
    progress: 25,
    color: '#f97316',
    indent: 1,
    parentId: '3',
    capacity: 75
  },
  {
    id: '8',
    name: 'Backend Services',
    responsible: 'Alex Rivera',
    startDate: new Date('2026-02-03'),
    endDate: new Date('2026-02-28'),
    progress: 35,
    color: '#38bdf8',
    indent: 1,
    parentId: '3',
    capacity: 85
  },
  {
    id: '6',
    name: 'UAT & Testing',
    responsible: 'Sarah Chen',
    startDate: new Date('2026-03-03'),
    endDate: new Date('2026-03-20'),
    progress: 0,
    color: '#ea580c',
    indent: 0,
    capacity: 70
  },
  {
    id: '7',
    name: 'Go-Live',
    responsible: 'Mike Johnson',
    startDate: new Date('2026-03-24'),
    endDate: new Date('2026-03-24'),
    progress: 0,
    color: '#e11d48',
    indent: 0,
    isMilestone: true,
    milestoneType: 'Value Step',
    capacity: 100
  }
];

// Timeline constants
const TIMELINE_START = new Date('2026-01-06');
const TIMELINE_END = new Date('2026-03-28');
const TODAY_DATE = new Date('2026-02-10');
const TOTAL_DAYS = Math.ceil((TIMELINE_END.getTime() - TIMELINE_START.getTime()) / (1000 * 60 * 60 * 24));
const PX_PER_DAY = 7;
const TIMELINE_WIDTH = TOTAL_DAYS * PX_PER_DAY;
const ROW_HEIGHT = 32;
const WEEK_DAYS = 7;
const TABLE_WIDTH = 320;
const RESOURCE_ROW_HEIGHT = 48;

// Unique team members
const TEAM_MEMBERS = ['Sarah Chen', 'Mike Johnson', 'Alex Rivera', 'Emily Watson', 'James Liu'];

// Baseline loads (other initiatives)
const BASELINE_LOADS: Record<string, number[]> = {
  'Sarah Chen': [30, 35, 40, 25, 20, 15, 25, 30, 35, 25, 20, 15],
  'Mike Johnson': [45, 40, 35, 30, 35, 45, 40, 30, 25, 30, 35, 40],
  'Alex Rivera': [20, 25, 15, 10, 15, 25, 30, 20, 15, 10, 15, 20],
  'Emily Watson': [30, 35, 40, 30, 25, 15, 15, 35, 40, 30, 25, 20],
  'James Liu': [20, 25, 30, 35, 40, 30, 25, 20, 15, 10, 15, 20]
};

const daysBetween = (start: Date, end: Date) =>
  Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

const formatDate = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const formatMonth = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

// Generate week buckets aligned with timeline
const generateWeekBuckets = () => {
  const buckets: { start: Date; end: Date; left: number; width: number }[] = [];
  let offset = 0;

  while (offset < TOTAL_DAYS) {
    const start = new Date(TIMELINE_START.getTime() + offset * 24 * 60 * 60 * 1000);
    const days = Math.min(WEEK_DAYS, TOTAL_DAYS - offset);
    const end = new Date(start.getTime() + (days - 1) * 24 * 60 * 60 * 1000);
    buckets.push({
      start,
      end,
      left: offset * PX_PER_DAY,
      width: days * PX_PER_DAY
    });
    offset += WEEK_DAYS;
  }

  return buckets;
};

// Generate month markers
const generateMonthMarkers = () => {
  const markers: { label: string; left: number; width: number }[] = [];
  let current = new Date(TIMELINE_START);

  while (current < TIMELINE_END) {
    const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);

    const effectiveStart = monthStart < TIMELINE_START ? TIMELINE_START : monthStart;
    const effectiveEnd = monthEnd > TIMELINE_END ? TIMELINE_END : monthEnd;

    const left = daysBetween(TIMELINE_START, effectiveStart) * PX_PER_DAY;
    const width = (daysBetween(effectiveStart, effectiveEnd) + 1) * PX_PER_DAY;

    markers.push({ label: formatMonth(effectiveStart), left, width });
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  return markers;
};

interface InteractivePlanDemoProps {
  className?: string;
  onTasksChange?: (tasks: DemoTask[]) => void;
}

export const InteractivePlanDemo = ({ className, onTasksChange }: InteractivePlanDemoProps) => {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>('4');
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [resourceCollapsed, setResourceCollapsed] = useState(false);
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [showHintPulse, setShowHintPulse] = useState(true);
  const [hintDismissed, setHintDismissed] = useState(false);

  const displayTasks = useMemo(() => {
    return tasks.map((task) => {
      if (!task.isParent) return task;
      const children = tasks.filter((child) => child.parentId === task.id);
      if (children.length === 0) return task;
      const start = new Date(Math.min(...children.map((child) => child.startDate.getTime())));
      const end = new Date(Math.max(...children.map((child) => child.endDate.getTime())));
      const avgProgress = Math.round(children.reduce((sum, child) => sum + child.progress, 0) / children.length);
      return {
        ...task,
        startDate: start,
        endDate: end,
        progress: avgProgress
      };
    });
  }, [tasks]);

  const timelineRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const resourceTimelineRef = useRef<HTMLDivElement>(null);

  const weekBuckets = useMemo(() => generateWeekBuckets(), []);
  const monthMarkers = useMemo(() => generateMonthMarkers(), []);

  // Calculate resource loads dynamically from tasks
  const resourceLoads = useMemo(() => {
    return TEAM_MEMBERS.map(name => {
      const weeklyLoads = weekBuckets.map((bucket, weekIndex) => {
        const baseline = BASELINE_LOADS[name]?.[weekIndex] ?? 25;

        // Calculate initiative load from tasks
        let initiative = 0;
        displayTasks.forEach(task => {
          if (task.isParent) return;
          if (task.responsible !== name) return;

          // Check if task overlaps with this week
          const taskStart = task.startDate.getTime();
          const taskEnd = task.endDate.getTime();
          const bucketStart = bucket.start.getTime();
          const bucketEnd = bucket.end.getTime();

          if (taskEnd >= bucketStart && taskStart <= bucketEnd) {
            // Calculate overlap days
            const overlapStart = Math.max(taskStart, bucketStart);
            const overlapEnd = Math.min(taskEnd, bucketEnd);
            const overlapDays = Math.max(1, Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1);

            // Add proportional capacity
            initiative += (task.capacity * overlapDays) / WEEK_DAYS;
          }
        });

        return { baseline, initiative: Math.round(initiative) };
      });

      return { name, weeklyLoads };
    });
  }, [displayTasks, weekBuckets]);

  // Notify parent of task changes
  useEffect(() => {
    onTasksChange?.(displayTasks);
  }, [displayTasks, onTasksChange]);

  // Sync horizontal scroll between timeline and resource timeline
  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (resourceTimelineRef.current) {
      resourceTimelineRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleResourceTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (timelineRef.current) {
      timelineRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  // Sync vertical scroll between table and timeline
  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleTimelineVerticalScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (tableRef.current) {
      tableRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // Handle task bar drag
  const handleBarMouseDown = useCallback((taskId: string, e: React.MouseEvent) => {
    e.preventDefault();
    setSelectedTaskId(taskId);
    setHasInteracted(true);
    setShowHintPulse(false);

    const startX = e.clientX;
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.isParent) return;

    const originalStart = new Date(task.startDate);
    const originalEnd = new Date(task.endDate);
    const dayMs = 1000 * 60 * 60 * 24;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaDays = Math.round(deltaX / PX_PER_DAY);

      setTasks(prev => prev.map(t => {
        if (t.id !== taskId) return t;
        let newStart = new Date(originalStart.getTime() + deltaDays * dayMs);
        let newEnd = new Date(originalEnd.getTime() + deltaDays * dayMs);

        if (newStart < TIMELINE_START) {
          const offset = TIMELINE_START.getTime() - newStart.getTime();
          newStart = new Date(newStart.getTime() + offset);
          newEnd = new Date(newEnd.getTime() + offset);
        }
        if (newEnd > TIMELINE_END) {
          const offset = newEnd.getTime() - TIMELINE_END.getTime();
          newStart = new Date(newStart.getTime() - offset);
          newEnd = new Date(newEnd.getTime() - offset);
        }

        return {
          ...t,
          startDate: newStart,
          endDate: newEnd
        };
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [tasks]);

  const handleResizeMouseDown = useCallback((taskId: string, edge: 'start' | 'end', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedTaskId(taskId);
    setHasInteracted(true);
    setShowHintPulse(false);

    const startX = e.clientX;
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.isParent) return;

    const originalStart = new Date(task.startDate);
    const originalEnd = new Date(task.endDate);
    const dayMs = 1000 * 60 * 60 * 24;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaDays = Math.round(deltaX / PX_PER_DAY);

      setTasks(prev => prev.map(t => {
        if (t.id !== taskId) return t;
        if (edge === 'start') {
          let newStart = new Date(originalStart.getTime() + deltaDays * dayMs);
          if (newStart > originalEnd) newStart = new Date(originalEnd);
          if (newStart < TIMELINE_START) newStart = new Date(TIMELINE_START);
          return {
            ...t,
            startDate: newStart
          };
        }

        let newEnd = new Date(originalEnd.getTime() + deltaDays * dayMs);
        if (newEnd < originalStart) newEnd = new Date(originalStart);
        if (newEnd > TIMELINE_END) newEnd = new Date(TIMELINE_END);
        return {
          ...t,
          endDate: newEnd
        };
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [tasks]);

  // Scroll to current date area on mount
  useEffect(() => {
    if (timelineRef.current) {
      const todayOffset = daysBetween(TIMELINE_START, TODAY_DATE) * PX_PER_DAY;
      const scrollTo = Math.max(0, todayOffset - 150);
      timelineRef.current.scrollLeft = scrollTo;
      if (resourceTimelineRef.current) {
        resourceTimelineRef.current.scrollLeft = scrollTo;
      }
    }
  }, []);

  // Hint pulse animation
  useEffect(() => {
    if (!hasInteracted) {
      const interval = setInterval(() => {
        setShowHintPulse(prev => !prev);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [hasInteracted]);

  const renderTaskBar = (task: DemoTask) => {
    const startOffset = daysBetween(TIMELINE_START, task.startDate) * PX_PER_DAY;
    const duration = daysBetween(task.startDate, task.endDate) + 1;
    const width = Math.max(duration * PX_PER_DAY, 20);

    const isSelected = selectedTaskId === task.id;
    const isHovered = hoveredTaskId === task.id;
    const isParent = Boolean(task.isParent);
    const canEdit = !task.isMilestone && !isParent;

    if (task.isMilestone) {
      return (
        <div
          key={task.id}
          className={`${styles.milestoneMarker} ${isSelected ? styles.selected : ''}`}
          style={{ left: `${startOffset}px` }}
          onClick={() => setSelectedTaskId(task.id)}
          onMouseEnter={() => setHoveredTaskId(task.id)}
          onMouseLeave={() => setHoveredTaskId(null)}
        >
          <div className={styles.milestoneDiamond} style={{ background: task.color }} />
          {task.milestoneType === 'Value Step' && (
            <div className={styles.valueStepLabel}>$</div>
          )}
        </div>
      );
    }

    return (
      <div
        key={task.id}
        className={`${styles.taskBar} ${isSelected ? styles.selected : ''} ${isHovered ? styles.hovered : ''} ${isParent ? styles.parentTask : ''}`}
        style={{
          left: `${startOffset}px`,
          width: `${width}px`,
          background: `linear-gradient(135deg, ${task.color}dd, ${task.color})`
        }}
        onMouseDown={canEdit ? (e) => handleBarMouseDown(task.id, e) : undefined}
        onMouseEnter={() => setHoveredTaskId(task.id)}
        onMouseLeave={() => setHoveredTaskId(null)}
      >
        <div
          className={styles.progressFill}
          style={{ width: `${task.progress}%`, background: `${task.color}` }}
        />
        <span className={styles.barLabel}>{task.name}</span>
        {isSelected && canEdit && (
          <>
            <div
              className={styles.resizeHandle}
              data-position="start"
              onMouseDown={(e) => handleResizeMouseDown(task.id, 'start', e)}
            />
            <div
              className={styles.resizeHandle}
              data-position="end"
              onMouseDown={(e) => handleResizeMouseDown(task.id, 'end', e)}
            />
          </>
        )}
      </div>
    );
  };

  const MAX_LOAD = 150;
  const hundredPercentOffset = (100 / MAX_LOAD) * 100;

  return (
    <div className={`${styles.demoContainer} ${className || ''}`}>
      {/* Interactive hint overlay */}
      {!hasInteracted && !hintDismissed && (
        <div className={`${styles.hintOverlay} ${showHintPulse ? styles.pulse : ''}`}>
          <div className={styles.hintContent}>
            <div className={styles.hintText}>
              <span className={styles.hintTitle}>Interactive Demo</span>
              <span className={styles.hintDesc}>Drag the task bars to see resource load update in real-time.</span>
            </div>
            <button
              type="button"
              className={styles.hintDismiss}
              onClick={() => setHintDismissed(true)}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <div className={styles.demoWindow}>
        {/* Window chrome */}
        <div className={styles.windowChrome}>
          <div className={styles.browserTab}>
            <span className={styles.browserFavicon} />
            Initiative - Laiten
          </div>
          <div className={styles.browserAddress}>app.laiten.com/initiatives/plan-203</div>
        </div>

        {/* Main content */}
        <div className={styles.appContent}>
        {/* Implementation Plan section */}
        <div className={styles.planSection}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <h3>Implementation plan</h3>
            </div>
            <span className={styles.badge}>{displayTasks.length} tasks</span>
          </div>

          <div className={styles.planLegend}>
            <span className={styles.planLegendItem}>
              <span className={styles.planLegendBadge}>M</span>
              Milestone
            </span>
            <span className={styles.planLegendItem}>
              <span className={styles.planLegendBadge}>$</span>
              Value step
            </span>
            <span className={styles.planLegendNote}>Complete % shows task progress</span>
          </div>

          <div className={styles.planGrid} style={{ gridTemplateColumns: `${TABLE_WIDTH}px 1fr` }}>
            {/* Task table */}
            <div className={styles.taskTable}>
              <div className={styles.tableHeader}>
                <div className={styles.colName}>Task</div>
                <div className={styles.colOwner}>Owner</div>
                <div className={styles.colProgress}>Complete %</div>
              </div>
              <div className={styles.tableBody} ref={tableRef} onScroll={handleTableScroll}>
                {displayTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`${styles.tableRow} ${selectedTaskId === task.id ? styles.selected : ''} ${task.isParent ? styles.parentRow : ''}`}
                    onClick={() => setSelectedTaskId(task.id)}
                    style={{ paddingLeft: `${8 + task.indent * 16}px` }}
                  >
                    <div className={styles.colName}>
                      <span className={styles.taskColorDot} style={{ background: task.color }} />
                      <span className={styles.taskNameText}>{task.name}</span>
                      {task.isMilestone && <span className={styles.milestoneTag}>M</span>}
                    </div>
                    <div className={styles.colOwner}>{task.isParent ? '' : task.responsible.split(' ')[0]}</div>
                    <div className={styles.colProgress}>
                      <div className={styles.progressBar}>
                        <div className={styles.progressValue} style={{ width: `${task.progress}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline / Gantt */}
            <div className={styles.timeline}>
              <div className={styles.timelineHeader}>
                <div className={styles.monthRow} style={{ width: `${TIMELINE_WIDTH}px` }}>
                  {monthMarkers.map((marker, i) => (
                    <div
                      key={i}
                      className={styles.monthMarker}
                      style={{ left: `${marker.left}px`, width: `${marker.width}px` }}
                    >
                      {marker.label}
                    </div>
                  ))}
                </div>
              </div>
              <div
                className={styles.timelineBody}
                ref={timelineRef}
                onScroll={(e) => { handleTimelineScroll(e); handleTimelineVerticalScroll(e); }}
              >
                <div className={styles.timelineCanvas} style={{ width: `${TIMELINE_WIDTH}px`, height: `${displayTasks.length * ROW_HEIGHT}px` }}>
                  {/* Today line */}
                  <div
                    className={styles.todayLine}
                    style={{ left: `${daysBetween(TIMELINE_START, TODAY_DATE) * PX_PER_DAY}px` }}
                  >
                    <span className={styles.todayLabel}>Today</span>
                  </div>

                  {/* Task rows */}
                  {displayTasks.map((task, index) => (
                    <div
                      key={task.id}
                      className={styles.timelineRow}
                      style={{ top: `${index * ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px` }}
                    >
                      {renderTaskBar(task)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Resource Load section */}
        <div className={`${styles.resourceSection} ${resourceCollapsed ? styles.collapsed : ''}`}>
          <div className={styles.resourceHeader}>
            <button
              className={styles.collapseBtn}
              onClick={() => setResourceCollapsed(!resourceCollapsed)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ transform: resourceCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <div className={styles.resourceHeaderText}>
              <h4>Resource load</h4>
              <p>Weekly capacity updates when you drag tasks</p>
            </div>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <i className={styles.baselineSwatch} />
                Baseline
              </span>
              <span className={styles.legendItem}>
                <i className={styles.currentSwatch} />
                Initiative
              </span>
              <span className={styles.legendItem}>
                <i className={styles.overloadSwatch} />
                &gt;100%
              </span>
            </div>
          </div>

          {!resourceCollapsed && (
            <div className={styles.resourceBody} style={{ gridTemplateColumns: `${TABLE_WIDTH}px 1fr` }}>
              <div className={styles.resourceNames}>
                {resourceLoads.map((r) => (
                  <div key={r.name} className={styles.resourceNameRow} style={{ height: `${RESOURCE_ROW_HEIGHT}px` }}>
                    {r.name}
                  </div>
                ))}
              </div>
              <div
                className={styles.resourceTimeline}
                ref={resourceTimelineRef}
                onScroll={handleResourceTimelineScroll}
              >
                <div className={styles.resourceCanvas} style={{ width: `${TIMELINE_WIDTH}px` }}>
                  {resourceLoads.map((resource) => (
                    <div key={resource.name} className={styles.resourceRow} style={{ height: `${RESOURCE_ROW_HEIGHT}px` }}>
                      <div className={styles.capacityLine} style={{ bottom: `${hundredPercentOffset}%` }} />
                      <div className={styles.weekBars}>
                        {weekBuckets.map((bucket, weekIndex) => {
                          const load = resource.weeklyLoads[weekIndex] || { baseline: 0, initiative: 0 };
                          const baselineHeight = (load.baseline / MAX_LOAD) * 100;
                          const initiativeHeight = (load.initiative / MAX_LOAD) * 100;
                          const totalHeight = baselineHeight + initiativeHeight;
                          const overloadHeight = Math.max(0, totalHeight - hundredPercentOffset);

                          return (
                            <div
                              key={weekIndex}
                              className={styles.weekCell}
                              style={{ left: `${bucket.left}px`, width: `${bucket.width}px` }}
                            >
                              <div className={styles.weekBar}>
                                <span className={styles.baselineBar} style={{ height: `${baselineHeight}%` }} />
                                <span
                                  className={styles.initiativeBar}
                                  style={{ height: `${initiativeHeight}%`, bottom: `${baselineHeight}%` }}
                                />
                                {overloadHeight > 0 && (
                                  <span
                                    className={styles.overloadBar}
                                    style={{ height: `${overloadHeight}%`, bottom: `${hundredPercentOffset}%` }}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

// Export tasks type for heatmap
export type { DemoTask };
export { INITIAL_TASKS, TEAM_MEMBERS, TIMELINE_START, TIMELINE_END, BASELINE_LOADS };






