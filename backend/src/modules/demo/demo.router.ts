import { Router } from 'express';
import { accountsService } from '../accounts/accounts.module.js';
import { demoDataService } from './demo.service.js';

const router = Router();

// Обрабатываем запрос на загрузку демо-данных только от суперадмина
router.post('/seed', async (req, res) => {
  const { email } = req.body as { email?: string };
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalized) {
    res.status(400).json({ code: 'invalid-input', message: 'Provide the requester email.' });
    return;
  }

  const account = await accountsService.findByEmail(normalized);

  if (!account || account.role !== 'super-admin') {
    res.status(403).json({ code: 'forbidden', message: 'Only super admins may load demo data.' });
    return;
  }

  try {
    const summary = await demoDataService.triggerSeed();
    res.json({
      status: 'ok',
      summary
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'IN_PROGRESS') {
      res.status(409).json({ code: 'in-progress', message: 'The demo data loader is already running.' });
      return;
    }

    res.status(500).json({ code: 'unknown', message: 'Failed to load demo data.' });
  }
});

router.post('/erase', async (req, res) => {
  const { email } = req.body as { email?: string };
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalized) {
    res.status(400).json({ code: 'invalid-input', message: 'Provide the requester email.' });
    return;
  }

  const account = await accountsService.findByEmail(normalized);

  if (!account || account.role !== 'super-admin') {
    res.status(403).json({ code: 'forbidden', message: 'Only super admins may erase demo data.' });
    return;
  }

  try {
    const summary = await demoDataService.triggerErase();
    res.json({
      status: 'ok',
      summary
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'IN_PROGRESS') {
      res.status(409).json({ code: 'in-progress', message: 'Another demo data task is already running.' });
      return;
    }

    res.status(500).json({ code: 'unknown', message: 'Failed to erase demo data.' });
  }
});

export { router as demoRouter };
