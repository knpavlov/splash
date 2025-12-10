import { Router, Response } from 'express';
import { initiativesService } from './initiatives.module.js';
import type { InitiativeCommentPayload, InitiativeCommentReplyPayload } from './initiatives.service.js';
import type { InitiativeMutationMetadata } from './initiatives.types.js';

const router = Router();

const normalizeActor = (input: unknown): InitiativeMutationMetadata | undefined => {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const payload = input as { accountId?: unknown; name?: unknown };
  const accountId =
    typeof payload.accountId === 'string' && payload.accountId.trim() ? payload.accountId.trim() : null;
  const actorName = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null;
  if (!accountId && !actorName) {
    return undefined;
  }
  return { actorAccountId: accountId, actorName };
};

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
    case 'STAGE_PENDING':
      res.status(409).json({ code: 'stage-pending', message: 'This stage is already awaiting approvals.' });
      return;
    case 'STAGE_ALREADY_APPROVED':
      res.status(409).json({ code: 'stage-approved', message: 'This stage has already been approved.' });
      return;
    case 'MISSING_APPROVERS':
      res.status(422).json({ code: 'missing-approvers', message: 'Assign account roles for all approvers before submitting.' });
      return;
    case 'WORKSTREAM_NOT_FOUND':
      res.status(404).json({ code: 'workstream-not-found', message: 'Workstream configuration not found.' });
      return;
    case 'APPROVAL_NOT_FOUND':
      res.status(404).json({ code: 'approval-not-found', message: 'Approval request not found.' });
      return;
    case 'FORBIDDEN':
      res.status(403).json({ code: 'forbidden', message: 'You cannot act on this approval.' });
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
  const { initiative, actor } = req.body as { initiative?: unknown; actor?: unknown };
  if (!initiative) {
    res.status(400).json({ code: 'invalid-input', message: 'Provide initiative data.' });
    return;
  }
  try {
    const record = await initiativesService.createInitiative(initiative, normalizeActor(actor));
    res.status(201).json(record);
  } catch (error) {
    handleError(error, res);
  }
});

router.put('/:id', async (req, res) => {
  const { initiative, expectedVersion, actor } = req.body as {
    initiative?: unknown;
    expectedVersion?: unknown;
    actor?: unknown;
  };
  if (!initiative || typeof expectedVersion !== 'number') {
    res.status(400).json({ code: 'invalid-input', message: 'Provide initiative data and expected version.' });
    return;
  }
  try {
    const record = await initiativesService.updateInitiative(
      req.params.id,
      initiative,
      expectedVersion,
      normalizeActor(actor)
    );
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
  const { targetStage, actor } = req.body as { targetStage?: unknown; actor?: unknown };
  try {
    const initiative = await initiativesService.advanceStage(
      req.params.id,
      typeof targetStage === 'string' ? (targetStage as any) : undefined,
      normalizeActor(actor)
    );
    res.json(initiative);
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/:id/submit', async (req, res) => {
  const { actor } = req.body as { actor?: unknown };
  try {
    const initiative = await initiativesService.submitStage(req.params.id, normalizeActor(actor));
    res.json(initiative);
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/:id/events', async (req, res) => {
  try {
    const events = await initiativesService.listEvents(req.params.id);
    res.json(events);
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/:id/status-reports', async (req, res) => {
  try {
    const reports = await initiativesService.listStatusReports(req.params.id);
    res.json(reports);
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/:id/status-reports', async (req, res) => {
  const { report, actor } = req.body as { report?: unknown; actor?: unknown };
  if (!report || typeof report !== 'object') {
    res.status(400).json({ code: 'invalid-input', message: 'Provide status report payload.' });
    return;
  }
  try {
    const created = await initiativesService.createStatusReport(req.params.id, report, normalizeActor(actor));
    res.status(201).json(created);
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/:id/comments', async (req, res) => {
  try {
    const threads = await initiativesService.listComments(req.params.id);
    res.json(threads);
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/:id/comments', async (req, res) => {
  const { comment, actor } = req.body as { comment?: unknown; actor?: unknown };
  if (!comment || typeof comment !== 'object') {
    res.status(400).json({ code: 'invalid-input', message: 'Provide comment payload.' });
    return;
  }
  try {
    const thread = await initiativesService.createComment(
      req.params.id,
      comment as InitiativeCommentPayload,
      normalizeActor(actor)
    );
    res.status(201).json(thread);
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/:id/comments/:threadId/replies', async (req, res) => {
  const { reply, actor } = req.body as { reply?: unknown; actor?: unknown };
  if (!reply || typeof reply !== 'object') {
    res.status(400).json({ code: 'invalid-input', message: 'Provide reply payload.' });
    return;
  }
  try {
    const thread = await initiativesService.replyToComment(
      req.params.id,
      req.params.threadId,
      reply as InitiativeCommentReplyPayload,
      normalizeActor(actor)
    );
    res.status(201).json(thread);
  } catch (error) {
    handleError(error, res);
  }
});

router.patch('/:id/comments/:threadId/status', async (req, res) => {
  const { resolved, actor } = req.body as { resolved?: unknown; actor?: unknown };
  if (typeof resolved !== 'boolean') {
    res.status(400).json({ code: 'invalid-input', message: 'Provide resolved flag.' });
    return;
  }
  try {
    const thread = await initiativesService.setCommentResolution(
      req.params.id,
      req.params.threadId,
      resolved,
      normalizeActor(actor)
    );
    res.json(thread);
  } catch (error) {
    handleError(error, res);
  }
});

router.delete('/:id/comments/:threadId', async (req, res) => {
  const { messageId, actor } = req.body as { messageId?: unknown; actor?: unknown };
  try {
    const result = await initiativesService.deleteComment(
      req.params.id,
      req.params.threadId,
      typeof messageId === 'string' ? messageId : null,
      normalizeActor(actor)
    );
    res.json(result);
  } catch (error) {
    handleError(error, res);
  }
});

export { router as initiativesRouter };
