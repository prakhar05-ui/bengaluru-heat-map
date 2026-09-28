import { Router } from 'express';
import { createReportSchema } from '@app/shared';
import { REPORTS_ENABLED } from '../config.js';
import { dataSource } from '../data/dataSource.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { parseOr400 } from '../validate.js';

export const reportsRouter = Router();

// GET /api/reports -> approved reports only. Pending/rejected are never public.
reportsRouter.get('/', async (_req, res, next) => {
  try {
    // Off when deployed: the in-memory store and the seed examples are for development only.
    if (!REPORTS_ENABLED) return res.json({ items: [], count: 0 });
    const items = await dataSource.listReports({ status: 'approved' });
    // Only expose public fields.
    const publicItems = items.map(({ id, lat, lng, category, note, status, createdAt }) => ({
      id, lat, lng, category, ...(note ? { note } : {}), status, createdAt,
    }));
    res.json({ items: publicItems, count: publicItems.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/reports -> saved as "pending" for moderation.
reportsRouter.post(
  '/',
  (_req, res, next) =>
    REPORTS_ENABLED ? next() : res.status(503).json({ error: 'Community reports are coming soon.' }),
  rateLimit({ windowMs: 10 * 60 * 1000, max: 5 }),
  async (req, res, next) => {
    try {
      // TODO: Verify a Cloudflare Turnstile token before accepting the report:
      //   POST https://challenges.cloudflare.com/turnstile/v0/siteverify
      //   body: { secret: process.env.TURNSTILE_SECRET, response: req.body.turnstileToken, remoteip: req.ip }
      //   Reject with 403 unless `success === true`. (Turnstile is free; add the
      //   widget on the client in ReportPinDialog and the field in createReportSchema.)
      const input = parseOr400(createReportSchema, req.body, res);
      if (!input) return;
      const report = await dataSource.createReport(input);
      res.status(201).json({ id: report.id, status: report.status });
    } catch (err) {
      next(err);
    }
  },
);
