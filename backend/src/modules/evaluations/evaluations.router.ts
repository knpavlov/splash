import { Router, Response } from 'express';
import { evaluationWorkflowService, evaluationsService } from './evaluations.module.js';
import type { OfferDecisionStatus } from './evaluations.types.js';

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
      res.status(404).json({ code: 'not-found', message: 'Evaluation not found.' });
      return;
    case 'PROCESS_ALREADY_STARTED':
      res.status(409).json({ code: 'process-already-started', message: 'The process has already been started.' });
      return;
    case 'MISSING_ASSIGNMENT_DATA':
      res.status(400).json({ code: 'missing-assignment-data', message: 'Fill in interviewers, cases and fit questions.' });
      return;
    case 'INVALID_ASSIGNMENT_DATA':
      res
        .status(400)
        .json({ code: 'invalid-assignment-data', message: 'Provide valid case and fit question identifiers for every slot.' });
      return;
    case 'INVALID_ASSIGNMENT_RESOURCES':
      res
        .status(400)
        .json({
          code: 'invalid-assignment-resources',
          message: 'Some referenced cases or fit questions are no longer available. Reassign interviews before sending invites.'
        });
      return;
    case 'MAILER_UNAVAILABLE':
      res
        .status(503)
        .json({ code: 'mailer-unavailable', message: 'Email service is not configured. Cannot notify interviewers.' });
      return;
    case 'INVALID_SELECTION':
      res
        .status(400)
        .json({ code: 'invalid-selection', message: 'Select at least one interviewer before resending invites.' });
      return;
    case 'INVITATION_DELIVERY_FAILED':
      res
        .status(502)
        .json({
          code: 'invitation-delivery-failed',
          message: 'Some invitations could not be delivered. Check the mail log and try again.'
        });
      return;
    case 'INVALID_PORTAL_URL':
      res
        .status(503)
        .json({
          code: 'invalid-portal-url',
          message:
            'Provide a valid interviewer portal URL (environment override or request origin) that interviewers can access.'
        });
      return;
    case 'VERSION_CONFLICT':
      res
        .status(409)
        .json({ code: 'version-conflict', message: 'Evaluation data is outdated. Refresh the page.' });
      return;
    case 'FORMS_PENDING':
      res
        .status(409)
        .json({ code: 'forms-pending', message: 'Collect all interview feedback before progressing.' });
      return;
    default:
      res.status(500).json({ code: 'unknown', message: 'Failed to process the request.' });
  }
};

router.get('/', async (_req, res) => {
  const evaluations = await evaluationsService.listEvaluations();
  res.json(evaluations);
});

router.post('/:id/start', async (req, res) => {
  try {
    const body = (req.body ?? {}) as { portalBaseUrl?: unknown };
    const portalBaseUrl = typeof body.portalBaseUrl === 'string' ? body.portalBaseUrl.trim() : undefined;
    const requestOrigin = req.get('origin');
    const resolvedBase = portalBaseUrl && portalBaseUrl.length > 0 ? portalBaseUrl : requestOrigin;
    const result = await evaluationWorkflowService.startProcess(req.params.id, {
      portalBaseUrl: resolvedBase
    });
    res.json(result);
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/:id/invitations', async (req, res) => {
  try {
    const body = (req.body ?? {}) as { slotIds?: unknown; portalBaseUrl?: unknown };
    const slotIds = Array.isArray(body.slotIds)
      ? body.slotIds.filter((value): value is string => typeof value === 'string')
      : undefined;
    const portalBaseUrl = typeof body.portalBaseUrl === 'string' ? body.portalBaseUrl.trim() : undefined;
    const requestOrigin = req.get('origin');
    const resolvedBase = portalBaseUrl && portalBaseUrl.length > 0 ? portalBaseUrl : requestOrigin;
    const result = await evaluationWorkflowService.sendInvitations(req.params.id, {
      slotIds,
      portalBaseUrl: resolvedBase
    });
    res.json(result);
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/:id/advance', async (req, res) => {
  try {
    const evaluation = await evaluationWorkflowService.advanceRound(req.params.id);
    res.json(evaluation);
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/:id/decision', async (req, res) => {
  try {
    const { decision, expectedVersion } = (req.body ?? {}) as {
      decision?: unknown;
      expectedVersion?: unknown;
    };
    if (typeof expectedVersion !== 'number') {
      res.status(400).json({ code: 'invalid-input', message: 'Provide the expected version.' });
      return;
    }
    const normalizedDecision =
      decision === 'offer' || decision === 'accepted-offer' || decision === 'reject'
        ? (decision as 'offer' | 'accepted-offer' | 'reject')
        : decision === null
          ? null
          : undefined;
    if (normalizedDecision === undefined) {
      res.status(400).json({ code: 'invalid-input', message: 'Provide a valid decision value.' });
      return;
    }
    const evaluation = await evaluationWorkflowService.updateDecision(
      req.params.id,
      normalizedDecision,
      expectedVersion
    );
    res.json(evaluation);
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/:id/decision-status', async (req, res) => {
  try {
    const { status, expectedVersion } = (req.body ?? {}) as {
      status?: unknown;
      expectedVersion?: unknown;
    };
    if (typeof expectedVersion !== 'number') {
      res.status(400).json({ code: 'invalid-input', message: 'Provide the expected version.' });
      return;
    }
    const allowedStatuses = ['pending', 'accepted', 'accepted-co', 'declined', 'declined-co'] as const;
    const normalizedStatus =
      typeof status === 'string' && allowedStatuses.includes(status as (typeof allowedStatuses)[number])
        ? (status as OfferDecisionStatus)
        : null;
    if (!normalizedStatus) {
      res.status(400).json({ code: 'invalid-input', message: 'Provide a valid offer decision status.' });
      return;
    }
    const evaluation = await evaluationWorkflowService.updateOfferDecisionStatus(
      req.params.id,
      normalizedStatus,
      expectedVersion
    );
    res.json(evaluation);
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/', async (req, res) => {
  const { config } = req.body as { config?: unknown };
  if (!config) {
    res.status(400).json({ code: 'invalid-input', message: 'Provide evaluation data.' });
    return;
  }

  try {
    const evaluation = await evaluationsService.createEvaluation(config);
    const synchronized = await evaluationWorkflowService.refreshAssignmentsFromRecord(evaluation);
    res.status(201).json(synchronized);
  } catch (error) {
    handleError(error, res);
  }
});

router.put('/:id', async (req, res) => {
  const { config, expectedVersion } = req.body as { config?: unknown; expectedVersion?: unknown };
  if (!config || typeof expectedVersion !== 'number') {
    res
      .status(400)
      .json({ code: 'invalid-input', message: 'Provide evaluation data and the expected version.' });
    return;
  }

  try {
    const evaluation = await evaluationsService.updateEvaluation(req.params.id, config, expectedVersion);
    const synchronized = await evaluationWorkflowService.refreshAssignmentsFromRecord(evaluation);
    res.json(synchronized);
  } catch (error) {
    handleError(error, res);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = await evaluationsService.deleteEvaluation(req.params.id);
    res.json({ id });
  } catch (error) {
    handleError(error, res);
  }
});

export { router as evaluationsRouter };
