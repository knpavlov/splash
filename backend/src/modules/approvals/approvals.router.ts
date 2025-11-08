import { Router, Response } from 'express';
import { initiativesService } from '../initiatives/initiatives.module.js';
import type { InitiativeApprovalRecord, ApprovalDecision } from '../initiatives/initiatives.types.js';

const router = Router();

const handleError = (error: unknown, res: Response) => {
  if (!(error instanceof Error)) {
    res.status(500).json({ code: 'unknown', message: 'Unexpected error.' });
    return;
  }
  switch (error.message) {
    case 'INVALID_INPUT':
      res.status(400).json({ code: 'invalid-input', message: 'Invalid approval data.' });
      return;
    case 'NOT_FOUND':
      res.status(404).json({ code: 'not-found', message: 'Initiative not found.' });
      return;
    case 'WORKSTREAM_NOT_FOUND':
      res.status(404).json({ code: 'workstream-not-found', message: 'Workstream configuration missing.' });
      return;
    case 'APPROVAL_NOT_FOUND':
      res.status(404).json({ code: 'approval-not-found', message: 'Approval request not found.' });
      return;
    case 'VERSION_CONFLICT':
      res.status(409).json({ code: 'version-conflict', message: 'Initiative was updated elsewhere.' });
      return;
    case 'FORBIDDEN':
      res.status(403).json({ code: 'forbidden', message: 'You cannot act on this approval.' });
      return;
    case 'MISSING_APPROVERS':
      res.status(422).json({ code: 'missing-approvers', message: 'Assign approvers before progressing.' });
      return;
    default:
      res.status(500).json({ code: 'unknown', message: 'Failed to process the request.' });
  }
};

router.get('/', async (req, res) => {
  const { status, accountId } = req.query as { status?: InitiativeApprovalRecord['status']; accountId?: string };
  const filter: { status?: InitiativeApprovalRecord['status']; accountId?: string | null } = {};
  if (status === 'pending' || status === 'approved' || status === 'returned' || status === 'rejected') {
    filter.status = status;
  }
  if (typeof accountId === 'string' && accountId.trim()) {
    filter.accountId = accountId.trim();
  }
  const tasks = await initiativesService.listApprovalTasks(filter);
  res.json(tasks);
});

router.post('/:id/decision', async (req, res) => {
  const { decision, accountId, comment } = req.body as {
    decision?: ApprovalDecision;
    accountId?: string | null;
    comment?: string | null;
  };
  if (decision !== 'approve' && decision !== 'return' && decision !== 'reject') {
    res.status(400).json({ code: 'invalid-input', message: 'Provide a valid decision (approve, return, reject).' });
    return;
  }
  try {
    const initiative = await initiativesService.decideApproval(
      req.params.id,
      decision,
      typeof accountId === 'string' ? accountId.trim() : undefined,
      typeof comment === 'string' ? comment : null
    );
    res.json(initiative);
  } catch (error) {
    handleError(error, res);
  }
});

export { router as approvalsRouter };
