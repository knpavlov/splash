import { RefObject, useMemo } from 'react';
import styles from '../../../../styles/InitiativeResourceLoadModule.module.css';
import { Initiative, InitiativePlanModel, InitiativePlanTask } from '../../../../shared/types/initiative';
import { PLAN_SPLIT_MAX, PLAN_SPLIT_MIN, sanitizePlanModel } from '../../plan/planModel';
import { addDays, diffInDays, PlanTimelineRange, parseDate } from '../../plan/planTimeline';
import { ChevronIcon } from '../../../../components/icons/ChevronIcon';

interface InitiativeResourceLoadModuleProps {
  plan: InitiativePlanModel;
  initiativeId: string;
  initiatives: Initiative[];
  timelineRange: PlanTimelineRange;
  pxPerDay: number;
  scrollRef: RefObject<HTMLDivElement>;
  namesScrollRef: RefObject<HTMLDivElement>;
  splitRatio: number;
  height: number | null;
  isCollapsed: boolean;
  onToggle: () => void;
}

interface WeekBucket {
  index: number;
  start: Date;
  end: Date;
  days: number;
  width: number;
}

interface LoadEntry {
  baseline: number[];
  initiative: number[];
}

const WEEK_DAYS = 7;
const MAX_DISPLAY_LOAD = 150;
const hundredPercentOffset = (100 / MAX_DISPLAY_LOAD) * 100;
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

const formatRange = (start: Date, end: Date) => `${shortDate.format(start)} – ${shortDate.format(end)}`;

const loadToPercent = (value: number) => (Math.min(Math.max(value, 0), MAX_DISPLAY_LOAD) / MAX_DISPLAY_LOAD) * 100;

const collectSlices = (task: InitiativePlanTask) => {
  const start = task.startDate ? parseDate(task.startDate) : null;
  const end = task.endDate ? parseDate(task.endDate) : null;
  if (!start || !end) {
    return [];
  }
  if (task.capacityMode === 'variable' && task.capacitySegments.length) {
    return task.capacitySegments
      .map((segment) => {
        const segmentStart = parseDate(segment.startDate);
        const segmentEnd = parseDate(segment.endDate);
        if (!segmentStart || !segmentEnd || segmentEnd < segmentStart) {
          return null;
        }
        return {
          start: segmentStart,
          end: segmentEnd,
          capacity: segment.capacity
        };
      })
      .filter((segment): segment is { start: Date; end: Date; capacity: number } => Boolean(segment));
  }
  return [
    {
      start,
      end,
      capacity: task.requiredCapacity ?? 0
    }
  ];
};

export const InitiativeResourceLoadModule = ({
  plan,
  initiativeId,
  initiatives,
  timelineRange,
  pxPerDay,
  scrollRef,
  namesScrollRef,
  splitRatio,
  height,
  isCollapsed,
  onToggle
}: InitiativeResourceLoadModuleProps) => {
  const normalizedPlan = useMemo(() => sanitizePlanModel(plan), [plan]);
  const clampedSplit = Math.min(Math.max(splitRatio, PLAN_SPLIT_MIN), PLAN_SPLIT_MAX);
  const weekBuckets = useMemo<WeekBucket[]>(() => {
    if (isCollapsed) {
      return [];
    }
    const buckets: WeekBucket[] = [];
    for (let offset = 0; offset < timelineRange.totalDays; offset += WEEK_DAYS) {
      const start = addDays(timelineRange.start, offset);
      const days = Math.min(WEEK_DAYS, timelineRange.totalDays - offset);
      const end = addDays(start, Math.max(days - 1, 0));
      buckets.push({
        index: buckets.length,
        start,
        end,
        days,
        width: days * pxPerDay
      });
    }
    return buckets;
  }, [isCollapsed, pxPerDay, timelineRange.start, timelineRange.totalDays]);

  const responsiblePeople = useMemo(() => {
    if (isCollapsed) {
      return [];
    }
    const seen = new Set<string>();
    const result: string[] = [];
    normalizedPlan.tasks.forEach((task) => {
      const name = task.responsible.trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        result.push(name);
      }
    });
    return result;
  }, [isCollapsed, normalizedPlan.tasks]);

  const otherInitiativePlans = useMemo(() => {
    if (isCollapsed) {
      return [];
    }
    return initiatives
      .filter((initiative) => initiative.id && initiative.id !== initiativeId)
      .map((initiative) => sanitizePlanModel(initiative.plan));
  }, [initiativeId, initiatives, isCollapsed]);

  const loads = useMemo(() => {
    const bucketCount = weekBuckets.length;
    const map = new Map<string, LoadEntry>();
    responsiblePeople.forEach((person) => {
      map.set(person, {
        baseline: Array.from({ length: bucketCount }, () => 0),
        initiative: Array.from({ length: bucketCount }, () => 0)
      });
    });
    if (!bucketCount || !map.size) {
      return map;
    }
    const windowStart = timelineRange.start;
    const windowEnd = timelineRange.end;
    const distribute = (tasks: InitiativePlanTask[], key: keyof LoadEntry) => {
      tasks.forEach((task) => {
        const person = task.responsible.trim();
        if (!person || !map.has(person)) {
          return;
        }
        const entry = map.get(person)!;
        const slices = collectSlices(task);
        slices.forEach((slice) => {
          const sliceStart = slice.start < windowStart ? windowStart : slice.start;
          const sliceEnd = slice.end > windowEnd ? windowEnd : slice.end;
          if (sliceEnd < sliceStart) {
            return;
          }
          weekBuckets.forEach((bucket, bucketIndex) => {
            if (sliceEnd < bucket.start || sliceStart > bucket.end) {
              return;
            }
            const overlapStart = sliceStart > bucket.start ? sliceStart : bucket.start;
            const overlapEnd = sliceEnd < bucket.end ? sliceEnd : bucket.end;
            if (overlapEnd < overlapStart) {
              return;
            }
            const overlapDays = diffInDays(overlapStart, overlapEnd) + 1;
            if (overlapDays <= 0) {
              return;
            }
            entry[key][bucketIndex] += (slice.capacity * overlapDays) / WEEK_DAYS;
          });
        });
      });
    };
    distribute(normalizedPlan.tasks, 'initiative');
    otherInitiativePlans.forEach((otherPlan) => distribute(otherPlan.tasks, 'baseline'));
    return map;
  }, [normalizedPlan.tasks, otherInitiativePlans, responsiblePeople, timelineRange.end, timelineRange.start, weekBuckets]);

  const renderRow = (person: string) => {
    const entry = loads.get(person);
    const values = entry ?? { baseline: [], initiative: [] };
    return (
      <div key={person} className={styles.timelineRow}>
        <div className={styles.capacityLine} style={{ bottom: `${hundredPercentOffset}%` }} />
        <div className={styles.weekSeries}>
          {weekBuckets.map((bucket) => {
            const baseline = values.baseline[bucket.index] ?? 0;
            const initiativeLoad = values.initiative[bucket.index] ?? 0;
            const total = baseline + initiativeLoad;
            const baselineHeight = loadToPercent(baseline);
            const totalHeight = loadToPercent(total);
            const initiativeHeight = Math.max(totalHeight - baselineHeight, 0);
            const overloadHeight = Math.max(totalHeight - hundredPercentOffset, 0);
            const tooltip = `${formatRange(bucket.start, bucket.end)} · Baseline ${Math.round(
              baseline
            )}% · Initiative ${Math.round(initiativeLoad)}%`;
            return (
              <div
                key={`${person}-${bucket.index}`}
                className={styles.weekCell}
                style={{ width: `${bucket.width}px` }}
                title={tooltip}
                aria-label={tooltip}
              >
                <div className={styles.weekBar}>
                  <span
                    className={styles.baselineBar}
                    style={{ height: `${baselineHeight}%`, opacity: baselineHeight > 0 ? 1 : 0 }}
                  />
                  <span
                    className={styles.initiativeBar}
                    style={{
                      height: `${initiativeHeight}%`,
                      bottom: `${baselineHeight}%`,
                      opacity: initiativeHeight > 0 ? 1 : 0
                    }}
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
    );
  };

  return (
    <section className={styles.resourceModule} aria-label="Resource load overview">
      <header className={styles.moduleHeader}>
        <div className={styles.headerLeft}>
          <button
            className={styles.collapseButton}
            type="button"
            onClick={onToggle}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand resource load' : 'Collapse resource load'}
          >
            <ChevronIcon direction={isCollapsed ? 'right' : 'down'} size={16} />
          </button>
          <div>
            <h4>Resource load</h4>
            <p>Weekly capacity across all initiatives touching these owners.</p>
          </div>
        </div>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <i className={`${styles.legendSwatch} ${styles.baselineSwatch}`} />
            Baseline
          </span>
          <span className={styles.legendItem}>
            <i className={`${styles.legendSwatch} ${styles.currentSwatch}`} />
            This initiative
          </span>
          <span className={styles.legendItem}>
            <i className={`${styles.legendSwatch} ${styles.overloadSwatch}`} />
            Above 100%
          </span>
        </div>
      </header>
      {!isCollapsed && (
        <div className={styles.body} style={height === null ? { flex: 1 } : { height: `${height}px` }}>
          {!responsiblePeople.length ? (
            <div className={styles.emptyState}>
              <strong>Assign responsible owners to tasks to see their workload.</strong>
              <p>We combine this initiative with any other plan that schedules the same person.</p>
            </div>
          ) : (
            <div
              className={styles.matrix}
              style={{ gridTemplateColumns: `${clampedSplit * 100}% ${100 - clampedSplit * 100}%` }}
            >
              <div className={styles.namesColumn}>
                <div className={styles.namesScroll} ref={namesScrollRef}>
                  {responsiblePeople.map((person) => (
                    <div key={person} className={styles.nameRow}>
                      {person}
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.timelineColumn}>
                <div className={styles.timelineHeader}>
                  <div className={styles.monthRow}>
                    {timelineRange.months.map((month) => (
                      <span key={`${month.label}-${month.offset}`} style={{ width: `${month.span * pxPerDay}px` }}>
                        {month.label}
                      </span>
                    ))}
                  </div>
                  <div className={styles.dayRow}>
                    {timelineRange.days.map((day) => (
                      <span key={day.key} style={{ width: `${pxPerDay}px` }}>
                        {day.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className={styles.timelineScroll} ref={scrollRef}>
                  <div
                    className={styles.timelineRows}
                    style={{ width: `${timelineRange.width}px` }}
                  >
                    {responsiblePeople.map((person) => renderRow(person))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
