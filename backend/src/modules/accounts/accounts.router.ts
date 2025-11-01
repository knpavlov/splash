import { Router } from 'express';
import { accountsService } from './accounts.module.js';
import type { InterviewerSeniority } from './accounts.types.js';

const router = Router();

router.get('/', async (_req, res) => {
  const accounts = await accountsService.listAccounts();
  res.json(accounts);
});

const allowedInterviewerRoles: InterviewerSeniority[] = ['MD', 'SD', 'D', 'SM', 'M', 'SA', 'A'];

const parseInterviewerRole = (value: unknown): InterviewerSeniority | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return allowedInterviewerRoles.includes(normalized as InterviewerSeniority)
    ? (normalized as InterviewerSeniority)
    : null;
};

router.post('/invite', async (req, res) => {
  const { email, role = 'admin', firstName, lastName, interviewerRole } = req.body as {
    email?: string;
    role?: 'admin' | 'user';
    firstName?: string;
    lastName?: string;
    interviewerRole?: string | null;
  };
  try {
    const account = await accountsService.inviteAccount(
      email ?? '',
      role,
      firstName,
      lastName,
      parseInterviewerRole(interviewerRole)
    );
    res.status(201).json(account);
  } catch (error) {
    if (error instanceof Error && error.message === 'ALREADY_EXISTS') {
      res.status(409).json({ code: 'duplicate', message: 'The specified user has already been invited.' });
      return;
    }
    if (error instanceof Error && (error.message === 'INVALID_NAME' || error.message === 'INVALID_INVITE')) {
      res.status(400).json({ code: 'invalid-input', message: 'Provide a valid name and email.' });
      return;
    }
    if (error instanceof Error && error.message === 'MAILER_UNAVAILABLE') {
      res
        .status(503)
        .json({ code: 'mailer-unavailable', message: 'Email delivery is not configured. Configure SMTP and retry.' });
      return;
    }
    res.status(400).json({ code: 'invalid-input', message: 'Failed to send the invitation.' });
  }
});

router.post('/:id/activate', async (req, res) => {
  try {
    const account = await accountsService.activateAccount(req.params.id);
    res.json(account);
  } catch (error) {
    res.status(404).json({ code: 'not-found', message: 'Account not found.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const account = await accountsService.removeAccount(req.params.id);
    res.json(account);
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      res.status(403).json({ code: 'invalid-input', message: 'The super admin cannot be deleted.' });
      return;
    }
    res.status(404).json({ code: 'not-found', message: 'Account not found.' });
  }
});

router.post('/:id/role', async (req, res) => {
  const { role } = req.body as { role?: unknown };
  if (role !== 'admin' && role !== 'user') {
    res.status(400).json({ code: 'invalid-input', message: 'Provide a valid role (admin or user).' });
    return;
  }

  try {
    const account = await accountsService.updateRole(req.params.id, role);
    res.json(account);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NOT_FOUND') {
        res.status(404).json({ code: 'not-found', message: 'Account not found.' });
        return;
      }
      if (error.message === 'FORBIDDEN') {
        res
          .status(403)
          .json({ code: 'invalid-input', message: 'This account role cannot be changed to the requested value.' });
        return;
      }
    }
    res.status(400).json({ code: 'invalid-input', message: 'Failed to update the account role.' });
  }
});

export { router as accountsRouter };
