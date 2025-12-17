import { Router } from 'express';
import { randomUUID } from 'crypto';
import { LandingRepository } from './landing.repository.js';

const router = Router();
const repository = new LandingRepository();

const normalizeText = (value: unknown, max: number) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
};

const normalizeEmail = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().slice(0, 320);
};

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const normalizeSeats = (value: unknown) => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 100000) return null;
  return rounded;
};

router.post('/inquiries', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const intent = normalizeText(body.intent, 32) || 'sales';
  const seats = normalizeSeats(body.seats);
  const annualBilling = body.annualBilling !== false;

  const contact = (body.contact ?? {}) as Record<string, unknown>;
  const contactName = normalizeText(contact.name, 160);
  const contactEmail = normalizeEmail(contact.email);
  const company = normalizeText(contact.company, 200);
  const message = normalizeText(contact.message, 4000);

  if (!seats) {
    res.status(400).json({ code: 'invalid-input', message: 'Provide a valid seat count.' });
    return;
  }

  if (!contactName) {
    res.status(400).json({ code: 'invalid-input', message: 'Provide your name.' });
    return;
  }

  if (!contactEmail || !isValidEmail(contactEmail)) {
    res.status(400).json({ code: 'invalid-input', message: 'Provide a valid email.' });
    return;
  }

  if (intent === 'sales' && !company) {
    res.status(400).json({ code: 'invalid-input', message: 'Provide your company.' });
    return;
  }

  const meta = {
    pricing: body.pricing ?? null,
    annualDiscountPercent: body.annualDiscountPercent ?? null,
    page: body.page ?? null,
    userAgent: req.get('user-agent') ?? null,
    ip: req.ip ?? null
  };

  try {
    const result = await repository.insertInquiry({
      id: randomUUID(),
      intent,
      seats,
      annualBilling,
      contactName,
      contactEmail,
      company: company || null,
      message: message || null,
      meta
    });
    res.json({ id: result.id });
  } catch (error) {
    console.error('Failed to create landing inquiry', error);
    res.status(500).json({ code: 'unknown', message: 'Failed to submit the request.' });
  }
});

export { router as landingRouter };

