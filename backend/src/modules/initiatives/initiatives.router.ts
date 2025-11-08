import { Router, Response } from 'express';
import { initiativesService } from './initiatives.module.js';

const router = Router();

const handleError = (error: unknown, res: Response) => {
  if (!(error instanceof Error)) {
    res.status(500).json({ code: 'unknown', message: 'Unexpected error.' });
    return;
  }
  switch (error.message) {
    case 'INVALID_INPUT':
      res.status(400).json({ code: 'invalid-input', message: 'Invalid initiative data.' });
      return;
    case 'NOT_FOUND':
      res.status(404).json({ code: 'not-found', message: 'Initiative not found.' });
      return;
    case 'VERSION_CONFLICT':
      res.status(409).json({ code: 'version-conflict', message: 'Initiative was updated elsewhere.' });
      return;
    default:
      res.status(500).json({ code: 'unknown', message: 'Failed to process the request.' });
  }
};

router.get('/', async (_req, res) => {
  const initiatives = await initiativesService.listInitiatives();
  res.json(initiatives);
});

router.get('/:id', async (req, res) => {
  try {
    const initiative = await initiativesService.getInitiative(req.params.id);
    res.json(initiative);
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/', async (req, res) => {
  const { initiative } = req.body as { initiative?: unknown };
  if (!initiative) {
    res.status(400).json({ code: 'invalid-input', message: 'Provide initiative data.' });
    return;
  }
  try {
    const record = await initiativesService.createInitiative(initiative);
    res.status(201).json(record);
  } catch (error) {
    handleError(error, res);
  }
});

router.put('/:id', async (req, res) => {
  const { initiative, expectedVersion } = req.body as { initiative?: unknown; expectedVersion?: unknown };
  if (!initiative || typeof expectedVersion !== 'number') {
    res.status(400).json({ code: 'invalid-input', message: 'Provide initiative data and expected version.' });
    return;
  }
  try {
    const record = await initiativesService.updateInitiative(req.params.id, initiative, expectedVersion);
    res.json(record);
  } catch (error) {
    handleError(error, res);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = await initiativesService.removeInitiative(req.params.id);
    res.json({ id });
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/:id/advance', async (req, res) => {
  const { targetStage } = req.body as { targetStage?: unknown };
  try {
    const initiative = await initiativesService.advanceStage(
      req.params.id,
      typeof targetStage === 'string' ? (targetStage as any) : undefined
    );
    res.json(initiative);
  } catch (error) {
    handleError(error, res);
  }
});

export { router as initiativesRouter };
