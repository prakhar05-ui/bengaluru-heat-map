import { Router } from 'express';
import { REPORTS_ENABLED } from '../config.js';
import { dataSource } from '../data/dataSource.js';

export const metaRouter = Router();

// GET /api/meta -> where the data came from (city-wide sources, per-station counts, boundaries, attribution)
metaRouter.get('/', async (_req, res, next) => {
  try {
    res.json({ ...(await dataSource.getMeta()), features: { reports: REPORTS_ENABLED } });
  } catch (err) {
    next(err);
  }
});
