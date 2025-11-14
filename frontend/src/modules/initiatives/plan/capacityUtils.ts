import { InitiativePlanTask } from '../../../shared/types/initiative';
import { parseDate } from './planTimeline';

export interface CapacitySlice {
  start: Date;
  end: Date;
  capacity: number;
}

export const collectCapacitySlices = (task: InitiativePlanTask): CapacitySlice[] => {
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
        if (segment.capacity < 0) {
          return null;
        }
        return {
          start: segmentStart,
          end: segmentEnd,
          capacity: segment.capacity
        };
      })
      .filter((slice): slice is CapacitySlice => Boolean(slice));
  }
  return [
    {
      start,
      end,
      capacity: task.requiredCapacity ?? 0
    }
  ];
};
