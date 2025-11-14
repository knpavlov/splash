import { InitiativePlanModel, InitiativePlanTask } from '../../../shared/types/initiative';
import { PLAN_ZOOM_MAX, PLAN_ZOOM_MIN } from './planModel';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const ZOOM_SCALE = [6, 8, 10, 14, 18, 24, 32] as const;

export const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * MS_PER_DAY);

export const diffInDays = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);

export const parseDate = (value: string | null) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

export const getZoomScale = (zoomLevel: number) => ZOOM_SCALE[clampValue(zoomLevel, PLAN_ZOOM_MIN, PLAN_ZOOM_MAX)];

export interface TimelineMonthSegment {
  label: string;
  offset: number;
  span: number;
}

export interface TimelineDaySegment {
  label: string;
  key: string;
}

export interface PlanTimelineRange {
  start: Date;
  end: Date;
  totalDays: number;
  months: TimelineMonthSegment[];
  days: TimelineDaySegment[];
  width: number;
}

const findTimelineBounds = (tasks: InitiativePlanTask[]) => {
  const datedTasks = tasks.filter((task) => task.startDate && task.endDate);
  let start = new Date();
  let end = addDays(start, 14);
  if (datedTasks.length) {
    start = datedTasks
      .map((task) => parseDate(task.startDate)!)
      .reduce((acc, date) => (date < acc ? date : acc));
    end = datedTasks
      .map((task) => parseDate(task.endDate)!)
      .reduce((acc, date) => (date > acc ? date : acc));
    start = addDays(start, -3);
    end = addDays(end, 3);
  }
  return { start, end };
};

export const buildTimelineRange = (plan: InitiativePlanModel | InitiativePlanTask[], pxPerDay: number): PlanTimelineRange => {
  const tasks = Array.isArray(plan) ? plan : plan.tasks;
  const { start, end } = findTimelineBounds(tasks);
  const totalDays = Math.max(diffInDays(start, end), 0) + 1;
  const months: TimelineMonthSegment[] = [];
  let monthStartIndex = 0;
  let currentLabel = `${start.toLocaleString('en-US', { month: 'short' })} ${start.getFullYear()}`;
  for (let dayIndex = 0; dayIndex < totalDays; dayIndex += 1) {
    const next = addDays(start, dayIndex);
    const label = `${next.toLocaleString('en-US', { month: 'short' })} ${next.getFullYear()}`;
    if (label !== currentLabel) {
      months.push({ label: currentLabel, offset: monthStartIndex, span: dayIndex - monthStartIndex });
      monthStartIndex = dayIndex;
      currentLabel = label;
    }
  }
  months.push({ label: currentLabel, offset: monthStartIndex, span: totalDays - monthStartIndex });
  const days = Array.from({ length: totalDays }, (_, index) => {
    const date = addDays(start, index);
    return {
      label: date.getDate().toString(),
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    };
  });
  return {
    start,
    end,
    totalDays,
    months,
    days,
    width: totalDays * pxPerDay
  };
};
