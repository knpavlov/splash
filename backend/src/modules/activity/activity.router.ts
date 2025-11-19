import { Router, Request, Response } from 'express';
import { activityService } from './activity.module.js';
import { ActivityTimeframeKey } from './activity.types.js';

const router = Router();

const parseListParam = (value: unknown): string[] => {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const parseTimeframe = (value: unknown): ActivityTimeframeKey | undefined => {
  const allowed: ActivityTimeframeKey[] = [
    'since-last-login',
    'since-last-visit',
    'since-yesterday',
    'since-7-days',
    'since-last-month'
  ];
  if (typeof value === 'string' && allowed.includes(value as ActivityTimeframeKey)) {
    return value as ActivityTimeframeKey;
  }
  return undefined;
};

const resolveAccountId = (req: Request, res: Response) => {
  const accountId = req.headers['x-account-id'];
  if (typeof accountId !== 'string' || !accountId.trim()) {
    res.status(401).json({ code: 'unauthorized', message: 'Account context is required.' });
    return null;
  }
  return accountId.trim();
};

router.get('/preferences', async (req, res) => {
  const accountId = resolveAccountId(req, res);
  if (!accountId) {
    return;
  }
  try {
    const payload = await activityService.getPreferenceBundle(accountId);
    res.json(payload);
  } catch (error) {
    console.error('Failed to load activity preferences:', error);
    res.status(500).json({ code: 'activity-preferences-error', message: 'Unable to load activity preferences.' });
  }
});

router.put('/preferences', async (req, res) => {
  const accountId = resolveAccountId(req, res);
  if (!accountId) {
    return;
  }
  const body = req.body ?? {};
  try {
    await activityService.updatePreferences(accountId, {
      workstreamIds: Array.isArray(body.workstreamIds) ? body.workstreamIds : undefined,
      initiativeIds: Array.isArray(body.initiativeIds) ? body.initiativeIds : undefined,
      moduleKeys: Array.isArray(body.moduleKeys) ? body.moduleKeys : undefined,
      metricKeys: Array.isArray(body.metricKeys) ? body.metricKeys : undefined,
      defaultTimeframe: parseTimeframe(body.defaultTimeframe)
    });
    const payload = await activityService.getPreferenceBundle(accountId);
    res.json(payload);
  } catch (error) {
    console.error('Failed to update activity preferences:', error);
    res.status(500).json({ code: 'activity-preferences-error', message: 'Unable to update activity preferences.' });
  }
});

router.post('/preferences/visit', async (req, res) => {
  const accountId = resolveAccountId(req, res);
  if (!accountId) {
    return;
  }
  try {
    const visitedAt = await activityService.markVisited(accountId);
    res.status(200).json({ lastVisitedAt: visitedAt });
  } catch (error) {
    console.error('Failed to update last activity visit:', error);
    res.status(500).json({ code: 'activity-visit-error', message: 'Unable to mark the page as visited.' });
  }
});

router.get('/summary', async (req, res) => {
  const accountId = resolveAccountId(req, res);
  if (!accountId) {
    return;
  }
  try {
    const summary = await activityService.getSummary(accountId, {
      timeframe: parseTimeframe(req.query.timeframe),
      workstreamIds: parseListParam(req.query.workstreams),
      metricKeys: parseListParam(req.query.metrics)
    });
    res.json(summary);
  } catch (error) {
    console.error('Failed to load activity summary:', error);
    res.status(500).json({ code: 'activity-summary-error', message: 'Unable to load the activity dashboard.' });
  }
});

router.get('/comment-feed', async (req, res) => {
  const accountId = resolveAccountId(req, res);
  if (!accountId) {
    return;
  }
  const limit =
    typeof req.query.limit === 'string' && Number(req.query.limit)
      ? Math.min(Math.max(Number(req.query.limit), 10), 200)
      : 60;
  try {
    const feed = await activityService.listCommentFeed(accountId, {
      timeframe: parseTimeframe(req.query.timeframe),
      workstreamIds: parseListParam(req.query.workstreams),
      initiativeIds: parseListParam(req.query.initiatives),
      limit
    });
    res.json(feed);
  } catch (error) {
    console.error('Failed to load comment feed:', error);
    res.status(500).json({ code: 'activity-comments-error', message: 'Unable to load initiative comments.' });
  }
});

export { router as activityRouter };
