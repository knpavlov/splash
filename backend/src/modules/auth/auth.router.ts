import { Router } from 'express';
import { authService } from './auth.module.js';

const router = Router();

router.post('/request-code', async (req, res) => {
  try {
    const result = await authService.requestAccessCode(String(req.body.email ?? ''));
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'ACCOUNT_NOT_FOUND') {
        res.status(404).json({ message: 'Account not found.' });
        return;
      }
      if (error.message === 'ACCESS_DENIED') {
        res.status(403).json({ message: 'Access denied for this account.' });
        return;
      }
      if (error.message === 'MAILER_UNAVAILABLE') {
        res
          .status(503)
          .json({ message: 'Email delivery is temporarily unavailable. Configure SMTP and try again.' });
        return;
      }
      if (error.message === 'MAILER_DOMAIN_NOT_VERIFIED') {
        res
          .status(424)
          .json({ message: 'Sender domain is not verified. Confirm DNS records in Resend and retry.' });
        return;
      }
      if (error.message === 'MAILER_DELIVERY_FAILED') {
        res
          .status(502)
          .json({ message: 'Email provider rejected the request. Check your Resend settings and try again.' });
        return;
      }
    }
    res.status(500).json({ message: 'Failed to request an access code.' });
  }
});

router.post('/verify-code', async (req, res) => {
  const { email, code } = req.body as { email?: string; code?: string };
  if (!email || !code) {
    res.status(400).json({ message: 'Provide email and access code.' });
    return;
  }
  try {
    const session = await authService.verifyAccessCode(email, code);
    res.json(session);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'CODE_EXPIRED') {
        res.status(410).json({ message: 'Code expired. Request a new one.' });
        return;
      }
      if (error.message === 'ACCOUNT_NOT_FOUND') {
        res.status(404).json({ message: 'Account not found.' });
        return;
      }
    }
    res.status(401).json({ message: 'Invalid code.' });
  }
});

export { router as authRouter };
