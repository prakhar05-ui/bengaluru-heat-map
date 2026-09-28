import { Router } from 'express';
import { jurisdictionsQuerySchema } from '@app/shared';
import { dataSource } from '../data/dataSource.js';
import { cleanQuery, parseOr400 } from '../validate.js';

export const jurisdictionsRouter = Router();

// GET /api/jurisdictions?year=2019-2024&type=harassment -> GeoJSON polygons with counts
jurisdictionsRouter.get('/', async (req, res, next) => {
  try {
    const filter = parseOr400(jurisdictionsQuerySchema, cleanQuery(req.query), res);
    if (!filter) return;
    res.type('application/geo+json').json(await dataSource.listJurisdictions(filter));
  } catch (err) {
    next(err);
  }
});
