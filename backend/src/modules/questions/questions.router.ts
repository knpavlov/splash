import { Router, Response } from 'express';
import { questionsService } from './questions.module.js';

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
      res.status(404).json({ code: 'not-found', message: 'Fit question not found.' });
      return;
    case 'VERSION_CONFLICT':
      res.status(409).json({ code: 'version-conflict', message: 'The fit question version is outdated.' });
      return;
    default:
      res.status(500).json({ code: 'unknown', message: 'Failed to process the request.' });
  }
};

router.get('/', async (_req, res) => {
  const questions = await questionsService.listQuestions();
  res.json(questions);
});

router.get('/:id', async (req, res) => {
  try {
    const question = await questionsService.getQuestion(req.params.id);
    res.json(question);
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/', async (req, res) => {
  const { question } = req.body as { question?: unknown };
  if (!question) {
    res.status(400).json({ code: 'invalid-input', message: 'Provide question data.' });
    return;
  }
  try {
    const record = await questionsService.createQuestion(question);
    res.status(201).json(record);
  } catch (error) {
    handleError(error, res);
  }
});

router.put('/:id', async (req, res) => {
  const { question, expectedVersion } = req.body as { question?: unknown; expectedVersion?: unknown };
  if (!question || typeof expectedVersion !== 'number') {
    res
      .status(400)
      .json({ code: 'invalid-input', message: 'Provide question data and expected version.' });
    return;
  }
  try {
    const record = await questionsService.updateQuestion(req.params.id, question, expectedVersion);
    res.json(record);
  } catch (error) {
    handleError(error, res);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = await questionsService.deleteQuestion(req.params.id);
    res.json({ id });
  } catch (error) {
    handleError(error, res);
  }
});

export { router as questionsRouter };
