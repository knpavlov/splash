import { useState, useMemo, useRef, useEffect } from 'react';
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
  isMilestone?: boolean;
  milestoneType?: string;
}

interface DemoResourceLoad {
  name: string;
  weeklyLoads: { baseline: number; initiative: number }[];
}

// Demo data - realistic enterprise transformation tasks
const DEMO_TASKS: DemoTask[] = [
  {
    id: '1',
    name: 'Discovery & Requirements',
    responsible: 'Sarah Chen',
    startDate: new Date('2025-01-06'),
    endDate: new Date('2025-01-24'),
    progress: 100,
    color: '#5b21b6',
    indent: 0
  },
  {
    id: '2',
    name: 'Technical Architecture Design',
    responsible: 'Mike Johnson',
    startDate: new Date('2025-01-20'),
    endDate: new Date('2025-02-07'),
    progress: 85,
    color: '#2563eb',
    indent: 0
  },
  {
    id: '3',
    name: 'Core Platform Development',
    responsible: 'Alex Rivera',
    startDate: new Date('2025-02-03'),
    endDate: new Date('2025-03-14'),
    progress: 45,
    color: '#0ea5e9',
    indent: 0
  },
  {
    id: '4',
    name: 'API Integration Layer',
    responsible: 'Emily Watson',
    startDate: new Date('2025-02-10'),
    endDate: new Date('2025-02-28'),
    progress: 60,
    color: '#10b981',
    indent: 1
  },
  {
    id: '5',
    name: 'Data Migration Module',
    responsible: 'James Liu',
    startDate: new Date('2025-02-17'),
    endDate: new Date('2025-03-07'),
    progress: 25,
    color: '#f97316',
    indent: 1
  },
  {
    id: '6',
    name: 'UAT & Testing',
    responsible: 'Sarah Chen',
    startDate: new Date('2025-03-10'),
    endDate: new Date('2025-03-21'),
    progress: 0,
    color: '#ea580c',
    indent: 0
  },
  {
    id: '7',
    name: 'Go-Live',
    responsible: 'Mike Johnson',
    startDate: new Date('2025-03-24'),
    endDate: new Date('2025-03-24'),
    progress: 0,
    color: '#e11d48',
    indent: 0,
    isMilestone: true,
    milestoneType: 'Value Step'
  }
];

// Generate weekly loads for resource chart
const generateResourceLoads = (): DemoResourceLoad[] => {
  const people = ['Sarah Chen', 'Mike Johnson', 'Alex Rivera', 'Emily Watson', 'James Liu'];
  return people.map((name) => ({
    name,
    weeklyLoads: Array.from({ length: 12 }, (_, i) => {
      // Create realistic load patterns
      const baselineBase = 30 + Math.random() * 25;
      const initiativeBase = 20 + Math.random() * 35;
      // Add some peaks mid-project
      const peakFactor = i >= 4 && i <= 8 ? 1.3 : 1;
      return {
        baseline: Math.round(baselineBase * peakFactor),
        initiative: Math.round(initiativeBase * peakFactor)
      };
    })
  }));
};

// Timeline utilities
const TIMELINE_START = new Date('2025-01-06');
const TIMELINE_END = new Date('2025-03-28');
const TOTAL_DAYS = Math.ceil((TIMELINE_END.getTime() - TIMELINE_START.getTime()) / (1000 * 60 * 60 * 24));
const PX_PER_DAY = 8;
const TIMELINE_WIDTH = TOTAL_DAYS * PX_PER_DAY;
const ROW_HEIGHT = 36;

const daysBetween = (start: Date, end: Date) =>
  Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

const formatDate = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const formatMonth = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

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

    markers.push({
      label: formatMonth(effectiveStart),
      left,
      width
    });

    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  return markers;
};

interface InteractivePlanDemoProps {
  className?: string;
}

export const InteractivePlanDemo = ({ className }: InteractivePlanDemoProps) => {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>('3');
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [resourceCollapsed, setResourceCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [tasks, setTasks] = useState(DEMO_TASKS);
  const timelineRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const resourceLoads = useMemo(() => generateResourceLoads(), []);
  const monthMarkers = useMemo(() => generateMonthMarkers(), []);

  // Sync scroll between table and timeline
  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (tableRef.current) {
      tableRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // Simulate dragging a task bar
  const handleBarMouseDown = (taskId: string, e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setSelectedTaskId(taskId);

    const startX = e.clientX;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const originalStart = new Date(task.startDate);
    const originalEnd = new Date(task.endDate);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaDays = Math.round(deltaX / PX_PER_DAY);

      setTasks(prev => prev.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          startDate: new Date(originalStart.getTime() + deltaDays * 24 * 60 * 60 * 1000),
          endDate: new Date(originalEnd.getTime() + deltaDays * 24 * 60 * 60 * 1000)
        };
      }));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Scroll to today indicator on mount
  useEffect(() => {
    if (timelineRef.current) {
      const todayOffset = daysBetween(TIMELINE_START, new Date()) * PX_PER_DAY;
      timelineRef.current.scrollLeft = Math.max(0, todayOffset - 200);
    }
  }, []);

  const renderTaskBar = (task: DemoTask) => {
    const startOffset = daysBetween(TIMELINE_START, task.startDate) * PX_PER_DAY;
    const duration = daysBetween(task.startDate, task.endDate) + 1;
    const width = duration * PX_PER_DAY;

    const isSelected = selectedTaskId === task.id;
    const isHovered = hoveredTaskId === task.id;

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
            <div className={styles.valueStepLabel}>💰</div>
          )}
        </div>
      );
    }

    return (
      <div
        key={task.id}
        className={`${styles.taskBar} ${isSelected ? styles.selected : ''} ${isHovered ? styles.hovered : ''}`}
        style={{
          left: `${startOffset}px`,
          width: `${width}px`,
          background: `linear-gradient(135deg, ${task.color}dd, ${task.color})`
        }}
        onMouseDown={(e) => handleBarMouseDown(task.id, e)}
        onMouseEnter={() => setHoveredTaskId(task.id)}
        onMouseLeave={() => setHoveredTaskId(null)}
      >
        <div
          className={styles.progressFill}
          style={{ width: `${task.progress}%`, background: `${task.color}` }}
        />
        <span className={styles.barLabel}>{task.name}</span>
        {isSelected && (
          <>
            <div className={styles.resizeHandle} data-position="start" />
            <div className={styles.resizeHandle} data-position="end" />
          </>
        )}
      </div>
    );
  };

  const renderResourceRow = (resource: DemoResourceLoad, index: number) => {
    const MAX_LOAD = 150;
    const hundredPercentOffset = (100 / MAX_LOAD) * 100;

    return (
      <div key={resource.name} className={styles.resourceRow}>
        <div className={styles.capacityLine} style={{ bottom: `${hundredPercentOffset}%` }} />
        <div className={styles.weekBars}>
          {resource.weeklyLoads.map((load, weekIndex) => {
            const baselineHeight = (load.baseline / MAX_LOAD) * 100;
            const initiativeHeight = (load.initiative / MAX_LOAD) * 100;
            const totalHeight = baselineHeight + initiativeHeight;
            const overloadHeight = Math.max(0, totalHeight - hundredPercentOffset);

            return (
              <div key={weekIndex} className={styles.weekCell}>
                <div className={styles.weekBar}>
                  <span
                    className={styles.baselineBar}
                    style={{ height: `${baselineHeight}%` }}
                  />
                  <span
                    className={styles.initiativeBar}
                    style={{
                      height: `${initiativeHeight}%`,
                      bottom: `${baselineHeight}%`
                    }}
                  />
                  {overloadHeight > 0 && (
                    <span
                      className={styles.overloadBar}
                      style={{
                        height: `${overloadHeight}%`,
                        bottom: `${hundredPercentOffset}%`
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={`${styles.demoContainer} ${className || ''}`}>
      {/* Window chrome */}
      <div className={styles.windowChrome}>
        <div className={styles.windowControls}>
          <span className={styles.windowDot} data-color="red" />
          <span className={styles.windowDot} data-color="yellow" />
          <span className={styles.windowDot} data-color="green" />
        </div>
        <div className={styles.windowTitle}>LaikaPro</div>
        <div className={styles.windowActions}>
          <span className={styles.windowTab}>Initiative Profile</span>
        </div>
      </div>

      {/* Main content */}
      <div className={styles.appContent}>
        {/* Implementation Plan section */}
        <div className={styles.planSection}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <h3>Implementation plan</h3>
            </div>
            <span className={styles.badge}>{tasks.length} tasks</span>
          </div>

          <div className={styles.planGrid}>
            {/* Task table */}
            <div className={styles.taskTable}>
              <div className={styles.tableHeader}>
                <div className={styles.colName}>Task name</div>
                <div className={styles.colOwner}>Owner</div>
                <div className={styles.colDates}>Dates</div>
                <div className={styles.colProgress}>Progress</div>
              </div>
              <div className={styles.tableBody} ref={tableRef} onScroll={handleTableScroll}>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`${styles.tableRow} ${selectedTaskId === task.id ? styles.selected : ''}`}
                    onClick={() => setSelectedTaskId(task.id)}
                    style={{ paddingLeft: `${12 + task.indent * 20}px` }}
                  >
                    <div className={styles.colName}>
                      <span
                        className={styles.taskColorDot}
                        style={{ background: task.color }}
                      />
                      {task.name}
                      {task.isMilestone && <span className={styles.milestoneTag}>Milestone</span>}
                    </div>
                    <div className={styles.colOwner}>{task.responsible}</div>
                    <div className={styles.colDates}>
                      {formatDate(task.startDate)} - {formatDate(task.endDate)}
                    </div>
                    <div className={styles.colProgress}>
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressValue}
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                      <span>{task.progress}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline / Gantt */}
            <div className={styles.timeline}>
              <div className={styles.timelineHeader}>
                <div className={styles.monthRow}>
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
                onScroll={handleTimelineScroll}
              >
                <div className={styles.timelineCanvas} style={{ width: `${TIMELINE_WIDTH}px` }}>
                  {/* Today line */}
                  <div
                    className={styles.todayLine}
                    style={{ left: `${daysBetween(TIMELINE_START, new Date()) * PX_PER_DAY}px` }}
                  >
                    <span className={styles.todayLabel}>Today</span>
                  </div>

                  {/* Task rows */}
                  {tasks.map((task, index) => (
                    <div
                      key={task.id}
                      className={styles.timelineRow}
                      style={{ top: `${index * ROW_HEIGHT}px` }}
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
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ transform: resourceCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <div>
              <h4>Resource load</h4>
              <p>Weekly capacity across all initiatives touching these owners.</p>
            </div>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <i className={styles.baselineSwatch} />
                Baseline
              </span>
              <span className={styles.legendItem}>
                <i className={styles.currentSwatch} />
                This initiative
              </span>
              <span className={styles.legendItem}>
                <i className={styles.overloadSwatch} />
                Above 100%
              </span>
            </div>
          </div>

          {!resourceCollapsed && (
            <div className={styles.resourceBody}>
              <div className={styles.resourceNames}>
                {resourceLoads.map((r) => (
                  <div key={r.name} className={styles.resourceNameRow}>
                    {r.name}
                  </div>
                ))}
              </div>
              <div className={styles.resourceTimeline}>
                {resourceLoads.map((resource, index) => renderResourceRow(resource, index))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Interactive hint */}
      <div className={styles.interactiveHint}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <path d="M12 18v-6"/>
          <path d="M9 15l3 3 3-3"/>
        </svg>
        Try dragging the task bars
      </div>
    </div>
  );
};
