import { Router, Request, Response } from 'express';
import { financialDynamicsService } from './financialDynamics.module.js';

const router = Router();

const resolveAccountId = (req: Request, res: Response): string | null => {
  const accountId = req.headers['x-account-id'];
  if (typeof accountId !== 'string' || !accountId.trim()) {
    res.status(401).json({ code: 'unauthorized', message: 'Account context is required.' });
    return null;
  }
  return accountId.trim();
};

router.get('/preferences', async (req, res) => {
  const accountId = resolveAccountId(req, res);
  if (!accountId) {
    return;
  }
  try {
    const preferences = await financialDynamicsService.getPreferences(accountId);
    res.json(preferences);
  } catch (error) {
    console.error('Failed to load P&L dynamics preferences:', error);
    res
      .status(500)
      .json({ code: 'financial-dynamics-preferences-error', message: 'Unable to load saved view.' });
  }
});

router.put('/preferences', async (req, res) => {
  const accountId = resolveAccountId(req, res);
  if (!accountId) {
    return;
  }
  const body = req.body ?? {};
  try {
    const preferences = await financialDynamicsService.savePreferences(accountId, {
      settings: body.settings,
      favorites: Array.isArray(body.favorites) ? body.favorites : undefined
    });
    res.json(preferences);
  } catch (error) {
    console.error('Failed to update P&L dynamics preferences:', error);
    res
      .status(500)
      .json({ code: 'financial-dynamics-preferences-error', message: 'Unable to save view settings.' });
  }
});

export { router as financialDynamicsRouter };
