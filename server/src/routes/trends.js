import { Router } from 'express';
import { trendsQuerySchema } from '@app/shared';
import { dataSource } from '../data/dataSource.js';
import { cleanQuery, parseOr400 } from '../validate.js';

export const trendsRouter = Router();

// GET /api/trends?stationId=ps-koramangala&type=harassment
trendsRouter.get('/', async (req, res, next) => {
  try {
    const filter = parseOr400(trendsQuerySchema, cleanQuery(req.query), res);
    if (!filter) return;
    if (filter.stationId && !(await dataSource.stationExists(filter.stationId))) {
      return res.status(404).json({ error: `Unknown stationId "${filter.stationId}"` });
    }
    const { scope, points } = await dataSource.getTrends(filter);
    res.json({ stationId: filter.stationId ?? null, type: filter.type ?? null, scope, points });
  } catch (err) {
    next(err);
  }
});
