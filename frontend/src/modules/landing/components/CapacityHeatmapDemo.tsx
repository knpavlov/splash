import { useMemo, useState } from 'react';
import styles from './CapacityHeatmapDemo.module.css';
import { DemoTask, TEAM_MEMBERS, TIMELINE_START, TIMELINE_END, BASELINE_LOADS } from './InteractivePlanDemo';

interface CapacityHeatmapDemoProps {
  tasks: DemoTask[];
  className?: string;
}

const WEEK_DAYS = 7;
const TOTAL_DAYS = Math.ceil((TIMELINE_END.getTime() - TIMELINE_START.getTime()) / (1000 * 60 * 60 * 24));

// Generate week labels
const generateWeekLabels = () => {
  const labels: string[] = [];
  let offset = 0;

  while (offset < TOTAL_DAYS) {
    const start = new Date(TIMELINE_START.getTime() + offset * 24 * 60 * 60 * 1000);
    labels.push(start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    offset += WEEK_DAYS;
  }

  return labels;
};

// Calculate load color based on percentage
const getLoadColor = (load: number): string => {
  if (load === 0) return 'rgba(255, 255, 255, 0.02)';
  if (load < 50) return `rgba(34, 197, 94, ${0.2 + (load / 50) * 0.4})`; // Green
  if (load < 80) return `rgba(234, 179, 8, ${0.3 + ((load - 50) / 30) * 0.4})`; // Yellow
  if (load < 100) return `rgba(249, 115, 22, ${0.4 + ((load - 80) / 20) * 0.4})`; // Orange
  return `rgba(239, 68, 68, ${Math.min(0.9, 0.5 + ((load - 100) / 50) * 0.4)})`; // Red
};

const getLoadTextColor = (load: number): string => {
  if (load === 0) return '#4b5563';
  if (load < 80) return '#e5e7eb';
  return '#fff';
};

export const CapacityHeatmapDemo = ({ tasks, className }: CapacityHeatmapDemoProps) => {
  const weekLabels = useMemo(() => generateWeekLabels(), []);
  const [selectedCell, setSelectedCell] = useState<{ name: string; weekIndex: number } | null>(null);

  // Calculate heatmap data from tasks
  const { heatmapData, cellDetails } = useMemo(() => {
    const data: { name: string; loads: number[] }[] = [];
    const details: Record<string, { baseline: number; contributions: { name: string; load: number }[]; total: number }[]> = {};

    TEAM_MEMBERS.forEach(name => {
      const loads: number[] = [];
      details[name] = [];

      weekLabels.forEach((_, weekIndex) => {
        const bucketStart = new Date(TIMELINE_START.getTime() + weekIndex * WEEK_DAYS * 24 * 60 * 60 * 1000);
        const bucketEnd = new Date(bucketStart.getTime() + (WEEK_DAYS - 1) * 24 * 60 * 60 * 1000);

        const baseline = BASELINE_LOADS[name]?.[weekIndex] ?? 25;
        const contributions: { name: string; load: number }[] = [];

        tasks.forEach(task => {
          if (task.isParent || task.responsible !== name) return;

          const taskStart = task.startDate.getTime();
          const taskEnd = task.endDate.getTime();
          const bucketStartTime = bucketStart.getTime();
          const bucketEndTime = bucketEnd.getTime();

          if (taskEnd >= bucketStartTime && taskStart <= bucketEndTime) {
            const overlapStart = Math.max(taskStart, bucketStartTime);
            const overlapEnd = Math.min(taskEnd, bucketEndTime);
            const overlapDays = Math.max(1, Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1);
            const load = Math.round((task.capacity * overlapDays) / WEEK_DAYS);
            contributions.push({ name: task.name, load });
          }
        });

        const initiativeTotal = contributions.reduce((sum, item) => sum + item.load, 0);
        const total = Math.round(baseline + initiativeTotal);

        loads.push(total);
        details[name].push({ baseline, contributions, total });
      });

      data.push({ name, loads });
    });

    return { heatmapData: data, cellDetails: details };
  }, [tasks, weekLabels]);

  // Calculate team average for each week
  const teamAverages = useMemo(() => {
    return weekLabels.map((_, weekIndex) => {
      const sum = heatmapData.reduce((acc, row) => acc + row.loads[weekIndex], 0);
      return Math.round(sum / heatmapData.length);
    });
  }, [heatmapData, weekLabels]);

  // Find overloaded team members
  const overloadedCount = useMemo(() => {
    return heatmapData.filter(row => row.loads.some(load => load > 100)).length;
  }, [heatmapData]);

  return (
    <div className={`${styles.demoContainer} ${className || ''}`}>
      {/* Window chrome */}
      <div className={styles.windowChrome}>
        <div className={styles.browserTab}>
          <span className={styles.browserFavicon} />
          Capacity Heatmap
        </div>
        <div className={styles.browserAddress}>app.laiten.com/capacity/heatmap</div>
      </div>

      {/* Main content */}
      <div className={styles.appContent}>
        {/* Header with stats */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <rect x="7" y="7" width="3" height="9"/>
              <rect x="14" y="7" width="3" height="5"/>
            </svg>
            <h3>Capacity Heatmap</h3>
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{TEAM_MEMBERS.length}</span>
              <span className={styles.statLabel}>Team Members</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={`${styles.statValue} ${overloadedCount > 0 ? styles.warning : ''}`}>
                {overloadedCount}
              </span>
              <span className={styles.statLabel}>Overloaded</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={styles.statValue}>{weekLabels.length}</span>
              <span className={styles.statLabel}>Weeks</span>
            </div>
          </div>
        </div>

        {/* Heatmap grid */}
        <div className={styles.heatmapContainer}>
          <div className={styles.heatmapGrid}>
            {/* Header row with week labels */}
            <div className={styles.headerRow}>
              <div className={styles.nameCell}>Team Member</div>
              {weekLabels.map((label, i) => (
                <div key={i} className={styles.weekLabel}>{label}</div>
              ))}
            </div>

            {/* Data rows */}
            {heatmapData.map((row) => {
              return (
                <div key={row.name} className={styles.dataRow}>
                  <div className={styles.nameCell}>{row.name}</div>
                  {row.loads.map((load, colIndex) => (
                    <div
                      key={colIndex}
                      className={styles.heatCell}
                      style={{
                        background: getLoadColor(load),
                        color: getLoadTextColor(load)
                      }}
                      title={`${row.name}: ${load}% capacity for week of ${weekLabels[colIndex]}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedCell({ name: row.name, weekIndex: colIndex })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedCell({ name: row.name, weekIndex: colIndex });
                        }
                      }}
                    >
                      {load}%
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Team average row */}
            <div className={`${styles.dataRow} ${styles.averageRow}`}>
              <div className={styles.nameCell}>Team Average</div>
              {teamAverages.map((avg, i) => (
                <div
                  key={i}
                  className={styles.heatCell}
                  style={{
                    background: getLoadColor(avg),
                    color: getLoadTextColor(avg)
                  }}
                >
                  {avg}%
                </div>
              ))}
            </div>
          </div>

          {selectedCell && (
            <div className={styles.detailPopup}>
              <div className={styles.popupHeader}>
                <div>
                  <div className={styles.popupTitle}>{selectedCell.name}</div>
                  <div className={styles.popupSubtitle}>Week of {weekLabels[selectedCell.weekIndex]}</div>
                </div>
                <button
                  type="button"
                  className={styles.popupClose}
                  onClick={() => setSelectedCell(null)}
                >
                  {'\u00D7'}
                </button>
              </div>
              <div className={styles.popupBody}>
                <div className={styles.popupRow}>
                  <span>Baseline load</span>
                  <span>{cellDetails[selectedCell.name][selectedCell.weekIndex].baseline}%</span>
                </div>
                <div className={styles.popupSectionTitle}>Initiative tasks</div>
                {cellDetails[selectedCell.name][selectedCell.weekIndex].contributions.length === 0 ? (
                  <div className={styles.popupEmpty}>No tasks scheduled.</div>
                ) : (
                  cellDetails[selectedCell.name][selectedCell.weekIndex].contributions.map((task) => (
                    <div key={task.name} className={styles.popupRow}>
                      <span>{task.name}</span>
                      <span>{task.load}%</span>
                    </div>
                  ))
                )}
                <div className={styles.popupTotal}>
                  <span>Total load</span>
                  <span>{cellDetails[selectedCell.name][selectedCell.weekIndex].total}%</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className={styles.legend}>
          <span className={styles.legendTitle}>Load Level:</span>
          <div className={styles.legendItems}>
            <div className={styles.legendItem}>
              <span className={styles.legendColor} style={{ background: 'rgba(34, 197, 94, 0.5)' }} />
              <span>&lt;50%</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendColor} style={{ background: 'rgba(234, 179, 8, 0.6)' }} />
              <span>50-80%</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendColor} style={{ background: 'rgba(249, 115, 22, 0.7)' }} />
              <span>80-100%</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendColor} style={{ background: 'rgba(239, 68, 68, 0.8)' }} />
              <span>&gt;100%</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
