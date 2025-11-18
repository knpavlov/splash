import { Router } from 'express';
import { initiativeLogsService } from './initiativeLogs.module.js';

const router = Router();

router.get('/', async (req, res) => {
  const accountId = req.headers['x-account-id'];
  if (typeof accountId !== 'string' || !accountId.trim()) {
    res.status(401).json({ code: 'unauthorized', message: 'Account context is required.' });
    return;
  }
  const filters = {
    limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : 100,
    before: typeof req.query.before === 'string' ? new Date(req.query.before) : undefined,
    after: typeof req.query.after === 'string' ? new Date(req.query.after) : undefined,
    workstreamIds:
      typeof req.query.workstreams === 'string'
        ? req.query.workstreams.split(',').map((id) => id.trim()).filter(Boolean)
        : undefined
  };
  try {
    const logs = await initiativeLogsService.listLogs(accountId, filters);
    res.json(logs);
  } catch (error) {
    console.error('Failed to list initiative logs:', error);
    res.status(500).json({ code: 'log-list-error', message: 'Unable to load initiative logs.' });
  }
});

router.post('/mark-read', async (req, res) => {
  const accountId = req.headers['x-account-id'];
  if (typeof accountId !== 'string' || !accountId.trim()) {
    res.status(401).json({ code: 'unauthorized', message: 'Account context is required.' });
    return;
  }
  const eventIds = Array.isArray(req.body?.eventIds)
    ? req.body.eventIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  try {
    await initiativeLogsService.markAsRead(accountId, eventIds);
    res.status(204).send();
  } catch (error) {
    console.error('Failed to mark initiative logs as read:', error);
    res.status(500).json({ code: 'mark-read-error', message: 'Unable to mark entries as read.' });
  }
});

export { router as initiativeLogsRouter };
