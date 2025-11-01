import { Router, Response } from 'express';
import { caseCriteriaService } from './caseCriteria.module.js';

const router = Router();

const handleError = (error: unknown, res: Response) => {
  if (!(error instanceof Error)) {
    res.status(500).json({ code: 'unknown', message: 'Unexpected error.' });
    return;
  }

  switch (error.message) {
    case 'INVALID_INPUT':
      res.status(400).json({ code: 'invalid-input', message: 'Invalid input.' });
      return;
    case 'NOT_FOUND':
      res.status(404).json({ code: 'not-found', message: 'Case criterion not found.' });
      return;
    case 'VERSION_CONFLICT':
      res.status(409).json({ code: 'version-conflict', message: 'The case criterion version is outdated.' });
      return;
    default:
      res.status(500).json({ code: 'unknown', message: 'Failed to process the request.' });
  }
};

router.get('/', async (_req, res) => {
  const criteria = await caseCriteriaService.listCriteria();
  res.json(criteria);
});

router.post('/', async (req, res) => {
  const { criterion } = req.body as { criterion?: unknown };
  if (!criterion) {
    res.status(400).json({ code: 'invalid-input', message: 'Provide criterion data.' });
    return;
  }
  try {
    const record = await caseCriteriaService.createCriterion(criterion);
    res.status(201).json(record);
  } catch (error) {
    handleError(error, res);
  }
});

router.put('/:id', async (req, res) => {
  const { criterion, expectedVersion } = req.body as { criterion?: unknown; expectedVersion?: unknown };
  if (!criterion || typeof expectedVersion !== 'number') {
    res
      .status(400)
      .json({ code: 'invalid-input', message: 'Provide criterion data and expected version.' });
    return;
  }
  try {
    const record = await caseCriteriaService.updateCriterion(req.params.id, criterion, expectedVersion);
    res.json(record);
  } catch (error) {
    handleError(error, res);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = await caseCriteriaService.deleteCriterion(req.params.id);
    res.json({ id });
  } catch (error) {
    handleError(error, res);
  }
});

export { router as caseCriteriaRouter };
