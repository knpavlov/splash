import { Router } from 'express';
import { snapshotsService } from './snapshots.module.js';
import type { SnapshotDetailLevel, SessionSnapshotTrigger } from './snapshots.types.js';

const router = Router();

const parseDateParam = (value: unknown): Date | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeDetailLevel = (value: unknown): SnapshotDetailLevel => {
  if (value === 'summary') {
    return 'summary';
  }
  return 'full';
};

const isSessionEvent = (value: unknown): value is SessionSnapshotTrigger =>
  value === 'login' || value === 'logout';

router.get('/settings', async (_req, res) => {
  try {
    const settings = await snapshotsService.getSettings();
    res.json(settings);
  } catch (error) {
    console.error('Failed to load snapshot settings:', error);
    res.status(500).json({ code: 'snapshot-settings-error', message: 'Unable to load snapshot settings.' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const settings = await snapshotsService.updateSettings(req.body ?? {});
    res.json(settings);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'INVALID_RETENTION') {
        res.status(400).json({ code: 'invalid-retention', message: 'Retention must be at least 30 days.' });
        return;
      }
      if (error.message === 'INVALID_TIME') {
        res.status(400).json({ code: 'invalid-time', message: 'Provide a valid schedule time.' });
        return;
      }
      if (error.message === 'INVALID_TIMEZONE') {
        res.status(400).json({ code: 'invalid-timezone', message: 'Provide a valid timezone identifier.' });
        return;
      }
    }
    console.error('Failed to update snapshot settings:', error);
    res.status(500).json({ code: 'snapshot-settings-error', message: 'Unable to update snapshot settings.' });
  }
});

router.get('/program', async (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 30, 120));
  const from = parseDateParam(req.query.from);
  const to = parseDateParam(req.query.to);
  try {
    const snapshots = await snapshotsService.listProgramSnapshots({ limit, from: from ?? undefined, to: to ?? undefined });
    res.json(snapshots);
  } catch (error) {
    console.error('Failed to list program snapshots:', error);
    res.status(500).json({ code: 'snapshot-list-error', message: 'Unable to load snapshots.' });
  }
});

router.get('/program/latest', async (_req, res) => {
  try {
    const snapshot = await snapshotsService.getLatestProgramSnapshot();
    if (!snapshot) {
      res.status(404).json({ code: 'not-found', message: 'Snapshot not found.' });
      return;
    }
    res.json(snapshot);
  } catch (error) {
    console.error('Failed to load latest snapshot:', error);
    res.status(500).json({ code: 'snapshot-load-error', message: 'Unable to load the latest snapshot.' });
  }
});

router.get('/program/:id', async (req, res) => {
  try {
    const snapshot = await snapshotsService.getProgramSnapshot(req.params.id);
    if (!snapshot) {
      res.status(404).json({ code: 'not-found', message: 'Snapshot not found.' });
      return;
    }
    res.json(snapshot);
  } catch (error) {
    console.error('Failed to load snapshot payload:', error);
    res.status(500).json({ code: 'snapshot-load-error', message: 'Unable to load the snapshot.' });
  }
});

router.post('/capture', async (req, res) => {
  const detailLevel = normalizeDetailLevel(req.body?.detailLevel);
  try {
    const snapshot = await snapshotsService.captureProgramSnapshot('manual', detailLevel);
    res.status(201).json(snapshot);
  } catch (error) {
    console.error('Failed to capture manual snapshot:', error);
    res.status(500).json({ code: 'snapshot-capture-error', message: 'Unable to capture the snapshot.' });
  }
});

router.post('/session-events', async (req, res) => {
  const { accountId, event } = (req.body ?? {}) as { accountId?: string; event?: string };
  if (!isSessionEvent(event)) {
    res.status(400).json({ code: 'invalid-event', message: 'Specify whether this is a login or logout event.' });
    return;
  }
  void snapshotsService
    .captureSessionSnapshot(event, { id: typeof accountId === 'string' ? accountId : null })
    .catch((error) => {
      console.error('Failed to capture session snapshot:', error);
    });
  res.status(202).json({ accepted: true });
});

export { router as snapshotsRouter };
