import { Router, Response } from 'express';
import { workstreamsService } from './workstreams.module.js';

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
      res.status(404).json({ code: 'not-found', message: 'Workstream not found.' });
      return;
    case 'VERSION_CONFLICT':
      res.status(409).json({ code: 'version-conflict', message: 'The workstream version is outdated.' });
      return;
    case 'ACCOUNT_NOT_FOUND':
      res.status(404).json({ code: 'not-found', message: 'Account not found.' });
      return;
    case 'WORKSTREAM_NOT_FOUND':
      res.status(404).json({ code: 'not-found', message: 'One or more workstreams were not found.' });
      return;
    default:
      res.status(500).json({ code: 'unknown', message: 'Failed to process the request.' });
  }
};

router.get('/', async (_req, res) => {
  const workstreams = await workstreamsService.listWorkstreams();
  res.json(workstreams);
});

router.get('/role-options', async (_req, res) => {
  const options = await workstreamsService.getRoleOptions();
  res.json(options);
});

router.put('/role-options', async (req, res) => {
  try {
    const { options } = req.body as { options?: unknown };
    const saved = await workstreamsService.saveRoleOptions(options);
    res.json(saved);
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/', async (req, res) => {
  const { workstream } = req.body as { workstream?: unknown };
  if (!workstream) {
    res.status(400).json({ code: 'invalid-input', message: 'Provide workstream data.' });
    return;
  }
  try {
    const record = await workstreamsService.createWorkstream(workstream);
    res.status(201).json(record);
  } catch (error) {
    handleError(error, res);
  }
});

router.put('/:id', async (req, res) => {
  const { workstream, expectedVersion } = req.body as { workstream?: unknown; expectedVersion?: unknown };
  if (!workstream || typeof expectedVersion !== 'number') {
    res.status(400).json({ code: 'invalid-input', message: 'Provide workstream data and expected version.' });
    return;
  }
  try {
    const record = await workstreamsService.updateWorkstream(req.params.id, workstream, expectedVersion);
    res.json(record);
  } catch (error) {
    handleError(error, res);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = await workstreamsService.removeWorkstream(req.params.id);
    res.json({ id });
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/:id/assignments', async (req, res) => {
  try {
    const assignments = await workstreamsService.listAssignmentsByWorkstream(req.params.id);
    res.json(assignments);
  } catch (error) {
    handleError(error, res);
  }
});

export { router as workstreamsRouter };
