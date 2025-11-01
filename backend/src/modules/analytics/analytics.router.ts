import { Router } from 'express';
import { analyticsService } from './analytics.module.js';
import type { InterviewerPeriodKey, SummaryPeriodKey, TimelineGrouping } from './analytics.types.js';

const router = Router();

const summaryPeriods: SummaryPeriodKey[] = ['rolling_3', 'fytd', 'rolling_12'];
const interviewerPeriods: InterviewerPeriodKey[] = ['last_month', 'rolling_3', 'fytd', 'rolling_12'];
const timelineGroupings: TimelineGrouping[] = ['week', 'month', 'quarter'];
const interviewerRoleCodes = ['MD', 'SD', 'D', 'SM', 'M', 'SA', 'A'];

const resolveSummaryPeriod = (value: unknown): SummaryPeriodKey => {
  if (typeof value !== 'string') {
    return 'rolling_3';
  }
  const normalized = value.trim() as SummaryPeriodKey;
  return summaryPeriods.includes(normalized) ? normalized : 'rolling_3';
};

const resolveInterviewerPeriod = (value: unknown): InterviewerPeriodKey => {
  if (typeof value !== 'string') {
    return 'rolling_3';
  }
  const normalized = value.trim() as InterviewerPeriodKey;
  return interviewerPeriods.includes(normalized) ? normalized : 'rolling_3';
};

const resolveGrouping = (value: unknown): TimelineGrouping => {
  if (typeof value !== 'string') {
    return 'month';
  }
  const normalized = value.trim() as TimelineGrouping;
  return timelineGroupings.includes(normalized) ? normalized : 'month';
};

const normalizeIds = (value: unknown): string[] | undefined => {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
      .filter((item) => item.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);
  }
  return undefined;
};

const normalizeRoles = (value: unknown): string[] | undefined => {
  if (!value) {
    return undefined;
  }
  const toArray = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const normalized = toArray
    .map((item) => (typeof item === 'string' ? item.trim().toUpperCase() : ''))
    .filter((item) => interviewerRoleCodes.includes(item));
  return normalized.length ? normalized : undefined;
};

router.get('/summary', async (req, res) => {
  try {
    const period = resolveSummaryPeriod(req.query.period);
    const summary = await analyticsService.getSummary(period);
    res.json(summary);
  } catch (error) {
    console.error('Failed to load analytics summary:', error);
    res.status(500).json({ code: 'analytics-error', message: 'Unable to load summary metrics.' });
  }
});

router.get('/timeline', async (req, res) => {
  try {
    const groupBy = resolveGrouping(req.query.groupBy);
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const timeline = await analyticsService.getTimeline(groupBy, { from, to });
    res.json(timeline);
  } catch (error) {
    console.error('Failed to load analytics timeline:', error);
    res.status(500).json({ code: 'analytics-error', message: 'Unable to load the timeline.' });
  }
});

router.get('/interviewers', async (req, res) => {
  try {
    const period = resolveInterviewerPeriod(req.query.period);
    const interviewerIds = normalizeIds(req.query.interviewers);
    const roles = normalizeRoles(req.query.roles);
    const groupBy = resolveGrouping(req.query.groupBy);
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const stats = await analyticsService.getInterviewerStats(period, { interviewerIds, roles, groupBy, from, to });
    res.json(stats);
  } catch (error) {
    console.error('Failed to load interviewer analytics:', error);
    res.status(500).json({ code: 'analytics-error', message: 'Unable to load interviewer statistics.' });
  }
});

router.get('/export/:dataset', async (req, res) => {
  const dataset = req.params.dataset;
  const groupBy = resolveGrouping(req.query.groupBy);
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const interviewerIds = normalizeIds(req.query.interviewers);
  const roles = normalizeRoles(req.query.roles);

  try {
    switch (dataset) {
      case 'summary': {
        const period = resolveSummaryPeriod(req.query.period);
        const csv = await analyticsService.exportSummary(period);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="analytics-summary.csv"');
        res.send(`\uFEFF${csv}`);
        return;
      }
      case 'timeline': {
        const csv = await analyticsService.exportTimeline(groupBy, { from, to });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="analytics-timeline.csv"');
        res.send(`\uFEFF${csv}`);
        return;
      }
      case 'interviewers': {
        const period = resolveInterviewerPeriod(req.query.period);
        const csv = await analyticsService.exportInterviewers(period, {
          interviewerIds,
          roles,
          groupBy,
          from,
          to
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="analytics-interviewers.csv"');
        res.send(`\uFEFF${csv}`);
        return;
      }
      default:
        res.status(404).json({ code: 'not-found', message: 'Unknown dataset for export.' });
    }
  } catch (error) {
    console.error('Failed to export analytics dataset:', error);
    res.status(500).json({ code: 'analytics-error', message: 'Unable to prepare the export file.' });
  }
});

export { router as analyticsRouter };

