import { useEffect, useMemo, useRef, useState } from 'react';
import styles from '../../../../styles/InitiativeResourceLoadModule.module.css';
import { Initiative, InitiativePlanModel, InitiativePlanTask } from '../../../../shared/types/initiative';
import { sanitizePlanModel } from '../../plan/planModel';
import { addDays, buildTimelineRange, diffInDays, getZoomScale, parseDate } from '../../plan/planTimeline';

interface InitiativeResourceLoadModuleProps {
  plan: InitiativePlanModel;
  initiativeId: string;
  initiatives: Initiative[];
  onTimelineScroll?: (scrollLeft: number) => void;
  timelineScrollLeft?: number;
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
  onTimelineScroll,
  timelineScrollLeft
}: InitiativeResourceLoadModuleProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const normalizedPlan = useMemo(() => sanitizePlanModel(plan), [plan]);
  const pxPerDay = useMemo(
    () => getZoomScale(normalizedPlan.settings.zoomLevel),
    [normalizedPlan.settings.zoomLevel]
  );
  const timelineRange = useMemo(() => buildTimelineRange(normalizedPlan, pxPerDay), [normalizedPlan, pxPerDay]);
  const weekBuckets = useMemo<WeekBucket[]>(() => {
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
  }, [timelineRange, pxPerDay]);

  const responsiblePeople = useMemo(() => {
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
  }, [normalizedPlan.tasks]);

  const otherInitiativePlans = useMemo(
    () =>
      initiatives
        .filter((initiative) => initiative.id && initiative.id !== initiativeId)
        .map((initiative) => sanitizePlanModel(initiative.plan)),
    [initiativeId, initiatives]
  );

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

  const timelineScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = timelineScrollRef.current;
    if (!element || !onTimelineScroll) {
      return;
    }
    const handleScroll = () => {
      onTimelineScroll(element.scrollLeft);
    };
    element.addEventListener('scroll', handleScroll);
    return () => {
      element.removeEventListener('scroll', handleScroll);
    };
  }, [onTimelineScroll]);

  useEffect(() => {
    if (timelineScrollLeft === null || timelineScrollLeft === undefined) {
      return;
    }
    const element = timelineScrollRef.current;
    if (!element) {
      return;
    }
    if (Math.abs(element.scrollLeft - timelineScrollLeft) > 1) {
      element.scrollLeft = timelineScrollLeft;
    }
  }, [timelineScrollLeft]);

  const renderTimelineHeader = () => (
    <div className={styles.timelineHeader} style={{ width: `${timelineRange.width}px` }}>
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
  );

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
        <div>
          <h3>Resource load</h3>
          <p>Weekly capacity across all initiatives touching these owners.</p>
        </div>
        <div className={styles.headerActions}>
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
          <button
            className={styles.collapseButton}
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </header>
      {!isCollapsed && (
        <div className={styles.body}>
          {!responsiblePeople.length ? (
            <div className={styles.emptyState}>
              <strong>Assign responsible owners to tasks to see their workload.</strong>
              <p>We will combine this initiative with every other plan where the same person is scheduled.</p>
            </div>
          ) : (
            <div className={styles.matrix}>
              <div className={styles.namesColumn}>
                <div className={styles.nameHeader}>People</div>
                {responsiblePeople.map((person) => (
                  <div key={person} className={styles.nameRow}>
                    {person}
                  </div>
                ))}
              </div>
              <div className={styles.timelineColumn}>
                <div className={styles.timelineScroll} ref={timelineScrollRef}>
                  {renderTimelineHeader()}
                  <div className={styles.timelineRows}>{responsiblePeople.map((person) => renderRow(person))}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
