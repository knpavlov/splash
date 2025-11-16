import { Router, Response } from 'express';
import { financialsService } from './financials.module.js';

const router = Router();

const handleError = (error: unknown, res: Response) => {
  if (!(error instanceof Error)) {
    res.status(500).json({ code: 'unknown', message: 'Unexpected error.' });
    return;
  }
  switch (error.message) {
    case 'INVALID_INPUT':
      res.status(400).json({ code: 'invalid-input', message: 'Invalid financial blueprint payload.' });
      return;
    case 'VERSION_CONFLICT':
      res.status(409).json({ code: 'version-conflict', message: 'The blueprint version is outdated.' });
      return;
    default:
      res.status(500).json({ code: 'unknown', message: 'Failed to process the request.' });
  }
};

router.get('/blueprint', async (_req, res) => {
  try {
    const blueprint = await financialsService.getBlueprint();
    res.json(blueprint);
  } catch (error) {
    handleError(error, res);
  }
});

router.put('/blueprint', async (req, res) => {
  const { blueprint, expectedVersion } = req.body as { blueprint?: unknown; expectedVersion?: unknown };
  if (!blueprint) {
    res.status(400).json({ code: 'invalid-input', message: 'Provide blueprint data.' });
    return;
  }
  try {
    const record = await financialsService.saveBlueprint(blueprint, expectedVersion);
    res.json(record);
  } catch (error) {
    handleError(error, res);
  }
});

export { router as financialsRouter };
