import { Router, Response } from 'express';
import { participantsService } from './participants.module.js';
import { ParticipantInput } from './participants.types.js';

const router = Router();

const handleError = (error: unknown, res: Response) => {
  if (!(error instanceof Error)) {
    res.status(500).json({ code: 'unknown', message: 'Unexpected error.' });
    return;
  }
  switch (error.message) {
    case 'INVALID_INPUT':
      res.status(400).json({ code: 'invalid-input', message: 'Invalid participant data.' });
      return;
    case 'NOT_FOUND':
      res.status(404).json({ code: 'not-found', message: 'Participant not found.' });
      return;
    default:
      res.status(500).json({ code: 'unknown', message: 'Failed to process participant request.' });
  }
};

router.get('/', async (_req, res) => {
  const list = await participantsService.listParticipants();
  res.json(list);
});

router.post('/', async (req, res) => {
  const payload = req.body as ParticipantInput | undefined;
  if (!payload) {
    res.status(400).json({ code: 'invalid-input', message: 'Provide participant data.' });
    return;
  }
  try {
    const participant = await participantsService.createParticipant(payload);
    res.status(201).json(participant);
  } catch (error) {
    handleError(error, res);
  }
});

router.patch('/:id', async (req, res) => {
  const payload = req.body as ParticipantInput | undefined;
  if (!payload) {
    res.status(400).json({ code: 'invalid-input', message: 'Provide participant changes.' });
    return;
  }
  try {
    const participant = await participantsService.updateParticipant(req.params.id, payload);
    res.json(participant);
  } catch (error) {
    handleError(error, res);
  }
});

export { router as participantsRouter };
