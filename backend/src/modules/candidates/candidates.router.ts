import { Router, Response } from 'express';
import { candidatesService } from './candidates.module.js';

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
      res.status(404).json({ code: 'not-found', message: 'Candidate not found.' });
      return;
    case 'VERSION_CONFLICT':
      res.status(409).json({ code: 'version-conflict', message: 'The candidate version is outdated.' });
      return;
    default:
      res.status(500).json({ code: 'unknown', message: 'Failed to process the request.' });
  }
};

router.get('/', async (_req, res) => {
  const candidates = await candidatesService.listCandidates();
  res.json(candidates);
});

router.get('/:id', async (req, res) => {
  try {
    const candidate = await candidatesService.getCandidate(req.params.id);
    res.json(candidate);
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/', async (req, res) => {
  const { profile } = req.body as { profile?: unknown };
  if (!profile) {
    res.status(400).json({ code: 'invalid-input', message: 'Provide candidate data.' });
    return;
  }
  try {
    const candidate = await candidatesService.createCandidate(profile);
    res.status(201).json(candidate);
  } catch (error) {
    handleError(error, res);
  }
});

router.put('/:id', async (req, res) => {
  const { profile, expectedVersion } = req.body as { profile?: unknown; expectedVersion?: unknown };
  if (!profile || typeof expectedVersion !== 'number') {
    res.status(400).json({ code: 'invalid-input', message: 'Provide candidate data and expected version.' });
    return;
  }
  try {
    const candidate = await candidatesService.updateCandidate(req.params.id, profile, expectedVersion);
    res.json(candidate);
  } catch (error) {
    handleError(error, res);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = await candidatesService.deleteCandidate(req.params.id);
    res.json({ id });
  } catch (error) {
    handleError(error, res);
  }
});

export { router as candidatesRouter };
